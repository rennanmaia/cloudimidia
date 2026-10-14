<?php
declare(strict_types=1);

class MemberController
{
    public static function index($org): void
    {
        $ctx = org_ctx($org);
        $ctx->require('viewer');
        $members = DB::all(
            'SELECT u.id, u.name, u.email, m.role, m.created_at FROM memberships m JOIN users u ON u.id = m.user_id
             WHERE m.organization_id = ? ORDER BY FIELD(m.role, "owner","admin","editor","viewer"), u.name',
            [$ctx->id()]
        );
        $guests = DB::all(
            'SELECT sp.id, sp.role, sp.created_at, u.id AS user_id, u.name, u.email, s.id AS screen_id, s.name AS screen_name
             FROM screen_permissions sp JOIN users u ON u.id = sp.user_id JOIN screens s ON s.id = sp.screen_id
             WHERE s.organization_id = ? ORDER BY u.name, s.name',
            [$ctx->id()]
        );
        respond([
            'members' => array_map(fn($m) => $m + ['is_me' => (int)$m['id'] === $ctx->userId()], $members),
            'guests' => $guests,
        ]);
    }

    private static function ownersCount(int $orgId): int
    {
        return (int)DB::val('SELECT COUNT(*) FROM memberships WHERE organization_id = ? AND role = "owner"', [$orgId]);
    }

    public static function update($org, $user): void
    {
        $ctx = org_ctx($org);
        $ctx->require('admin');
        $userId = (int)$user;
        $current = DB::val('SELECT role FROM memberships WHERE organization_id = ? AND user_id = ?', [$ctx->id(), $userId]);
        if (!$current) abort('Membro não encontrado.', 404);
        $role = str_input('role', 20);
        if (!isset(OrgCtx::RANK[$role])) abort('Papel inválido.', 422);
        // Somente proprietários podem promover a proprietário ou alterar outro proprietário
        if (($role === 'owner' || $current === 'owner') && !$ctx->can('owner')) {
            abort('Apenas proprietários podem alterar este papel.', 403);
        }
        if ($current === 'owner' && $role !== 'owner' && self::ownersCount($ctx->id()) <= 1) {
            abort('A organização precisa ter pelo menos um proprietário.', 422);
        }
        DB::exec('UPDATE memberships SET role = ? WHERE organization_id = ? AND user_id = ?', [$role, $ctx->id(), $userId]);
        $name = DB::val('SELECT name FROM users WHERE id = ?', [$userId]);
        log_activity($ctx->id(), 'member.updated', "Papel de $name alterado para $role");
        respond(['ok' => true]);
    }

    public static function destroy($org, $user): void
    {
        $ctx = org_ctx($org);
        $userId = (int)$user;
        $isSelf = $userId === $ctx->userId();
        if (!$isSelf) $ctx->require('admin');
        $current = DB::val('SELECT role FROM memberships WHERE organization_id = ? AND user_id = ?', [$ctx->id(), $userId]);
        if (!$current) abort('Membro não encontrado.', 404);
        if ($current === 'owner' && !$isSelf && !$ctx->can('owner')) abort('Apenas proprietários podem remover outro proprietário.', 403);
        if ($current === 'owner' && self::ownersCount($ctx->id()) <= 1) {
            abort('A organização precisa ter pelo menos um proprietário. Transfira a propriedade antes de sair.', 422);
        }
        DB::exec('DELETE FROM memberships WHERE organization_id = ? AND user_id = ?', [$ctx->id(), $userId]);
        $name = DB::val('SELECT name FROM users WHERE id = ?', [$userId]);
        log_activity($ctx->id(), 'member.removed', $isSelf ? "$name saiu da organização" : "$name removido da equipe");
        respond(['ok' => true]);
    }

    private static function guestRow(OrgCtx $ctx, int $id): array
    {
        $row = DB::one(
            'SELECT sp.*, u.name, s.name AS screen_name FROM screen_permissions sp JOIN screens s ON s.id = sp.screen_id JOIN users u ON u.id = sp.user_id
             WHERE sp.id = ? AND s.organization_id = ?',
            [$id, $ctx->id()]
        );
        if (!$row) abort('Acesso não encontrado.', 404);
        return $row;
    }

    public static function updateGuest($org, $id): void
    {
        $ctx = org_ctx($org);
        $ctx->require('admin');
        $row = self::guestRow($ctx, (int)$id);
        $role = str_input('role', 20);
        if (!in_array($role, ['editor', 'viewer'], true)) abort('Papel inválido.', 422);
        DB::exec('UPDATE screen_permissions SET role = ? WHERE id = ?', [$role, $row['id']]);
        respond(['ok' => true]);
    }

    public static function destroyGuest($org, $id): void
    {
        $ctx = org_ctx($org);
        $row = self::guestRow($ctx, (int)$id);
        if ((int)$row['user_id'] !== $ctx->userId()) $ctx->require('admin');
        DB::exec('DELETE FROM screen_permissions WHERE id = ?', [$row['id']]);
        log_activity($ctx->id(), 'guest.removed', "Acesso de {$row['name']} à TV {$row['screen_name']} removido");
        respond(['ok' => true]);
    }
}
