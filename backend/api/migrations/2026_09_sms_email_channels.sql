-- ============================================================
-- SMS & Email notification channels (Module 6.6 / 6.7, extends 6.8) —
-- idempotent migration for existing databases. A fresh SetupDB.sql import does
-- not need it. Safe to run more than once.
--
-- Implements the §0.1 compatibility findings C1, C2, C3, C4 and C11 from
-- docs/features/sms_email_implementation.md.
--
-- Run: mysql -u root ams_db < backend/api/migrations/2026_09_sms_email_channels.sql
-- ============================================================

-- ── 1. C4 — users.email_address was varchar(30) ──────────────
-- Shorter than a great many real addresses, and UNIQUE, so a tenant with a
-- longer address either could not register or was silently truncated and then
-- never received mail. Widening only; 190 keeps the unique index inside the
-- utf8mb4 key limit (190 * 4 bytes < 767).
ALTER TABLE `users`
  MODIFY COLUMN `email_address` VARCHAR(190) NOT NULL;

-- ── 2. C1/C2 — global per-user channel opt-out ───────────────
-- notification_preferences is keyed (user_id, category), so it can only ever
-- express a per-category choice. Notification types that belong to no category
-- (maintenance_update, overdue, payment_received, lease_expiring, every
-- decision notice) bypass that table entirely — without these columns a tenant
-- could not stop SMS at all. user_channel_allowed() in config.php checks these
-- FIRST. sms_consent_at records the RA 10173 consent moment (§0.4).
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `sms_opt_out`    TINYINT(1) NOT NULL DEFAULT 0 AFTER `contact_no`,
  ADD COLUMN IF NOT EXISTS `email_opt_out`  TINYINT(1) NOT NULL DEFAULT 0 AFTER `sms_opt_out`,
  ADD COLUMN IF NOT EXISTS `sms_consent_at` DATETIME DEFAULT NULL AFTER `email_opt_out`;

-- ── 3. C1 — per-category channel flags ───────────────────────
-- A missing row means "opted in", which is what create_notification() already
-- assumes, so both columns default to 1. That is NOT the same as SMS being on:
-- the real gate is system_settings.notifications_sms_enabled, which ships '0'.
-- SMS stays off building-wide until an admin turns it on, and only then does a
-- tenant's per-category choice matter (§0.3 cost control).
ALTER TABLE `notification_preferences`
  ADD COLUMN IF NOT EXISTS `sms_enabled`   TINYINT(1) NOT NULL DEFAULT 1 AFTER `in_app_enabled`,
  ADD COLUMN IF NOT EXISTS `email_enabled` TINYINT(1) NOT NULL DEFAULT 1 AFTER `sms_enabled`;

