<?php
declare(strict_types=1);

class ScheduleController
{
    private static function targetsFor(array $scheduleIds): array
    {
        if (!$scheduleIds) return [];
        $out = [];
        foreach (DB::all(
            'SELECT t.schedule_id, t.screen_id, t.group_id, s.name AS screen_name, g.name AS group_name, g.color AS group_color
             FROM schedule_targets t LEFT JOIN screens s ON s.id = t.screen_id LEFT JOIN screen_groups g ON g.id = t.group_id
             WHERE t.schedule_id IN (' . DB::in($scheduleIds) . ')',
            $scheduleIds
        ) as $t) {
            $out[(int)$t['schedule_id']][] = $t['screen_id']
                ? ['type' => 'screen', 'id' => (int)$t['screen_id'], 'name' => $t['screen_name']]
                : ['type' => 'group', 'id' => (int)$t['group_id'], 'name' => $t['group_name'], 'color' => $t['group_color']];
        }
        return $out;
    }

    private static function guestCan(OrgCtx $ctx, array $targets, bool $edit): bool
    {
        if (!$targets) return false;
        foreach ($targets as $t) {
            if ($t['type'] !== 'screen') return false;
            $role = $ctx->screens[$t['id']] ?? null;
            if (!$role || ($edit && $role !== 'editor')) return false;
        }
        return true;
    }

    public static function index($org): void
    {
        $ctx = org_ctx($org);
        $params = [$ctx->id()];
        $filter = '';
        $screenId = int_or_null(query('screen_id'));
        if ($screenId) {
            $ids = array_column(Manifest::schedulesForScreen($screenId, $ctx->id(), false), 'id');
            if (!$ids) respond(['schedules' => []]);
            $filter = ' AND s.id IN (' . DB::in($ids) . ')';
            $params = array_merge($params, $ids);
        }
        $rows = DB::all(
            "SELECT s.*, p.name AS playlist_name FROM schedules s JOIN playlists p ON p.id = s.playlist_id
             WHERE s.organization_id = ? $filter ORDER BY s.is_active DESC, s.priority DESC, s.name",
            $params
        );
        $targets = self::targetsFor(array_column($rows, 'id'));
        $out = [];
        foreach ($rows as $r) {
            $t = $targets[(int)$r['id']] ?? [];
            if ($ctx->isGuest() && !self::guestCan($ctx, $t, false)) continue;
            $f = Manifest::formatSchedule($r);
            $f['playlist_name'] = $r['playlist_name'];
            $f['targets'] = $t;
            $f['can_edit'] = $ctx->can('editor') || ($ctx->isGuest() && self::guestCan($ctx, $t, true));
            $out[] = $f;
        }
        respond(['schedules' => $out, 'timezone' => $ctx->org['timezone']]);
    }

    private static function validated(OrgCtx $ctx): array
    {
        required(['name' => 'o nome da programação', 'playlist_id' => 'a playlist']);
        $playlistId = (int)input('playlist_id');
        if (!DB::val('SELECT id FROM playlists WHERE id = ? AND organization_id = ?', [$playlistId, $ctx->id()])) abort('Playlist inválida.', 422);
        if ($ctx->isGuest() && !in_array($playlistId, $ctx->guestPlaylistIds(), true)) abort('Playlist inválida.', 422);

        $time = function ($key) {
            $v = str_input($key, 8);
            if ($v === '') return null;
            if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)(:\d\d)?$/', $v)) abort('Horário inválido.', 422);
            return substr($v, 0, 5) . ':00';
        };
        $date = function ($key) {
            $v = str_input($key, 10);
            if ($v === '') return null;
            $d = DateTime::createFromFormat('Y-m-d', $v);
            if (!$d || $d->format('Y-m-d') !== $v) abort('Data inválida.', 422);
            return $v;
        };
        $start = $time('start_time');
        $end = $time('end_time');
        if (($start === null) !== ($end === null)) abort('Informe o horário de início e de fim, ou marque "Dia todo".', 422);
        if ($start !== null && $start === $end) abort('O horário de início e fim não podem ser iguais.', 422);
        $startDate = $date('start_date');
        $endDate = $date('end_date');
        if ($startDate && $endDate && $endDate < $startDate) abort('A data final deve ser depois da data inicial.', 422);

        $days = array_values(array_unique(array_filter(array_map('intval', (array)input('days', [])), fn($d) => $d >= 0 && $d <= 6)));
        sort($days);
        if (!$days) abort('Selecione ao menos um dia da semana.', 422);

