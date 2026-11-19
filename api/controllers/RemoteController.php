<?php
declare(strict_types=1);

/**
 * Controle remoto da trilha sonora pelo celular (área logada).
 * Enquanto a tela do controle está aberta, a TV consulta os comandos a cada poucos segundos
 * (remote_until); fora disso, eles chegam no heartbeat normal (15 s).
 */
class RemoteController
{
    /** Tempo que a TV fica no modo rápido depois do último contato do controle */
    private const SESSION_SECONDS = 45;

    private static function screen(OrgCtx $ctx, $id): array
    {
        $s = DB::one('SELECT * FROM screens WHERE id = ? AND organization_id = ?', [(int)$id, $ctx->id()]);
        if (!$s || !$ctx->canViewScreen((int)$s['id'])) abort('TV não encontrada.', 404);
        if (!$ctx->canOperateScreen((int)$s['id'])) abort('Você não tem permissão para controlar esta TV.', 403);
        return $s;
    }

    private static function keepAlive(int $sid): void
    {
        DB::update('screens', ['remote_until' => gmdate('Y-m-d H:i:s', time() + self::SESSION_SECONDS)], 'id = ?', [$sid]);
    }

    /** Situação da trilha na TV (consultada pelo controle a cada 2 s). */
    public static function status($org, $id): void
    {
        $ctx = org_ctx($org);
        $s = self::screen($ctx, $id);
        self::keepAlive((int)$s['id']);
        $st = decode_json($s['soundtrack'] ?? null, null);
        $state = decode_json($s['soundtrack_state'] ?? null, null);
        $lastSeen = $s['last_seen_at'] ? strtotime($s['last_seen_at'] . ' UTC') : 0;
        // Situação velha (TV sem contato) não vale
        if ($state && strtotime($state['at'] ?? '') < time() - 90) $state = null;
        respond([
            'screen' => ['id' => (int)$s['id'], 'name' => $s['name'], 'online' => $lastSeen > time() - ScreenController::ONLINE_SECONDS, 'muted' => (bool)$s['muted']],
            'soundtrack' => $st ? ['provider' => $st['source']['provider'] ?? null, 'url' => $st['url'], 'volume' => $st['volume'] ?? 60] : null,
            'state' => $state,
        ]);
    }

    public static function send($org, $id): void
    {
        $ctx = org_ctx($org);
        $s = self::screen($ctx, $id);
        $cmd = str_input('command', 20);
        if (!in_array($cmd, Soundtrack::REMOTE_COMMANDS, true)) abort('Comando inválido.', 422);
        if (!$s['soundtrack']) abort('Esta TV não tem trilha sonora configurada.', 422);
        $payload = null;
        if ($cmd === 'volume') {
            $v = input('value');
            if (!is_numeric($v)) abort('Informe o volume.', 422);
            $payload = json_encode(['value' => max(0, min(100, (int)$v))]);
            // Só vale o último volume pedido
            DB::exec("UPDATE screen_commands SET delivered_at = ? WHERE screen_id = ? AND command = 'st_volume' AND delivered_at IS NULL", [now(), $s['id']]);
        }
        DB::insert('screen_commands', ['screen_id' => $s['id'], 'command' => 'st_' . $cmd, 'payload' => $payload, 'created_by' => $ctx->userId(), 'created_at' => now()]);
        self::keepAlive((int)$s['id']);
        respond(['ok' => true]);
    }
}
