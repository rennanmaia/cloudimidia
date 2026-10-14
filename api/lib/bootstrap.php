<?php
declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');
date_default_timezone_set('UTC');
mb_internal_encoding('UTF-8');

define('API_ROOT', dirname(__DIR__));
define('APP_ROOT', dirname(API_ROOT));
define('UPLOAD_DIR', APP_ROOT . '/uploads');
define('STORAGE_DIR', APP_ROOT . '/storage');

$configFile = API_ROOT . '/config.php';
if (!is_file($configFile)) {
    $configFile = API_ROOT . '/config.example.php';
}
$GLOBALS['APP_CONFIG'] = require $configFile;

function config(string $key, $default = null)
{
    $value = $GLOBALS['APP_CONFIG'];
    foreach (explode('.', $key) as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            return $default;
        }
        $value = $value[$part];
    }
    return $value;
}

require __DIR__ . '/Http.php';
require __DIR__ . '/DB.php';
require __DIR__ . '/Util.php';
require __DIR__ . '/Auth.php';
require __DIR__ . '/Access.php';
require __DIR__ . '/Router.php';
require __DIR__ . '/Integrations.php';
require __DIR__ . '/Manifest.php';
require __DIR__ . '/Migrations.php';
require __DIR__ . '/Footer.php';

spl_autoload_register(function (string $class) {
    $file = API_ROOT . '/controllers/' . $class . '.php';
    if (is_file($file)) {
        require $file;
    }
});

// Erros do PHP viram exceções para responder sempre em JSON
set_error_handler(function (int $severity, string $message, string $file, int $line) {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});
