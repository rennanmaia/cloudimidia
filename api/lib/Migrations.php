<?php
declare(strict_types=1);

/**
 * Atualizações do banco para instalações existentes.
 * A versão aplicada fica em storage/schema_version, então a checagem custa só a leitura de um arquivo.
 * Instalações novas já recebem tudo pelo database/schema.sql.
 */
class Migrations
{
    public const VERSION = 9;

    public const PLAY_ISSUES_SQL = 'CREATE TABLE IF NOT EXISTS play_issues (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  screen_id INT UNSIGNED NOT NULL,
  media_id INT UNSIGNED NULL,
  integration_id INT UNSIGNED NULL,
  reason VARCHAR(20) NOT NULL,
  detail VARCHAR(255) NULL,
  created_at DATETIME NOT NULL,
  KEY ix_play_issues_screen (screen_id, created_at),
  CONSTRAINT fk_play_issues_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_play_issues_screen FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    public const ORG_CREDENTIALS_SQL = 'CREATE TABLE IF NOT EXISTS org_credentials (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  provider VARCHAR(40) NOT NULL,
  secret TEXT NOT NULL,
  hint VARCHAR(40) NULL,
  status VARCHAR(10) NOT NULL DEFAULT \'ok\',
  status_message VARCHAR(500) NULL,
  checked_at DATETIME NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  UNIQUE KEY uq_org_credentials (organization_id, provider),
  CONSTRAINT fk_org_credentials_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

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

        // v5: chaves de integrações externas (ex.: FutDigital)
        DB::pdo()->exec(self::ORG_CREDENTIALS_SQL);

        // v6: itens pulados nas TVs (erro, travou, não começou)
        DB::pdo()->exec(self::PLAY_ISSUES_SQL);

        // v7: trilha sonora da TV
        if (!self::columnExists('screens', 'soundtrack')) {
            DB::pdo()->exec('ALTER TABLE screens ADD COLUMN soundtrack TEXT NULL AFTER rotation');
        }

        // v8: controle remoto da trilha pelo celular (situação da trilha e sessão do controle aberto)
        if (!self::columnExists('screens', 'soundtrack_state')) {
            DB::pdo()->exec('ALTER TABLE screens
                ADD COLUMN soundtrack_state TEXT NULL AFTER soundtrack,
                ADD COLUMN remote_until DATETIME NULL AFTER soundtrack_state');
        }

        // v9: convidado "Só a trilha sonora" (dono ou funcionário do comércio)
        DB::pdo()->exec("ALTER TABLE screen_permissions MODIFY role ENUM('editor','viewer','soundtrack') NOT NULL DEFAULT 'editor'");

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
