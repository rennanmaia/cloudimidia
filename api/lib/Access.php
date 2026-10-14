<?php
declare(strict_types=1);

/**
 * Contexto de acesso de um usuário a uma organização.
 *
 * Papéis na organização (do menor para o maior): viewer, editor, admin, owner.
 * Usuários sem papel na organização podem ter acesso a TVs específicas
 * (screen_permissions) com papel editor ou viewer — são os "convidados de TV".
 */
class OrgCtx
{
    public const RANK = ['viewer' => 1, 'editor' => 2, 'admin' => 3, 'owner' => 4];

    public array $org;
    public array $user;
    public ?string $role;
    /** @var array<int,string> screen_id => role */
    public array $screens;

    public function __construct(array $org, array $user, ?string $role, array $screens)
    {
        $this->org = $org;
        $this->user = $user;
        $this->role = $role;
        $this->screens = $screens;
    }

    public function id(): int
    {
        return (int)$this->org['id'];
    }

    public function userId(): int
    {
        return (int)$this->user['id'];
    }

    public function rank(): int
    {
        return $this->role ? self::RANK[$this->role] : 0;
    }

    public function can(string $min): bool
    {
        return $this->rank() >= self::RANK[$min];
    }

    public function require(string $min): void
    {
        if (!$this->can($min)) {
            abort('Você não tem permissão para esta ação.', 403);
        }
    }

    public function isGuest(): bool
    {
        return $this->role === null;
    }

    /** Pode criar conteúdo (mídias, playlists, integrações)? */
    public function canCreateContent(): bool
    {
        return $this->can('editor') || in_array('editor', $this->screens, true);
    }

    public function requireCreateContent(): void
    {
        if (!$this->canCreateContent()) {
            abort('Você não tem permissão para esta ação.', 403);
        }
    }

    public function canViewScreen(int $screenId): bool
    {
        return $this->role !== null || isset($this->screens[$screenId]);
    }

    public function canOperateScreen(int $screenId): bool
    {
        return $this->can('editor') || (($this->screens[$screenId] ?? null) === 'editor');
    }

    public function editableGuestScreens(): array
    {
        return array_keys(array_filter($this->screens, fn($r) => $r === 'editor'));
    }

    /** Pode editar um recurso criado por $ownerId? */
    public function canEditOwned(?int $ownerId): bool
    {
        if ($this->can('editor')) {
            return true;
        }
        return $this->canCreateContent() && $ownerId === $this->userId();
    }

    /** IDs das playlists visíveis para um convidado (próprias + usadas nas TVs dele). */
    public function guestPlaylistIds(): array
    {
        $screenIds = array_keys($this->screens);
        $ids = DB::col('SELECT id FROM playlists WHERE organization_id = ? AND created_by = ?', [$this->id(), $this->userId()]);
        if ($screenIds) {
            $in = DB::in($screenIds);
            $ids = array_merge(
                $ids,
                DB::col("SELECT default_playlist_id FROM screens WHERE id IN ($in) AND default_playlist_id IS NOT NULL", $screenIds),
                DB::col(
                    "SELECT s.playlist_id FROM schedules s JOIN schedule_targets t ON t.schedule_id = s.id
                     WHERE t.screen_id IN ($in) OR t.group_id IN (SELECT group_id FROM screen_group_members WHERE screen_id IN ($in))",
                    array_merge($screenIds, $screenIds)
                )
            );
        }
        return ints($ids);
    }
}

function org_ctx($orgId): OrgCtx
{
    $user = Auth::require();
    $orgId = (int)$orgId;
    $org = DB::one('SELECT * FROM organizations WHERE id = ?', [$orgId]);
    if (!$org) {
        abort('Organização não encontrada.', 404);
    }
    $role = DB::val('SELECT role FROM memberships WHERE organization_id = ? AND user_id = ?', [$orgId, $user['id']]);
    $screens = [];
    foreach (DB::all(
        'SELECT sp.screen_id, sp.role FROM screen_permissions sp JOIN screens s ON s.id = sp.screen_id
         WHERE s.organization_id = ? AND sp.user_id = ?',
        [$orgId, $user['id']]
    ) as $r) {
        $screens[(int)$r['screen_id']] = $r['role'];
    }

    if ((int)$user['is_superadmin'] === 1) {
        $role = 'owner';
    }
    if (!$role && !$screens) {
        abort('Você não tem acesso a esta organização.', 403);
    }
    if ($org['status'] === 'suspended' && !(int)$user['is_superadmin']) {
        abort('Esta organização está suspensa. Entre em contato com o suporte.', 403);
    }
    return new OrgCtx($org, $user, $role ?: null, $screens);
}
