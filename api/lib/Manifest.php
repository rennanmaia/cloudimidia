<?php
declare(strict_types=1);

/**
 * Monta o "manifesto" que o player da TV usa para exibir a programação.
 * Também é usado na pré-visualização de playlists no painel.
 */
class Manifest
{
    public static function formatMedia(array $m): array
    {
        return [
            'id' => (int)$m['id'],
            'type' => $m['type'],
            'name' => $m['name'],
            'url' => upload_url($m['file_path']),
            'thumb_url' => upload_url($m['thumb_path']),
            'mime' => $m['mime'],
            'size_bytes' => (int)$m['size_bytes'],
            'duration' => $m['duration'] !== null ? (float)$m['duration'] : null,
            'width' => $m['width'] !== null ? (int)$m['width'] : null,
            'height' => $m['height'] !== null ? (int)$m['height'] : null,
            'uploaded_by' => $m['uploaded_by'] !== null ? (int)$m['uploaded_by'] : null,
            'created_at' => $m['created_at'],
        ];
    }

    /** Integrações formatadas para o player (inclui faixas de música da biblioteca). */
    public static function integrations(int $orgId, array $ids): array
    {
        $ids = ints($ids);
        if (!$ids) return [];
        $out = [];
        $rows = DB::all('SELECT * FROM integrations WHERE organization_id = ? AND id IN (' . DB::in($ids) . ')', array_merge([$orgId], $ids));
        foreach ($rows as $r) {
            $i = Integrations::format($r);
            $i['has_data'] = Integrations::hasRemoteData($i['type']);
            if ($i['type'] === 'music' && ($i['config']['source'] ?? '') === 'library') {
                $mids = ints($i['config']['media_ids'] ?? []);
                $tracks = $mids ? DB::all("SELECT * FROM media WHERE organization_id = ? AND type = 'audio' AND id IN (" . DB::in($mids) . ')', array_merge([$orgId], $mids)) : [];
                $i['tracks'] = array_map(fn($m) => ['id' => (int)$m['id'], 'name' => $m['name'], 'url' => upload_url($m['file_path'])], $tracks);
            }
            $out[(int)$r['id']] = $i;
        }
        return $out;
    }

    /** Playlists completas (com itens) indexadas pelo id. */
    public static function playlists(int $orgId, array $ids, array &$integrationIds = []): array
    {
        $ids = ints($ids);
        if (!$ids) return [];
        $in = DB::in($ids);
        $playlists = [];
        foreach (DB::all("SELECT * FROM playlists WHERE organization_id = ? AND id IN ($in)", array_merge([$orgId], $ids)) as $p) {
            $playlists[(int)$p['id']] = [
                'id' => (int)$p['id'],
                'name' => $p['name'],
                'transition' => $p['transition'],
                'ticker_integration_id' => $p['ticker_integration_id'] !== null ? (int)$p['ticker_integration_id'] : null,
                'ticker_text' => $p['ticker_text'],
                'music_integration_id' => $p['music_integration_id'] !== null ? (int)$p['music_integration_id'] : null,
                'footer' => Footer::resolve($orgId, $p, $integrationIds),
                'items' => [],
            ];
            if ($p['music_integration_id']) $integrationIds[] = (int)$p['music_integration_id'];
        }
        if (!$playlists) return [];
        $pids = array_keys($playlists);
        $items = DB::all(
            'SELECT pi.*, m.id AS m_id, m.type AS m_type, m.name AS m_name, m.file_path, m.thumb_path, m.mime, m.size_bytes, m.duration AS m_duration,
                    m.width, m.height, m.uploaded_by, m.created_at AS m_created, i.name AS i_name, i.type AS i_type
             FROM playlist_items pi
             LEFT JOIN media m ON m.id = pi.media_id
             LEFT JOIN integrations i ON i.id = pi.integration_id
             WHERE pi.playlist_id IN (' . DB::in($pids) . ') ORDER BY pi.playlist_id, pi.position, pi.id',
            $pids
        );
        foreach ($items as $it) {
            $item = [
                'id' => (int)$it['id'],
                'type' => $it['item_type'],
                'duration' => $it['duration'] !== null ? (int)$it['duration'] : null,
                'settings' => decode_json($it['settings']),
            ];
            if ($it['item_type'] === 'media') {
                if (!$it['m_id']) continue;
                $item['kind'] = $it['m_type'];
                $item['name'] = $it['m_name'];
                $item['media'] = self::formatMedia([
                    'id' => $it['m_id'], 'type' => $it['m_type'], 'name' => $it['m_name'], 'file_path' => $it['file_path'],
                    'thumb_path' => $it['thumb_path'], 'mime' => $it['mime'], 'size_bytes' => $it['size_bytes'],
                    'duration' => $it['m_duration'], 'width' => $it['width'], 'height' => $it['height'],
                    'uploaded_by' => $it['uploaded_by'], 'created_at' => $it['m_created'],
                ]);
            } else {
                if (!$it['integration_id'] || !$it['i_type']) continue;
                $item['kind'] = $it['i_type'];
                $item['name'] = $it['i_name'];
                $item['integration_id'] = (int)$it['integration_id'];
                $integrationIds[] = (int)$it['integration_id'];
            }
            $playlists[(int)$it['playlist_id']]['items'][] = $item;
        }
        return $playlists;
    }

