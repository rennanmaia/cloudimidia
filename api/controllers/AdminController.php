<?php
declare(strict_types=1);

/** Administração da plataforma (superadmin): clientes, limites e usuários. */
class AdminController
{
    public static function stats(): void
    {
        Auth::requireSuperadmin();
        respond([
            'users' => (int)DB::val('SELECT COUNT(*) FROM users'),
            'organizations' => (int)DB::val('SELECT COUNT(*) FROM organizations'),
            'screens' => (int)DB::val('SELECT COUNT(*) FROM screens'),
            'screens_online' => (int)DB::val('SELECT COUNT(*) FROM screens WHERE last_seen_at > ?', [gmdate('Y-m-d H:i:s', time() - ScreenController::ONLINE_SECONDS)]),
            'storage_bytes' => (int)DB::val('SELECT COALESCE(SUM(size_bytes),0) FROM media'),
            'plays_24h' => (int)DB::val('SELECT COUNT(*) FROM play_logs WHERE started_at > ?', [gmdate('Y-m-d H:i:s', time() - 86400)]),
        ]);
    }

    public static function orgs(): void
    {
        Auth::requireSuperadmin();
        $q = trim((string)query('q', ''));
        $where = $q !== '' ? 'WHERE o.name LIKE ?' : '';
        $rows = DB::all(
            "SELECT o.*,
               (SELECT COUNT(*) FROM screens s WHERE s.organization_id = o.id) AS screens_count,
               (SELECT COUNT(*) FROM screens s WHERE s.organization_id = o.id AND s.last_seen_at > ?) AS online_count,
               (SELECT COUNT(*) FROM memberships m WHERE m.organization_id = o.id) AS members_count,
               (SELECT COALESCE(SUM(size_bytes),0) FROM media md WHERE md.organization_id = o.id) AS storage_bytes,
               (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = o.id AND m.role = 'owner' ORDER BY m.id LIMIT 1) AS owner_email
             FROM organizations o $where ORDER BY o.created_at DESC LIMIT 500",
            $q !== '' ? [gmdate('Y-m-d H:i:s', time() - ScreenController::ONLINE_SECONDS), "%$q%"] : [gmdate('Y-m-d H:i:s', time() - ScreenController::ONLINE_SECONDS)]
        );
        respond(['organizations' => array_map(fn($o) => format_org($o) + [
            'screens_count' => (int)$o['screens_count'],
            'online_count' => (int)$o['online_count'],
            'members_count' => (int)$o['members_count'],
            'storage_bytes' => (int)$o['storage_bytes'],
            'owner_email' => $o['owner_email'],
        ], $rows)]);
    }

    public static function updateOrg($id): void
    {
        Auth::requireSuperadmin();
        $org = DB::one('SELECT * FROM organizations WHERE id = ?', [(int)$id]);
        if (!$org) abort('Organização não encontrada.', 404);
        $data = ['updated_at' => now()];
        if (has_input('status')) $data['status'] = input('status') === 'suspended' ? 'suspended' : 'active';
        if (has_input('max_screens')) $data['max_screens'] = input('max_screens') === null || input('max_screens') === '' ? null : max(0, (int)input('max_screens'));
        if (has_input('max_storage_mb')) $data['max_storage_mb'] = input('max_storage_mb') === null || input('max_storage_mb') === '' ? null : max(0, (int)input('max_storage_mb'));
        if (has_input('name') && str_input('name', 120) !== '') $data['name'] = str_input('name', 120);
        DB::update('organizations', $data, 'id = ?', [$org['id']]);
        respond(['ok' => true]);
    }

    /* ---------------- Versões do app da TV ---------------- */

    public static function releases(): void
    {
        Auth::requireSuperadmin();
        $rows = DB::all('SELECT r.*, u.name AS creator_name FROM app_releases r LEFT JOIN users u ON u.id = r.created_by ORDER BY r.version_code DESC');
        $installs = DB::all("SELECT JSON_UNQUOTE(JSON_EXTRACT(diagnostics, '$.app_version_code')) AS code, COUNT(*) AS n FROM screens WHERE diagnostics IS NOT NULL GROUP BY code");
        respond([
            'releases' => array_map(fn($r) => [
                'id' => (int)$r['id'],
                'version_code' => (int)$r['version_code'],
                'version_name' => $r['version_name'],
                'url' => upload_url($r['file_path']),
                'size_bytes' => (int)$r['size_bytes'],
                'notes' => $r['notes'],
                'creator_name' => $r['creator_name'],
                'created_at' => $r['created_at'],
            ], $rows),
            'installs' => array_map(fn($i) => ['version_code' => (int)$i['code'], 'screens' => (int)$i['n']], $installs),
            'download_url' => app_url('api/player/app/download'),
        ]);
    }

