-- Migration: create_visitor_logs.sql
-- Description: Create visitor_logs table and initialize visitor settings

CREATE TABLE IF NOT EXISTS `visitor_logs` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) DEFAULT NULL,
  `room_name` VARCHAR(50) NOT NULL,
  `visitor_name` VARCHAR(150) NOT NULL,
  `contact_number` VARCHAR(30) NOT NULL,
  `id_type` VARCHAR(50) DEFAULT NULL,
  `id_number` VARCHAR(50) DEFAULT NULL,
  `purpose` VARCHAR(255) NOT NULL,
  `vehicle_plate` VARCHAR(30) DEFAULT NULL,
  `status` ENUM('pending_approval', 'checked_in', 'checked_out', 'overstayed', 'denied') NOT NULL DEFAULT 'pending_approval',
  `check_in_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `check_out_at` DATETIME DEFAULT NULL,
  `checkout_notes` TEXT DEFAULT NULL,
  `admin_notes` TEXT DEFAULT NULL,
  `created_by` INT(11) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_visitor_user` (`user_id`),
  KEY `idx_visitor_room` (`room_name`),
  KEY `idx_visitor_status` (`status`),
  KEY `idx_visitor_checkin` (`check_in_at`),
  CONSTRAINT `fk_visitor_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Default settings
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('visitor_overstay_hours', '24');
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('service_visitor_management_active', 'true');
