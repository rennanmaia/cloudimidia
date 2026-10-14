<?php
declare(strict_types=1);

/**
 * Endpoints usados pelo player instalado na TV.
 *
 * Fluxo de pareamento:
 *  1. A TV abre /tv, gera uma chave local e chama POST player/register -> recebe um código de 6 dígitos.
 *  2. A TV exibe o código (e um QR Code) e consulta POST player/poll a cada poucos segundos.
 *  3. No celular, o usuário digita o código em "Adicionar TV"; a API cria a TV e gera o token do aparelho.
 *  4. O próximo poll entrega o token à TV, que passa a usar o cabeçalho X-Device-Token.
 */
class PlayerController
{
    private static function deviceKeyHash(): string
    {
        $key = (string)input('device_key', '');
        if (!preg_match('/^[a-zA-Z0-9-]{16,128}$/', $key)) abort('Chave do dispositivo inválida.', 422);
        return hash('sha256', $key);
    }

    private static function deviceInfo(): ?string
    {
        $info = input('info');
        if (!is_array($info)) return null;
        $clean = [];
        foreach (['resolution', 'platform', 'user_agent', 'version', 'language'] as $k) {
            if (isset($info[$k]) && is_scalar($info[$k])) $clean[$k] = mb_substr((string)$info[$k], 0, 255);
        }
        return json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function register(): void
    {
        $hash = self::deviceKeyHash();
        $existing = DB::one(
            'SELECT * FROM pairing_requests WHERE device_key_hash = ? AND expires_at > ? AND screen_id IS NULL ORDER BY id DESC LIMIT 1',
            [$hash, now()]
        );
        if ($existing) {
            respond(['code' => $existing['code'], 'expires_at' => $existing['expires_at'], 'pair_url' => app_url('#/tvs/adicionar?code=' . $existing['code'])]);
        }
        // limpeza ocasional de pedidos antigos
        if (random_int(1, 10) === 1) {
            DB::exec('DELETE FROM pairing_requests WHERE expires_at < ?', [gmdate('Y-m-d H:i:s', time() - 86400)]);
        }
        $attempts = 0;
        do {
            $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $taken = DB::val('SELECT id FROM pairing_requests WHERE code = ? AND expires_at > ? AND screen_id IS NULL', [$code, now()]);
        } while ($taken && ++$attempts < 20);

        $expires = gmdate('Y-m-d H:i:s', time() + 3600);
        DB::insert('pairing_requests', [
            'code' => $code,
            'device_key_hash' => $hash,
            'device_info' => self::deviceInfo(),
            'expires_at' => $expires,
            'created_at' => now(),
        ]);
        respond(['code' => $code, 'expires_at' => $expires, 'pair_url' => app_url('#/tvs/adicionar?code=' . $code)]);
    }

    public static function poll(): void
    {
        $hash = self::deviceKeyHash();
        $req = DB::one('SELECT * FROM pairing_requests WHERE device_key_hash = ? ORDER BY id DESC LIMIT 1', [$hash]);
        if (!$req) respond(['status' => 'unknown']);
        if ($req['screen_id'] && $req['device_token']) {
            DB::update('pairing_requests', ['device_token' => null, 'claimed_at' => now()], 'id = ?', [$req['id']]);
            respond(['status' => 'paired', 'token' => $req['device_token']]);
        }
        if (strtotime($req['expires_at'] . ' UTC') < time() || $req['screen_id']) {
            respond(['status' => 'expired']);
        }
        respond(['status' => 'waiting', 'code' => $req['code']]);
    }

    /**
     * Instalação por link: a TV foi cadastrada antes no painel e o técnico abriu /tv?instalar=TOKEN.
     * O link vale uma única vez e expira; o aparelho recebe direto o seu token.
     */
    public static function install(): void
    {
        $token = (string)input('token', '');
        if (!preg_match('/^[a-f0-9]{48}$/', $token)) abort('Link de instalação inválido.', 422);
        $screen = DB::one('SELECT * FROM screens WHERE install_token_hash = ?', [hash('sha256', $token)]);
        if (!$screen) abort('Este link de instalação não é válido ou já foi usado. Gere um novo link no painel.', 404);
        if (strtotime($screen['install_expires_at'] . ' UTC') < time()) abort('Este link de instalação expirou. Gere um novo link no painel.', 410);

        $deviceToken = random_token(32);
        ScreenController::attachDevice((int)$screen['id'], $deviceToken, self::deviceInfo());
        DB::insert('activity_logs', [
            'organization_id' => $screen['organization_id'],
            'action' => 'screen.installed',
            'description' => "Aparelho instalado na TV \"{$screen['name']}\" pelo link de instalação",
            'created_at' => now(),
        ]);
        respond(['token' => $deviceToken, 'screen_name' => $screen['name']]);
    }

    private static function screen(): array
    {
        $token = $_SERVER['HTTP_X_DEVICE_TOKEN'] ?? '';
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) abort('Dispositivo não autorizado.', 401);
        $screen = DB::one('SELECT * FROM screens WHERE device_token_hash = ?', [hash('sha256', $token)]);
        if (!$screen) abort('Dispositivo não autorizado.', 401);
        return $screen;
    }

