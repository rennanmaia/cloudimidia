<?php
declare(strict_types=1);

class InvitationController
{
    private static function format(array $inv): array
    {
        $screenIds = ints(decode_json($inv['screen_ids']));
        $screens = $screenIds ? DB::all('SELECT id, name FROM screens WHERE id IN (' . DB::in($screenIds) . ')', $screenIds) : [];
        return [
            'id' => (int)$inv['id'],
            'email' => $inv['email'],
            'role' => $inv['role'],
            'scope' => $inv['scope'],
            'screens' => $screens,
            'link' => app_url('#/convite/' . $inv['token']),
            'expires_at' => $inv['expires_at'],
            'accepted_at' => $inv['accepted_at'],
            'created_at' => $inv['created_at'],
            'invited_by_name' => $inv['invited_by_name'] ?? null,
        ];
    }

    public static function index($org): void
    {
        $ctx = org_ctx($org);
        $ctx->require('admin');
        $rows = DB::all(
            'SELECT i.*, u.name AS invited_by_name FROM invitations i LEFT JOIN users u ON u.id = i.invited_by
             WHERE i.organization_id = ? AND i.accepted_at IS NULL ORDER BY i.id DESC',
            [$ctx->id()]
        );
        respond(['invitations' => array_map([self::class, 'format'], $rows)]);
    }

    public static function store($org): void
    {
        $ctx = org_ctx($org);
        $ctx->require('admin');
        $email = mb_strtolower(str_input('email', 190));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) abort('Informe um e-mail válido.', 422, ['email' => 'E-mail inválido.']);
        $scope = input('scope') === 'screens' ? 'screens' : 'org';
        $role = str_input('role', 20, 'editor');
        $screenIds = [];

        if ($scope === 'org') {
            if (!in_array($role, ['viewer', 'editor', 'admin', 'owner'], true)) abort('Papel inválido.', 422);
            if ($role === 'owner' && !$ctx->can('owner')) abort('Apenas proprietários podem convidar outro proprietário.', 403);
            $existing = DB::val('SELECT m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.organization_id = ? AND u.email = ?', [$ctx->id(), $email]);
            if ($existing) abort('Esta pessoa já faz parte da equipe.', 422);
        } else {
            if (!in_array($role, ['viewer', 'editor'], true)) abort('Papel inválido.', 422);
            $screenIds = ints(input('screen_ids', []));
            if (!$screenIds) abort('Selecione ao menos uma TV.', 422);
            $valid = DB::col('SELECT id FROM screens WHERE organization_id = ? AND id IN (' . DB::in($screenIds) . ')', array_merge([$ctx->id()], $screenIds));
            if (count($valid) !== count($screenIds)) abort('TV inválida.', 422);
        }

        $token = random_token(24);
        $id = DB::insert('invitations', [
            'organization_id' => $ctx->id(),
            'email' => $email,
            'role' => $role,
            'scope' => $scope,
            'screen_ids' => $screenIds ? json_encode($screenIds) : null,
            'token' => $token,
            'invited_by' => $ctx->userId(),
            'expires_at' => gmdate('Y-m-d H:i:s', time() + 7 * 86400),
            'created_at' => now(),
        ]);
        $inv = DB::one('SELECT * FROM invitations WHERE id = ?', [$id]);
        $formatted = self::format($inv);
        $what = $scope === 'org' ? "a equipe de {$ctx->org['name']}" : 'TV(s) de ' . $ctx->org['name'];
        send_mail(
            $email,
            "Convite para gerenciar {$ctx->org['name']}",
            "Olá!\n\n{$ctx->user['name']} convidou você para gerenciar $what no " . config('app_name') . ".\n\nAceite o convite pelo link (válido por 7 dias):\n{$formatted['link']}\n"
        );
        log_activity($ctx->id(), 'invitation.created', "Convite enviado para $email");
        respond(['invitation' => $formatted], 201);
    }

    public static function destroy($org, $id): void
    {
        $ctx = org_ctx($org);
        $ctx->require('admin');
        DB::exec('DELETE FROM invitations WHERE id = ? AND organization_id = ?', [(int)$id, $ctx->id()]);
        respond(['ok' => true]);
    }

    private static function findValid(string $token): array
    {
        $inv = DB::one(
            'SELECT i.*, o.name AS org_name, o.logo_path, u.name AS invited_by_name FROM invitations i
             JOIN organizations o ON o.id = i.organization_id LEFT JOIN users u ON u.id = i.invited_by WHERE i.token = ?',
            [$token]
        );
        if (!$inv) abort('Convite não encontrado.', 404);
        if ($inv['accepted_at']) abort('Este convite já foi utilizado.', 410);
        if (strtotime($inv['expires_at'] . ' UTC') < time()) abort('Este convite expirou. Peça um novo convite.', 410);
        return $inv;
    }

    public static function showPublic($token): void
    {
        $inv = self::findValid((string)$token);
        $f = self::format($inv);
        respond([
            'invitation' => [
                'email' => $f['email'],
                'role' => $f['role'],
                'scope' => $f['scope'],
                'screens' => $f['screens'],
                'organization_name' => $inv['org_name'],
                'organization_logo' => upload_url($inv['logo_path']),
                'invited_by_name' => $inv['invited_by_name'],
                'has_account' => (bool)DB::val('SELECT id FROM users WHERE email = ?', [$inv['email']]),
            ],
        ]);
    }

    public static function accept($token): void
    {
        $user = Auth::require();
        $inv = self::findValid((string)$token);
        $orgId = (int)$inv['organization_id'];
        $userId = (int)$user['id'];

        DB::transaction(function () use ($inv, $orgId, $userId) {
            $current = DB::val('SELECT role FROM memberships WHERE organization_id = ? AND user_id = ?', [$orgId, $userId]);
            if ($inv['scope'] === 'org') {
                if (!$current) {
                    DB::insert('memberships', ['organization_id' => $orgId, 'user_id' => $userId, 'role' => $inv['role'], 'created_at' => now()]);
                } elseif (OrgCtx::RANK[$inv['role']] > OrgCtx::RANK[$current]) {
                    DB::exec('UPDATE memberships SET role = ? WHERE organization_id = ? AND user_id = ?', [$inv['role'], $orgId, $userId]);
                }
            } elseif (!$current) {
                foreach (ints(decode_json($inv['screen_ids'])) as $sid) {
                    $exists = DB::one('SELECT * FROM screen_permissions WHERE screen_id = ? AND user_id = ?', [$sid, $userId]);
                    if (!$exists) {
                        DB::insert('screen_permissions', ['screen_id' => $sid, 'user_id' => $userId, 'role' => $inv['role'], 'created_at' => now()]);
                    } elseif ($exists['role'] === 'viewer' && $inv['role'] === 'editor') {
                        DB::exec('UPDATE screen_permissions SET role = "editor" WHERE id = ?', [$exists['id']]);
                    }
                }
            }
            DB::exec('UPDATE invitations SET accepted_at = ?, accepted_by = ? WHERE id = ?', [now(), $userId, $inv['id']]);
        });

        DB::insert('activity_logs', ['organization_id' => $orgId, 'user_id' => $userId, 'action' => 'invitation.accepted', 'description' => "{$user['name']} aceitou o convite", 'created_at' => now()]);
        respond(['organization_id' => $orgId]);
    }
}
