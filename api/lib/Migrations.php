<?php
declare(strict_types=1);

/**
 * Atualizações do banco para instalações existentes.
 * A versão aplicada fica em storage/schema_version, então a checagem custa só a leitura de um arquivo.
 * Instalações novas já recebem tudo pelo database/schema.sql.
 */
class Migrations
{
    public const VERSION = 4;

    public const APP_RELEASES_SQL = 'CREATE TABLE IF NOT EXISTS app_releases (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        version_code INT NOT NULL,
        version_name VARCHAR(40) NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
        notes VARCHAR(1000) NULL,
        created_by INT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_app_releases_code (version_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    public static function run(): void
    {
        $file = STORAGE_DIR . '/schema_version';
        if ((int)@file_get_contents($file) >= self::VERSION) {
            return;
        }
        if (!DB::tableExists('screens')) {
            return; // ainda não instalado: o setup cria o esquema completo
        }

        // v2: cadastro prévio de TVs com link de instalação
        if (!self::columnExists('screens', 'install_token_hash')) {
            DB::pdo()->exec('ALTER TABLE screens
                ADD COLUMN install_token_hash CHAR(64) NULL AFTER device_token_hash,
                ADD COLUMN install_expires_at DATETIME NULL AFTER install_token_hash,
                ADD UNIQUE KEY uq_screens_install (install_token_hash)');
        }

        // v3: barra inferior configurável
        if (!self::columnExists('playlists', 'footer')) {
            DB::pdo()->exec('ALTER TABLE playlists ADD COLUMN footer TEXT NULL AFTER music_integration_id');
        }

        // v4: app da TV (estatísticas, captura de tela e versões do app)
        if (!self::columnExists('screens', 'diagnostics')) {
            DB::pdo()->exec('ALTER TABLE screens
                ADD COLUMN diagnostics TEXT NULL AFTER device_info,
                ADD COLUMN screenshot_path VARCHAR(255) NULL AFTER diagnostics,
                ADD COLUMN screenshot_at DATETIME NULL AFTER screenshot_path');
        }
        DB::pdo()->exec(self::APP_RELEASES_SQL);

        if (!is_dir(STORAGE_DIR)) {
            @mkdir(STORAGE_DIR, 0775, true);
        }
        @file_put_contents($file, (string)self::VERSION);
    }

    private static function columnExists(string $table, string $column): bool
    {
        return (bool)DB::val(
            'SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
            [$table, $column]
        );
    }
}