    /** Envio do .apk em partes (mesmo protocolo das mídias). */
    public static function uploadRelease(): void
    {
        $me = Auth::requireSuperadmin();
        $uploadId = preg_replace('/[^a-zA-Z0-9]/', '', (string)input('upload_id', ''));
        if (strlen($uploadId) < 8) abort('Envio inválido.', 422);
        if (!preg_match('/\.apk$/i', (string)input('name', ''))) abort('Envie o arquivo .apk do aplicativo.', 422);
        $index = (int)input('chunk_index', 0);
        $total = max(1, (int)input('total_chunks', 1));
        $file = $_FILES['file'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK) abort('Falha ao receber o arquivo.', 422);
        if ((int)input('total_size', 0) > 300 * 1024 * 1024) abort('Arquivo muito grande.', 422);

        $tmpDir = STORAGE_DIR . '/tmp';
        ensure_dir($tmpDir);
        $part = $tmpDir . '/apk_' . $me['id'] . '_' . $uploadId . '.part';
        if ($index > 0 && !is_file($part)) abort('Envio não encontrado. Recomece.', 422);
        $out = fopen($part, $index === 0 ? 'wb' : 'ab');
        $in = fopen($file['tmp_name'], 'rb');
        stream_copy_to_stream($in, $out);
        fclose($in);
        fclose($out);
        if ($index < $total - 1) respond(['received' => $index + 1]);

        try {
            $code = (int)input('version_code', 0);
            $name = mb_substr(trim((string)input('version_name', '')), 0, 40);
            if ($code <= 0 || $name === '') abort('Informe a versão (nome e número).', 422);
            if (DB::val('SELECT id FROM app_releases WHERE version_code = ?', [$code])) abort("Já existe uma versão com o número $code.", 422);
            if (file_get_contents($part, false, null, 0, 2) !== 'PK') abort('O arquivo enviado não é um .apk válido.', 422);
            $rel = 'app/cloudimidia-player-' . preg_replace('/[^0-9A-Za-z.\-]/', '', $name) . '-' . $code . '.apk';
            ensure_dir(UPLOAD_DIR . '/app');
            if (!rename($part, UPLOAD_DIR . '/' . $rel)) abort('Não foi possível salvar o arquivo.', 500);
            DB::insert('app_releases', [
                'version_code' => $code,
                'version_name' => $name,
                'file_path' => $rel,
                'size_bytes' => filesize(UPLOAD_DIR . '/' . $rel),
                'notes' => mb_substr(trim((string)input('notes', '')), 0, 1000) ?: null,
                'created_by' => $me['id'],
                'created_at' => now(),
            ]);
        } finally {
            if (is_file($part)) @unlink($part);
        }
        respond(['ok' => true], 201);
    }

    public static function deleteRelease($id): void
    {
        Auth::requireSuperadmin();
        $r = DB::one('SELECT * FROM app_releases WHERE id = ?', [(int)$id]);
        if (!$r) abort('Versão não encontrada.', 404);
        DB::exec('DELETE FROM app_releases WHERE id = ?', [$r['id']]);
        delete_upload($r['file_path']);
        respond(['ok' => true]);
    }

    public static function users(): void
    {
        Auth::requireSuperadmin();
        $q = trim((string)query('q', ''));
        $where = $q !== '' ? 'WHERE u.name LIKE ? OR u.email LIKE ?' : '';
        $rows = DB::all(
            "SELECT u.id, u.name, u.email, u.is_superadmin, u.status, u.last_login_at, u.created_at,
               (SELECT COUNT(*) FROM memberships m WHERE m.user_id = u.id) AS orgs_count,
               (SELECT COUNT(*) FROM screen_permissions sp WHERE sp.user_id = u.id) AS screens_count
             FROM users u $where ORDER BY u.created_at DESC LIMIT 500",
            $q !== '' ? ["%$q%", "%$q%"] : []
        );
        respond(['users' => array_map(fn($u) => [
            'id' => (int)$u['id'], 'name' => $u['name'], 'email' => $u['email'],
            'is_superadmin' => (bool)$u['is_superadmin'], 'status' => $u['status'],
            'last_login_at' => $u['last_login_at'], 'created_at' => $u['created_at'],
            'orgs_count' => (int)$u['orgs_count'], 'screens_count' => (int)$u['screens_count'],
        ], $rows)]);
    }

    public static function updateUser($id): void
    {
        $me = Auth::requireSuperadmin();
        $user = DB::one('SELECT * FROM users WHERE id = ?', [(int)$id]);
        if (!$user) abort('Usuário não encontrado.', 404);
        $isSelf = (int)$user['id'] === (int)$me['id'];
        $data = ['updated_at' => now()];
        if (has_input('status')) {
            if ($isSelf) abort('Você não pode bloquear a própria conta.', 422);
            $data['status'] = input('status') === 'blocked' ? 'blocked' : 'active';
        }
        if (has_input('is_superadmin')) {
            if ($isSelf) abort('Você não pode alterar o próprio acesso de administrador.', 422);
            $data['is_superadmin'] = bool_input('is_superadmin') ? 1 : 0;
        }
        $tempPassword = null;
        if (bool_input('reset_password')) {
            $tempPassword = substr(str_replace(['+', '/', '='], '', base64_encode(random_bytes(9))), 0, 10);
            $data['password_hash'] = password_hash($tempPassword, PASSWORD_DEFAULT);
        }
        DB::update('users', $data, 'id = ?', [$user['id']]);
        if (($data['status'] ?? null) === 'blocked' || $tempPassword) {
            DB::exec('DELETE FROM auth_tokens WHERE user_id = ?', [$user['id']]);
        }
        respond(['ok' => true, 'temp_password' => $tempPassword]);
    }
}
