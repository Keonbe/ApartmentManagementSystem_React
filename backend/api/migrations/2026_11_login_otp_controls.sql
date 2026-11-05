-- ===== login_otp_controls =====
-- Admin → Other Settings → Sign-in Codes (login_otp_settings.php).
-- login_otp_enabled: '1' = a tenant signing in on a device it has not seen
--   gets an emailed 6-digit code (login.php / verify_device.php); '0' = no code
--   for anyone who follows the default. Starts on, as before this setting.
-- users.login_otp_mode: 'default' follows that switch, 'on' always asks this
--   account for a code on a new device, 'off' never does. Admins never get one.
-- Idempotent: an existing column or saved setting is kept.

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'login_otp_mode') = 0,
  'ALTER TABLE `users` ADD COLUMN `login_otp_mode` enum(''default'',''on'',''off'') NOT NULL DEFAULT ''default''', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('login_otp_enabled', '1');