    public static function manifest(): void
    {
        $screen = self::screen();
        respond(Manifest::forScreen($screen));
    }

    public static function heartbeat(): void
    {
        $screen = self::screen();
        $sid = (int)$screen['id'];
        $data = [
            'last_seen_at' => now(),
            'last_ip' => client_ip(),
            'now_playing' => str_input('now_playing', 255) ?: null,
        ];
        $info = self::deviceInfo();
        if ($info) $data['device_info'] = $info;
        $native = self::nativeDiagnostics();
        if ($native) $data['diagnostics'] = $native;
        DB::update('screens', $data, 'id = ?', [$sid]);

        // Registro de exibições (comprovação para anunciantes)
        $logs = input('logs');
        if (is_array($logs)) {
            foreach (array_slice($logs, 0, 300) as $l) {
                if (!is_array($l) || !isset($l['started_at']) || !is_numeric($l['started_at'])) continue;
                $ts = (int)floor($l['started_at'] / 1000);
                if ($ts < time() - 7 * 86400 || $ts > time() + 600) continue;
                DB::insert('play_logs', [
                    'organization_id' => $screen['organization_id'],
                    'screen_id' => $sid,
                    'media_id' => int_or_null($l['media_id'] ?? null),
                    'integration_id' => int_or_null($l['integration_id'] ?? null),
                    'playlist_id' => int_or_null($l['playlist_id'] ?? null),
                    'schedule_id' => int_or_null($l['schedule_id'] ?? null),
                    'started_at' => gmdate('Y-m-d H:i:s', $ts),
                    'duration' => max(0, min(86400, (int)($l['duration'] ?? 0))),
                ]);
            }
        }

        $commands = DB::all('SELECT id, command, payload FROM screen_commands WHERE screen_id = ? AND delivered_at IS NULL ORDER BY id', [$sid]);
        if ($commands) {
            DB::exec('UPDATE screen_commands SET delivered_at = ? WHERE id IN (' . DB::in(array_column($commands, 'id')) . ')', array_merge([now()], array_column($commands, 'id')));
        }
        $manifest = Manifest::forScreen(DB::one('SELECT * FROM screens WHERE id = ?', [$sid]));
        respond([
            'version' => $manifest['version'],
            'commands' => array_map(fn($c) => ['id' => (int)$c['id'], 'command' => $c['command']], $commands),
            'screen_name' => $screen['name'],
            'server_time' => gmdate('c'),
        ]);
    }

