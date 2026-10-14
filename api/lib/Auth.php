<?php
declare(strict_types=1);

class Auth
{
    private static ?array $user = null;
    private static bool $resolved = false;
    private static ?string $tokenHash = null;

    public static function bearer(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if ($header === '' && function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) {
                if (strcasecmp($k, 'Authorization') === 0) {
                    $header = $v;
                }
            }
        }
        if (preg_match('/Bearer\s+([a-f0-9]{64})/i', $header, $m)) {
            return strtolower($m[1]);
        }
        return null;
    }

    public static function user(): ?array
    {
        if (!self::$resolved) {
            self::$resolved = true;
            $token = self::bearer();
            if ($token) {
                $hash = hash('sha256', $token);
                $row = DB::one(
                    'SELECT u.*, t.id AS token_id, t.last_used_at AS token_used FROM auth_tokens t
                     JOIN users u ON u.id = t.user_id
                     WHERE t.token_hash = ? AND t.expires_at > ?',
                    [$hash, now()]
                );
                if ($row && $row['status'] === 'active') {
                    self::$tokenHash = $hash;
                    // Atualiza o uso no máximo a cada 10 minutos
                    if (!$row['token_used'] || strtotime($row['token_used'] . ' UTC') < time() - 600) {
                        DB::exec('UPDATE auth_tokens SET last_used_at = ? WHERE id = ?', [now(), $row['token_id']]);
                    }
                    unset($row['token_id'], $row['token_used']);
                    self::$user = $row;
                }
            }
        }
        return self::$user;
    }

    public static function id(): ?int
    {
        $u = self::user();
        return $u ? (int)$u['id'] : null;
    }

    public static function require(): array
    {
        $u = self::user();
        if (!$u) {
            abort('Sua sessão expirou. Entre novamente.', 401);
        }
        return $u;
    }

    public static function requireSuperadmin(): array
    {
        $u = self::require();
        if (!(int)$u['is_superadmin']) {
            abort('Acesso restrito ao administrador da plataforma.', 403);
        }
        return $u;
    }

    public static function isSuperadmin(): bool
    {
        $u = self::user();
        return $u && (int)$u['is_superadmin'] === 1;
    }

    public static function issueToken(int $userId): string
    {
        $token = random_token(32);
        DB::insert('auth_tokens', [
            'user_id' => $userId,
            'token_hash' => hash('sha256', $token),
            'user_agent' => mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255),
            'expires_at' => gmdate('Y-m-d H:i:s', time() + 86400 * (int)config('token_ttl_days', 30)),
            'created_at' => now(),
        ]);
        DB::exec('UPDATE users SET last_login_at = ? WHERE id = ?', [now(), $userId]);
        // limpeza ocasional
        if (random_int(1, 20) === 1) {
            DB::exec('DELETE FROM auth_tokens WHERE expires_at < ?', [now()]);
        }
        return $token;
    }

    public static function revokeCurrent(): void
    {
        self::user();
        if (self::$tokenHash) {
            DB::exec('DELETE FROM auth_tokens WHERE token_hash = ?', [self::$tokenHash]);
        }
    }

    public static function publicUser(array $u): array
    {
        return [
            'id' => (int)$u['id'],
            'name' => $u['name'],
            'email' => $u['email'],
            'is_superadmin' => (bool)$u['is_superadmin'],
            'created_at' => $u['created_at'],
        ];
    }
}