    public static function formatSchedule(array $s): array
    {
        return [
            'id' => (int)$s['id'],
            'name' => $s['name'],
            'playlist_id' => (int)$s['playlist_id'],
            'mode' => $s['mode'],
            'insert_every' => (int)$s['insert_every'],
            'priority' => (int)$s['priority'],
            'days' => array_map('intval', array_filter(explode(',', (string)$s['days']), 'strlen')),
            'start_time' => $s['start_time'] ? substr($s['start_time'], 0, 5) : null,
            'end_time' => $s['end_time'] ? substr($s['end_time'], 0, 5) : null,
            'start_date' => $s['start_date'],
            'end_date' => $s['end_date'],
            'is_active' => (bool)$s['is_active'],
            'color' => $s['color'],
        ];
    }

    /** Programações que atingem uma TV (diretamente ou por grupo). */
    public static function schedulesForScreen(int $screenId, int $orgId, bool $onlyActive = true): array
    {
        $groupIds = DB::col('SELECT group_id FROM screen_group_members WHERE screen_id = ?', [$screenId]);
        $params = [$orgId, $screenId];
        $groupSql = '';
        if ($groupIds) {
            $groupSql = ' OR t.group_id IN (' . DB::in($groupIds) . ')';
            $params = array_merge($params, $groupIds);
        }
        $active = $onlyActive ? ' AND s.is_active = 1 AND (s.end_date IS NULL OR s.end_date >= DATE_SUB(UTC_DATE(), INTERVAL 1 DAY))' : '';
        return DB::all(
            "SELECT DISTINCT s.* FROM schedules s JOIN schedule_targets t ON t.schedule_id = s.id
             WHERE s.organization_id = ? AND (t.screen_id = ? $groupSql) $active ORDER BY s.priority DESC, s.id DESC",
            $params
        );
    }

    public static function forScreen(array $screen): array
    {
        $orgId = (int)$screen['organization_id'];
        $org = DB::one('SELECT * FROM organizations WHERE id = ?', [$orgId]);
        $schedules = array_map([self::class, 'formatSchedule'], self::schedulesForScreen((int)$screen['id'], $orgId));
        $playlistIds = array_column($schedules, 'playlist_id');
        if ($screen['default_playlist_id']) $playlistIds[] = (int)$screen['default_playlist_id'];
        $integrationIds = [];
        $playlists = self::playlists($orgId, $playlistIds, $integrationIds);

        $manifest = [
            'screen' => [
                'id' => (int)$screen['id'],
                'name' => $screen['name'],
                'is_active' => (bool)$screen['is_active'] && $org['status'] === 'active',
                'muted' => (bool)$screen['muted'],
                'rotation' => (int)$screen['rotation'],
            ],
            'organization' => [
                'name' => $org['name'],
                'logo_url' => upload_url($org['logo_path']),
                'timezone' => $org['timezone'],
            ],
            'default_playlist_id' => $screen['default_playlist_id'] ? (int)$screen['default_playlist_id'] : null,
            'schedules' => $schedules,
            'playlists' => (object)$playlists,
            'integrations' => (object)self::integrations($orgId, $integrationIds),
        ];
        $manifest['version'] = md5(json_encode($manifest));
        $manifest['server_time'] = gmdate('c');
        return $manifest;
    }
}
