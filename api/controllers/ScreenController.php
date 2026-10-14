<?php
declare(strict_types=1);

class ScreenController
{
    public const ONLINE_SECONDS = 75;

    public static function format(array $s, array $groups, OrgCtx $ctx): array
    {
        $info = decode_json($s['device_info']);
        $lastSeen = $s['last_seen_at'] ? strtotime($s['last_seen_at'] . ' UTC') : null;
        $id = (int)$s['id'];
        return [
            'id' => $id,
            'name' => $s['name'],
            'location' => $s['location'],
            'notes' => $s['notes'],
            'is_active' => (bool)$s['is_active'],
            'muted' => (bool)$s['muted'],
            'rotation' => (int)$s['rotation'],
            'default_playlist_id' => $s['default_playlist_id'] !== null ? (int)$s['default_playlist_id'] : null,
            'default_playlist_name' => $s['default_playlist_name'] ?? null,
            'paired' => $s['device_token_hash'] !== null,
            // Link de instalação ainda válido (TV cadastrada aguardando o aparelho)
            'install_link_active' => !empty($s['install_token_hash']) && $s['install_expires_at'] && strtotime($s['install_expires_at'] . ' UTC') > time(),
            'install_expires_at' => !empty($s['install_token_hash']) ? $s['install_expires_at'] : null,
            'online' => $lastSeen !== null && $lastSeen > time() - self::ONLINE_SECONDS,
            'last_seen_at' => $s['last_seen_at'],
            'last_ip' => $ctx->can('admin') ? $s['last_ip'] : null,
            'now_playing' => $s['now_playing'],
            'device' => [
                'resolution' => $info['resolution'] ?? null,
                'platform' => $info['platform'] ?? null,
                'user_agent' => $info['user_agent'] ?? null,
                'player_version' => $info['version'] ?? null,
            ],
            'groups' => $groups[$id] ?? [],
            'can_operate' => $ctx->canOperateScreen($id),
            'guest_role' => $ctx->screens[$id] ?? null,
            'created_at' => $s['created_at'],
        ];
    }

    public static function listScreens(OrgCtx $ctx, ?array $onlyIds = null): array
    {
        $params = [$ctx->id()];
        $where = 's.organization_id = ?';
        $ids = $onlyIds;
        if ($ctx->isGuest()) {
            $ids = $ids === null ? array_keys($ctx->screens) : array_values(array_intersect($ids, array_keys($ctx->screens)));
        }
        if ($ids !== null) {
            if (!$ids) return [];
            $where .= ' AND s.id IN (' . DB::in($ids) . ')';
            $params = array_merge($params, $ids);
        }
        $rows = DB::all(
            "SELECT s.*, p.name AS default_playlist_name FROM screens s LEFT JOIN playlists p ON p.id = s.default_playlist_id
             WHERE $where ORDER BY s.name",
            $params
        );
        $groups = [];
        if ($rows) {
            $sids = array_column($rows, 'id');
            foreach (DB::all(
                'SELECT m.screen_id, g.id, g.name, g.color FROM screen_group_members m JOIN screen_groups g ON g.id = m.group_id
                 WHERE m.screen_id IN (' . DB::in($sids) . ') ORDER BY g.name',
                $sids
            ) as $g) {
                $groups[(int)$g['screen_id']][] = ['id' => (int)$g['id'], 'name' => $g['name'], 'color' => $g['color']];
            }
        }
        return array_map(fn($s) => self::format($s, $groups, $ctx), $rows);
    }

    private static function find(OrgCtx $ctx, $id): array
    {
        $screen = DB::one('SELECT * FROM screens WHERE id = ? AND organization_id = ?', [(int)$id, $ctx->id()]);
        if (!$screen || !$ctx->canViewScreen((int)$screen['id'])) abort('TV não encontrada.', 404);
        return $screen;
    }

    public static function index($org): void
    {
        $ctx = org_ctx($org);
        respond(['screens' => self::listScreens($ctx)]);
    }

