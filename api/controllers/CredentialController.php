<?php
declare(strict_types=1);

/** Gerenciamento das chaves de APIs externas da organização (só administradores alteram). */
class CredentialController
{
    private static function provider(string $p): array
    {
        if (!isset(Credentials::PROVIDERS[$p])) abort('Serviço desconhecido.', 404);
        return Credentials::PROVIDERS[$p];
    }

    public static function index($org): void
    {
        $ctx = org_ctx($org);
        $ctx->require('viewer');
        $rows = [];
        foreach (DB::all('SELECT c.*, u.name AS updated_by_name FROM org_credentials c LEFT JOIN users u ON u.id = c.updated_by WHERE c.organization_id = ?', [$ctx->id()]) as $r) {
            $rows[$r['provider']] = $r;
        }
        $out = [];
        foreach (Credentials::PROVIDERS as $key => $p) {
            $r = $rows[$key] ?? null;
            $out[] = [
                'provider' => $key,
                'name' => $p['name'],
                'description' => $p['description'],
                'url' => $p['url'],
                'configured' => (bool)$r,
                'hint' => $r['hint'] ?? null,
                'status' => $r['status'] ?? null,
                'status_message' => $r['status_message'] ?? null,
                'checked_at' => $r['checked_at'] ?? null,
                'updated_at' => $r['updated_at'] ?? ($r['created_at'] ?? null),
                'updated_by_name' => $r['updated_by_name'] ?? null,
            ];
        }
        respond(['credentials' => $out, 'can_manage' => $ctx->can('admin')]);
    }

    /** Cadastra ou troca a chave (validada no serviço antes de salvar). */
    public static function update($org, $provider): void
    {
        $ctx = org_ctx($org);
        $ctx->require('admin');
        $p = self::provider((string)$provider);
        $secret = trim((string)input('secret', ''));
        if ($secret === '' || strlen($secret) > 500 || preg_match('/\s/', $secret)) abort('Informe a chave.', 422);
        try {
            $summary = Credentials::test((string)$provider, $secret);
        } catch (Throwable $e) {
            abort("{$p['name']} recusou a chave: " . $e->getMessage(), 422);
        }
        $data = [
            'secret' => Credentials::encrypt($secret),
            'hint' => Credentials::mask($secret),
            'status' => 'ok',
            'status_message' => $summary,
            'checked_at' => now(),
            'updated_by' => $ctx->userId(),
            'updated_at' => now(),
        ];
        $exists = DB::val('SELECT id FROM org_credentials WHERE organization_id = ? AND provider = ?', [$ctx->id(), $provider]);
        if ($exists) DB::update('org_credentials', $data, 'id = ?', [$exists]);
        else DB::insert('org_credentials', $data + ['organization_id' => $ctx->id(), 'provider' => (string)$provider, 'created_at' => now()]);
        // Dados em cache das integrações desse serviço são refeitos com a nova chave
        DB::exec('DELETE c FROM integration_cache c JOIN integrations i ON i.id = c.integration_id WHERE i.organization_id = ? AND i.type = ?', [$ctx->id(), $provider]);
        log_activity($ctx->id(), 'credential.updated', "Chave do {$p['name']} " . ($exists ? 'trocada' : 'cadastrada'));
        respond(['ok' => true, 'message' => $summary]);
    }

    public static function destroy($org, $provider): void
    {
        $ctx = org_ctx($org);
        $ctx->require('admin');
        $p = self::provider((string)$provider);
        DB::exec('DELETE FROM org_credentials WHERE organization_id = ? AND provider = ?', [$ctx->id(), $provider]);
        log_activity($ctx->id(), 'credential.deleted', "Chave do {$p['name']} removida");
        respond(['ok' => true]);
    }

    /** Testa de novo a chave salva. */
    public static function test($org, $provider): void
    {
        $ctx = org_ctx($org);
        $ctx->require('editor');
        self::provider((string)$provider);
        $secret = Credentials::get($ctx->id(), (string)$provider);
        if ($secret === null) abort('Nenhuma chave cadastrada.', 404);
        try {
            $summary = Credentials::test((string)$provider, $secret);
            $status = ['status' => 'ok', 'status_message' => $summary];
        } catch (Throwable $e) {
            $status = ['status' => 'error', 'status_message' => mb_substr($e->getMessage(), 0, 500)];
        }
        DB::update('org_credentials', $status + ['checked_at' => now()], 'organization_id = ? AND provider = ?', [$ctx->id(), $provider]);
        respond($status);
    }

    /** Campeonatos liberados para a chave do FutDigital (para escolher na integração). */
    public static function futdigitalCompetitions($org): void
    {
        $ctx = org_ctx($org);
        $secret = Credentials::get($ctx->id(), 'futdigital');
        if ($secret === null) respond(['configured' => false, 'competitions' => []]);
        try {
            $list = Integrations::futdigitalApi($secret, 'competitions');
        } catch (Throwable $e) {
            abort('Não foi possível consultar o FutDigital: ' . $e->getMessage(), 502);
        }
        respond(['configured' => true, 'competitions' => array_map(fn($c) => [
            'id' => (int)$c['id'],
            'name' => $c['name'],
            'status' => $c['status'] ?? null,
            'season' => $c['season'] ?? null,
            'city' => $c['city'] ?? null,
            'logo_url' => $c['logo_url'] ?? null,
            'league' => $c['league']['name'] ?? null,
        ], $list)]);
    }
}
