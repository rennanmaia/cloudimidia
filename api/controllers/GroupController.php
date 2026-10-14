<?php
declare(strict_types=1);

class GroupController
{
    public static function index($org): void
    {
        $ctx = org_ctx($org);
        $rows = DB::all(
            'SELECT g.*, (SELECT COUNT(*) FROM screen_group_members m WHERE m.group_id = g.id) AS screens_count
             FROM screen_groups g WHERE g.organization_id = ? ORDER BY g.name',
            [$ctx->id()]
        );
        respond(['groups' => array_map(fn($g) => ['id' => (int)$g['id'], 'name' => $g['name'], 'color' => $g['color'], 'screens_count' => (int)$g['screens_count']], $rows)]);
    }

    public static function store($org): void
    {
        $ctx = org_ctx($org);
        $ctx->require('editor');
        required(['name' => 'o nome do grupo']);
        $id = DB::insert('screen_groups', [
            'organization_id' => $ctx->id(),
            'name' => str_input('name', 80),
            'color' => valid_color(str_input('color', 20)),
            'created_at' => now(),
        ]);
        self::syncScreens($ctx, $id);
        log_activity($ctx->id(), 'group.created', 'Grupo "' . str_input('name', 80) . '" criado');
        respond(['id' => $id], 201);
    }

    public static function update($org, $id): void
    {
        $ctx = org_ctx($org);
        $ctx->require('editor');
        $group = DB::one('SELECT * FROM screen_groups WHERE id = ? AND organization_id = ?', [(int)$id, $ctx->id()]);
        if (!$group) abort('Grupo não encontrado.', 404);
        required(['name' => 'o nome do grupo']);
        DB::update('screen_groups', ['name' => str_input('name', 80), 'color' => valid_color(str_input('color', 20))], 'id = ?', [$group['id']]);
        self::syncScreens($ctx, (int)$group['id']);
        respond(['ok' => true]);
    }

    private static function syncScreens(OrgCtx $ctx, int $groupId): void
    {
        if (!has_input('screen_ids')) return;
        $ids = ints(input('screen_ids'));
        $valid = $ids ? DB::col('SELECT id FROM screens WHERE organization_id = ? AND id IN (' . DB::in($ids) . ')', array_merge([$ctx->id()], $ids)) : [];
        DB::exec('DELETE FROM screen_group_members WHERE group_id = ?', [$groupId]);
        foreach ($valid as $sid) {
            DB::insert('screen_group_members', ['screen_id' => $sid, 'group_id' => $groupId]);
        }
    }

    public static function destroy($org, $id): void
    {
        $ctx = org_ctx($org);
        $ctx->require('editor');
        $group = DB::one('SELECT * FROM screen_groups WHERE id = ? AND organization_id = ?', [(int)$id, $ctx->id()]);
        if (!$group) abort('Grupo não encontrado.', 404);
        DB::exec('DELETE FROM screen_groups WHERE id = ?', [$group['id']]);
        // Programações que ficaram sem nenhum alvo são desativadas
        DB::exec('UPDATE schedules s SET is_active = 0 WHERE s.organization_id = ? AND NOT EXISTS (SELECT 1 FROM schedule_targets t WHERE t.schedule_id = s.id)', [$ctx->id()]);
        log_activity($ctx->id(), 'group.deleted', "Grupo \"{$group['name']}\" excluído");
        respond(['ok' => true]);
    }
}
