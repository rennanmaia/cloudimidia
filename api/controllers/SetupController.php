<?php
declare(strict_types=1);

class SetupController
{
    private static function needsSetup(): bool
    {
        return !DB::tableExists('users') || (int)DB::val('SELECT COUNT(*) FROM users') === 0;
    }

    public static function status(): void
    {
        respond([
            'needs_setup' => self::needsSetup(),
            'app_name' => config('app_name'),
            'allow_registration' => (bool)config('allow_registration', true),
        ]);
    }

    public static function runSchema(): void
    {
        $sql = file_get_contents(APP_ROOT . '/database/schema.sql');
        $sql = preg_replace('/^\s*--.*$/m', '', $sql);
        foreach (preg_split('/;\s*\n/', $sql) as $stmt) {
            if (trim($stmt) !== '') {
                DB::pdo()->exec($stmt);
            }
        }
    }

    public static function install(): void
    {
        if (!self::needsSetup()) {
            abort('O sistema já foi configurado.', 409);
        }
        required(['name' => 'seu nome', 'email' => 'seu e-mail', 'password' => 'uma senha', 'organization_name' => 'o nome da sua empresa']);
        $email = mb_strtolower(str_input('email', 190));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) abort('E-mail inválido.', 422);
        $password = (string)input('password');
        if (mb_strlen($password) < 6) abort('A senha deve ter pelo menos 6 caracteres.', 422);

        if (!DB::tableExists('users')) {
            self::runSchema();
        }

        $userId = DB::transaction(function () use ($email, $password) {
            $userId = DB::insert('users', [
                'name' => str_input('name', 120),
                'email' => $email,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'is_superadmin' => 1,
                'created_at' => now(),
            ]);
            $orgId = DB::insert('organizations', [
                'name' => str_input('organization_name', 120),
                'timezone' => 'America/Sao_Paulo',
                'max_screens' => null,
                'max_storage_mb' => null,
                'created_by' => $userId,
                'created_at' => now(),
            ]);
            DB::insert('memberships', ['organization_id' => $orgId, 'user_id' => $userId, 'role' => 'owner', 'created_at' => now()]);
            return $userId;
        });

        $user = DB::one('SELECT * FROM users WHERE id = ?', [$userId]);
        respond(['token' => Auth::issueToken($userId), 'user' => Auth::publicUser($user)], 201);
    }
}
