ALTER TABLE subscribers
  MODIFY status ENUM('active','inactive','suspended') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive',
  ADD KEY idx_subscriber_status (status);

ALTER TABLE subscriptions
  ADD COLUMN invoice_id BIGINT UNSIGNED NULL AFTER amount,
  ADD COLUMN activated_at DATETIME NULL AFTER status,
  ADD COLUMN cancelled_at DATETIME NULL AFTER activated_at,
  ADD COLUMN cancel_reason VARCHAR(255) NULL AFTER cancelled_at,
  ADD KEY idx_subscription_lookup (subscriber_id, status, end_date);
