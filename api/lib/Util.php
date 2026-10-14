<?php
declare(strict_types=1);

function now(): string
{
    return gmdate('Y-m-d H:i:s');
}

function random_token(int $bytes = 32): string
{
    return bin2hex(random_bytes($bytes));
}

function app_url(string $path = ''): string
{
    $base = rtrim((string)config('app_url', ''), '/');
    if ($base === '') {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        // SCRIPT_NAME = /cloudimidia/api/index.php  ->  /cloudimidia
        $dir = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'))), '/');
        $base = ($https ? 'https' : 'http') . '://' . $host . $dir;
    }
    return $base . ($path !== '' ? '/' . ltrim($path, '/') : '');
}

function upload_url(?string $relative): ?string
{
    return $relative ? app_url('uploads/' . $relative) : null;
}

function ints($values): array
{
    if (!is_array($values)) {
        return [];
    }
    return array_values(array_unique(array_filter(array_map('intval', $values), fn($v) => $v > 0)));
}

function int_or_null($v): ?int
{
    return ($v === null || $v === '' || (int)$v <= 0) ? null : (int)$v;
}

function bool_input(string $key, bool $default = false): bool
{
    $v = input($key, $default);
    return filter_var($v, FILTER_VALIDATE_BOOLEAN);
}

function log_activity(?int $orgId, string $action, string $description = ''): void
{
    try {
        DB::insert('activity_logs', [
            'organization_id' => $orgId,
            'user_id' => Auth::id(),
            'action' => $action,
            'description' => mb_substr($description, 0, 500),
            'created_at' => now(),
        ]);
    } catch (Throwable $e) {
        // log nunca deve quebrar a requisição
    }
}

function send_mail(string $to, string $subject, string $text): void
{
    $dir = STORAGE_DIR . '/logs';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    @file_put_contents($dir . '/mail.log', sprintf("[%s] Para: %s | %s\n%s\n\n", now(), $to, $subject, $text), FILE_APPEND);

    if (config('mail_enabled')) {
        $headers = 'From: ' . config('mail_from') . "\r\nContent-Type: text/plain; charset=UTF-8";
        @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $text, $headers);
    }
}

function ensure_dir(string $dir): void
{
    // @: outro envio simultâneo pode criar a pasta ao mesmo tempo
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        abort('Não foi possível criar o diretório de armazenamento.', 500);
    }
}

function delete_upload(?string $relative): void
{
    if ($relative && strpos($relative, '..') === false) {
        $path = UPLOAD_DIR . '/' . $relative;
        if (is_file($path)) {
            @unlink($path);
        }
    }
}

function rrmdir(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    foreach (scandir($dir) as $f) {
        if ($f === '.' || $f === '..') {
            continue;
        }
        $p = $dir . '/' . $f;
        is_dir($p) ? rrmdir($p) : @unlink($p);
    }
    @rmdir($dir);
}

function valid_timezone(string $tz): bool
{
    return in_array($tz, DateTimeZone::listIdentifiers(), true);
}

function valid_color(?string $c, string $default = '#6366f1'): string
{
    return ($c && preg_match('/^#[0-9a-fA-F]{6}$/', $c)) ? strtolower($c) : $default;
}

function org_usage(int $orgId): array
{
    return [
        'screens' => (int)DB::val('SELECT COUNT(*) FROM screens WHERE organization_id = ?', [$orgId]),
        'storage_bytes' => (int)DB::val('SELECT COALESCE(SUM(size_bytes),0) FROM media WHERE organization_id = ?', [$orgId]),
    ];
}

function format_org(array $o): array
{
    return [
        'id' => (int)$o['id'],
        'name' => $o['name'],
        'logo_url' => upload_url($o['logo_path'] ?? null),
        'timezone' => $o['timezone'],
        'status' => $o['status'],
        'max_screens' => $o['max_screens'] !== null ? (int)$o['max_screens'] : null,
        'max_storage_mb' => $o['max_storage_mb'] !== null ? (int)$o['max_storage_mb'] : null,
        'created_at' => $o['created_at'],
    ];
}

function decode_json(?string $s, $default = [])
{
    if ($s === null || $s === '') {
        return $default;
    }
    $v = json_decode($s, true);
    return $v === null ? $default : $v;
}
