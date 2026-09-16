-- ============================================================
-- Features from the 2026-09-16 decisions (docs/todo.md) — idempotent
-- migration for existing databases. Mirrored into SetupDB.sql.
--
-- password_reset_requests  forgot_password.php throttle (3 per email per hour)
-- household_members        co-occupants of a lease; only the lease holder has a login
-- expenses                 building expenses entered by an admin, added to report expenses
-- unit_waitlist            basic first-come waitlist for a unit, fed from inquiries
-- system_settings          room_preview_mode, max_occupants_per_unit
--
-- Run: mysql -u root ams_db < backend/api/migrations/2026_09_decisions_features.sql
-- ============================================================

-- One row per reset request, kept only long enough to count the last hour.
-- Separate from password_resets, whose rows are replaced on every request.
CREATE TABLE IF NOT EXISTS `password_reset_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `ip_address` varchar(45) NOT NULL,
  `requested_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `email_time` (`email`,`requested_at`),
  KEY `ip_time` (`ip_address`,`requested_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- status: Pending (requested by the tenant) -> Active | Rejected; Active -> Removed.
-- A removal request is a notification on the Active row (metadata), not a status.
CREATE TABLE IF NOT EXISTS `household_members` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rent_application_id` int(11) NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `relationship` varchar(50) NOT NULL,
  `contact_no` varchar(30) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'Pending',
  `added_at` datetime DEFAULT NULL,
  `removed_at` datetime DEFAULT NULL,
  `removal_requested_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hm_app_status` (`rent_application_id`,`status`),
  CONSTRAINT `fk_hm_application` FOREIGN KEY (`rent_application_id`) REFERENCES `rent_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Maintenance costs are not copied here: the report still derives them from
-- maintenance_requests, so a repair is never counted twice.
CREATE TABLE IF NOT EXISTS `expenses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category` varchar(30) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `expense_date` date NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_expense_date` (`expense_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- status: Waiting -> Notified -> Removed (or Waiting -> Removed).
-- room_name references rooms.id but is not an FK, like inquiries/unit_reservations.
CREATE TABLE IF NOT EXISTS `unit_waitlist` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `inquiry_id` int(11) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `room_name` varchar(50) NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `contact_no` varchar(30) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'Waiting',
  `notified_at` datetime DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_wl_room_status` (`room_name`,`status`,`created_at`),
  KEY `fk_wl_inquiry` (`inquiry_id`),
  KEY `fk_wl_user` (`user_id`),
  CONSTRAINT `fk_wl_inquiry` FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wl_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('room_preview_mode', 'images'),
('max_occupants_per_unit', '8');