        $targets = [];
        foreach ((array)input('targets', []) as $t) {
            if (!is_array($t)) continue;
            $type = ($t['type'] ?? '') === 'group' ? 'group' : 'screen';
            $id = (int)($t['id'] ?? 0);
            if ($id <= 0) continue;
            $table = $type === 'group' ? 'screen_groups' : 'screens';
            if (!DB::val("SELECT id FROM $table WHERE id = ? AND organization_id = ?", [$id, $ctx->id()])) abort('TV ou grupo inválido.', 422);
            $targets[$type . $id] = ['type' => $type, 'id' => $id];
        }
        $targets = array_values($targets);
        if (!$targets) abort('Selecione em quais TVs ou grupos a programação será exibida.', 422);
        if ($ctx->isGuest() && !self::guestCan($ctx, $targets, true)) abort('Você só pode programar as TVs às quais tem acesso.', 403);

        return [
            'data' => [
                'name' => str_input('name', 120),
                'playlist_id' => $playlistId,
                'mode' => input('mode') === 'insert' ? 'insert' : 'replace',
                'insert_every' => max(1, min(50, (int)input('insert_every', 3))),
                'priority' => max(1, min(100, (int)input('priority', 10))),
                'days' => implode(',', $days),
                'start_time' => $start,
                'end_time' => $end,
                'start_date' => $startDate,
                'end_date' => $endDate,
                'is_active' => bool_input('is_active', true) ? 1 : 0,
                'color' => valid_color(str_input('color', 20)),
                'updated_at' => now(),
            ],
            'targets' => $targets,
        ];
    }

    private static function saveTargets(int $scheduleId, array $targets): void
    {
        DB::exec('DELETE FROM schedule_targets WHERE schedule_id = ?', [$scheduleId]);
        foreach ($targets as $t) {
            DB::insert('schedule_targets', [
                'schedule_id' => $scheduleId,
                'screen_id' => $t['type'] === 'screen' ? $t['id'] : null,
                'group_id' => $t['type'] === 'group' ? $t['id'] : null,
            ]);
        }
    }

    public static function store($org): void
    {
        $ctx = org_ctx($org);
        if (!$ctx->can('editor') && !$ctx->editableGuestScreens()) abort('Você não tem permissão para esta ação.', 403);
        $v = self::validated($ctx);
        $id = DB::transaction(function () use ($ctx, $v) {
            $id = DB::insert('schedules', $v['data'] + ['organization_id' => $ctx->id(), 'created_by' => $ctx->userId(), 'created_at' => now()]);
            self::saveTargets($id, $v['targets']);
            return $id;
        });
        log_activity($ctx->id(), 'schedule.created', "Programação \"{$v['data']['name']}\" criada");
        respond(['id' => $id], 201);
    }

    private static function findEditable(OrgCtx $ctx, $id): array
    {
        $s = DB::one('SELECT * FROM schedules WHERE id = ? AND organization_id = ?', [(int)$id, $ctx->id()]);
        if (!$s) abort('Programação não encontrada.', 404);
        if (!$ctx->can('editor')) {
            $targets = self::targetsFor([(int)$s['id']])[(int)$s['id']] ?? [];
            if (!$ctx->isGuest() || !self::guestCan($ctx, $targets, true)) abort('Você não tem permissão para alterar esta programação.', 403);
        }
        return $s;
    }

    public static function update($org, $id): void
    {
        $ctx = org_ctx($org);
        $s = self::findEditable($ctx, $id);
        // Atualização parcial apenas do status (ativar/desativar rapidamente)
        if (array_keys(body()) === ['is_active']) {
            DB::update('schedules', ['is_active' => bool_input('is_active') ? 1 : 0, 'updated_at' => now()], 'id = ?', [$s['id']]);
            log_activity($ctx->id(), 'schedule.updated', "Programação \"{$s['name']}\" " . (bool_input('is_active') ? 'ativada' : 'pausada'));
            respond(['ok' => true]);
        }
        $v = self::validated($ctx);
        DB::transaction(function () use ($s, $v) {
            DB::update('schedules', $v['data'], 'id = ?', [$s['id']]);
            self::saveTargets((int)$s['id'], $v['targets']);
        });
        log_activity($ctx->id(), 'schedule.updated', "Programação \"{$v['data']['name']}\" atualizada");
        respond(['ok' => true]);
    }

    public static function destroy($org, $id): void
    {
        $ctx = org_ctx($org);
        $s = self::findEditable($ctx, $id);
        DB::exec('DELETE FROM schedules WHERE id = ?', [$s['id']]);
        log_activity($ctx->id(), 'schedule.deleted', "Programação \"{$s['name']}\" excluída");
        respond(['ok' => true]);
    }
}
