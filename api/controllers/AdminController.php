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