    public static function pair($org): void
    {
        $ctx = org_ctx($org);
        $ctx->require('editor');
        $code = preg_replace('/\D/', '', (string)input('code', ''));
        if (strlen($code) !== 6) abort('Digite o código de 6 números que aparece na TV.', 422, ['code' => 'Código inválido.']);
        $req = DB::one('SELECT * FROM pairing_requests WHERE code = ? AND expires_at > ? AND screen_id IS NULL ORDER BY id DESC LIMIT 1', [$code, now()]);
        if (!$req) abort('Código não encontrado ou expirado. Confira o código exibido na TV.', 404, ['code' => 'Código não encontrado.']);

        $token = random_token(32);
        $replaceId = int_or_null(input('replace_screen_id'));

        $screenId = DB::transaction(function () use ($ctx, $req, $token, $replaceId) {
            if ($replaceId) {
                $screen = self::find($ctx, $replaceId);
                self::attachDevice((int)$screen['id'], $token, $req['device_info']);
                log_activity($ctx->id(), 'screen.repaired', ($screen['device_token_hash'] ? 'Novo aparelho conectado' : 'Aparelho instalado') . " na TV \"{$screen['name']}\"");
                return (int)$screen['id'];
            }
            $id = self::createScreen($ctx, hash('sha256', $token), $req['device_info']);
            log_activity($ctx->id(), 'screen.created', 'TV "' . str_input('name', 120) . '" cadastrada');
            return $id;
        });

        DB::update('pairing_requests', ['screen_id' => $screenId, 'device_token' => $token], 'id = ?', [$req['id']]);
        respond(['screen' => self::listScreens($ctx, [$screenId])[0] ?? null], 201);
    }

    /** Vincula um aparelho à TV; qualquer link de instalação pendente deixa de valer. */
    public static function attachDevice(int $screenId, string $deviceToken, ?string $deviceInfo): void
    {
        DB::update('screens', [
            'device_token_hash' => hash('sha256', $deviceToken),
            'install_token_hash' => null,
            'install_expires_at' => null,
            'device_info' => $deviceInfo,
            'last_seen_at' => null,
            'updated_at' => now(),
        ], 'id = ?', [$screenId]);
    }

    private static function createScreen(OrgCtx $ctx, ?string $deviceTokenHash, ?string $deviceInfo): int
    {
        required(['name' => 'o nome da TV']);
        $max = $ctx->org['max_screens'];
        if ($max !== null && org_usage($ctx->id())['screens'] >= (int)$max) {
            abort("Seu plano permite até $max TVs. Entre em contato para ampliar o limite.", 422);
        }
        $playlistId = int_or_null(input('default_playlist_id'));
        if ($playlistId && !DB::val('SELECT id FROM playlists WHERE id = ? AND organization_id = ?', [$playlistId, $ctx->id()])) {
            $playlistId = null;
        }
        $id = DB::insert('screens', [
            'organization_id' => $ctx->id(),
            'name' => str_input('name', 120),
            'location' => str_input('location', 190) ?: null,
            'is_active' => 1,
            'rotation' => in_array((int)input('rotation', 0), [0, 90, 180, 270], true) ? (int)input('rotation', 0) : 0,
            'default_playlist_id' => $playlistId,
            'device_token_hash' => $deviceTokenHash,
            'device_info' => $deviceInfo,
            'created_by' => $ctx->userId(),
            'created_at' => now(),
        ]);
        self::syncGroups($ctx, $id, input('group_ids', []));
        return $id;
    }

