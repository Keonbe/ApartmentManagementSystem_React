-- ============================================================
-- Utility readings (checklist 8.7) — idempotent migration for existing databases.
--
-- The table used to be created at runtime by get_utility_readings.php, so it
-- was missing from SetupDB.sql and a fresh install failed on the first reading
-- save. It is now part of the schema, and this file brings an older database
-- in line without touching existing rows.
--
-- invoice_id records which invoice a reading was billed on, mirroring
-- service_requests.invoice_id.
--
-- Run: mysql -u root ams_db < backend/api/migrations/2026_09_utility_readings.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS `utility_readings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `room_name` varchar(50) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `billing_period` varchar(7) NOT NULL,
  `reading_date` date NOT NULL,
  `water_prev_reading` decimal(10,2) DEFAULT 0.00,
  `water_curr_reading` decimal(10,2) DEFAULT 0.00,
  `water_rate_per_unit` decimal(10,2) DEFAULT 40.00,
  `water_consumption` decimal(10,2) DEFAULT 0.00,
  `water_amount` decimal(10,2) DEFAULT 0.00,
  `water_other_fees` decimal(10,2) DEFAULT 0.00,
  `electric_prev_reading` decimal(10,2) DEFAULT 0.00,
  `electric_curr_reading` decimal(10,2) DEFAULT 0.00,
  `electric_rate_per_unit` decimal(10,2) DEFAULT 12.00,
  `electric_consumption` decimal(10,2) DEFAULT 0.00,
  `electric_amount` decimal(10,2) DEFAULT 0.00,
  `electric_other_fees` decimal(10,2) DEFAULT 0.00,
  `is_invoiced` tinyint(1) DEFAULT 0,
  `invoice_id` varchar(50) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `recorded_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_room_period` (`room_name`,`billing_period`),
  KEY `fk_ur_user` (`user_id`),
  CONSTRAINT `fk_ur_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `utility_readings` ADD COLUMN IF NOT EXISTS `invoice_id` varchar(50) DEFAULT NULL AFTER `is_invoiced`;
