<?php
declare(strict_types=1);

/**
 * Integrações: fontes de conteúdo dinâmico exibidas nas TVs.
 */
class Integrations
{
    public const TYPES = ['rss', 'weather', 'sports', 'currency', 'clock', 'text', 'webpage', 'youtube', 'music'];

    /** Tipos cujos dados são buscados no servidor (com cache), em segundos */
    private const TTL = ['rss' => 600, 'weather' => 1200, 'sports' => 120, 'currency' => 300];

    public const SPORTS_LEAGUES = [
        'soccer/bra.1' => 'Brasileirão Série A',
        'soccer/bra.2' => 'Brasileirão Série B',
        'soccer/bra.copa_do_brazil' => 'Copa do Brasil',
        'soccer/conmebol.libertadores' => 'Copa Libertadores',
        'soccer/conmebol.sudamericana' => 'Copa Sul-Americana',
        'soccer/uefa.champions' => 'UEFA Champions League',
        'soccer/eng.1' => 'Premier League',
        'soccer/esp.1' => 'La Liga',
        'soccer/ita.1' => 'Serie A (Itália)',
        'soccer/ger.1' => 'Bundesliga',
        'soccer/fra.1' => 'Ligue 1',
        'soccer/fifa.world' => 'Copa do Mundo',
        'basketball/nba' => 'NBA',
        'football/nfl' => 'NFL',
        'racing/f1' => 'Fórmula 1',
    ];

    public static function sanitizeConfig(string $type, $config): array
    {
        $c = is_array($config) ? $config : [];
        $str = fn($k, $max = 500, $def = '') => isset($c[$k]) && is_scalar($c[$k]) ? mb_substr(trim((string)$c[$k]), 0, $max) : $def;
        $int = fn($k, $min, $max, $def) => isset($c[$k]) && is_numeric($c[$k]) ? max($min, min($max, (int)$c[$k])) : $def;
        $bool = fn($k, $def) => isset($c[$k]) ? filter_var($c[$k], FILTER_VALIDATE_BOOLEAN) : $def;
        $url = function ($k) use ($str) {
            $u = $str($k, 1000);
            if ($u !== '' && !preg_match('#^https?://#i', $u)) {
                abort('Informe um endereço válido começando com http:// ou https://', 422);
            }
            return $u;
        };

        switch ($type) {
            case 'rss':
                // Uma ou várias fontes (ex.: g1 + ge da mesma região), misturadas por horário
                $list = isset($c['urls']) && is_array($c['urls']) ? $c['urls'] : [$c['url'] ?? ''];
                $urls = [];
                foreach ($list as $one) {
                    $one = is_scalar($one) ? trim((string)$one) : '';
                    if ($one === '') continue;
                    if (!preg_match('#^https?://#i', $one)) abort('Informe endereços válidos começando com http:// ou https://', 422);
                    $urls[] = mb_substr($one, 0, 1000);
                }
                $urls = array_slice(array_values(array_unique($urls)), 0, 5);
                if (!$urls) abort('Informe o endereço do feed de notícias (RSS).', 422);
                return ['url' => $urls[0], 'urls' => $urls, 'max_items' => $int('max_items', 1, 30, 10), 'item_duration' => $int('item_duration', 4, 60, 10), 'show_images' => $bool('show_images', true), 'source_name' => $str('source_name', 60)];
            case 'weather':
                if (!isset($c['latitude'], $c['longitude']) || !is_numeric($c['latitude']) || !is_numeric($c['longitude'])) {
                    abort('Selecione a cidade para a previsão do tempo.', 422);
                }
                return ['city' => $str('city', 120), 'latitude' => round((float)$c['latitude'], 4), 'longitude' => round((float)$c['longitude'], 4)];
            case 'sports':
                $league = $str('league', 60, 'soccer/bra.1');
                if (!isset(self::SPORTS_LEAGUES[$league])) abort('Campeonato inválido.', 422);
                return ['league' => $league, 'title' => $str('title', 80, self::SPORTS_LEAGUES[$league])];
            case 'currency':
                $pairs = array_values(array_filter(array_map(fn($p) => strtoupper(preg_replace('/[^A-Za-z\-]/', '', (string)$p)), (array)($c['pairs'] ?? [])), fn($p) => preg_match('/^[A-Z]{3,4}-[A-Z]{3}$/', $p)));
                if (!$pairs) $pairs = ['USD-BRL', 'EUR-BRL', 'BTC-BRL'];
                return ['pairs' => array_slice($pairs, 0, 8)];
            case 'clock':
                $tz = $str('timezone', 64);
                return ['style' => in_array($c['style'] ?? '', ['digital', 'analog'], true) ? $c['style'] : 'digital', 'show_date' => $bool('show_date', true), 'timezone' => ($tz && valid_timezone($tz)) ? $tz : '', 'background' => valid_color($c['background'] ?? null, '#0f172a'), 'color' => valid_color($c['color'] ?? null, '#ffffff'), 'label' => $str('label', 80)];
            case 'text':
                return ['title' => $str('title', 160), 'message' => $str('message', 2000), 'background' => valid_color($c['background'] ?? null, '#4f46e5'), 'color' => valid_color($c['color'] ?? null, '#ffffff'), 'align' => in_array($c['align'] ?? '', ['left', 'center'], true) ? $c['align'] : 'center', 'size' => in_array($c['size'] ?? '', ['md', 'lg', 'xl'], true) ? $c['size'] : 'lg'];
            case 'webpage':
                $u = $url('url');
                if ($u === '') abort('Informe o endereço da página.', 422);
                return ['url' => $u, 'reload_minutes' => $int('reload_minutes', 0, 1440, 0)];
            case 'youtube':
                $u = $url('url');
                if (!self::youtubeId($u) && !self::youtubeList($u)) abort('Informe um link válido de vídeo ou playlist do YouTube.', 422);
                return ['url' => $u, 'video_id' => self::youtubeId($u), 'list_id' => self::youtubeList($u), 'muted' => $bool('muted', true)];
            case 'music':
                $source = ($c['source'] ?? '') === 'library' ? 'library' : 'stream';
                $cfg = ['source' => $source, 'volume' => $int('volume', 0, 100, 60), 'shuffle' => $bool('shuffle', true), 'stream_url' => '', 'media_ids' => []];
                if ($source === 'stream') {
                    $cfg['stream_url'] = $url('stream_url');
                    if ($cfg['stream_url'] === '') abort('Informe o endereço do streaming de áudio.', 422);
                } else {
                    $cfg['media_ids'] = array_slice(ints($c['media_ids'] ?? []), 0, 500);
                    if (!$cfg['media_ids']) abort('Selecione ao menos uma música da biblioteca.', 422);
                }
                return $cfg;
        }
        abort('Tipo de integração inválido.', 422);
    }

