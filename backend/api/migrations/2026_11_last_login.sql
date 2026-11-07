-- users.last_login_at: when the account last signed in (login.php, and
-- verify_device.php after a sign-in code). NULL = never signed in, so the
-- first sign-in can greet "Welcome" instead of "Welcome back".
-- Idempotent: the column is added only when missing. When it is added, the
-- accounts that already exist count as having signed in, except those still
-- waiting for their verification link (they cannot have signed in yet).

SET @missing := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'last_login_at') = 0;

SET @sql := IF(@missing,
  'ALTER TABLE `users` ADD COLUMN `last_login_at` datetime DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@missing,
  'UPDATE `users` SET `last_login_at` = NOW() WHERE `last_login_at` IS NULL AND `verification_token` IS NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
