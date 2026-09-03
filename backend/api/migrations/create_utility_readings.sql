CREATE TABLE IF NOT EXISTS `utility_readings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `room_name` VARCHAR(50) NOT NULL,
  `user_id` INT NULL,
  `billing_period` VARCHAR(7) NOT NULL, -- e.g. '2026-09'
  `reading_date` DATE NOT NULL,
  
  `water_prev_reading` DECIMAL(10,2) DEFAULT 0.00,
  `water_curr_reading` DECIMAL(10,2) DEFAULT 0.00,
  `water_rate_per_unit` DECIMAL(10,2) DEFAULT 40.00,
  `water_consumption` DECIMAL(10,2) DEFAULT 0.00,
  `water_amount` DECIMAL(10,2) DEFAULT 0.00,
  
  `electric_prev_reading` DECIMAL(10,2) DEFAULT 0.00,
  `electric_curr_reading` DECIMAL(10,2) DEFAULT 0.00,
  `electric_rate_per_unit` DECIMAL(10,2) DEFAULT 12.00,
  `electric_consumption` DECIMAL(10,2) DEFAULT 0.00,
  `electric_amount` DECIMAL(10,2) DEFAULT 0.00,
  
  `is_invoiced` TINYINT(1) DEFAULT 0,
  `notes` TEXT NULL,
  `recorded_by` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY `uk_room_period` (`room_name`, `billing_period`),
  CONSTRAINT `fk_utility_room` FOREIGN KEY (`room_name`) REFERENCES `rooms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_utility_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_utility_admin` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
