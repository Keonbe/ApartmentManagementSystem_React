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