    public static function youtubeId(string $url): ?string
    {
        if (preg_match('#(?:youtu\.be/|v=|/embed/|/shorts/|/live/)([A-Za-z0-9_-]{11})#', $url, $m)) {
            return $m[1];
        }
        return null;
    }

    public static function youtubeList(string $url): ?string
    {
        return preg_match('#[?&]list=([A-Za-z0-9_-]+)#', $url, $m) ? $m[1] : null;
    }

    public static function hasRemoteData(string $type): bool
    {
        return isset(self::TTL[$type]);
    }

    /** Dados da integração, usando cache no banco. */
    public static function data(array $integration, bool $force = false): array
    {
        $type = $integration['type'];
        $config = is_array($integration['config']) ? $integration['config'] : decode_json($integration['config']);
        if (!self::hasRemoteData($type)) {
            return ['data' => null, 'fetched_at' => now(), 'stale' => false];
        }
        $id = (int)$integration['id'];
        $hash = md5(json_encode($config));
        $cache = DB::one('SELECT * FROM integration_cache WHERE integration_id = ?', [$id]);
        $fresh = $cache && $cache['config_hash'] === $hash && $cache['data'] !== null
            && strtotime($cache['fetched_at'] . ' UTC') > time() - self::TTL[$type];
        if ($fresh && !$force) {
            return ['data' => decode_json($cache['data'], null), 'fetched_at' => $cache['fetched_at'], 'stale' => false];
        }

        // Evita várias TVs buscando ao mesmo tempo quando a fonte falha: espera 60s entre tentativas
        if (!$force && $cache && $cache['config_hash'] === $hash && $cache['error'] && strtotime($cache['fetched_at'] . ' UTC') > time() - 60) {
            return ['data' => decode_json($cache['data'], null), 'fetched_at' => $cache['fetched_at'], 'stale' => true, 'error' => $cache['error']];
        }

        try {
            $data = self::fetch($type, $config);
            DB::exec(
                'REPLACE INTO integration_cache (integration_id, config_hash, data, error, fetched_at) VALUES (?,?,?,NULL,?)',
                [$id, $hash, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE), now()]
            );
            return ['data' => $data, 'fetched_at' => now(), 'stale' => false];
        } catch (Throwable $e) {
            $old = ($cache && $cache['config_hash'] === $hash) ? $cache['data'] : null;
            DB::exec(
                'REPLACE INTO integration_cache (integration_id, config_hash, data, error, fetched_at) VALUES (?,?,?,?,?)',
                [$id, $hash, $old, mb_substr($e->getMessage(), 0, 500), now()]
            );
            return ['data' => decode_json($old, null), 'fetched_at' => now(), 'stale' => true, 'error' => $e->getMessage()];
        }
    }

    public static function fetch(string $type, array $c): array
    {
        switch ($type) {
            case 'rss': return self::rss($c);
            case 'weather': return self::weather($c);
            case 'sports': return self::sports($c);
            case 'currency': return self::currency($c);
        }
        return [];
    }

    public static function httpGet(string $url, int $timeout = 12): string
    {
        if (!function_exists('curl_init')) {
            $ctx = stream_context_create(['http' => ['timeout' => $timeout, 'header' => "User-Agent: CloudMidia/1.0\r\n"]]);
            $res = @file_get_contents($url, false, $ctx);
            if ($res === false) throw new RuntimeException('Falha ao acessar a fonte de dados.');
            return $res;
        }
        $attempt = function (?string $caFile) use ($url, $timeout) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 5,
                CURLOPT_CONNECTTIMEOUT => 6,
                CURLOPT_TIMEOUT => $timeout,
                CURLOPT_ENCODING => '',
                CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; CloudMidia/1.0)',
                CURLOPT_SSL_VERIFYPEER => (bool)config('http_verify_ssl', true),
                CURLOPT_SSL_VERIFYHOST => config('http_verify_ssl', true) ? 2 : 0,
            ]);
            if ($caFile) {
                curl_setopt($ch, CURLOPT_CAINFO, $caFile);
            }
            $body = curl_exec($ch);
            $errno = curl_errno($ch);
            $error = curl_error($ch);
            $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            return [$body, $errno, $error, $status];
        };

        [$body, $errno, $error, $status] = $attempt(null);
        if (in_array($errno, [60, 77], true)) {
            // Certificados ausentes (comum no XAMPP/Windows): tenta pacotes de CA conhecidos
            foreach ([ini_get('curl.cainfo'), dirname(PHP_BINARY) . '/extras/ssl/cacert.pem', 'C:/xampp/apache/bin/curl-ca-bundle.crt', 'C:/xampp/php/extras/ssl/cacert.pem'] as $ca) {
                if ($ca && is_file($ca)) {
                    [$body, $errno, $error, $status] = $attempt($ca);
                    if ($errno === 0) break;
                }
            }
        }
        if ($errno !== 0) throw new RuntimeException('Falha de conexão: ' . $error);
        if ($status >= 400) throw new RuntimeException('A fonte respondeu com erro HTTP ' . $status);
        return (string)$body;
    }

    private static function cleanText(?string $s, int $max = 400): string
    {
        $s = html_entity_decode(strip_tags((string)$s), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $s = trim(preg_replace('/\s+/u', ' ', $s));
        return mb_strlen($s) > $max ? rtrim(mb_substr($s, 0, $max - 1)) . '…' : $s;
    }

    public static function rss(array $c): array
    {
        $urls = $c['urls'] ?? [$c['url']];
        $feeds = [];
        $errors = [];
        foreach ($urls as $u) {
            try {
                $feeds[] = self::rssFeed($u, $c);
            } catch (Throwable $e) {
                $errors[] = $e->getMessage();
            }
        }
        if (!$feeds) throw new RuntimeException($errors[0] ?? 'O feed não possui notícias.');
        if (count($feeds) === 1) {
            $f = $feeds[0];
            return ['source' => $c['source_name'] ?: $f['title'], 'items' => $f['items']];
        }
        // Várias fontes: mistura por data (mais recentes primeiro), sem repetir manchetes
        $all = [];
        $seen = [];
        foreach ($feeds as $f) {
            foreach ($f['items'] as $it) {
                $key = mb_strtolower($it['title']);
                if (isset($seen[$key])) continue;
                $seen[$key] = true;
                $all[] = $it + ['source' => $f['short']];
            }
        }
        usort($all, fn($a, $b) => strcmp((string)$b['date'], (string)$a['date']));
        $names = array_values(array_unique(array_column($feeds, 'short')));
        return ['source' => $c['source_name'] ?: implode(' + ', $names), 'items' => array_slice($all, 0, $c['max_items'])];
    }

    /** Lê um feed RSS/Atom. Retorna título, nome curto (ex.: "g1") e notícias. */
    private static function rssFeed(string $url, array $c): array
    {
        $xmlStr = self::httpGet($url);
        libxml_use_internal_errors(true);
        $xml = simplexml_load_string($xmlStr, 'SimpleXMLElement', LIBXML_NOCDATA);
        if (!$xml) throw new RuntimeException('O endereço informado não é um feed RSS válido.');

        $items = [];
        $title = '';
        $entries = [];
        if (isset($xml->channel)) {
            $title = (string)$xml->channel->title;
            foreach ($xml->channel->item as $it) $entries[] = $it;
        } elseif (isset($xml->item)) { // RSS 1.0
            $title = (string)($xml->channel->title ?? '');
            foreach ($xml->item as $it) $entries[] = $it;
        } elseif (isset($xml->entry)) { // Atom
            $title = (string)$xml->title;
            foreach ($xml->entry as $it) $entries[] = $it;
        }

        foreach ($entries as $it) {
            if (count($items) >= $c['max_items']) break;
            $image = null;
            $media = $it->children('http://search.yahoo.com/mrss/');
            if (isset($media->content)) {
                foreach ($media->content as $mc) {
                    $u = (string)$mc->attributes()->url;
                    if ($u) { $image = $u; break; }
                }
            }
            if (!$image && isset($media->thumbnail)) $image = (string)$media->thumbnail->attributes()->url;
            if (!$image && isset($media->group->content)) $image = (string)$media->group->content->attributes()->url;
            if (!$image && isset($it->enclosure)) {
                $enc = $it->enclosure->attributes();
                if (str_starts_with((string)$enc->type, 'image') || preg_match('/\.(jpe?g|png|webp)/i', (string)$enc->url)) $image = (string)$enc->url;
            }
            $desc = (string)($it->description ?? $it->summary ?? $it->content ?? '');
            $content = $it->children('http://purl.org/rss/1.0/modules/content/');
            if (!$image) {
                $html = $desc . (isset($content->encoded) ? (string)$content->encoded : '');
                if (preg_match('/<img[^>]+src=["\']([^"\']+)["\']/i', $html, $m)) $image = html_entity_decode($m[1]);
            }
            $link = (string)$it->link;
            if (!$link && isset($it->link['href'])) $link = (string)$it->link['href'];
            $date = (string)($it->pubDate ?? $it->updated ?? $it->published ?? '');
            $ts = $date ? strtotime($date) : false;
            $items[] = [
                'title' => self::cleanText((string)$it->title, 220),
                'description' => self::cleanText($desc, 320),
                'image' => ($image && preg_match('#^https?://#', $image) && $c['show_images']) ? $image : null,
                'date' => $ts ? gmdate('c', $ts) : null,
                'link' => $link,
            ];
        }
        if (!$items) throw new RuntimeException('O feed não possui notícias.');
        $clean = self::cleanText($title, 60);
        // "g1 > Santarém e Região" -> "g1"
        $short = trim(explode('>', $clean)[0]) ?: $clean;
        return ['title' => $clean, 'short' => $short, 'items' => $items];
    }

    public static function weather(array $c): array
    {
        $url = 'https://api.open-meteo.com/v1/forecast?' . http_build_query([
            'latitude' => $c['latitude'],
            'longitude' => $c['longitude'],
            'current' => 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
            'daily' => 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
            'timezone' => 'auto',
            'forecast_days' => 5,
        ]);
        $j = json_decode(self::httpGet($url), true);
        if (!isset($j['current'])) throw new RuntimeException('Não foi possível obter a previsão do tempo.');
        $daily = [];
        foreach ($j['daily']['time'] ?? [] as $i => $d) {
            $daily[] = [
                'date' => $d,
                'code' => $j['daily']['weather_code'][$i] ?? 0,
                'max' => round($j['daily']['temperature_2m_max'][$i] ?? 0),
                'min' => round($j['daily']['temperature_2m_min'][$i] ?? 0),
                'rain' => $j['daily']['precipitation_probability_max'][$i] ?? null,
            ];
        }
        return [
            'city' => $c['city'],
            'current' => [
                'temp' => round($j['current']['temperature_2m']),
                'feels' => round($j['current']['apparent_temperature'] ?? $j['current']['temperature_2m']),
                'humidity' => $j['current']['relative_humidity_2m'] ?? null,
                'wind' => round($j['current']['wind_speed_10m'] ?? 0),
                'code' => $j['current']['weather_code'] ?? 0,
                'is_day' => (bool)($j['current']['is_day'] ?? 1),
            ],
            'daily' => $daily,
        ];
    }

    public static function sports(array $c): array
    {
        $j = json_decode(self::httpGet('https://site.api.espn.com/apis/site/v2/sports/' . $c['league'] . '/scoreboard?lang=pt&region=br'), true);
        if (!is_array($j)) throw new RuntimeException('Não foi possível obter os resultados.');
        $events = [];
        foreach ($j['events'] ?? [] as $ev) {
            $comp = $ev['competitions'][0] ?? [];
            $teams = ['home' => null, 'away' => null];
            $list = [];
            foreach ($comp['competitors'] ?? [] as $cp) {
                $t = [
                    'name' => $cp['team']['shortDisplayName'] ?? $cp['team']['displayName'] ?? ($cp['athlete']['displayName'] ?? ''),
                    'abbr' => $cp['team']['abbreviation'] ?? '',
                    'logo' => $cp['team']['logo'] ?? null,
                    'score' => $cp['score'] ?? null,
                    'winner' => $cp['winner'] ?? false,
                ];
                $list[] = $t;
                if (($cp['homeAway'] ?? '') === 'home') $teams['home'] = $t;
                if (($cp['homeAway'] ?? '') === 'away') $teams['away'] = $t;
            }
            if (!$teams['home'] && count($list) >= 2) { $teams['home'] = $list[0]; $teams['away'] = $list[1]; }
            if (!$teams['home'] || !$teams['away']) continue;
            $status = $ev['status']['type'] ?? $comp['status']['type'] ?? [];
            $events[] = [
                'date' => $ev['date'] ?? null,
                'state' => $status['state'] ?? 'pre',
                'detail' => $status['shortDetail'] ?? '',
                'home' => $teams['home'],
                'away' => $teams['away'],
                'venue' => $comp['venue']['fullName'] ?? null,
            ];
        }
        return ['title' => $c['title'], 'league' => $j['leagues'][0]['name'] ?? $c['title'], 'logo' => $j['leagues'][0]['logos'][0]['href'] ?? null, 'events' => array_slice($events, 0, 20)];
    }

    public static function currency(array $c): array
    {
        $j = json_decode(self::httpGet('https://economia.awesomeapi.com.br/json/last/' . implode(',', $c['pairs'])), true);
        if (!is_array($j) || isset($j['status'])) throw new RuntimeException('Não foi possível obter as cotações.');
        $quotes = [];
        foreach ($c['pairs'] as $p) {
            $q = $j[str_replace('-', '', $p)] ?? null;
            if (!$q) continue;
            $quotes[] = [
                'code' => $q['code'],
                'codein' => $q['codein'],
                'name' => explode('/', $q['name'])[0],
                'bid' => (float)$q['bid'],
                'pct' => (float)$q['pctChange'],
            ];
        }
        return ['quotes' => $quotes];
    }

    public static function geocode(string $q): array
    {
        $j = json_decode(self::httpGet('https://geocoding-api.open-meteo.com/v1/search?' . http_build_query(['name' => $q, 'count' => 8, 'language' => 'pt', 'format' => 'json'])), true);
        return array_map(fn($r) => [
            'name' => $r['name'],
            'label' => trim($r['name'] . ', ' . ($r['admin1'] ?? '') . ' - ' . ($r['country'] ?? ''), ' ,-'),
            'latitude' => $r['latitude'],
            'longitude' => $r['longitude'],
        ], $j['results'] ?? []);
    }

    public static function format(array $row): array
    {
        return [
            'id' => (int)$row['id'],
            'type' => $row['type'],
            'name' => $row['name'],
            'config' => decode_json($row['config']),
            'created_by' => $row['created_by'] !== null ? (int)$row['created_by'] : null,
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }
}
