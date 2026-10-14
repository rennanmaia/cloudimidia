<?php
declare(strict_types=1);

class AuthController
{
    private static function validEmail(): string
    {
        $email = mb_strtolower(str_input('email', 190));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            abort('Informe um e-mail válido.', 422, ['email' => 'E-mail inválido.']);
        }
        return $email;
    }

    private static function validPassword(string $key = 'password'): string
    {
        $p = (string)input($key, '');
        if (mb_strlen($p) < 6) {
            abort('A senha deve ter pelo menos 6 caracteres.', 422, [$key => 'Mínimo de 6 caracteres.']);
        }
        return $p;
    }

    public static function register(): void
    {
        $inviteToken = str_input('invite_token', 64);
        $invite = $inviteToken ? DB::one('SELECT * FROM invitations WHERE token = ? AND accepted_at IS NULL AND expires_at > ?', [$inviteToken, now()]) : null;
        if (!config('allow_registration', true) && !$invite) {
            abort('O cadastro está disponível apenas por convite.', 403);
        }
        required(['name' => 'seu nome', 'email' => 'seu e-mail', 'password' => 'uma senha']);
        $email = self::validEmail();
        $password = self::validPassword();
        if (DB::val('SELECT id FROM users WHERE email = ?', [$email])) {
            abort('Já existe uma conta com este e-mail. Faça login.', 422, ['email' => 'E-mail já cadastrado.']);
        }
        $orgName = str_input('organization_name', 120);
        if (!$invite && $orgName === '') {
            abort('Informe o nome da sua empresa.', 422, ['organization_name' => 'Obrigatório.']);
        }

        $userId = DB::transaction(function () use ($email, $password, $orgName) {
            $userId = DB::insert('users', [
                'name' => str_input('name', 120),
                'email' => $email,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'created_at' => now(),
            ]);
            if ($orgName !== '') {
                OrgController::createOrg($orgName, $userId, 'America/Sao_Paulo');
            }
            return $userId;
        });

        $token = Auth::issueToken($userId);
        $user = DB::one('SELECT * FROM users WHERE id = ?', [$userId]);
        respond(['token' => $token, 'user' => Auth::publicUser($user)], 201);
    }

    public static function login(): void
    {
        required(['email' => 'seu e-mail', 'password' => 'sua senha']);
        $email = mb_strtolower(str_input('email', 190));
        $user = DB::one('SELECT * FROM users WHERE email = ?', [$email]);
        if (!$user || !password_verify((string)input('password'), $user['password_hash'])) {
            usleep(300000);
            abort('E-mail ou senha incorretos.', 401);
        }
        if ($user['status'] !== 'active') {
            abort('Sua conta está bloqueada. Entre em contato com o suporte.', 403);
        }
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            DB::exec('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash((string)input('password'), PASSWORD_DEFAULT), $user['id']]);
        }
        respond(['token' => Auth::issueToken((int)$user['id']), 'user' => Auth::publicUser($user)]);
    }

    public static function logout(): void
    {
        Auth::revokeCurrent();
        respond(['ok' => true]);
    }

    public static function me(): void
    {
        $user = Auth::require();
        respond(['user' => Auth::publicUser($user), 'organizations' => OrgController::listFor((int)$user['id'])]);
    }

    public static function updateMe(): void
    {
        $user = Auth::require();
        required(['name' => 'seu nome', 'email' => 'seu e-mail']);
        $email = self::validEmail();
        if (DB::val('SELECT id FROM users WHERE email = ? AND id <> ?', [$email, $user['id']])) {
            abort('Este e-mail já está em uso por outra conta.', 422, ['email' => 'E-mail já cadastrado.']);
        }
        DB::update('users', ['name' => str_input('name', 120), 'email' => $email, 'updated_at' => now()], 'id = ?', [$user['id']]);
        respond(['user' => Auth::publicUser(DB::one('SELECT * FROM users WHERE id = ?', [$user['id']]))]);
    }

    public static function changePassword(): void
    {
        $user = Auth::require();
        if (!password_verify((string)input('current_password', ''), $user['password_hash'])) {
            abort('A senha atual está incorreta.', 422, ['current_password' => 'Senha incorreta.']);
        }
        $new = self::validPassword('new_password');
        DB::update('users', ['password_hash' => password_hash($new, PASSWORD_DEFAULT), 'updated_at' => now()], 'id = ?', [$user['id']]);
        respond(['ok' => true]);
    }

    public static function forgot(): void
    {
        $email = self::validEmail();
        $user = DB::one('SELECT * FROM users WHERE email = ? AND status = ?', [$email, 'active']);
        if ($user) {
            $token = random_token(24);
            DB::insert('password_resets', [
                'user_id' => $user['id'],
                'token_hash' => hash('sha256', $token),
                'expires_at' => gmdate('Y-m-d H:i:s', time() + 3600),
                'created_at' => now(),
            ]);
            $link = app_url('#/redefinir-senha/' . $token);
            send_mail($email, 'Redefinição de senha - ' . config('app_name'), "Olá, {$user['name']}!\n\nPara criar uma nova senha, acesse o link abaixo (válido por 1 hora):\n$link\n\nSe você não solicitou, ignore este e-mail.");
        }
        respond(['ok' => true, 'message' => 'Se o e-mail estiver cadastrado, você receberá as instruções em instantes.']);
    }

    public static function reset(): void
    {
        required(['token' => 'o código', 'password' => 'a nova senha']);
        $row = DB::one(
            'SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
            [hash('sha256', str_input('token', 100)), now()]
        );
        if (!$row) {
            abort('Link inválido ou expirado. Solicite uma nova redefinição.', 422);
        }
        $password = self::validPassword();
        DB::update('users', ['password_hash' => password_hash($password, PASSWORD_DEFAULT), 'updated_at' => now()], 'id = ?', [$row['user_id']]);
        DB::exec('UPDATE password_resets SET used_at = ? WHERE id = ?', [now(), $row['id']]);
        DB::exec('DELETE FROM auth_tokens WHERE user_id = ?', [$row['user_id']]);
        respond(['ok' => true]);
    }
}
