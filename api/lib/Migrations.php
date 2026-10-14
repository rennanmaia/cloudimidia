<?php
declare(strict_types=1);

/**
 * Atualizações do banco para instalações existentes.
 * A versão aplicada fica em storage/schema_version, então a checagem custa só a leitura de um arquivo.
 * Instalações novas já recebem tudo pelo database/schema.sql.
 */
class Migrations
{
    public const VERSION = 2;

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
