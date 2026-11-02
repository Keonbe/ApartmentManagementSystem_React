-- ===== auth_security =====
-- Email verification and new-device sign-in codes (login.php, registration.php,
-- verify_email.php, verify_device.php). Replaces the one-off
-- add_auth_security.php script, which migrate.php never ran, so dev databases
-- and SetupDB.sql lacked these columns and login.php failed with
-- "Unknown column 'email_verified_at'".
--
-- users.email_verified_at: NULL = registered but not verified (login refuses).
-- verification_token: the emailed link's token until it is used.
-- login_otp / _expires_at / _attempts: the 6-digit code for a new device.
-- trusted_devices: SHA-256 of the HttpOnly ams_trusted_device cookie; a known
-- device skips the code.
--
-- Idempotent. Existing accounts are marked verified only when the column is
-- created here (prod already has it, with real unverified sign-ups in it).

SET @add_verified := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verified_at');
SET @sql := IF(@add_verified, 'ALTER TABLE `users` ADD COLUMN `email_verified_at` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @sql := IF(@add_verified, 'UPDATE `users` SET `email_verified_at` = NOW() WHERE `email_verified_at` IS NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'verification_token') = 0,
  'ALTER TABLE `users` ADD COLUMN `verification_token` varchar(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'login_otp') = 0,
  'ALTER TABLE `users` ADD COLUMN `login_otp` varchar(6) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'login_otp_expires_at') = 0,
  'ALTER TABLE `users` ADD COLUMN `login_otp_expires_at` datetime DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'login_otp_attempts') = 0,
  'ALTER TABLE `users` ADD COLUMN `login_otp_attempts` tinyint(3) unsigned NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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
