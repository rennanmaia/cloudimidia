<?php
declare(strict_types=1);

/**
 * Trilha sonora da TV: música de fundo tocando enquanto as propagandas passam.
 * Fontes: YouTube (vídeo, playlist ou ao vivo), SoundCloud, Spotify, Deezer ou rádio/áudio online.
 * Fica na própria TV (screens.soundtrack) e vale mais que a música da playlist.
 */
class Soundtrack
{
    public const PROVIDERS = ['youtube', 'soundcloud', 'spotify', 'deezer', 'stream'];
    public const VIDEO_MODES = ['off', 'small', 'medium'];
    public const CORNERS = ['br', 'bl', 'tr', 'tl'];

    /** Identifica a plataforma pelo link. Lança 422 com uma mensagem clara se não reconhecer. */
    public static function parse(string $url): array
    {
        $url = trim($url);
        if (preg_match('#^spotify:(playlist|album|track|artist|show|episode):([A-Za-z0-9]{10,40})$#', $url, $m)) {
            return ['provider' => 'spotify', 'kind' => $m[1], 'id' => $m[2]];
        }
        if (!preg_match('#^https?://#i', $url)) abort('Cole o link completo, começando com https://', 422);
        $host = strtolower((string)parse_url($url, PHP_URL_HOST));
        $host = preg_replace('/^(www|m)\./', '', $host);
        $path = (string)parse_url($url, PHP_URL_PATH);
        parse_str((string)parse_url($url, PHP_URL_QUERY), $q);

        if (in_array($host, ['youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com'], true)) {
            $list = isset($q['list']) && preg_match('/^[A-Za-z0-9_-]{10,64}$/', (string)$q['list']) ? (string)$q['list'] : null;
            $video = Integrations::youtubeId($url);
            // Mixes automáticos (RD...) não funcionam no player embutido: usa só o vídeo
            if ($list && str_starts_with($list, 'RD')) $list = null;
            if (!$list && !$video) abort('Não encontrei o vídeo ou a playlist neste link do YouTube.', 422);
            return ['provider' => 'youtube', 'video_id' => $video, 'list_id' => $list];
        }
        if ($host === 'soundcloud.com' || $host === 'on.soundcloud.com') {
            if (trim($path, '/') === '') abort('Cole o link de uma música, playlist ou perfil do SoundCloud.', 422);
            return ['provider' => 'soundcloud', 'url' => strtok($url, '?')];
        }
        if ($host === 'open.spotify.com') {
            if (preg_match('#/(playlist|album|track|artist|show|episode)/([A-Za-z0-9]{10,40})#', $path, $m)) {
                return ['provider' => 'spotify', 'kind' => $m[1], 'id' => $m[2]];
            }
            abort('Cole o link de uma playlist, álbum, artista ou música do Spotify.', 422);
        }
        if (in_array($host, ['deezer.com', 'deezer.page.link', 'link.deezer.com', 'dzr.page.link'], true)) {
            if (preg_match('#/(playlist|album|track|artist)/(\d+)#', $path, $m)) {
                return ['provider' => 'deezer', 'kind' => $m[1], 'id' => $m[2]];
            }
            abort('Abra o link no navegador e copie o endereço completo da playlist do Deezer (deezer.com/…/playlist/número).', 422);
        }
        if (in_array($host, ['spotify.link', 'spoti.fi'], true)) {
            abort('Abra o link no navegador e copie o endereço completo (open.spotify.com/…).', 422);
        }
        // Rádio ou áudio online. Listas .m3u/.pls viram o primeiro endereço de áudio delas.
        if (preg_match('#\.(m3u|pls)$#i', $path)) $url = self::resolvePlaylistFile($url);
        return ['provider' => 'stream', 'url' => mb_substr($url, 0, 1000)];
    }

    private static function resolvePlaylistFile(string $url): string
    {
        try {
            $body = Integrations::httpGet($url, 8);
        } catch (Throwable $e) {
            abort('Não consegui abrir a lista da rádio: ' . $e->getMessage(), 422);
        }
        if (preg_match('#(?:^|\n|=)\s*(https?://[^\s]+)#i', $body, $m)) return trim($m[1]);
        abort('A lista da rádio não tem nenhum endereço de áudio.', 422);
    }

    /** Valida as configurações vindas do painel. null = sem trilha sonora. */
    public static function sanitize($in): ?array
    {
        if (!is_array($in) || !filter_var($in['enabled'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            return null;
        }
        $url = is_scalar($in['url'] ?? null) ? mb_substr(trim((string)$in['url']), 0, 1000) : '';
        if ($url === '') abort('Cole o link da trilha sonora.', 422);
        $int = fn($k, $min, $max, $def) => isset($in[$k]) && is_numeric($in[$k]) ? max($min, min($max, (int)$in[$k])) : $def;
        $bool = fn($k, $def) => isset($in[$k]) ? filter_var($in[$k], FILTER_VALIDATE_BOOLEAN) : $def;
        $source = self::parse($url);
        $hasVideo = $source['provider'] === 'youtube';
        return [
            'url' => $url,
            'source' => $source,
            'volume' => $int('volume', 0, 100, 60),
            'shuffle' => $bool('shuffle', true),
            'pause_on_ad_sound' => $bool('pause_on_ad_sound', true),
            // Miniatura do vídeo de tempos em tempos (só fontes com vídeo)
            'video_mode' => $hasVideo && in_array($in['video_mode'] ?? '', self::VIDEO_MODES, true) ? $in['video_mode'] : 'off',
            'video_every' => $int('video_every', 1, 60, 5),
            'video_for' => $int('video_for', 5, 120, 20),
            'corner' => in_array($in['corner'] ?? '', self::CORNERS, true) ? $in['corner'] : 'br',
        ];
    }
}
