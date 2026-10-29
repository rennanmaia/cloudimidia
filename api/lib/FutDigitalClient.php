<?php
declare(strict_types=1);

/**
 * Cliente da API de parceiros do FutDigital (só no servidor; a chave nunca vai para o player).
 * Tempo limite de 10 s, respeita 429/Retry-After e devolve a mensagem de erro da API.
 */
class FutDigitalClient
{
    public const BASE = 'https://fut.digital/api/v1';
    public const VIEWS = ['live', 'results', 'upcoming'];
    public const ORIENTATIONS = ['landscape', 'portrait', 'auto'];

    /** fn(method, url, headers, body): [status, corpo, retry-after] — só para testes */
    public static $transport = null;

    private string $key;

    public function __construct(string $key)
    {
        $this->key = $key;
    }

    /** Cliente com a chave cadastrada da organização. */
    public static function forOrg(int $orgId): self
    {
        $key = Credentials::get($orgId, 'futdigital');
        if ($key === null) throw new RuntimeException('Cadastre a chave do FutDigital em Configurações → Chaves de integrações.');
        return new self($key);
    }

    /** Esconde a chave em mensagens de erro e logs. */
    private function scrub(string $s): string
    {
        return $this->key !== '' ? str_replace($this->key, Credentials::mask($this->key), $s) : $s;
    }

    /**
     * Executa uma chamada. Retorna "data" ou lança FutDigitalError (com o status HTTP).
     * $retry: em 429, espera o Retry-After (até 5 s) e tenta uma vez de novo.
     */
    public function request(string $method, string $path, array $query = [], ?array $body = null, bool $retry = true)
    {
        $url = self::BASE . '/partner/' . ltrim($path, '/') . ($query ? '?' . http_build_query($query) : '');
        $headers = ['Authorization: Bearer ' . $this->key, 'Accept: application/json'];
        if ($body !== null) $headers[] = 'Content-Type: application/json';
        [$status, $raw, $retryAfter] = self::send($method, $url, $headers, $body !== null ? json_encode($body, JSON_UNESCAPED_UNICODE) : null);
        if ($status === 429 && $retry && $retryAfter <= 5) {
            sleep(max(1, $retryAfter));
            return $this->request($method, $path, $query, $body, false);
        }
        if ($status >= 200 && $status < 300 && ($status === 204 || $method === 'DELETE')) return null;
        $j = json_decode($raw, true);
        if ($status >= 400 || !is_array($j) || !array_key_exists('data', $j)) {
            $msg = is_array($j) ? ($j['error']['message'] ?? (is_string($j['error'] ?? null) ? $j['error'] : null)) : null;
            if ($status === 429) $msg = 'limite de consultas por minuto atingido, tente de novo em instantes';
            throw new FutDigitalError($this->scrub(is_string($msg) && $msg !== '' ? $msg : "resposta inesperada (HTTP $status)"), $status);
        }
        return $j['data'] ?? null;
    }

    /** Requisição HTTP crua: [status, corpo, retry-after]. */
    public static function send(string $method, string $url, array $headers = [], ?string $body = null): array
    {
        // Respostas simuladas nos testes
        if (self::$transport) return (self::$transport)($method, $url, $headers, $body);
        $retryAfter = 0;
        $attempt = function (?string $ca) use ($method, $url, $headers, $body, &$retryAfter) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CUSTOMREQUEST => $method,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_TIMEOUT => 10,
                CURLOPT_ENCODING => '',
                CURLOPT_USERAGENT => 'CloudiMidia/1.0',
                CURLOPT_SSL_VERIFYPEER => (bool)config('http_verify_ssl', true),
                CURLOPT_SSL_VERIFYHOST => config('http_verify_ssl', true) ? 2 : 0,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$retryAfter) {
                    if (stripos($line, 'Retry-After:') === 0) $retryAfter = (int)trim(substr($line, 12));
                    return strlen($line);
                },
            ]);
            if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            if ($ca) curl_setopt($ch, CURLOPT_CAINFO, $ca);
            $res = curl_exec($ch);
            $out = [curl_errno($ch), curl_error($ch), (int)curl_getinfo($ch, CURLINFO_HTTP_CODE), (string)$res];
            curl_close($ch);
            return $out;
        };
        [$errno, $error, $status, $res] = $attempt(null);
        if (in_array($errno, [60, 77], true)) {
            // Certificados ausentes (comum no XAMPP/Windows)
            foreach ([ini_get('curl.cainfo'), dirname(PHP_BINARY) . '/extras/ssl/cacert.pem', 'C:/xampp/apache/bin/curl-ca-bundle.crt', 'C:/xampp/php/extras/ssl/cacert.pem'] as $ca) {
                if ($ca && is_file($ca)) {
                    [$errno, $error, $status, $res] = $attempt($ca);
                    if ($errno === 0) break;
                }
            }
        }
        if ($errno !== 0) throw new FutDigitalError('falha de conexão com o FutDigital: ' . $error, 0);
        return [$status, $res, $retryAfter];
    }

    public function me(): array { return (array)$this->request('GET', 'me'); }
    public function competitions(?string $status = null): array { return (array)$this->request('GET', 'competitions', $status ? ['status' => $status] : []); }
    public function arenas(string $q = ''): array { return (array)$this->request('GET', 'arenas', $q !== '' ? ['q' => $q] : []); }
    public function listSlots(): array { return (array)$this->request('GET', 'slots'); }
    public function createSlot(array $fields): array { return (array)$this->request('POST', 'slots', [], $fields); }
    public function updateSlot(int $id, array $fields): array { return (array)$this->request('PATCH', "slots/$id", [], $fields); }
    public function deleteSlot(int $id): void { $this->request('DELETE', "slots/$id"); }

    /** Conteúdo público de um slot (sem chave): has_content, live, results, upcoming. */
    public static function slotContent(string $token): array
    {
        [$status, $raw] = self::send('GET', self::BASE . '/slots/' . rawurlencode($token), ['Accept: application/json']);
        $j = json_decode($raw, true);
        if ($status >= 400 || !is_array($j) || !isset($j['data'])) {
            $msg = is_array($j) ? ($j['error']['message'] ?? null) : null;
            throw new FutDigitalError(is_string($msg) && $msg !== '' ? $msg : "resposta inesperada (HTTP $status)", $status);
        }
        return $j['data'];
    }

    /** Lista guardada em cache por 10 min (formulário do painel). */
    public static function cached(int $orgId, string $name, callable $fn, int $ttl = 600)
    {
        $dir = STORAGE_DIR . '/cache';
        ensure_dir($dir);
        $file = $dir . '/fd_' . $orgId . '_' . md5($name) . '.json';
        if (is_file($file) && filemtime($file) > time() - $ttl) {
            $j = json_decode((string)file_get_contents($file), true);
            if (is_array($j)) return $j;
        }
        $data = $fn();
        @file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE), LOCK_EX);
        return $data;
    }

    public static function clearCache(int $orgId): void
    {
        foreach (glob(STORAGE_DIR . '/cache/fd_' . $orgId . '_*.json') ?: [] as $f) @unlink($f);
    }

    /** Token do slot a partir do endereço da página. */
    public static function tokenFromUrl(string $url): string
    {
        parse_str((string)parse_url($url, PHP_URL_QUERY), $q);
        return preg_match('/^[A-Za-z0-9]{8,80}$/', (string)($q['k'] ?? '')) ? (string)$q['k'] : '';
    }
}

class FutDigitalError extends RuntimeException
{
    public function __construct(string $message, public int $status = 0)
    {
        parent::__construct($message);
    }
}
