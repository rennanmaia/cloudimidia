<?php
declare(strict_types=1);

class OrgController
{
    public static function createOrg(string $name, int $userId, string $timezone): int
    {
        $orgId = DB::insert('organizations', [
            'name' => $name,
            'timezone' => valid_timezone($timezone) ? $timezone : 'America/Sao_Paulo',
            'max_screens' => config('default_max_screens'),
            'max_storage_mb' => config('default_max_storage_mb'),
            'created_by' => $userId,
            'created_at' => now(),
        ]);
        DB::insert('memberships', ['organization_id' => $orgId, 'user_id' => $userId, 'role' => 'owner', 'created_at' => now()]);
        return $orgId;
    }

    /** Organizações às quais o usuário tem acesso (como membro ou convidado de TVs). */
    public static function listFor(int $userId): array
    {
        $rows = DB::all(
            'SELECT o.*, m.role FROM organizations o JOIN memberships m ON m.organization_id = o.id WHERE m.user_id = ? ORDER BY o.name',
            [$userId]
        );
        $guest = DB::all(
            'SELECT DISTINCT o.*, NULL AS role FROM screen_permissions sp
             JOIN screens s ON s.id = sp.screen_id
             JOIN organizations o ON o.id = s.organization_id
             WHERE sp.user_id = ? AND o.id NOT IN (SELECT organization_id FROM memberships WHERE user_id = ?) ORDER BY o.name',
            [$userId, $userId]
        );
        return array_map(function ($o) {
            $f = format_org($o);
            $f['role'] = $o['role'];
            return $f;
        }, array_merge($rows, $guest));
    }

    public static function index(): void
    {
        $user = Auth::require();
        respond(['organizations' => self::listFor((int)$user['id'])]);
    }

    public static function store(): void
    {
        $user = Auth::require();
        required(['name' => 'o nome da empresa']);
        $id = self::createOrg(str_input('name', 120), (int)$user['id'], str_input('timezone', 64, 'America/Sao_Paulo'));
        log_activity($id, 'org.created', 'Organização criada');
        respond(['organization' => format_org(DB::one('SELECT * FROM organizations WHERE id = ?', [$id])) + ['role' => 'owner']], 201);
    }

    public static function show($org): void
    {
        $ctx = org_ctx($org);
        $data = format_org($ctx->org);
        $data['role'] = $ctx->role;
        $data['is_guest'] = $ctx->isGuest();
        $data['guest_screens'] = (object)$ctx->screens;
        $data['can_create_content'] = $ctx->canCreateContent();
        $data['usage'] = org_usage($ctx->id());
        respond(['organization' => $data]);
    }

    public static function update($org): void
    {
        $ctx = org_ctx($org);
        $ctx->require('admin');
        required(['name' => 'o nome da empresa']);
        $tz = str_input('timezone', 64, $ctx->org['timezone']);
        if (!valid_timezone($tz)) abort('Fuso horário inválido.', 422);
        DB::update('organizations', ['name' => str_input('name', 120), 'timezone' => $tz, 'updated_at' => now()], 'id = ?', [$ctx->id()]);
        log_activity($ctx->id(), 'org.updated', 'Dados da organização atualizados');
        self::show($org);
    }

    public static function logo($org): void
    {
        $ctx = org_ctx($org);
        $ctx->require('admin');
        $file = $_FILES['file'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK) abort('Envie uma imagem.', 422);
        $info = @getimagesize($file['tmp_name']);
        $ext = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/gif' => 'gif'][$info['mime'] ?? ''] ?? null;
        if (!$ext) abort('Formato de imagem não suportado. Use PNG, JPG ou WEBP.', 422);
        if ($file['size'] > 5 * 1024 * 1024) abort('A imagem deve ter no máximo 5 MB.', 422);
        $rel = 'org_' . $ctx->id() . '/logo_' . random_token(6) . '.' . $ext;
        ensure_dir(dirname(UPLOAD_DIR . '/' . $rel));
        move_uploaded_file($file['tmp_name'], UPLOAD_DIR . '/' . $rel);
        delete_upload($ctx->org['logo_path']);
        DB::update('organizations', ['logo_path' => $rel, 'updated_at' => now()], 'id = ?', [$ctx->id()]);
        respond(['logo_url' => upload_url($rel)]);
    }

