CREATE DATABASE IF NOT EXISTS ams_db 
  DEFAULT CHARACTER SET utf8mb4 
  DEFAULT COLLATE utf8mb4_general_ci;

USE ams_db;

-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: ams_db
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activity_logs`
--

DROP TABLE IF EXISTS `activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `activity_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category` varchar(50) NOT NULL,
  `action` varchar(255) NOT NULL,
  `details` text DEFAULT NULL,
  `performed_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `performed_by` (`performed_by`),
  CONSTRAINT `activity_logs_ibfk_1` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `announcements`
--

DROP TABLE IF EXISTS `announcements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `announcements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tag` varchar(50) NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `send_to` varchar(50) NOT NULL DEFAULT 'All Tenants',
  `channels` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`channels`)),
  `status` varchar(50) NOT NULL DEFAULT 'sent',
  `scheduled_date` datetime DEFAULT NULL,
  `recipient_count` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cctv_requests`
--

DROP TABLE IF EXISTS `cctv_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cctv_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `incident_date` date NOT NULL,
  `incident_time` varchar(50) NOT NULL,
  `location_details` varchar(50) NOT NULL,
  `reason_request` text NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'Pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_cctv_user` (`user_id`),
  CONSTRAINT `fk_cctv_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `invoices`
--

DROP TABLE IF EXISTS `invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `invoices` (
  `id` varchar(50) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `rent_application_id` int(11) DEFAULT NULL,
  `base_rent` decimal(10,2) NOT NULL DEFAULT 0.00,
  `water` decimal(10,2) NOT NULL DEFAULT 0.00,
  `electricity` decimal(10,2) NOT NULL DEFAULT 0.00,
  `parking` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `security_deposit` decimal(10,2) NOT NULL DEFAULT 0.00,
  `payment_method` varchar(50) DEFAULT NULL,
  `payment_reference` varchar(100) DEFAULT NULL,
  `proof_of_payment_path` varchar(255) DEFAULT NULL,
  `sender_name` varchar(150) DEFAULT NULL,
  `billing_period` varchar(50) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `paid_at` timestamp NULL DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `scheduled_date` date DEFAULT NULL,
  `scheduled_time_slot` varchar(20) DEFAULT NULL,
  `checkout_session_id` varchar(100) DEFAULT NULL,
  `payment_gateway` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_invoice_user` (`user_id`),
  KEY `fk_invoice_rent_app` (`rent_application_id`),
  CONSTRAINT `fk_invoice_rent_app` FOREIGN KEY (`rent_application_id`) REFERENCES `rent_applications` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_invoice_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lease_contracts`
--

DROP TABLE IF EXISTS `lease_contracts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `lease_contracts` (
  `id` varchar(50) NOT NULL,
  `rent_application_id` int(11) DEFAULT NULL,
  `deposit_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `lease_start` date DEFAULT NULL,
  `lease_end` date DEFAULT NULL,
  `status` enum('draft','active','expired','terminated','eviction-pending') NOT NULL DEFAULT 'draft',
  `signed_lease_path` varchar(255) DEFAULT NULL,
  `notarized_lease_path` varchar(255) DEFAULT NULL,
  `eviction_status` varchar(50) DEFAULT NULL,
  `deposit_status` varchar(50) DEFAULT 'Held',
  `damage_deduction` decimal(10,2) DEFAULT 0.00,
  `utility_deduction` decimal(10,2) DEFAULT 0.00,
  `refund_amount` decimal(10,2) DEFAULT 0.00,
  `refund_date` date DEFAULT NULL,
  `generated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_contract_rent_app` (`rent_application_id`),
  CONSTRAINT `fk_contract_rent_app` FOREIGN KEY (`rent_application_id`) REFERENCES `rent_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `maintenance_requests`
--

DROP TABLE IF EXISTS `maintenance_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `maintenance_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `issue_category` varchar(50) NOT NULL,
  `urgency` varchar(50) NOT NULL,
  `preferred_date` date NOT NULL,
  `preferred_time` varchar(50) NOT NULL,
  `description` text NOT NULL,
  `permission_to_enter` tinyint(1) NOT NULL DEFAULT 0,
  `attachment_path` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `status` varchar(20) NOT NULL DEFAULT 'Pending',
  `assigned_to` varchar(100) DEFAULT NULL,
  `estimated_cost` decimal(10,2) DEFAULT NULL,
  `work_notes` text DEFAULT NULL,
  `tenant_responsible` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fk_maintenance_user` (`user_id`),
  CONSTRAINT `fk_maintenance_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `type` varchar(50) NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `parking_reservations`
--

DROP TABLE IF EXISTS `parking_reservations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `parking_reservations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `vehicle_type` varchar(50) NOT NULL,
  `vehicle_model` varchar(100) NOT NULL,
  `plate_number` varchar(20) NOT NULL,
  `status` varchar(50) DEFAULT 'Pending',
  `transmission` varchar(50) NOT NULL,
  `duration_months` int(11) NOT NULL,
  `total_cost` decimal(10,2) NOT NULL,
  `document_path` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_parking_user` (`user_id`),
  CONSTRAINT `fk_parking_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rent_applications`
--

DROP TABLE IF EXISTS `rent_applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rent_applications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `first_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) NOT NULL,
  `suffix` varchar(20) DEFAULT NULL,
  `contact_no` varchar(30) NOT NULL,
  `email` varchar(150) NOT NULL,
  `gender` varchar(20) NOT NULL,
  `occupants` int(11) NOT NULL,
  `months_of_rent` int(11) NOT NULL,
  `room_name` varchar(50) NOT NULL,
  `monthly_rent` decimal(10,2) NOT NULL,
  `valid_id_front_path` varchar(255) NOT NULL,
  `valid_id_back_path` varchar(255) NOT NULL,
  `nbi_clearance_path` varchar(255) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'Pending Review',
  `rejection_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `archive_date` date DEFAULT NULL,
  `archive_reason` varchar(255) DEFAULT NULL,
  `archive_notes` text DEFAULT NULL,
  `requested_move_out_date` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_rent_room` (`room_name`),
  KEY `fk_rent_user` (`user_id`),
  CONSTRAINT `fk_rent_room` FOREIGN KEY (`room_name`) REFERENCES `rooms` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_rent_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rooms`
--

DROP TABLE IF EXISTS `rooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rooms` (
  `id` varchar(50) NOT NULL,
  `type` varchar(50) NOT NULL,
  `floor` varchar(50) NOT NULL,
  `monthly_rent` decimal(10,2) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'vacant',
  `tenant_name` varchar(100) DEFAULT NULL,
  `lease_start` date DEFAULT NULL,
  `lease_end` date DEFAULT NULL,
  `last_tenant` varchar(100) DEFAULT NULL,
  `maintenance_flag` tinyint(1) NOT NULL DEFAULT 0,
  `occupants` int(11) NOT NULL DEFAULT 0,
  `room_condition` varchar(100) DEFAULT 'Good',
  `furnishing_status` varchar(50) DEFAULT 'Unfurnished',
  `last_inspection_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `system_settings`
