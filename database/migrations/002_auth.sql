ALTER TABLE admins
  MODIFY role ENUM('super_admin','admin','operator','viewer') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'operator',
  MODIFY status ENUM('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  ADD COLUMN last_login_at DATETIME NULL AFTER status;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id BIGINT UNSIGNED NULL,
  admin_name VARCHAR(100) NULL,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(255) NOT NULL,
  status_code SMALLINT UNSIGNED NOT NULL,
  ip VARCHAR(64) NULL,
  request_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_admin (admin_id, created_at),
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