    /** Cadastro prévio: a TV é criada sem aparelho e conectada depois (código ou link de instalação). */
    public static function store($org): void
    {
        $ctx = org_ctx($org);
        $ctx->require('editor');
        $id = DB::transaction(fn() => self::createScreen($ctx, null, null));
        log_activity($ctx->id(), 'screen.created', 'TV "' . str_input('name', 120) . '" cadastrada (aguardando instalação)');
        $result = ['screen' => self::listScreens($ctx, [$id])[0]];
        if (bool_input('with_install_link', true)) {
            $result['install'] = self::issueInstallLink($id);
            $result['screen']['install_link_active'] = true;
            $result['screen']['install_expires_at'] = $result['install']['expires_at'];
        }
        respond($result, 201);
    }

    private static function issueInstallLink(int $screenId): array
    {
        $token = random_token(24);
        $expires = gmdate('Y-m-d H:i:s', time() + 7 * 86400);
        DB::update('screens', ['install_token_hash' => hash('sha256', $token), 'install_expires_at' => $expires], 'id = ?', [$screenId]);
        return ['link' => app_url('tv?instalar=' . $token), 'expires_at' => $expires];
    }

    /** Gera um novo link de instalação (o anterior deixa de funcionar). */
    public static function installLink($org, $id): void
    {
        $ctx = org_ctx($org);
        $ctx->require('editor');
        $screen = self::find($ctx, $id);
        $install = self::issueInstallLink((int)$screen['id']);
        log_activity($ctx->id(), 'screen.install_link', "Link de instalação gerado para \"{$screen['name']}\"");
        respond(['install' => $install]);
    }

    public static function revokeInstallLink($org, $id): void
    {
        $ctx = org_ctx($org);
        $ctx->require('editor');
        $screen = self::find($ctx, $id);
        DB::update('screens', ['install_token_hash' => null, 'install_expires_at' => null], 'id = ?', [$screen['id']]);
        respond(['ok' => true]);
    }

    private static function syncGroups(OrgCtx $ctx, int $screenId, $groupIds): void
    {
        $ids = ints($groupIds);
        $valid = $ids ? DB::col('SELECT id FROM screen_groups WHERE organization_id = ? AND id IN (' . DB::in($ids) . ')', array_merge([$ctx->id()], $ids)) : [];
        DB::exec('DELETE FROM screen_group_members WHERE screen_id = ?', [$screenId]);
        foreach ($valid as $gid) {
            DB::insert('screen_group_members', ['screen_id' => $screenId, 'group_id' => $gid]);
        }
    }

    public static function show($org, $id): void
    {
        $ctx = org_ctx($org);
        $screen = self::find($ctx, $id);
        $sid = (int)$screen['id'];
        $formatted = self::listScreens($ctx, [$sid])[0];

        $schedules = [];
        foreach (Manifest::schedulesForScreen($sid, $ctx->id(), false) as $s) {
            $f = Manifest::formatSchedule($s);
            $f['playlist_name'] = DB::val('SELECT name FROM playlists WHERE id = ?', [$s['playlist_id']]);
            $f['via_group'] = DB::val(
                'SELECT g.name FROM schedule_targets t JOIN screen_groups g ON g.id = t.group_id
                 JOIN screen_group_members m ON m.group_id = g.id AND m.screen_id = ? WHERE t.schedule_id = ? LIMIT 1',
                [$sid, $s['id']]
            ) ?: null;
            $schedules[] = $f;
        }

        $access = [];
        if ($ctx->can('admin')) {
            $access = DB::all(
                'SELECT sp.id, sp.role, u.id AS user_id, u.name, u.email FROM screen_permissions sp JOIN users u ON u.id = sp.user_id WHERE sp.screen_id = ? ORDER BY u.name',
                [$sid]
            );
        }

        respond([
            'screen' => $formatted,
            'schedules' => $schedules,
            'access' => $access,
            'timezone' => $ctx->org['timezone'],
        ]);
    }