--

DROP TABLE IF EXISTS `system_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `system_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `setting_key` (`setting_key`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `first_name` varchar(30) NOT NULL,
  `middle_name` varchar(50) DEFAULT NULL,
  `last_name` varchar(30) NOT NULL,
  `suffix` varchar(20) DEFAULT NULL,
  `contact_no` varchar(30) DEFAULT NULL,
  `gender` varchar(20) DEFAULT NULL,
  `email_address` varchar(30) NOT NULL,
  `password` varchar(200) NOT NULL,
  `role` varchar(20) DEFAULT 'user',
  `avatar_url` varchar(255) DEFAULT NULL,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email_address` (`email_address`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-15 23:05:47

-- --------------------------------------------------------
-- SEED DATA
-- --------------------------------------------------------

-- 1. Default Admin User
INSERT IGNORE INTO `users` (`first_name`, `last_name`, `email_address`, `password`, `role`) 
VALUES ('Admin', 'User', 'admin@gmail.com', '$2y$10$kyF64U0j2xVl0PN1wiqJ5eaDR14ZhjAxjVTnRC0yLleTl9Rdi4Nli', 'admin'); -- admin123

-- 2. Initial Units
INSERT IGNORE INTO `rooms` (`id`, `type`, `floor`, `monthly_rent`, `status`, `tenant_name`, `lease_start`, `lease_end`, `last_tenant`, `maintenance_flag`, `occupants`) VALUES
('A', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('B', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('C', 'Studio',    '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('D', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, 'S.A', 0, 0),
('E', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('F', 'Studio',    '2F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0), 
('G', 'Studio', '2F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0), 
('H', 'Studio', '2F', 4000, 'vacant', NULL, NULL, NULL, 'R.G', 0, 0),
('I', 'Studio',    '2F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('J', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('K', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('L', 'Studio',    '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('M', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('N', 'Studio',    '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0);

--
-- Table structure for table `visitor_logs`
--

DROP TABLE IF EXISTS `visitor_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `visitor_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `room_name` varchar(50) NOT NULL,
  `visitor_name` varchar(150) NOT NULL,
  `contact_number` varchar(30) NOT NULL,
  `id_type` varchar(50) DEFAULT NULL,
  `id_number` varchar(50) DEFAULT NULL,
  `purpose` varchar(255) NOT NULL,
  `vehicle_plate` varchar(30) DEFAULT NULL,
  `status` enum('pending_approval','checked_in','checked_out','overstayed','denied') NOT NULL DEFAULT 'pending_approval',
  `check_in_at` datetime NOT NULL DEFAULT current_timestamp(),
  `check_out_at` datetime DEFAULT NULL,
  `checkout_notes` text DEFAULT NULL,
  `admin_notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_visitor_user` (`user_id`),
  KEY `idx_visitor_room` (`room_name`),
  KEY `idx_visitor_status` (`status`),
  KEY `idx_visitor_checkin` (`check_in_at`),
  CONSTRAINT `fk_visitor_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inquiries`
--
-- Module 1.8. status: New -> Contacted -> Scheduled -> Reserved -> Converted / Closed
-- room_name references rooms.id but is intentionally not an FK, so an inquiry
-- can be filed without naming a specific unit.
--

CREATE TABLE IF NOT EXISTS `inquiries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `full_name` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `contact_no` varchar(30) NOT NULL,
  `room_name` varchar(50) DEFAULT NULL,
  `occupants` int(11) DEFAULT NULL,
  `preferred_move_in` date DEFAULT NULL,
  `message` text DEFAULT NULL,
  `source` varchar(20) NOT NULL DEFAULT 'web',
  `status` varchar(20) NOT NULL DEFAULT 'New',
  `viewing_date` datetime DEFAULT NULL,
  `admin_notes` text DEFAULT NULL,
  `closed_reason` varchar(255) DEFAULT NULL,
  `handled_by` int(11) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_inquiry_status` (`status`),
  KEY `idx_inquiry_room` (`room_name`),
  KEY `fk_inquiry_user` (`user_id`),
  CONSTRAINT `fk_inquiry_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Table structure for table `unit_reservations`
--
-- status: Active -> Converted / Expired / Cancelled
-- "One Active hold per room" is enforced in create_reservation.php inside a
-- transaction with SELECT ... FOR UPDATE (MySQL has no partial unique index).
--

CREATE TABLE IF NOT EXISTS `unit_reservations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `inquiry_id` int(11) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `room_name` varchar(50) NOT NULL,
  `reserved_for_name` varchar(150) NOT NULL,
  `contact_no` varchar(30) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `hold_expires_at` date NOT NULL,
  `reservation_fee` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` varchar(20) NOT NULL DEFAULT 'Active',
  `notes` text DEFAULT NULL,
  `released_at` datetime DEFAULT NULL,
  `released_reason` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_res_status` (`status`),
  KEY `idx_res_room` (`room_name`),
  KEY `fk_res_inquiry` (`inquiry_id`),
  KEY `fk_res_user` (`user_id`),
  CONSTRAINT `fk_res_inquiry` FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_res_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Notifications columns relied on by the API but absent from the dump above.
-- Every notification INSERT writes `status`; get_notifications.php filters on
-- it. `metadata_value` is used by extend_lease / update_occupants /
-- process_tenant_request.
--

ALTER TABLE `notifications` ADD COLUMN IF NOT EXISTS `status` varchar(20) DEFAULT 'Pending';
ALTER TABLE `notifications` ADD COLUMN IF NOT EXISTS `metadata_value` varchar(255) DEFAULT NULL;

--
-- Table structure for table `service_catalog`
--
-- Module 5.5. Admin-managed priced add-on services offered to tenants.
-- category: cleaning | laundry | other -- must match the `service_<category>_active`
--   system_settings keys, which gate the whole category in the tenant portal.
-- pricing_unit: session | kg | hour | item -- drives whether the booking form asks
--   for a quantity (kg/hour/item) or fixes it at 1 (session).
-- is_active = 0 hides an item from the tenant catalog without deleting the
--   historical service_requests rows that snapshot it.
--

CREATE TABLE IF NOT EXISTS `service_catalog` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category` varchar(20) NOT NULL DEFAULT 'other',
  `name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `pricing_unit` varchar(20) NOT NULL DEFAULT 'session',
  `min_quantity` decimal(10,2) NOT NULL DEFAULT 1.00,
  `max_quantity` decimal(10,2) DEFAULT NULL,
  `lead_time_days` int(11) NOT NULL DEFAULT 1,
  `icon` varchar(50) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_service_cat_name` (`category`,`name`),
  KEY `idx_service_active` (`is_active`),
  KEY `idx_service_category` (`category`),
  KEY `fk_service_creator` (`created_by`),
  CONSTRAINT `fk_service_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Table structure for table `service_requests`
--
-- Module 5.5. status: Pending -> Approved -> In Progress -> Completed,
--   plus Rejected / Cancelled. One-off bookings only (no recurring plans).
-- service_name / category / unit_price / pricing_unit are SNAPSHOTTED at booking
--   time so re-pricing the catalog never rewrites history; service_id is
--   ON DELETE SET NULL for the same reason.
-- total_cost = unit_price * quantity, computed in PHP at booking time.
-- is_invoiced / invoice_id / billing_period mirror utility_readings.is_invoiced:
--   post_service_charge() in config.php claims the row atomically with
--   UPDATE service_requests SET is_invoiced = 1 WHERE id = ? AND is_invoiced = 0
--   BEFORE touching invoices, so a double-click cannot double-bill.
-- room_name references rooms.id but is intentionally not an FK, matching the
--   convention used by inquiries / unit_reservations.
--

CREATE TABLE IF NOT EXISTS `service_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `service_id` int(11) DEFAULT NULL,
  `room_name` varchar(50) DEFAULT NULL,
  `service_name` varchar(150) NOT NULL,
  `category` varchar(20) NOT NULL DEFAULT 'other',
  `unit_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `pricing_unit` varchar(20) NOT NULL DEFAULT 'session',
  `quantity` decimal(10,2) NOT NULL DEFAULT 1.00,
  `total_cost` decimal(10,2) NOT NULL DEFAULT 0.00,
  `preferred_date` date NOT NULL,
  `preferred_time_slot` varchar(50) NOT NULL,
  `notes` text DEFAULT NULL,
  `attachment_path` varchar(255) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'Pending',
  `admin_notes` text DEFAULT NULL,
  `assigned_to` varchar(100) DEFAULT NULL,
  `is_invoiced` tinyint(1) NOT NULL DEFAULT 0,
  `invoice_id` varchar(50) DEFAULT NULL,
  `billing_period` varchar(50) DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `cancelled_reason` varchar(255) DEFAULT NULL,
  `handled_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_svcreq_status` (`status`),
  KEY `idx_svcreq_date` (`preferred_date`),
  KEY `idx_svcreq_invoiced` (`is_invoiced`),
  KEY `idx_svcreq_invoice` (`invoice_id`),
  KEY `fk_svcreq_user` (`user_id`),
  KEY `fk_svcreq_service` (`service_id`),
  CONSTRAINT `fk_svcreq_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_svcreq_service` FOREIGN KEY (`service_id`) REFERENCES `service_catalog` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Service charges roll into the tenant's monthly invoice the same way `parking`
-- does, so they inherit due-date reminders and overdue flags from
-- check_due_date_reminders.php for free. Unlike `water` / `electricity` (which
-- sync_utility_to_invoice.php overwrites), `services` ACCUMULATES: several
-- completed requests in the same billing period add into the one column.
--

ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `services` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `parking`;

-- Seed catalog entries. Admin can re-price, deactivate or add more from /admin-services.
INSERT IGNORE INTO `service_catalog`
  (`category`, `name`, `description`, `price`, `pricing_unit`, `min_quantity`, `max_quantity`, `lead_time_days`, `icon`, `is_active`, `sort_order`) VALUES
('cleaning', 'Standard Unit Cleaning', 'General sweeping, mopping, dusting and bathroom sanitation for a studio or one-bedroom unit.', 500.00, 'session', 1, 1, 1, 'faBroom', 1, 10),
('cleaning', 'Deep Cleaning', 'Intensive scrubbing of kitchen, bathroom grout, appliances and hard-to-reach fixtures.', 1200.00, 'session', 1, 1, 2, 'faBroom', 1, 20),
('laundry', 'Wash & Fold', 'Machine wash, dry and fold of regular garments, billed per kilogram.', 60.00, 'kg', 1, 20, 1, 'faTshirt', 1, 30),
('laundry', 'Dry Cleaning', 'Professional dry cleaning for suits, gowns and delicate fabrics, billed per item.', 250.00, 'item', 1, 15, 2, 'faTshirt', 1, 40),
('other', 'Pest Control Treatment', 'Scheduled unit-level pest control and follow-up inspection.', 900.00, 'session', 1, 1, 3, 'faConciergeBell', 1, 50);

--
-- Table structure for table `password_resets`
--
-- Used by forgot_password.php / reset_password.php. This table previously had
-- its own dedicated migration file (backend/api/migrations/create_password_resets_table.php)
-- which was removed in a later cleanup without being folded in here — a fresh
-- database built only from this file was missing it entirely, causing
-- forgot_password.php's INSERT to hard-fail. Restored here as the single
-- source of truth (docs/documentation/external_services.md § "Verified against
-- the repo (Sept 2026)").
--

CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3. Default System Settings
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('system_name', 'Apartment Management System'),
('contact_email', 'admin@ams.com'),
('contact_phone', '+63 912 345 6789'),
('currency_symbol', '₱'),
('maintenance_auto_assign', 'true'),
('minLeaseDuration', '3'),
('overdueThresholdDays', '15'),
('autoFlagEviction', 'true'),
('maintenanceMonthlyBudget', '50000'),
('tenantResponsibilityClause', '"Per the Terms & Conditions of this lease agreement, the Tenant shall be responsible for any damage or maintenance issues caused by negligence, misuse, or unauthorized modifications to the leased unit. Costs for such repairs will be billed directly to the Tenant and are excluded from the building\'s maintenance budget allocation."'),
('payment_mode', 'manual'),
('payment_sandbox_enabled', '0'),
('payment_ch_gcash_sandbox', '1'),
('payment_ch_bank_sandbox', '1'),
('payment_ch_maya', '1'),
('payment_ch_gcash_manual', '1'),
('payment_ch_bank_manual', '1'),
('payment_ch_in_person', '1'),
('visitor_overstay_hours', '24'),
('service_visitor_management_active', 'true'),
('service_cleaning_active', 'true'),
('service_laundry_active', 'true'),
('service_other_active', 'true'),
('reservation_hold_days', '7'),
('max_parking_slots', '3'),
('parking_allowed_vehicle_types', '["motorcycle"]'),
('landlord_name', 'Elizabeth Angcanan'),
('landlord_address', 'Tamak, Maguyam, Silang, Cavite'),
('landlord_contact', '*********** (Smart)'),
('property_address', 'Sitio Engkanto, Brgy. Maguyam, Silang, Cavite');