-- ── 4. C11 — delivery log ────────────────────────────────────
-- Every outbound SMS/email attempt. log_notification_delivery() truncates
-- message_body to 500 chars and prune_notification_log() drops rows older than
-- notification_log_retention_days, so personal data is not kept indefinitely.
CREATE TABLE IF NOT EXISTS `notification_log` (
  `id`            int(11) NOT NULL AUTO_INCREMENT,
  `user_id`       int(11) DEFAULT NULL,
  `channel`       enum('in-app','email','sms') NOT NULL,
  `event_type`    varchar(50) NOT NULL,
  `recipient`     varchar(255) DEFAULT NULL COMMENT 'email address or phone number',
  `subject`       varchar(255) DEFAULT NULL,
  `message_body`  text DEFAULT NULL COMMENT 'truncated to 500 chars by the writer',
  `status`        enum('sent','failed','skipped') NOT NULL DEFAULT 'sent',
  `error_message` text DEFAULT NULL,
  `sent_at`       timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_log_channel_status` (`channel`, `status`),
  KEY `idx_log_user` (`user_id`),
  KEY `idx_log_sent_at` (`sent_at`),
  CONSTRAINT `fk_notif_log_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ── 5. Async send queue ──────────────────────────────────────
-- Created here so the schema is settled in one migration. Nothing writes to it
-- until the dispatcher lands (§0.2): a web request must never block on a
-- provider, so dispatch enqueues and process_queue.php is the only sender.
CREATE TABLE IF NOT EXISTS `notification_queue` (
  `id`              int(11) NOT NULL AUTO_INCREMENT,
  `user_id`         int(11) NOT NULL,
  `channel`         enum('email','sms') NOT NULL,
  `event_type`      varchar(50) NOT NULL,
  `payload`         longtext NOT NULL COMMENT '{"to","subject","body","template","vars"}',
  `status`          enum('pending','processing','sent','failed') NOT NULL DEFAULT 'pending',
  `claim_token`     char(16) DEFAULT NULL COMMENT 'set by the claiming drain',
  `attempts`        tinyint(4) NOT NULL DEFAULT 0,
  `max_attempts`    tinyint(4) NOT NULL DEFAULT 3,
  `next_attempt_at` datetime DEFAULT current_timestamp(),
  `error_message`   text DEFAULT NULL,
  `created_at`      datetime DEFAULT current_timestamp(),
  `processed_at`    datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_queue_pending` (`status`, `next_attempt_at`),
  CONSTRAINT `fk_notif_queue_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ── 6. C3 — provider settings ────────────────────────────────
-- get_system_settings.php and update_system_settings.php carried a secret list
-- naming semaphore_api_key / smtp_user / smtp_pass. Nothing ever read or wrote
-- those three, and the keys below are the ones the services use, so the legacy
-- names are dropped in the same change that masks the new ones.
DELETE FROM `system_settings`
WHERE `setting_key` IN ('semaphore_api_key', 'smtp_user', 'smtp_pass');

-- sms_provider accepts: 'log', 'semaphore', 'twilio', 'vonage', 'movider', 'itexmo'.
-- 'log' is the dry-run driver: it writes to notification_log and sends nothing.
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('smtp_host', 'smtp.gmail.com'),
('smtp_port', '587'),
('smtp_username', ''),
('smtp_password', ''),
('smtp_from_name', 'AMS Notifications'),
('smtp_from_email', ''),
-- log | smtp. The mirror of sms_provider's 'log': the dry-run driver renders the
-- email, records it and writes it to the mock outbox without opening a socket,
-- so the pipeline is demoable with no SMTP account and no PHPMailer installed.
('email_driver', 'log'),
('sms_provider', 'log'),
('sms_api_key', ''),
('sms_sender_name', 'AMS'),
('sms_twilio_sid', ''),
('sms_twilio_auth_token', ''),
('sms_twilio_from_number', ''),
('sms_vonage_api_key', ''),
('sms_vonage_api_secret', ''),
('sms_movider_api_key', ''),
('sms_movider_api_secret', ''),
('sms_itexmo_api_code', ''),
('sms_itexmo_password', ''),
-- Building-wide kill switches. Both ship off: email needs SMTP credentials and
-- SMS costs money and needs a registered sender ID (§0.4).
('notifications_email_enabled', '0'),
('notifications_sms_enabled', '0'),
-- queue | sync. 'sync' blocks the HTTP request and exists only for demos.
('notifications_dispatch_mode', 'queue'),
-- Quiet hours (24h, local). Overdue and urgent announcements are exempt.
('notifications_quiet_start', '21'),
('notifications_quiet_end', '07'),
-- C11 retention: notification_log rows older than this are pruned.
('notification_log_retention_days', '90'),
-- Claimed by the queue drain, same pattern as notification_sweep_last_run.
('notification_queue_last_run', '2000-01-01 00:00:00'),
-- Drives the cost preview on the announcement form. Set to whatever the
-- provider actually charges once you have a real rate card.
('sms_unit_cost', '0.50');

-- C11 — manual prune. prune_notification_log() in config.php runs the same
-- statement with the retention setting; kept here so a one-off prune is easy.
-- DELETE FROM `notification_log`
--   WHERE `sent_at` < DATE_SUB(NOW(), INTERVAL 90 DAY) LIMIT 5000;
