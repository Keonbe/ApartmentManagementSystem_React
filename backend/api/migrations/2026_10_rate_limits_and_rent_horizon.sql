-- Audit M13: counter for public forms that have no account to throttle on
-- (registration per IP). Rows older than a day are pruned by the endpoint.
CREATE TABLE IF NOT EXISTS `rate_limit_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `action` varchar(50) NOT NULL,
  `rate_key` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rate_limit_lookup` (`action`, `rate_key`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Audit L6: how far ahead (in months from today) a rent end may reach after an
-- extension. Admin-editable in Settings -> Rental, at most 12.
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('max_rent_ahead_months', '12');
