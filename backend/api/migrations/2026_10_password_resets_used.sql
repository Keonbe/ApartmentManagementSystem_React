-- Older installations created password_resets without one-time-use state.
-- The endpoint retains existing token rows and treats them as unused.
CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(150) NOT NULL,
  `token_hash` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `email` (`email`),
  KEY `token_hash` (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='password_resets' AND column_name='used')=0,
  'ALTER TABLE `password_resets` ADD COLUMN `used` tinyint(1) NOT NULL DEFAULT 0 AFTER `expires_at`',
  'ALTER TABLE `password_resets` ADD COLUMN IF NOT EXISTS `used` tinyint(1) NOT NULL DEFAULT 0 AFTER `expires_at`');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;