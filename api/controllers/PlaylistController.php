<?php
declare(strict_types=1);

class PlaylistController
{
    private static function visibleFilter(OrgCtx $ctx, string $alias = 'p'): array
    {
        if (!$ctx->isGuest()) return ['', []];
        $ids = $ctx->guestPlaylistIds();
        if (!$ids) return [" AND 0 = 1", []];
        return [" AND $alias.id IN (" . DB::in($ids) . ')', $ids];
    }

    public static function index($org): void
    {
        $ctx = org_ctx($org);
        [$filter, $fp] = self::visibleFilter($ctx);
        $rows = DB::all(
            "SELECT p.*, u.name AS creator_name,
                (SELECT COUNT(*) FROM playlist_items pi WHERE pi.playlist_id = p.id) AS items_count,
                (SELECT COALESCE(SUM(COALESCE(pi.duration, m.duration, 10)),0) FROM playlist_items pi LEFT JOIN media m ON m.id = pi.media_id WHERE pi.playlist_id = p.id) AS total_duration,
                (SELECT COUNT(*) FROM schedules s WHERE s.playlist_id = p.id) AS schedules_count,
                (SELECT COUNT(*) FROM screens sc WHERE sc.default_playlist_id = p.id) AS screens_count
             FROM playlists p LEFT JOIN users u ON u.id = p.created_by
             WHERE p.organization_id = ? $filter ORDER BY p.name",
            array_merge([$ctx->id()], $fp)
        );
        $thumbs = [];
        if ($rows) {
            $ids = array_column($rows, 'id');
            foreach (DB::all(
                'SELECT pi.playlist_id, m.thumb_path, m.file_path, m.type FROM playlist_items pi JOIN media m ON m.id = pi.media_id
                 WHERE pi.playlist_id IN (' . DB::in($ids) . ") AND m.type IN ('image','video') ORDER BY pi.position",
                $ids
            ) as $t) {
                $pid = (int)$t['playlist_id'];
                if (count($thumbs[$pid] ?? []) < 4) {
                    $thumbs[$pid][] = upload_url($t['thumb_path'] ?: ($t['type'] === 'image' ? $t['file_path'] : null));
                }
            }
        }
        respond(['playlists' => array_map(fn($p) => [
            'id' => (int)$p['id'],
            'name' => $p['name'],
            'description' => $p['description'],
            'transition' => $p['transition'],
            'items_count' => (int)$p['items_count'],
            'total_duration' => (int)$p['total_duration'],
            'schedules_count' => (int)$p['schedules_count'],
            'screens_count' => (int)$p['screens_count'],
            'thumbs' => array_values(array_filter($thumbs[(int)$p['id']] ?? [])),
            'creator_name' => $p['creator_name'],
            'can_edit' => $ctx->canEditOwned($p['created_by'] !== null ? (int)$p['created_by'] : null),
            'updated_at' => $p['updated_at'] ?? $p['created_at'],
        ], $rows)]);
    }

    private static function find(OrgCtx $ctx, $id, bool $edit = false): array
    {
        $p = DB::one('SELECT * FROM playlists WHERE id = ? AND organization_id = ?', [(int)$id, $ctx->id()]);
        if (!$p) abort('Playlist não encontrada.', 404);
        if ($ctx->isGuest() && !in_array((int)$p['id'], $ctx->guestPlaylistIds(), true)) abort('Playlist não encontrada.', 404);
        if ($edit && !$ctx->canEditOwned($p['created_by'] !== null ? (int)$p['created_by'] : null)) {
            abort('Você não tem permissão para alterar esta playlist.', 403);
        }
        return $p;
    }

    public static function show($org, $id): void
    {
        $ctx = org_ctx($org);
        $p = self::find($ctx, $id);
        $integrationIds = [];
        $full = Manifest::playlists($ctx->id(), [(int)$p['id']], $integrationIds)[(int)$p['id']];
        $full['description'] = $p['description'];
        $full['can_edit'] = $ctx->canEditOwned($p['created_by'] !== null ? (int)$p['created_by'] : null);
        $full['integrations'] = (object)Manifest::integrations($ctx->id(), $integrationIds);
        $full['used_in'] = [
            'schedules' => DB::all('SELECT id, name FROM schedules WHERE playlist_id = ?', [$p['id']]),
            'screens' => DB::all('SELECT id, name FROM screens WHERE default_playlist_id = ?', [$p['id']]),
        ];
        respond(['playlist' => $full, 'timezone' => $ctx->org['timezone']]);
    }

    public static function store($org): void
    {
        $ctx = org_ctx($org);
        $ctx->requireCreateContent();
        required(['name' => 'o nome da playlist']);
        $id = DB::insert('playlists', [
            'organization_id' => $ctx->id(),
            'name' => str_input('name', 120),
            'description' => str_input('description', 500) ?: null,
            'created_by' => $ctx->userId(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        log_activity($ctx->id(), 'playlist.created', 'Playlist "' . str_input('name', 120) . '" criada');
        respond(['id' => $id], 201);
    }

    public static function update($org, $id): void
    {
        $ctx = org_ctx($org);
        $p = self::find($ctx, $id, true);
        $pid = (int)$p['id'];
        $data = ['updated_at' => now()];
        if (has_input('name')) {
            $name = str_input('name', 120);
            if ($name === '') abort('Informe o nome da playlist.', 422);
            $data['name'] = $name;
        }
        if (has_input('description')) $data['description'] = str_input('description', 500) ?: null;
        if (has_input('transition')) $data['transition'] = in_array(input('transition'), ['fade', 'slide', 'zoom', 'none'], true) ? input('transition') : 'fade';
        if (has_input('ticker_text')) $data['ticker_text'] = str_input('ticker_text', 1000) ?: null;
        foreach (['ticker_integration_id' => ['rss', 'text'], 'music_integration_id' => ['music']] as $field => $types) {
            if (has_input($field)) {
                $iid = int_or_null(input($field));
                if ($iid && !DB::val('SELECT id FROM integrations WHERE id = ? AND organization_id = ? AND type IN (' . DB::in($types) . ')', array_merge([$iid, $ctx->id()], $types))) {
                    abort('Integração inválida.', 422);
                }
                $data[$field] = $iid;
            }
        }

        DB::transaction(function () use ($ctx, $pid, $data) {
            DB::update('playlists', $data, 'id = ?', [$pid]);
            if (!has_input('items')) return;
            $items = input('items');
            if (!is_array($items)) abort('Itens inválidos.', 422);
            if (count($items) > 500) abort('Uma playlist pode ter no máximo 500 itens.', 422);

            $mediaIds = ints(array_column($items, 'media_id'));
            $integrationIds = ints(array_column($items, 'integration_id'));
            $validMedia = $mediaIds ? array_map('intval', DB::col('SELECT id FROM media WHERE organization_id = ? AND id IN (' . DB::in($mediaIds) . ')', array_merge([$ctx->id()], $mediaIds))) : [];
            if ($ctx->isGuest() && $validMedia) {
                $already = array_map('intval', DB::col('SELECT media_id FROM playlist_items WHERE playlist_id = ? AND media_id IS NOT NULL', [$pid]));
                $own = array_map('intval', DB::col('SELECT id FROM media WHERE uploaded_by = ? AND id IN (' . DB::in($validMedia) . ')', array_merge([$ctx->userId()], $validMedia)));
                $validMedia = array_values(array_intersect($validMedia, array_merge($already, $own)));
            }
            $validInt = $integrationIds ? array_map('intval', DB::col('SELECT id FROM integrations WHERE organization_id = ? AND id IN (' . DB::in($integrationIds) . ')', array_merge([$ctx->id()], $integrationIds))) : [];

            DB::exec('DELETE FROM playlist_items WHERE playlist_id = ?', [$pid]);
            $pos = 0;
            foreach ($items as $it) {
                if (!is_array($it)) continue;
                $type = ($it['type'] ?? '') === 'integration' ? 'integration' : 'media';
                $mid = (int)($it['media_id'] ?? 0);
                $iid = (int)($it['integration_id'] ?? 0);
                if ($type === 'media' && !in_array($mid, $validMedia, true)) continue;
                if ($type === 'integration' && !in_array($iid, $validInt, true)) continue;
                $duration = isset($it['duration']) && is_numeric($it['duration']) && $it['duration'] > 0 ? min(86400, (int)$it['duration']) : null;
                $settings = is_array($it['settings'] ?? null) ? $it['settings'] : [];
                $clean = [];
                if (isset($settings['fit']) && in_array($settings['fit'], ['cover', 'contain', 'fill'], true)) $clean['fit'] = $settings['fit'];
                if (isset($settings['muted'])) $clean['muted'] = (bool)$settings['muted'];
                DB::insert('playlist_items', [
                    'playlist_id' => $pid,
                    'position' => $pos++,
                    'item_type' => $type,
                    'media_id' => $type === 'media' ? $mid : null,
                    'integration_id' => $type === 'integration' ? $iid : null,
                    'duration' => $duration,
                    'settings' => $clean ? json_encode($clean) : null,
                ]);
            }
        });
        log_activity($ctx->id(), 'playlist.updated', 'Playlist "' . ($data['name'] ?? $p['name']) . '" atualizada');
        self::show($org, $id);
    }

    public static function destroy($org, $id): void
    {
        $ctx = org_ctx($org);
        $p = self::find($ctx, $id, true);
        $used = DB::col('SELECT name FROM schedules WHERE playlist_id = ?', [$p['id']]);
        if ($used) {
            abort('Esta playlist está sendo usada na grade de programação (' . implode(', ', array_slice($used, 0, 3)) . '). Remova-a da grade antes de excluir.', 409);
        }
        DB::exec('DELETE FROM playlists WHERE id = ?', [$p['id']]);
        log_activity($ctx->id(), 'playlist.deleted', "Playlist \"{$p['name']}\" excluída");
        respond(['ok' => true]);
    }

    public static function duplicate($org, $id): void
    {
        $ctx = org_ctx($org);
        $ctx->requireCreateContent();
        $p = self::find($ctx, $id);
        $newId = DB::transaction(function () use ($ctx, $p) {
            $newId = DB::insert('playlists', [
                'organization_id' => $ctx->id(),
                'name' => mb_substr($p['name'] . ' (cópia)', 0, 120),
                'description' => $p['description'],
                'transition' => $p['transition'],
                'ticker_integration_id' => $p['ticker_integration_id'],
                'ticker_text' => $p['ticker_text'],
                'music_integration_id' => $p['music_integration_id'],
                'created_by' => $ctx->userId(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::exec(
                'INSERT INTO playlist_items (playlist_id, position, item_type, media_id, integration_id, duration, settings)
                 SELECT ?, position, item_type, media_id, integration_id, duration, settings FROM playlist_items WHERE playlist_id = ?',
                [$newId, $p['id']]
            );
            return $newId;
        });
        respond(['id' => $newId], 201);
    }
}