    /** Estatísticas enviadas pelo app da TV (lista fechada de campos, tamanho limitado). */
    private static function nativeDiagnostics(): ?string
    {
        $d = input('native');
        if (!is_array($d)) return null;
        $keys = ['app_version', 'app_version_code', 'player_version', 'android', 'model', 'webview', 'mem_total', 'mem_free', 'mem_low',
            'storage_total', 'storage_free', 'cache_files', 'cache_bytes', 'cache_downloading', 'cache_missing', 'uptime', 'app_uptime',
            'autostart', 'can_autostart', 'home_app', 'can_install', 'network', 'wifi_signal', 'wifi_rssi', 'ip'];
        $out = [];
        foreach ($keys as $k) {
            if (isset($d[$k]) && is_scalar($d[$k])) $out[$k] = is_string($d[$k]) ? mb_substr($d[$k], 0, 120) : $d[$k];
        }
        if (isset($d['events']) && is_array($d['events'])) {
            $out['events'] = array_values(array_map(fn($e) => mb_substr((string)$e, 0, 300), array_filter(array_slice($d['events'], -10), 'is_scalar')));
        }
        $out['reported_at'] = gmdate('c');
        return json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /** Captura de tela enviada pelo app (JPEG em base64). */
    public static function screenshot(): void
    {
        $screen = self::screen();
        $b64 = (string)input('image', '');
        if (strlen($b64) > 4 * 1024 * 1024) abort('Imagem muito grande.', 422);
        $bin = base64_decode($b64, true);
        if ($bin === false || substr($bin, 0, 3) !== "\xFF\xD8\xFF") abort('Imagem inválida.', 422);
        $rel = 'org_' . $screen['organization_id'] . '/screens/screen_' . $screen['id'] . '.jpg';
        ensure_dir(dirname(UPLOAD_DIR . '/' . $rel));
        file_put_contents(UPLOAD_DIR . '/' . $rel, $bin);
        DB::update('screens', ['screenshot_path' => $rel, 'screenshot_at' => now()], 'id = ?', [$screen['id']]);
        respond(['ok' => true]);
    }

    /** Arquivos do player para o app baixar e usar offline (versão = hash do tv.html). */
    public static function bundle(): void
    {
        $public = APP_ROOT . '/public';
        if (!is_file($public . '/tv.html')) abort('Player não encontrado.', 404);
        $files = [['path' => 'tv.html', 'url' => app_url('tv')]];
        if (is_file($public . '/favicon.svg')) $files[] = ['path' => 'favicon.svg', 'url' => app_url('favicon.svg')];
        foreach (glob($public . '/assets/*') ?: [] as $f) {
            $name = basename($f);
            $files[] = ['path' => 'assets/' . $name, 'url' => app_url('assets/' . rawurlencode($name))];
        }
        respond(['version' => substr(md5_file($public . '/tv.html'), 0, 12), 'files' => $files]);
    }

    public static function latestRelease(): ?array
    {
        $r = DB::one('SELECT * FROM app_releases ORDER BY version_code DESC LIMIT 1');
        if (!$r) return null;
        return [
            'version_code' => (int)$r['version_code'],
            'version_name' => $r['version_name'],
            'url' => upload_url($r['file_path']),
            'size_bytes' => (int)$r['size_bytes'],
            'notes' => $r['notes'],
            'created_at' => $r['created_at'],
        ];
    }

    /** Versão mais recente do app (consultada pelo próprio app). */
    public static function app(): void
    {
        respond(['release' => self::latestRelease()]);
    }

    /** Link fixo para baixar o app (para instalar em aparelhos novos). */
    public static function appDownload(): void
    {
        $r = self::latestRelease();
        if (!$r) abort('Nenhuma versão do app foi publicada ainda.', 404);
        header('Location: ' . $r['url'], true, 302);
        exit;
    }

    public static function integration($id): void
    {
        $screen = self::screen();
        $row = DB::one('SELECT * FROM integrations WHERE id = ? AND organization_id = ?', [(int)$id, $screen['organization_id']]);
        if (!$row) abort('Integração não encontrada.', 404);
        respond(Integrations::data($row));
    }
}
