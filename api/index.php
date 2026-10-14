<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

send_cors_headers();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$route = (string)($_GET['_route'] ?? '');
if ($route === '' && isset($_SERVER['PATH_INFO'])) {
    $route = (string)$_SERVER['PATH_INFO'];
}

try {
    $r = new Router();

    // Sistema
    $r->get('health', fn() => respond(['ok' => true, 'time' => gmdate('c')]));
    $r->get('setup/status', [SetupController::class, 'status']);
    $r->post('setup', [SetupController::class, 'install']);

    // Autenticação e perfil
    $r->post('auth/register', [AuthController::class, 'register']);
    $r->post('auth/login', [AuthController::class, 'login']);
    $r->post('auth/logout', [AuthController::class, 'logout']);
    $r->post('auth/forgot', [AuthController::class, 'forgot']);
    $r->post('auth/reset', [AuthController::class, 'reset']);
    $r->get('auth/me', [AuthController::class, 'me']);
    $r->put('auth/me', [AuthController::class, 'updateMe']);
    $r->put('auth/password', [AuthController::class, 'changePassword']);

    // Convites (públicos)
    $r->get('invitations/{token}', [InvitationController::class, 'showPublic']);
    $r->post('invitations/{token}/accept', [InvitationController::class, 'accept']);

    // Organizações
    $r->get('orgs', [OrgController::class, 'index']);
    $r->post('orgs', [OrgController::class, 'store']);
    $r->get('orgs/{org}', [OrgController::class, 'show']);
    $r->put('orgs/{org}', [OrgController::class, 'update']);
    $r->delete('orgs/{org}', [OrgController::class, 'destroy']);
    $r->post('orgs/{org}/logo', [OrgController::class, 'logo']);
    $r->delete('orgs/{org}/logo', [OrgController::class, 'removeLogo']);
    $r->get('orgs/{org}/dashboard', [OrgController::class, 'dashboard']);
    $r->get('orgs/{org}/activity', [OrgController::class, 'activity']);

    // Equipe
    $r->get('orgs/{org}/members', [MemberController::class, 'index']);
    $r->put('orgs/{org}/members/{user}', [MemberController::class, 'update']);
    $r->delete('orgs/{org}/members/{user}', [MemberController::class, 'destroy']);
    $r->put('orgs/{org}/screen-access/{id}', [MemberController::class, 'updateGuest']);
    $r->delete('orgs/{org}/screen-access/{id}', [MemberController::class, 'destroyGuest']);
    $r->get('orgs/{org}/invitations', [InvitationController::class, 'index']);
    $r->post('orgs/{org}/invitations', [InvitationController::class, 'store']);
    $r->delete('orgs/{org}/invitations/{id}', [InvitationController::class, 'destroy']);

    // Grupos de TVs (segmentação)
    $r->get('orgs/{org}/groups', [GroupController::class, 'index']);
    $r->post('orgs/{org}/groups', [GroupController::class, 'store']);
    $r->put('orgs/{org}/groups/{id}', [GroupController::class, 'update']);
    $r->delete('orgs/{org}/groups/{id}', [GroupController::class, 'destroy']);

    // TVs
    $r->get('orgs/{org}/screens', [ScreenController::class, 'index']);
    $r->post('orgs/{org}/screens', [ScreenController::class, 'store']);
    $r->post('orgs/{org}/screens/pair', [ScreenController::class, 'pair']);
    $r->post('orgs/{org}/screens/{id}/install-link', [ScreenController::class, 'installLink']);
    $r->delete('orgs/{org}/screens/{id}/install-link', [ScreenController::class, 'revokeInstallLink']);
    $r->get('orgs/{org}/screens/{id}', [ScreenController::class, 'show']);
    $r->put('orgs/{org}/screens/{id}', [ScreenController::class, 'update']);
    $r->delete('orgs/{org}/screens/{id}', [ScreenController::class, 'destroy']);
    $r->post('orgs/{org}/screens/{id}/command', [ScreenController::class, 'command']);
    $r->get('orgs/{org}/screens/{id}/manifest', [ScreenController::class, 'manifest']);

    // Mídias
    $r->get('orgs/{org}/media', [MediaController::class, 'index']);
    $r->post('orgs/{org}/media/upload', [MediaController::class, 'upload']);
    $r->put('orgs/{org}/media/{id}', [MediaController::class, 'update']);
    $r->delete('orgs/{org}/media/{id}', [MediaController::class, 'destroy']);

    // Playlists
    $r->get('orgs/{org}/playlists', [PlaylistController::class, 'index']);
    $r->post('orgs/{org}/playlists', [PlaylistController::class, 'store']);
    $r->get('orgs/{org}/playlists/{id}', [PlaylistController::class, 'show']);
    $r->put('orgs/{org}/playlists/{id}', [PlaylistController::class, 'update']);
    $r->delete('orgs/{org}/playlists/{id}', [PlaylistController::class, 'destroy']);
    $r->post('orgs/{org}/playlists/{id}/duplicate', [PlaylistController::class, 'duplicate']);

    // Grade de programação
    $r->get('orgs/{org}/schedules', [ScheduleController::class, 'index']);
    $r->post('orgs/{org}/schedules', [ScheduleController::class, 'store']);
    $r->put('orgs/{org}/schedules/{id}', [ScheduleController::class, 'update']);
    $r->delete('orgs/{org}/schedules/{id}', [ScheduleController::class, 'destroy']);

    // Integrações
    $r->get('orgs/{org}/integrations', [IntegrationController::class, 'index']);
    $r->post('orgs/{org}/integrations', [IntegrationController::class, 'store']);
    $r->get('orgs/{org}/integrations/geocode', [IntegrationController::class, 'geocode']);
    $r->post('orgs/{org}/integrations/test', [IntegrationController::class, 'test']);
    $r->put('orgs/{org}/integrations/{id}', [IntegrationController::class, 'update']);
    $r->delete('orgs/{org}/integrations/{id}', [IntegrationController::class, 'destroy']);
    $r->get('orgs/{org}/integrations/{id}/data', [IntegrationController::class, 'data']);

    // Relatórios
    $r->get('orgs/{org}/reports/plays', [ReportController::class, 'plays']);

    // Player (TV)
    $r->post('player/register', [PlayerController::class, 'register']);
    $r->post('player/poll', [PlayerController::class, 'poll']);
    $r->post('player/install', [PlayerController::class, 'install']);
    $r->get('player/manifest', [PlayerController::class, 'manifest']);
    $r->post('player/heartbeat', [PlayerController::class, 'heartbeat']);
    $r->get('player/integrations/{id}', [PlayerController::class, 'integration']);

    // Administração da plataforma
    $r->get('admin/stats', [AdminController::class, 'stats']);
    $r->get('admin/orgs', [AdminController::class, 'orgs']);
    $r->put('admin/orgs/{id}', [AdminController::class, 'updateOrg']);
    $r->get('admin/users', [AdminController::class, 'users']);
    $r->put('admin/users/{id}', [AdminController::class, 'updateUser']);

    Migrations::run();
    $r->dispatch($_SERVER['REQUEST_METHOD'] ?? 'GET', $route);
} catch (ApiError $e) {
    $payload = ['error' => $e->getMessage()];
    if ($e->errors) {
        $payload['errors'] = $e->errors;
    }
    respond($payload, $e->status);
} catch (Throwable $e) {
    $dir = STORAGE_DIR . '/logs';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    @file_put_contents($dir . '/error.log', sprintf("[%s] %s %s\n%s\n\n", now(), $_SERVER['REQUEST_METHOD'] ?? '', $route, $e), FILE_APPEND);
    respond(['error' => 'Erro interno no servidor. Tente novamente.'], 500);
}
