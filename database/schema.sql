-- CloudMídia - esquema do banco de dados (MySQL 5.7+/MariaDB 10.3+)
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_superadmin TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('active','blocked') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  user_agent VARCHAR(255) NULL,
  expires_at DATETIME NOT NULL,
  last_used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auth_tokens_hash (token_hash),
  CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_resets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_password_resets_hash (token_hash),
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organizations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  logo_path VARCHAR(255) NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  max_screens INT NULL,
  max_storage_mb INT NULL,
  status ENUM('active','suspended') NOT NULL DEFAULT 'active',
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS memberships (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role ENUM('owner','admin','editor','viewer') NOT NULL DEFAULT 'viewer',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_memberships (organization_id, user_id),
  CONSTRAINT fk_memberships_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS screen_groups (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#6366f1',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_groups_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS media (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  type ENUM('image','video','audio') NOT NULL,
  name VARCHAR(190) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  thumb_path VARCHAR(255) NULL,
  mime VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  duration DECIMAL(10,2) NULL,
  width INT NULL,
  height INT NULL,
  uploaded_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_media_org (organization_id, type),
  CONSTRAINT fk_media_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_media_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integrations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  type VARCHAR(30) NOT NULL,
  name VARCHAR(120) NOT NULL,
  config TEXT NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  KEY ix_integrations_org (organization_id),
  CONSTRAINT fk_integrations_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_integrations_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_cache (
  integration_id INT UNSIGNED NOT NULL PRIMARY KEY,
  config_hash CHAR(32) NOT NULL,
  data MEDIUMTEXT NULL,
  error VARCHAR(500) NULL,
  fetched_at DATETIME NOT NULL,
  CONSTRAINT fk_integration_cache FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS playlists (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  transition ENUM('fade','slide','zoom','none') NOT NULL DEFAULT 'fade',
  ticker_integration_id INT UNSIGNED NULL,
  ticker_text VARCHAR(1000) NULL,
  music_integration_id INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  KEY ix_playlists_org (organization_id),
  CONSTRAINT fk_playlists_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_playlists_ticker FOREIGN KEY (ticker_integration_id) REFERENCES integrations(id) ON DELETE SET NULL,
  CONSTRAINT fk_playlists_music FOREIGN KEY (music_integration_id) REFERENCES integrations(id) ON DELETE SET NULL,
  CONSTRAINT fk_playlists_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS playlist_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  playlist_id INT UNSIGNED NOT NULL,
  position INT NOT NULL DEFAULT 0,
  item_type ENUM('media','integration') NOT NULL,
  media_id INT UNSIGNED NULL,
  integration_id INT UNSIGNED NULL,
  duration INT NULL,
  settings TEXT NULL,
  KEY ix_playlist_items (playlist_id, position),
  CONSTRAINT fk_items_playlist FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_media FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS screens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  location VARCHAR(190) NULL,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  muted TINYINT(1) NOT NULL DEFAULT 0,
  rotation SMALLINT NOT NULL DEFAULT 0,
  default_playlist_id INT UNSIGNED NULL,
  device_token_hash CHAR(64) NULL,
  install_token_hash CHAR(64) NULL,
  install_expires_at DATETIME NULL,
  device_info TEXT NULL,
  last_seen_at DATETIME NULL,
  last_ip VARCHAR(45) NULL,
  now_playing VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  UNIQUE KEY uq_screens_token (device_token_hash),
  UNIQUE KEY uq_screens_install (install_token_hash),
  KEY ix_screens_org (organization_id),
  CONSTRAINT fk_screens_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_screens_playlist FOREIGN KEY (default_playlist_id) REFERENCES playlists(id) ON DELETE SET NULL,
  CONSTRAINT fk_screens_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS screen_group_members (
  screen_id INT UNSIGNED NOT NULL,
  group_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (screen_id, group_id),
  CONSTRAINT fk_sgm_screen FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE,
  CONSTRAINT fk_sgm_group FOREIGN KEY (group_id) REFERENCES screen_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS screen_permissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  screen_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role ENUM('editor','viewer') NOT NULL DEFAULT 'editor',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_screen_permissions (screen_id, user_id),
  CONSTRAINT fk_sp_screen FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE,
  CONSTRAINT fk_sp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pairing_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code CHAR(6) NOT NULL,
  device_key_hash CHAR(64) NOT NULL,
  device_info TEXT NULL,
  screen_id INT UNSIGNED NULL,
  device_token VARCHAR(100) NULL,
  expires_at DATETIME NOT NULL,
  claimed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_pairing_code (code),
  KEY ix_pairing_device (device_key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS screen_commands (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  screen_id INT UNSIGNED NOT NULL,
  command VARCHAR(30) NOT NULL,
  payload TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at DATETIME NULL,
  KEY ix_commands_screen (screen_id, delivered_at),
  CONSTRAINT fk_commands_screen FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schedules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  playlist_id INT UNSIGNED NOT NULL,
  mode ENUM('replace','insert') NOT NULL DEFAULT 'replace',
  insert_every INT NOT NULL DEFAULT 3,
  priority INT NOT NULL DEFAULT 10,
  days VARCHAR(20) NOT NULL DEFAULT '0,1,2,3,4,5,6',
  start_time TIME NULL,
  end_time TIME NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  color VARCHAR(20) NOT NULL DEFAULT '#6366f1',
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  KEY ix_schedules_org (organization_id),
  CONSTRAINT fk_schedules_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_schedules_playlist FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE RESTRICT,
  CONSTRAINT fk_schedules_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schedule_targets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  schedule_id INT UNSIGNED NOT NULL,
  screen_id INT UNSIGNED NULL,
  group_id INT UNSIGNED NULL,
  KEY ix_targets_schedule (schedule_id),
  CONSTRAINT fk_targets_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  CONSTRAINT fk_targets_screen FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE,
  CONSTRAINT fk_targets_group FOREIGN KEY (group_id) REFERENCES screen_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invitations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  email VARCHAR(190) NOT NULL,
  role VARCHAR(20) NOT NULL,
  scope ENUM('org','screens') NOT NULL DEFAULT 'org',
  screen_ids TEXT NULL,
  token CHAR(48) NOT NULL,
  invited_by INT UNSIGNED NULL,
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME NULL,
  accepted_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invitations_token (token),
  CONSTRAINT fk_invitations_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_invitations_user FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS play_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  screen_id INT UNSIGNED NOT NULL,
  media_id INT UNSIGNED NULL,
  integration_id INT UNSIGNED NULL,
  playlist_id INT UNSIGNED NULL,
  schedule_id INT UNSIGNED NULL,
  started_at DATETIME NOT NULL,
  duration INT NOT NULL DEFAULT 0,
  KEY ix_play_logs_org (organization_id, started_at),
  KEY ix_play_logs_screen (screen_id, started_at),
  CONSTRAINT fk_play_logs_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_play_logs_screen FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NULL,
  user_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  description VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_activity_org (organization_id, created_at),
  CONSTRAINT fk_activity_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
