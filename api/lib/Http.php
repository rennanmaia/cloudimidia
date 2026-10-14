<?php
declare(strict_types=1);

class ApiError extends Exception
{
    public int $status;
    public ?array $errors;

    public function __construct(string $message, int $status = 400, ?array $errors = null)
    {
        parent::__construct($message);
        $this->status = $status;
        $this->errors = $errors;
    }
}

function abort(string $message, int $status = 400, ?array $errors = null): never
{
    throw new ApiError($message, $status, $errors);
}

function respond($data = null, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data ?? ['ok' => true], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function body(): array
{
    static $body = null;
    if ($body === null) {
        $body = [];
        $type = $_SERVER['CONTENT_TYPE'] ?? '';
        if (stripos($type, 'application/json') !== false) {
            $raw = file_get_contents('php://input');
            $decoded = $raw ? json_decode($raw, true, 512, JSON_INVALID_UTF8_SUBSTITUTE) : [];
            $body = is_array($decoded) ? $decoded : [];
        } elseif (!empty($_POST)) {
            $body = $_POST;
        }
    }
    return $body;
}

function input(string $key, $default = null)
{
    $b = body();
    return array_key_exists($key, $b) ? $b[$key] : $default;
}

function has_input(string $key): bool
{
    return array_key_exists($key, body());
}

function str_input(string $key, int $max = 255, string $default = ''): string
{
    $v = input($key, $default);
    if (!is_scalar($v)) {
        return $default;
    }
    return mb_substr(trim((string)$v), 0, $max);
}

function query(string $key, $default = null)
{
    return $_GET[$key] ?? $default;
}

function required(array $fields): void
{
    $errors = [];
    foreach ($fields as $key => $label) {
        $v = input($key);
        if ($v === null || (is_string($v) && trim($v) === '') || (is_array($v) && !$v)) {
            $errors[$key] = "Informe $label.";
        }
    }
    if ($errors) {
        abort(reset($errors), 422, $errors);
    }
}

function client_ip(): string
{
    return substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 45);
}

function send_cors_headers(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin && in_array($origin, (array)config('cors_origins', []), true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Device-Token');
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Max-Age: 86400');
    }
}
