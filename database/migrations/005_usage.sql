CREATE TABLE IF NOT EXISTS usage_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subscriber_id BIGINT UNSIGNED NOT NULL,
  session_id VARCHAR(100) NULL,
  record_key VARCHAR(191) NULL,
  bytes_in BIGINT UNSIGNED NOT NULL DEFAULT 0,
  bytes_out BIGINT UNSIGNED NOT NULL DEFAULT 0,
  recorded_at DATETIME NOT NULL,
  source ENUM('api','csv') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'api',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usage_record_key (record_key),
  KEY idx_usage_subscriber_time (subscriber_id, recorded_at),
  KEY idx_usage_recorded (recorded_at),
  CONSTRAINT fk_usage_subscriber FOREIGN KEY (subscriber_id) REFERENCES subscribers (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_daily (
  subscriber_id BIGINT UNSIGNED NOT NULL,
  usage_date DATE NOT NULL,
  bytes_in BIGINT UNSIGNED NOT NULL DEFAULT 0,
  bytes_out BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (subscriber_id, usage_date),
  KEY idx_usage_daily_date (usage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_quota_alerts (
  subscription_id BIGINT UNSIGNED NOT NULL,
  subscriber_id BIGINT UNSIGNED NOT NULL,
  used_bytes BIGINT UNSIGNED NOT NULL,
  limit_bytes BIGINT UNSIGNED NOT NULL,
  alerted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (subscription_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
