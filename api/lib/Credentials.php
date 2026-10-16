<?php
declare(strict_types=1);

/**
 * Chaves de APIs externas por organização (ex.: FutDigital).
 * Guardadas criptografadas (AES-256-GCM) com a chave do sistema em storage/app.key
 * (ou config 'app_key'). O painel só recebe uma versão mascarada.
 */
class Credentials
{
    public const PROVIDERS = [
        'futdigital' => [
            'name' => 'FutDigital',
            'description' => 'Jogos, resultados, classificação e artilharia dos campeonatos liberados para a sua chave de parceiro.',
            'url' => 'https://fut.digital',
            'prefix' => 'fdk_',
        ],
    ];

    private static function appKey(): string
    {
        $configured = (string)config('app_key', '');
        if ($configured !== '') {
            return hash('sha256', $configured, true);
        }
        $file = STORAGE_DIR . '/app.key';
        if (!is_file($file)) {
            ensure_dir(STORAGE_DIR);
            file_put_contents($file, bin2hex(random_bytes(32)), LOCK_EX);
            @chmod($file, 0600);
        }
        return hash('sha256', trim((string)file_get_contents($file)), true);
    }

    public static function encrypt(string $plain): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', self::appKey(), OPENSSL_RAW_DATA, $iv, $tag);
        return 'v1:' . base64_encode($iv . $tag . $cipher);
    }

    public static function decrypt(string $stored): ?string
    {
        if (!str_starts_with($stored, 'v1:')) return null;
        $raw = base64_decode(substr($stored, 3), true);
        if ($raw === false || strlen($raw) < 29) return null;
        $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', self::appKey(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        return $plain === false ? null : $plain;
    }

    public static function mask(string $secret): string
    {
        $prefix = '';
        foreach (self::PROVIDERS as $p) {
            if ($p['prefix'] && str_starts_with($secret, $p['prefix'])) $prefix = $p['prefix'];
        }
        return $prefix . '…' . substr($secret, -5);
    }

    public static function get(int $orgId, string $provider): ?string
    {
        $row = DB::one('SELECT secret FROM org_credentials WHERE organization_id = ? AND provider = ?', [$orgId, $provider]);
        return $row ? self::decrypt($row['secret']) : null;
    }

    /** Valida a chave no serviço externo. Retorna um resumo ou lança exceção com a mensagem do serviço. */
    public static function test(string $provider, string $secret): string
    {
        if ($provider === 'futdigital') {
            $list = Integrations::futdigitalApi($secret, 'competitions');
            $n = count($list);
            return $n === 1 ? '1 campeonato liberado' : "$n campeonatos liberados";
        }
        throw new RuntimeException('Serviço desconhecido.');
    }
}
