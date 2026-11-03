-- ============================================================
-- 2026_11_cctv_auth_chat_billing.sql
-- One migration for the local 2026-11 workstream, merged from five per-feature
-- files that were never pushed (so no deployed database has recorded them):
--   guest_chat_links   guest inquiry chat links and flags (2026_10_guest_chat_links)
--   invoiced_amount    amount a request put on its invoice (2026_11_invoiced_amount)
--   cctv_incident_type / cctv_decision_note / cctv_footage   CCTV request rework
--   auth_security      email verification and device sign-in codes
-- 2026_11_appearance_settings and 2026_11_contract_end_and_preview stay as their
-- own files: they are already on origin/main and may be applied on prod.
--
-- Every change checks information_schema first and runs through a prepared
-- statement (pattern of 2026_10_prod_schema_repair.sql): safe on MySQL 8 and
-- MariaDB, through the mysql client or cron/migrate.php, and safe to re-run.
-- The two data backfills (invoiced_amount, auth_security) only touch rows that
-- still need them.
-- ============================================================

-- ===== guest_chat_links =====
-- Guest inquiry chat (#25): one-time "continue your conversation" links sent
-- by email, a throttle for reply emails, a flag for guests who proved they own
-- the thread's email, and the link from a duplicate inquiry to the existing
-- conversation it matched (that inquiry no longer receives the thread's token).

SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'guest_chat_links') = 0,
  'CREATE TABLE `guest_chat_links` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `inquiry_id` int(11) NOT NULL,
    `token_hash` char(64) NOT NULL,
    `expires_at` datetime NOT NULL,
    `used_at` datetime DEFAULT NULL,
    `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_guest_chat_links_hash` (`token_hash`),
    KEY `idx_guest_chat_links_thread` (`inquiry_id`, `used_at`),
    CONSTRAINT `fk_guest_chat_links_inquiry` FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'guest_reply_emailed_at') = 0,
  'ALTER TABLE `inquiries` ADD COLUMN `guest_reply_emailed_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'guest_verified_at') = 0,
  'ALTER TABLE `inquiries` ADD COLUMN `guest_verified_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'matched_thread_id') = 0,
  'ALTER TABLE `inquiries` ADD COLUMN `matched_thread_id` int(11) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== invoiced_amount =====
-- The amount a service / maintenance request put on its invoice, stored at the
-- moment of posting (parking_charges.amount already does this). Reversing a
-- charge used to subtract the request's CURRENT cost, which backs out the wrong
-- amount when the cost was edited after billing.

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'service_requests' AND column_name = 'invoiced_amount') = 0,
  'ALTER TABLE `service_requests` ADD COLUMN `invoiced_amount` decimal(10,2) DEFAULT NULL AFTER `billing_period`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'maintenance_requests' AND column_name = 'invoiced_amount') = 0,
  'ALTER TABLE `maintenance_requests` ADD COLUMN `invoiced_amount` decimal(10,2) DEFAULT NULL AFTER `billing_period`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- Rows already on an invoice: the best known amount is the current cost.
UPDATE `service_requests` SET `invoiced_amount` = `total_cost`
 WHERE `is_invoiced` = 1 AND `invoice_id` IS NOT NULL AND `invoiced_amount` IS NULL;
UPDATE `maintenance_requests` SET `invoiced_amount` = COALESCE(`actual_cost`, `estimated_cost`, 0)
 WHERE `is_invoiced` = 1 AND `invoice_id` IS NOT NULL AND `invoiced_amount` IS NULL;

-- CCTV request rework (the next two sections): both columns are NULL for requests
-- filed or decided before them.

-- ===== cctv_incident_type =====
-- CCTV footage is released for incidents only: the request records what kind of
-- incident it is (cctv_request.php validates it against the configured list).

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'incident_type') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `incident_type` varchar(30) DEFAULT NULL AFTER `location_details`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== cctv_decision_note =====
-- The admin's note on a decision: where and when to view or collect the footage
-- (Approved) or why it was refused (Rejected). Shown to the tenant.

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'decision_note') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `decision_note` text DEFAULT NULL AFTER `status`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== cctv_footage =====
-- Footage the admin hands to the tenant on an Approved CCTV request: a stored
-- clip (footage_path) or a private link (footage_url), available until
-- footage_expires_at. After expiry the path and link are cleared but the date
-- stays, so My Requests can say the footage expired.

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'footage_path') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `footage_path` varchar(255) DEFAULT NULL AFTER `decision_note`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'footage_url') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `footage_url` varchar(500) DEFAULT NULL AFTER `footage_path`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'footage_attached_at') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `footage_attached_at` datetime DEFAULT NULL AFTER `footage_url`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'footage_expires_at') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `footage_expires_at` datetime DEFAULT NULL AFTER `footage_attached_at`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== auth_security =====
-- Email verification and device sign-in codes (login.php, verify_email.php,
-- verify_device.php, registration.php). Replaces the standalone script
-- add_auth_security.php so a database built from SetupDB.sql or migrated by
-- cron/migrate.php gets the same schema.
--
--   users.email_verified_at        NULL until the address is confirmed; login is
--                                  refused while it is NULL.
--   users.verification_token       emailed once at registration, cleared on use.
--   users.login_otp / _expires_at / _attempts
--                                  the six-digit code for a sign-in from a device
--                                  that is not trusted yet.
--   trusted_devices                SHA-256 of the cookie a verified device holds,
--                                  so it skips the code next time.
--
-- Accounts that exist when the columns are first added are marked verified so no
-- one is locked out. That backfill runs only on that first run (it is skipped
-- once email_verified_at exists), so re-running never verifies a new sign-up.
--
-- Every change checks information_schema first and runs through a prepared
-- statement: safe on MySQL 8 and MariaDB, through the mysql client or the
-- runner, and safe to re-run.

SET @fresh = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'email_verified_at') = 0, 1, 0);

SET @s = IF(@fresh = 1, 'ALTER TABLE `users` ADD COLUMN `email_verified_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'verification_token') = 0,
  'ALTER TABLE `users` ADD COLUMN `verification_token` varchar(64) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'login_otp') = 0,
  'ALTER TABLE `users` ADD COLUMN `login_otp` varchar(6) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'login_otp_expires_at') = 0,
  'ALTER TABLE `users` ADD COLUMN `login_otp_expires_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'login_otp_attempts') = 0,
  'ALTER TABLE `users` ADD COLUMN `login_otp_attempts` tinyint(3) unsigned NOT NULL DEFAULT 0', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF(@fresh = 1, 'UPDATE `users` SET `email_verified_at` = CURRENT_TIMESTAMP WHERE `email_verified_at` IS NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

CREATE TABLE IF NOT EXISTS `trusted_devices` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `device_token` char(64) NOT NULL,
  `user_agent` varchar(512) NOT NULL DEFAULT '',
  `ip_address` varchar(45) NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_used_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_trusted_device_token` (`device_token`),
  KEY `idx_trusted_devices_user` (`user_id`),
  CONSTRAINT `fk_trusted_devices_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
