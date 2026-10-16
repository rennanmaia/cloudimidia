<?php
declare(strict_types=1);

class IntegrationController
{
    public static function index($org): void
    {
        $ctx = org_ctx($org);
        $rows = DB::all(
            'SELECT i.*, (SELECT COUNT(DISTINCT pi.playlist_id) FROM playlist_items pi WHERE pi.integration_id = i.id)
                + (SELECT COUNT(*) FROM playlists p WHERE p.ticker_integration_id = i.id OR p.music_integration_id = i.id) AS usage_count
             FROM integrations i WHERE i.organization_id = ? ORDER BY i.name',
            [$ctx->id()]
        );
        respond([
            'integrations' => array_map(fn($r) => Integrations::format($r) + [
                'usage_count' => (int)$r['usage_count'],
                'can_edit' => $ctx->canEditOwned($r['created_by'] !== null ? (int)$r['created_by'] : null),
            ], $rows),
            'sports_leagues' => Integrations::SPORTS_LEAGUES,
        ]);
    }

    private static function find(OrgCtx $ctx, $id, bool $edit = false): array
    {
        $row = DB::one('SELECT * FROM integrations WHERE id = ? AND organization_id = ?', [(int)$id, $ctx->id()]);
        if (!$row) abort('Integração não encontrada.', 404);
        if ($edit && !$ctx->canEditOwned($row['created_by'] !== null ? (int)$row['created_by'] : null)) {
            abort('Você não tem permissão para alterar esta integração.', 403);
        }
        return $row;
    }

    private static function validConfig(OrgCtx $ctx, string $type): array
    {
        $config = Integrations::sanitizeConfig($type, input('config', []));
        if ($type === 'music' && $config['media_ids']) {
            $valid = DB::col("SELECT id FROM media WHERE organization_id = ? AND type = 'audio' AND id IN (" . DB::in($config['media_ids']) . ')', array_merge([$ctx->id()], $config['media_ids']));
            $config['media_ids'] = array_values(array_map('intval', array_intersect($config['media_ids'], array_map('intval', $valid))));
            if (!$config['media_ids']) abort('Selecione ao menos uma música da biblioteca.', 422);
        }
        return $config;
    }

    public static function store($org): void
    {
        $ctx = org_ctx($org);
        $ctx->requireCreateContent();
        required(['name' => 'o nome', 'type' => 'o tipo']);
        $type = str_input('type', 30);
        if (!in_array($type, Integrations::TYPES, true)) abort('Tipo de integração inválido.', 422);
        $id = DB::insert('integrations', [
            'organization_id' => $ctx->id(),
            'type' => $type,
            'name' => str_input('name', 120),
            'config' => json_encode(self::validConfig($ctx, $type), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'created_by' => $ctx->userId(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        log_activity($ctx->id(), 'integration.created', 'Integração "' . str_input('name', 120) . '" criada');
        respond(['integration' => Integrations::format(DB::one('SELECT * FROM integrations WHERE id = ?', [$id]))], 201);
    }

    public static function update($org, $id): void
    {
        $ctx = org_ctx($org);
        $row = self::find($ctx, $id, true);
        required(['name' => 'o nome']);
        DB::update('integrations', [
            'name' => str_input('name', 120),
            'config' => json_encode(self::validConfig($ctx, $row['type']), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'updated_at' => now(),
        ], 'id = ?', [$row['id']]);
        respond(['integration' => Integrations::format(DB::one('SELECT * FROM integrations WHERE id = ?', [$row['id']]))]);
    }

    public static function destroy($org, $id): void
    {
        $ctx = org_ctx($org);
        $row = self::find($ctx, $id, true);
        DB::exec('DELETE FROM integrations WHERE id = ?', [$row['id']]);
        log_activity($ctx->id(), 'integration.deleted', "Integração \"{$row['name']}\" excluída");
        respond(['ok' => true]);
    }

    public static function data($org, $id): void
    {
        $ctx = org_ctx($org);
        $row = self::find($ctx, $id);
        respond(Integrations::data($row, query('force') === '1'));
    }

    /** Testa uma configuração antes de salvar. */
    public static function test($org): void
    {
        $ctx = org_ctx($org);
        $ctx->requireCreateContent();
        $type = str_input('type', 30);
        if (!in_array($type, Integrations::TYPES, true)) abort('Tipo inválido.', 422);
        $config = self::validConfig($ctx, $type);
        if (!Integrations::hasRemoteData($type)) respond(['data' => null]);
        try {
            respond(['data' => Integrations::fetch($type, $config, $ctx->id())]);
        } catch (Throwable $e) {
            abort('Não foi possível obter os dados: ' . $e->getMessage(), 422);
        }
    }

    public static function geocode($org): void
    {
        org_ctx($org);
        $q = trim((string)query('q', ''));
        if (mb_strlen($q) < 2) respond(['results' => []]);
        try {
            respond(['results' => Integrations::geocode($q)]);
        } catch (Throwable $e) {
            abort('Não foi possível buscar cidades agora.', 502);
        }
    }
}