    public static function update($org, $id): void
    {
        $ctx = org_ctx($org);
        $screen = self::find($ctx, $id);
        $sid = (int)$screen['id'];
        if (!$ctx->canOperateScreen($sid)) abort('Você não tem permissão para alterar esta TV.', 403);

        $data = [];
        if (has_input('name')) {
            $name = str_input('name', 120);
            if ($name === '') abort('Informe o nome da TV.', 422);
            $data['name'] = $name;
        }
        if (has_input('location')) $data['location'] = str_input('location', 190) ?: null;
        if (has_input('notes')) $data['notes'] = str_input('notes', 2000) ?: null;
        if (has_input('is_active')) $data['is_active'] = bool_input('is_active') ? 1 : 0;
        if (has_input('muted')) $data['muted'] = bool_input('muted') ? 1 : 0;
        if (has_input('rotation')) {
            $rot = (int)input('rotation');
            if (!in_array($rot, [0, 90, 180, 270], true)) abort('Rotação inválida.', 422);
            $data['rotation'] = $rot;
        }
        if (has_input('default_playlist_id')) {
            $pid = int_or_null(input('default_playlist_id'));
            if ($pid) {
                if (!DB::val('SELECT id FROM playlists WHERE id = ? AND organization_id = ?', [$pid, $ctx->id()])) abort('Playlist inválida.', 422);
                if ($ctx->isGuest() && !in_array($pid, $ctx->guestPlaylistIds(), true)) abort('Playlist inválida.', 422);
            }
            $data['default_playlist_id'] = $pid;
        }
        if ($data) {
            $data['updated_at'] = now();
            DB::update('screens', $data, 'id = ?', [$sid]);
        }
        if (has_input('group_ids')) {
            $ctx->require('editor');
            self::syncGroups($ctx, $sid, input('group_ids'));
        }

        $changes = [];
        if (isset($data['is_active'])) $changes[] = $data['is_active'] ? 'ativada' : 'desativada';
        if (array_key_exists('default_playlist_id', $data)) $changes[] = 'playlist padrão alterada';
        log_activity($ctx->id(), 'screen.updated', "TV \"" . ($data['name'] ?? $screen['name']) . '" ' . ($changes ? implode(', ', $changes) : 'atualizada'));
        respond(['screen' => self::listScreens($ctx, [$sid])[0]]);
    }

    public static function destroy($org, $id): void
    {
        $ctx = org_ctx($org);
        $ctx->require('admin');
        $screen = self::find($ctx, $id);
        DB::exec('DELETE FROM screens WHERE id = ?', [$screen['id']]);
        DB::exec('UPDATE schedules s SET is_active = 0 WHERE s.organization_id = ? AND NOT EXISTS (SELECT 1 FROM schedule_targets t WHERE t.schedule_id = s.id)', [$ctx->id()]);
        log_activity($ctx->id(), 'screen.deleted', "TV \"{$screen['name']}\" removida");
        respond(['ok' => true]);
    }

    public static function command($org, $id): void
    {
        $ctx = org_ctx($org);
        $screen = self::find($ctx, $id);
        if (!$ctx->canOperateScreen((int)$screen['id'])) abort('Você não tem permissão para operar esta TV.', 403);
        $cmd = str_input('command', 30);
        $labels = ['reload' => 'Recarregar', 'identify' => 'Identificar', 'refresh' => 'Atualizar conteúdo', 'clear_cache' => 'Limpar cache'];
        if (!isset($labels[$cmd])) abort('Comando inválido.', 422);
        DB::exec('UPDATE screen_commands SET delivered_at = ? WHERE screen_id = ? AND command = ? AND delivered_at IS NULL', [now(), $screen['id'], $cmd]);
        DB::insert('screen_commands', ['screen_id' => $screen['id'], 'command' => $cmd, 'created_by' => $ctx->userId(), 'created_at' => now()]);
        log_activity($ctx->id(), 'screen.command', "Comando \"{$labels[$cmd]}\" enviado para \"{$screen['name']}\"");
        respond(['ok' => true]);
    }

    public static function manifest($org, $id): void
    {
        $ctx = org_ctx($org);
        $screen = self::find($ctx, $id);
        respond(Manifest::forScreen($screen));
    }
}