    public static function removeLogo($org): void
    {
        $ctx = org_ctx($org);
        $ctx->require('admin');
        delete_upload($ctx->org['logo_path']);
        DB::update('organizations', ['logo_path' => null], 'id = ?', [$ctx->id()]);
        respond(['ok' => true]);
    }

    public static function destroy($org): void
    {
        $ctx = org_ctx($org);
        $ctx->require('owner');
        if (str_input('confirm_name', 120) !== $ctx->org['name']) {
            abort('Digite o nome da organização exatamente para confirmar.', 422);
        }
        DB::transaction(function () use ($ctx) {
            DB::exec('DELETE FROM schedules WHERE organization_id = ?', [$ctx->id()]);
            DB::exec('DELETE FROM organizations WHERE id = ?', [$ctx->id()]);
        });
        rrmdir(UPLOAD_DIR . '/org_' . $ctx->id());
        respond(['ok' => true]);
    }

    public static function dashboard($org): void
    {
        $ctx = org_ctx($org);
        $orgId = $ctx->id();
        $screens = ScreenController::listScreens($ctx);
        $online = count(array_filter($screens, fn($s) => $s['online']));
        $active = count(array_filter($screens, fn($s) => $s['is_active']));

        $screenIds = array_column($screens, 'id');
        $playsToday = 0;
        if ($screenIds) {
            $tz = new DateTimeZone($ctx->org['timezone']);
            $start = (new DateTime('today', $tz))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
            $playsToday = (int)DB::val(
                'SELECT COUNT(*) FROM play_logs WHERE organization_id = ? AND started_at >= ? AND screen_id IN (' . DB::in($screenIds) . ')',
                array_merge([$orgId, $start], $screenIds)
            );
        }

        $stats = [
            'screens' => count($screens),
            'screens_online' => $online,
            'screens_active' => $active,
            'plays_today' => $playsToday,
        ];
        if (!$ctx->isGuest()) {
            $stats['media'] = (int)DB::val('SELECT COUNT(*) FROM media WHERE organization_id = ?', [$orgId]);
            $stats['playlists'] = (int)DB::val('SELECT COUNT(*) FROM playlists WHERE organization_id = ?', [$orgId]);
            $stats['schedules'] = (int)DB::val('SELECT COUNT(*) FROM schedules WHERE organization_id = ? AND is_active = 1', [$orgId]);
            $stats['members'] = (int)DB::val('SELECT COUNT(*) FROM memberships WHERE organization_id = ?', [$orgId]);
        }

        respond([
            'stats' => $stats,
            'screens' => $screens,
            'usage' => org_usage($orgId),
            'limits' => ['max_screens' => $ctx->org['max_screens'] !== null ? (int)$ctx->org['max_screens'] : null, 'max_storage_mb' => $ctx->org['max_storage_mb'] !== null ? (int)$ctx->org['max_storage_mb'] : null],
            'activity' => $ctx->isGuest() ? [] : self::activityRows($orgId, 8, 0),
        ]);
    }

    private static function activityRows(int $orgId, int $limit, int $offset): array
    {
        return DB::all(
            "SELECT a.id, a.action, a.description, a.created_at, u.name AS user_name
             FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
             WHERE a.organization_id = ? ORDER BY a.id DESC LIMIT $limit OFFSET $offset",
            [$orgId]
        );
    }

    public static function activity($org): void
    {
        $ctx = org_ctx($org);
        $ctx->require('viewer');
        $page = max(1, (int)query('page', 1));
        respond(['activity' => self::activityRows($ctx->id(), 50, ($page - 1) * 50)]);
    }
}
