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
  KEY `idx_created` (`created_at`),
  KEY `idx_category` (`category`),
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
  `attachment_path` varchar(255) DEFAULT NULL,
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
  `bank_name` varchar(100) DEFAULT NULL,
  `proof_of_payment_path` varchar(255) DEFAULT NULL,
  `proof_rejection_reason` varchar(255) DEFAULT NULL,
  `sender_name` varchar(150) DEFAULT NULL,
  `billing_period` varchar(50) NOT NULL,
  -- Rent periods and advance payments (2026_09_rent_periods_advance.sql): the
  -- tenancy month a rent invoice bills; the same date minus cancelled rows,
  -- for the unique key; and the ADV-… group of one advance payment.
  `rent_period_start` date DEFAULT NULL,
  `rent_period_key` date GENERATED ALWAYS AS (IF(`status` = 'cancelled', NULL, `rent_period_start`)) STORED,
  `payment_group` varchar(40) DEFAULT NULL,
  -- Months an advance-rent invoice covers (2026_09_advance_credits.sql).
  `advance_months` tinyint(4) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `cancel_reason` varchar(50) DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `scheduled_date` date DEFAULT NULL,
  `scheduled_time_slot` varchar(20) DEFAULT NULL,
  `checkout_session_id` varchar(100) DEFAULT NULL,
  -- PayMongo payment intent of that session; payment.failed webhooks are
  -- matched by it (2026_10_checkout_payment_intent.sql).
  `checkout_payment_intent_id` varchar(100) DEFAULT NULL,
  `processing_since` datetime DEFAULT NULL,
  `payment_gateway` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_invoice_user` (`user_id`),
  KEY `fk_invoice_rent_app` (`rent_application_id`),
  UNIQUE KEY `uq_invoice_rent_period` (`user_id`, `rent_period_key`),
  KEY `idx_invoice_payment_group` (`payment_group`),
  KEY `idx_invoices_checkout_intent` (`checkout_payment_intent_id`),
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
  -- contract_template_versions.id the terms were issued under (NULL = latest).
  `template_version_id` int(11) DEFAULT NULL,
  `eviction_status` varchar(50) DEFAULT NULL,
  -- Set only by the 'terminate' action (update_contract_status.php), which
  -- also ends the tenancy via vacate_tenant_room() — distinct from the
  -- move-out settlement fields below, which apply to a voluntary
  -- end-of-lease move-out instead.
  `termination_reason` text DEFAULT NULL,
  `terminated_at` datetime DEFAULT NULL,
  -- Claim column for the once-per-contract lease-end reminder
  -- (run_notification_sweep() -> send_lease_end_reminders()).
  `renewal_reminder_sent_at` datetime DEFAULT NULL,
  `deposit_status` varchar(50) DEFAULT 'Pending',
  `damage_deduction` decimal(10,2) DEFAULT 0.00,
  `utility_deduction` decimal(10,2) DEFAULT 0.00,
  `refund_amount` decimal(10,2) DEFAULT 0.00,
  `refund_date` date DEFAULT NULL,
  `generated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  -- E-signature images shown on the contract (upload_lease_document.php):
  -- the tenant's on their own draft contract, the owner's by an admin.
  `tenant_signature_path` text DEFAULT NULL,
  `owner_signature_path` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_contract_rent_app` (`rent_application_id`),
  -- One contract per application — create_contract.php used to insert a
  -- second row for an already-contracted application with no check, and
  -- every consumer query joins with LIMIT 1 and picks one arbitrarily.
  UNIQUE KEY `uniq_contract_app` (`rent_application_id`),
  CONSTRAINT `fk_contract_rent_app` FOREIGN KEY (`rent_application_id`) REFERENCES `rent_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lease_renewals`
-- Audit trail of lease-extension approvals. lease_contracts itself is
-- extended in place (single row per rent_application_id, matching every
-- consumer query's assumption); this table is the renewal history for that
-- row rather than a new contract version.
--

CREATE TABLE IF NOT EXISTS `lease_renewals` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `contract_id` varchar(50) NOT NULL,
  `added_months` int(11) NOT NULL,
  `previous_lease_end` date DEFAULT NULL,
  `new_lease_end` date DEFAULT NULL,
  `rent_at_renewal` decimal(10,2) DEFAULT NULL,
  `approved_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_renewal_contract` (`contract_id`),
  CONSTRAINT `fk_renewal_contract` FOREIGN KEY (`contract_id`) REFERENCES `lease_contracts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
  `audience` varchar(20) NOT NULL DEFAULT 'tenant',
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
  -- Pending -> Assigned | Rejected | Cancelled; Assigned -> Released (PARKING_TRANSITIONS in config.php)
  `slot_number` int(11) DEFAULT NULL,
  `assigned_at` datetime DEFAULT NULL,
  `released_at` datetime DEFAULT NULL,
  `release_reason` varchar(255) DEFAULT NULL,
  `rejection_reason` varchar(255) DEFAULT NULL,
  `transmission` varchar(50) NOT NULL,
  `duration_months` int(11) NOT NULL,
  `total_cost` decimal(10,2) NOT NULL,
  `document_path` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  -- The database refuses two active reservations on one slot and two open
  -- reservations for one tenant, so concurrent requests cannot overbook.
  `active_slot` int(11) AS (IF(`status` = 'Assigned', `slot_number`, NULL)) PERSISTENT,
  `open_user` int(11) AS (IF(`status` IN ('Pending', 'Assigned'), `user_id`, NULL)) PERSISTENT,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_active_slot` (`active_slot`),
  UNIQUE KEY `uniq_open_user` (`open_user`),
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
  `previous_address` varchar(255) DEFAULT NULL,
  `occupants` int(11) NOT NULL,
  `months_of_rent` int(11) NOT NULL,
  `preferred_move_in_date` date DEFAULT NULL,
  `move_in_date` date DEFAULT NULL,
  `move_in_notified_at` datetime DEFAULT NULL,
  `room_name` varchar(50) NOT NULL,
  `monthly_rent` decimal(10,2) NOT NULL,
  -- Legacy, no longer written: uploads live in application_documents
  -- (2026_10_manager_interview_alignment.sql).
  `valid_id_front_path` varchar(255) DEFAULT NULL,
  `valid_id_back_path` varchar(255) DEFAULT NULL,
  `nbi_clearance_path` varchar(255) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'Pending Review',
  `rejection_reason` varchar(255) DEFAULT NULL,
  `rejection_attachment_path` varchar(255) DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
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
  `rent_is_custom` tinyint(1) NOT NULL DEFAULT 0,
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
  `gallery` JSON DEFAULT NULL,
  `archived_at` datetime DEFAULT NULL,
  `archived_by` int(11) DEFAULT NULL,
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
  `sms_opt_out` tinyint(1) NOT NULL DEFAULT 0,
  `email_opt_out` tinyint(1) NOT NULL DEFAULT 0,
  `sms_consent_at` datetime DEFAULT NULL,
  `gender` varchar(20) DEFAULT NULL,
  `email_address` varchar(190) NOT NULL,
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
-- Layout: 1F = A-D (4 rooms, PHP4,000), 2F = E-H (4 rooms, PHP4,000), 3F = I-N (6 rooms, PHP3,500).
-- 3F is deliberately kept as exactly I/J/K/L/M/N because RentApplication.jsx
-- hardcodes that letter set to derive the PHP3,500 rate without querying
-- rooms.floor (used only as a fallback before the real rooms.monthly_rent loads).
INSERT IGNORE INTO `rooms` (`id`, `type`, `floor`, `monthly_rent`, `status`, `tenant_name`, `lease_start`, `lease_end`, `last_tenant`, `maintenance_flag`, `occupants`) VALUES
('A', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('B', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('C', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('D', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, 'S.A', 0, 0),
('E', 'Studio', '2F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('F', 'Studio', '2F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('G', 'Studio', '2F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('H', 'Studio', '2F', 4000, 'vacant', NULL, NULL, NULL, 'R.G', 0, 0),
('I', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('J', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('K', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('L', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('M', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('N', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0);

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
  `id_photo_path` varchar(255) DEFAULT NULL,
  `purpose` varchar(255) NOT NULL,
  `vehicle_plate` varchar(30) DEFAULT NULL,
  -- 'cancelled' lets a tenant withdraw their own pending pre-registration,
  -- and lets a moved-out/archived tenant's pending rows be closed out
  -- automatically (cancel_user_visitor_registrations()).
  `status` enum('pending_approval','checked_in','checked_out','overstayed','denied','cancelled') NOT NULL DEFAULT 'pending_approval',
  -- Expected arrival for a tenant's pre-registration; check_in_at is only
  -- ever stamped once the visitor is actually approved/admitted.
  `expected_at` datetime DEFAULT NULL,
  -- When the visitor is expected to leave (required on new rows by
  -- check_in_visitor.php; informational — overstay uses visitor_overstay_hours).
  `expected_check_out_at` datetime DEFAULT NULL,
  `check_in_at` datetime NOT NULL DEFAULT current_timestamp(),
  `check_out_at` datetime DEFAULT NULL,
  `checkout_notes` text DEFAULT NULL,
  -- Claim column so alert_overstayed_visitors() (called from
  -- get_notifications.php on every poll) alerts admins/host exactly once
  -- per visit instead of re-notifying on every page load.
  `overstay_alerted_at` datetime DEFAULT NULL,
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
  `thread_type` enum('registered','guest') NOT NULL DEFAULT 'registered',
  `guest_token` varchar(64) DEFAULT NULL,
  `guest_name` varchar(150) DEFAULT NULL,
  `guest_email` varchar(150) DEFAULT NULL,
  `guest_phone` varchar(30) DEFAULT NULL,
  `unit_of_interest` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inquiries_guest_token` (`guest_token`),
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
-- 2026-09-16 decisions (2026_09_decisions_features.sql)
--

-- status: Pending (requested by the tenant) -> Active | Rejected; Active -> Removed.
-- A removal request is a notification on the Active row (metadata), not a status.
CREATE TABLE IF NOT EXISTS `household_members` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rent_application_id` int(11) NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `relationship` varchar(50) NOT NULL,
  `contact_no` varchar(30) DEFAULT NULL,
  `age` tinyint(3) unsigned DEFAULT NULL,
  `age_category` varchar(30) DEFAULT NULL,
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

--
-- Notifications columns relied on by the API but absent from the dump above.
-- Every notification INSERT writes `status`; get_notifications.php filters on
-- it. `metadata_value` is used by extend_lease / update_occupants /
-- process_tenant_request.
--

ALTER TABLE `notifications` ADD COLUMN IF NOT EXISTS `status` varchar(20) DEFAULT 'Pending';
ALTER TABLE `notifications` ADD COLUMN IF NOT EXISTS `metadata_value` varchar(255) DEFAULT NULL;
-- 2026_09_application_rejection_attachment.sql / 2026_09_notification_archive.sql
ALTER TABLE `notifications` ADD COLUMN IF NOT EXISTS `attachment_path` varchar(255) DEFAULT NULL AFTER `metadata_value`;
ALTER TABLE `notifications` ADD COLUMN IF NOT EXISTS `is_archived` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `notifications` ADD INDEX IF NOT EXISTS `idx_type_status` (`type`, `status`);
ALTER TABLE `notifications` ADD INDEX IF NOT EXISTS `idx_user_read` (`user_id`, `is_read`);

-- Per-category notification opt-outs (checklist 6.8). No row = enabled on every channel.
-- Categories and the types they cover: NOTIFICATION_PREF_CATEGORIES in config.php.
CREATE TABLE IF NOT EXISTS `notification_preferences` (
  `user_id` int(11) NOT NULL,
  `category` varchar(40) NOT NULL,
  `in_app_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `sms_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `email_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`, `category`),
  CONSTRAINT `fk_notif_pref_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Outbound SMS/email delivery log (checklist 6.6 / 6.7). log_notification_delivery()
-- in config.php is the only writer and truncates message_body to 500 chars;
-- prune_notification_log() drops rows past notification_log_retention_days, so
-- tenant contact details are not retained indefinitely (RA 10173).
CREATE TABLE IF NOT EXISTS `notification_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `channel` enum('in-app','email','sms') NOT NULL,
  `event_type` varchar(50) NOT NULL,
  `recipient` varchar(255) DEFAULT NULL COMMENT 'email address or phone number',
  `subject` varchar(255) DEFAULT NULL,
  `message_body` text DEFAULT NULL COMMENT 'truncated to 500 chars by the writer',
  `status` enum('sent','failed','skipped') NOT NULL DEFAULT 'sent',
  `error_message` text DEFAULT NULL,
  `provider_message_id` varchar(64) DEFAULT NULL COMMENT 'Semaphore message_id',
  `provider_status` varchar(20) DEFAULT NULL COMMENT 'status Semaphore returned at send time',
  `sent_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_log_channel_status` (`channel`, `status`),
  KEY `idx_log_user` (`user_id`),
  KEY `idx_log_sent_at` (`sent_at`),
  KEY `idx_log_provider_msg` (`provider_message_id`),
  CONSTRAINT `fk_notif_log_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Async send queue. A web request never blocks on an SMS/SMTP provider: the
-- dispatcher enqueues here and the queue processor is the only sender.
CREATE TABLE IF NOT EXISTS `notification_queue` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `channel` enum('email','sms') NOT NULL,
  `event_type` varchar(50) NOT NULL,
  `payload` longtext NOT NULL COMMENT '{"to","subject","body","template","vars"}',
  `status` enum('pending','processing','sent','failed') NOT NULL DEFAULT 'pending',
  `claim_token` char(16) DEFAULT NULL COMMENT 'set by the claiming drain',
  `attempts` tinyint(4) NOT NULL DEFAULT 0,
  `max_attempts` tinyint(4) NOT NULL DEFAULT 3,
  `next_attempt_at` datetime DEFAULT current_timestamp(),
  `error_message` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `processed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_queue_pending` (`status`, `next_attempt_at`),
  CONSTRAINT `fk_notif_queue_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- One row per parking reservation per billed month (checklist 10.3). Inserting the
-- row is the claim, so the same month can never be billed twice.
CREATE TABLE IF NOT EXISTS `parking_charges` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `reservation_id` int(11) NOT NULL,
  `billing_period` char(7) NOT NULL,
  `invoice_id` varchar(50) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_reservation_period` (`reservation_id`, `billing_period`),
  CONSTRAINT `fk_parking_charge_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `parking_reservations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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

-- Lets restore_tenant.php put an archived application back to the status it
-- actually had before archiving (Approved / active / pending-move-out /
-- moved-out), instead of hardcoding 'active' regardless of history.
ALTER TABLE `rent_applications` ADD COLUMN IF NOT EXISTS `pre_archive_status` varchar(20) DEFAULT NULL;

-- Snapshotted at ticket creation so get_rooms.php can join maintenance
-- history directly on the unit instead of via "any application this user
-- has ever filed" (which mis-attributed tickets after a tenant moved rooms
-- and duplicated rows for a user with more than one application).
ALTER TABLE `maintenance_requests` ADD COLUMN IF NOT EXISTS `room_name` varchar(50) DEFAULT NULL;

-- Reminder dispatch tracking, so check_due_date_reminders.php sends at most
-- one reminder per invoice per day. These were previously created by an
-- ALTER TABLE executed inside that endpoint on every single request.
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `last_reminder_date` date DEFAULT NULL;
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `reminder_count` int(11) NOT NULL DEFAULT 0;

-- Late fee charged on an overdue invoice. create_invoice.php previously added
-- the admin-entered late fee straight into total_amount with nowhere to store
-- it, so get_invoices.php reported it as a hardcoded 0.00 and the tenant's
-- bill breakdown never summed to the amount they were actually charged.
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `late_fee` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `services`;

-- Set when an admin waives the late fee (adjust_invoice.php), so
-- promote_overdue_invoices() does not charge it again
-- (2026_10_chat_and_signature_columns.sql).
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `late_fee_waived` tinyint(1) NOT NULL DEFAULT 0;

-- Records when the applicant checked the Terms & Conditions box at submission.
-- update_tenant_status.php requires this to be set (along with every active,
-- required application document) before an application can be approved
-- (checklist item 1.7).
ALTER TABLE `rent_applications` ADD COLUMN IF NOT EXISTS `terms_agreed_at` timestamp NULL DEFAULT NULL;
-- Set when an admin assigns a tenant in person (update_room.php) and attests the
-- documents were checked there (2026_10_manager_interview_alignment.sql).
ALTER TABLE `rent_applications` ADD COLUMN IF NOT EXISTS `documents_verified_at` datetime DEFAULT NULL AFTER `terms_agreed_at`;

-- Maintenance timeline (checklist 4.6), title, actual cost and rejection reason.
-- resolved_at was read and written by the maintenance endpoints but never created.
ALTER TABLE `maintenance_requests` ADD COLUMN IF NOT EXISTS `title` varchar(150) DEFAULT NULL;
ALTER TABLE `maintenance_requests` ADD COLUMN IF NOT EXISTS `acknowledged_at` datetime DEFAULT NULL;
ALTER TABLE `maintenance_requests` ADD COLUMN IF NOT EXISTS `started_at` datetime DEFAULT NULL;
ALTER TABLE `maintenance_requests` ADD COLUMN IF NOT EXISTS `resolved_at` datetime DEFAULT NULL;
ALTER TABLE `maintenance_requests` ADD COLUMN IF NOT EXISTS `actual_cost` decimal(10,2) DEFAULT NULL;
ALTER TABLE `maintenance_requests` ADD COLUMN IF NOT EXISTS `rejection_reason` varchar(255) DEFAULT NULL;

-- Audit Phase 4 (H10): repair costs flagged tenant-responsible had nowhere to
-- post to, so they were tracked in reports and on the ticket but never
-- billed. `maintenance` accumulates the same way `services` does — several
-- billed tickets in one period add into the one column instead of
-- overwriting it. maintenance_requests gets the same claim-first billing
-- columns service_requests already has, so a ticket can be billed exactly
-- once (see post_maintenance_charge() / reverse_maintenance_charge()).
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `maintenance` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `services`;
ALTER TABLE `maintenance_requests` ADD COLUMN IF NOT EXISTS `is_invoiced` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `maintenance_requests` ADD COLUMN IF NOT EXISTS `invoice_id` varchar(50) DEFAULT NULL;
ALTER TABLE `maintenance_requests` ADD COLUMN IF NOT EXISTS `billing_period` varchar(50) DEFAULT NULL;
ALTER TABLE `maintenance_requests` ADD INDEX IF NOT EXISTS `idx_maint_invoiced` (`is_invoiced`);

-- Upgrade existing rows to the canonical categories (checklist 4.2) and urgencies, then backfill the timeline.
UPDATE `maintenance_requests` SET `issue_category` = 'General Maintenance' WHERE LOWER(`issue_category`) IN ('appliance', 'pest control', 'general', 'general maintenance');
UPDATE `maintenance_requests` SET `issue_category` = 'Structural/Physical' WHERE LOWER(`issue_category`) IN ('structural', 'carpentry', 'structural/physical');
UPDATE `maintenance_requests` SET `issue_category` = 'Water Supply' WHERE LOWER(`issue_category`) IN ('water', 'water supply');
UPDATE `maintenance_requests` SET `issue_category` = 'Plumbing' WHERE LOWER(`issue_category`) = 'plumbing';
UPDATE `maintenance_requests` SET `issue_category` = 'Electrical' WHERE LOWER(`issue_category`) = 'electrical';
UPDATE `maintenance_requests` SET `issue_category` = 'Others' WHERE `issue_category` NOT IN ('Plumbing', 'Electrical', 'Structural/Physical', 'Water Supply', 'General Maintenance');
UPDATE `maintenance_requests` SET `urgency` = 'Urgent' WHERE LOWER(`urgency`) IN ('urgent', 'emergency');
UPDATE `maintenance_requests` SET `urgency` = CONCAT(UPPER(LEFT(`urgency`, 1)), LOWER(SUBSTRING(`urgency`, 2))) WHERE LOWER(`urgency`) IN ('low', 'medium', 'high');
UPDATE `maintenance_requests` SET `acknowledged_at` = `created_at` WHERE `status` <> 'Pending' AND `acknowledged_at` IS NULL;
UPDATE `maintenance_requests` SET `started_at` = GREATEST(`created_at`, COALESCE(TIMESTAMP(`preferred_date`, '08:00:00'), `created_at`)) WHERE `status` IN ('In Progress', 'Completed') AND `started_at` IS NULL;
UPDATE `maintenance_requests` SET `resolved_at` = GREATEST(`created_at`, COALESCE(TIMESTAMP(`preferred_date`, '17:00:00'), `created_at`)), `actual_cost` = COALESCE(`actual_cost`, `estimated_cost`) WHERE `status` = 'Completed' AND `resolved_at` IS NULL;

-- Seed catalog entries. Admin can re-price, deactivate or add more from /admin-services.
INSERT IGNORE INTO `service_catalog`
  (`category`, `name`, `description`, `price`, `pricing_unit`, `min_quantity`, `max_quantity`, `lead_time_days`, `icon`, `is_active`, `sort_order`) VALUES
('cleaning', 'Standard Unit Cleaning', 'General sweeping, mopping, dusting and bathroom sanitation for a studio or one-bedroom unit.', 500.00, 'session', 1, 1, 1, 'faBroom', 1, 10),
('cleaning', 'Deep Cleaning', 'Intensive scrubbing of kitchen, bathroom grout, appliances and hard-to-reach fixtures.', 1200.00, 'session', 1, 1, 2, 'faBroom', 1, 20),
('laundry', 'Wash & Fold', 'Machine wash, dry and fold of regular garments, billed per kilogram.', 60.00, 'kg', 1, 20, 1, 'faTshirt', 1, 30),
('laundry', 'Dry Cleaning', 'Professional dry cleaning for suits, gowns and delicate fabrics, billed per item.', 250.00, 'item', 1, 15, 2, 'faTshirt', 1, 40),
('other', 'Pest Control Treatment', 'Scheduled unit-level pest control and follow-up inspection.', 900.00, 'session', 1, 1, 3, 'faConciergeBell', 1, 50);

--
-- Table structure for table `utility_readings`
--
-- One row per unit per billing month (checklist 8.7). billing_period is the
-- 'YYYY-MM' month the meter covers; invoices store the same month as a
-- "September 2026" label, so sync_utility_to_invoice.php converts before
-- matching. prev/curr readings form a chain per unit, so readings are recorded
-- oldest-first and only the latest un-invoiced one may be deleted.
-- is_invoiced is claimed atomically before the charge is posted, and
-- invoice_id records where it landed (mirrors service_requests).
-- Previously created at runtime by get_utility_readings.php (the
-- 2026_09_utility_readings.sql upgrade, since removed, added it to old databases).
--
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
  `bill_file_path` varchar(255) DEFAULT NULL,
  `entry_mode` enum('metered','total') NOT NULL DEFAULT 'metered',
  `total_amount` decimal(10,2) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `recorded_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_room_period` (`room_name`,`billing_period`),
  KEY `fk_ur_user` (`user_id`),
  CONSTRAINT `fk_ur_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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

--
-- Table structure for table `sessions`
-- Server-issued session tokens. login.php creates a row here and hands the
-- token back to the client; get_authenticated_user()/require_admin()/
-- require_user()/require_owner_or_admin() (backend/config.php) are the only
-- functions that should ever be trusted to say who is calling -- never a
-- client-supplied X-User-Id/X-Admin-Id header on its own.
--

CREATE TABLE IF NOT EXISTS `sessions` (
  `token` char(64) NOT NULL,
  `user_id` int(11) NOT NULL,
  `role` varchar(20) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `expires_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_seen_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`token`),
  KEY `fk_session_user` (`user_id`),
  CONSTRAINT `fk_session_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Table structure for table `login_attempts`
-- Failed sign-in attempts, counted per IP and per account by
-- login_throttle_message() in backend/config.php (also used by
-- change_password.php). Previously created by login.php at request time.
--
CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip_address` varchar(45) NOT NULL,
  `email` varchar(255) NOT NULL,
  `attempt_time` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ip_address` (`ip_address`,`attempt_time`),
  KEY `email_time` (`email`,`attempt_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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

-- Admin-editable lease contract (backend/contract_template.php). One row per
-- save; the highest version is in force. Empty until the first save or the
-- first contract that pins the built-in default.
CREATE TABLE IF NOT EXISTS `contract_template_versions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `version` int(11) NOT NULL,
  `content` longtext NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_template_version` (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Advance payments as monthly credits (2026_09_advance_credits.sql): one row
-- per month an advance-rent invoice covers. The daily sweep bills each month
-- on its usual date and settles it from the credit.
CREATE TABLE IF NOT EXISTS `advance_credits` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `advance_invoice_id` varchar(50) NOT NULL,
  `user_id` int(11) NOT NULL,
  `rent_application_id` int(11) DEFAULT NULL,
  `period_start` date NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('reserved','available','applied','cancelled','refund-due','refunded') NOT NULL DEFAULT 'reserved',
  `credit_key` date GENERATED ALWAYS AS (IF(`status` = 'cancelled', NULL, `period_start`)) STORED,
  `applied_invoice_id` varchar(50) DEFAULT NULL,
  `applied_at` timestamp NULL DEFAULT NULL,
  `refund_request_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_advance_credit_period` (`user_id`, `credit_key`),
  KEY `idx_advance_credit_invoice` (`advance_invoice_id`),
  CONSTRAINT `fk_advance_credit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_advance_credit_invoice` FOREIGN KEY (`advance_invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Payment ledger: one row per payment portion (split payments have several)
-- (2026_10_payment_transactions_and_banks.sql).
CREATE TABLE IF NOT EXISTS `payment_transactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `invoice_id` varchar(50) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `payment_method` varchar(50) NOT NULL,
  `bank_name` varchar(100) DEFAULT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `recorded_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payment_transactions_invoice` (`invoice_id`),
  KEY `idx_payment_transactions_recorder` (`recorded_by`),
  CONSTRAINT `fk_payment_transactions_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payment_transactions_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Tenant split payments: the portions a tenant submitted, kept until the admin
-- confirms or rejects them (2026_10_guest_chat_and_split_payment.sql).
CREATE TABLE IF NOT EXISTS `payment_proof_parts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payment_key` varchar(50) NOT NULL,
  `position` tinyint(4) NOT NULL DEFAULT 0,
  `method` varchar(20) NOT NULL,
  `bank_name` varchar(100) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `proof_path` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payment_proof_parts_key` (`payment_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Guest (not-yet-registered) inquiry chat, kept apart from `messages` so its
-- sender/receiver foreign keys stay unchanged (2026_10_guest_chat_and_split_payment.sql).
CREATE TABLE IF NOT EXISTS `guest_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `inquiry_id` int(11) NOT NULL,
  `sender_role` enum('admin','guest') NOT NULL,
  `sender_id` int(11) DEFAULT NULL,
  `message` text NOT NULL,
  `attachment_path` varchar(255) DEFAULT NULL,
  `reply_to_id` int(11) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_guest_messages_thread` (`inquiry_id`,`id`),
  CONSTRAINT `fk_guest_messages_inquiry` FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_guest_messages_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Chat messages between a tenant and an admin (send_message.php,
-- websocket-server/server.js). Same columns, keys and constraint names as
-- production; reply_to_id has no key or constraint there either.
CREATE TABLE IF NOT EXISTS `messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sender_id` int(11) NOT NULL,
  `receiver_id` int(11) NOT NULL,
  `message` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `attachment_path` varchar(255) DEFAULT NULL,
  `reply_to_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_sender` (`sender_id`),
  KEY `async_receiver` (`receiver_id`),
  CONSTRAINT `fk_messages_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_messages_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- House rules shown on the listing, inquiry and application forms, edited in
-- Settings (2026_10_house_rules.sql + 2026_10_house_rules_translations.sql).
CREATE TABLE IF NOT EXISTS `house_rules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category` varchar(100) NOT NULL,
  `title` varchar(255) NOT NULL,
  `title_fil` varchar(255) DEFAULT NULL,
  `description` text NOT NULL,
  `description_fil` text DEFAULT NULL,
  `is_highlight` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `scope` varchar(20) NOT NULL DEFAULT 'house',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `house_rules` (`category`, `title`, `description`, `is_highlight`, `sort_order`)
SELECT * FROM (
  SELECT 'Quiet Hours', 'Respect quiet hours', 'Please keep noise to a minimum between 10:00 PM and 7:00 AM so all residents can rest.', 1, 10 UNION ALL
  SELECT 'Care of Premises', 'Smoke-free indoor areas', 'Smoking is not permitted inside rooms or any enclosed indoor common areas. Please keep the premises clean and report damage promptly.', 1, 20 UNION ALL
  SELECT 'Visitors & Guests', 'Register your visitors', 'All visitors must be registered with apartment management and follow building access and safety procedures.', 0, 30 UNION ALL
  SELECT 'Payment Terms', 'Pay rent on time', 'Monthly rent is due on the agreed due date. Please contact management promptly if you have a question about your payment.', 1, 40
) AS defaults
WHERE NOT EXISTS (SELECT 1 FROM `house_rules`);

-- Parking and minors/pets rules (2026_10_panelist_gaps.sql).
INSERT INTO `house_rules` (`category`, `title`, `description`, `is_highlight`, `sort_order`, `scope`)
SELECT * FROM (
  SELECT 'Parking' AS category, 'One slot per rent' AS title, 'Each rent may reserve one parking slot. Additional slots depend on availability and management approval.' AS description, 1 AS is_highlight, 10 AS sort_order, 'parking' AS scope UNION ALL
  SELECT 'Parking', 'Registered vehicles only', 'Only the vehicle named in your reservation may use your slot. Upload the vehicle OR/CR and report any change of vehicle to management.', 1, 20, 'parking' UNION ALL
  SELECT 'Parking', 'Park within your slot', 'Park only inside your assigned slot and never block driveways or exits. Vehicles left in the wrong place may be moved at the owner''s risk.', 0, 30, 'parking'
) AS defaults
WHERE NOT EXISTS (SELECT 1 FROM house_rules WHERE scope = 'parking');

INSERT INTO `house_rules` (`category`, `title`, `description`, `is_highlight`, `sort_order`, `scope`)
SELECT * FROM (
  SELECT 'Children' AS category, 'No children under 12' AS title, 'Children under 12 years old are not allowed to live in the apartment. Every household member must be declared with their age, and a household request for a child under 12 is refused.' AS description, 1 AS is_highlight, 10 AS sort_order, 'minors' AS scope UNION ALL
  SELECT 'Children', 'Minors aged 12 to 17', 'Minors 12 to 17 may live in the apartment. The tenant is responsible for their conduct, and they must follow every house rule in all common areas.', 1, 20, 'minors' UNION ALL
  SELECT 'Pets', 'No pets allowed', 'Pets are not allowed inside the units or anywhere on the premises.', 0, 30, 'minors'
) AS defaults
WHERE NOT EXISTS (SELECT 1 FROM house_rules WHERE scope = 'minors');

-- ===== rules_filipino =====
-- Filipino text for the starter children/pets and parking rules, only while the
-- admin has not written one.
UPDATE `house_rules` SET `title_fil` = 'Bawal ang batang wala pang 12 taon',
  `description_fil` = 'Hindi pinapayagang tumira sa apartment ang mga batang wala pang 12 taong gulang. Dapat ideklara ang edad ng bawat miyembro ng sambahayan.'
 WHERE `scope` = 'minors' AND `title` = 'No children under 12' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Mga menor de edad (12 hanggang 17)',
  `description_fil` = 'Maaaring tumira ang mga menor de edad na 12 hanggang 17. Responsable ang nangungupahan sa kanilang asal at dapat nilang sundin ang lahat ng patakaran.'
 WHERE `scope` = 'minors' AND `title` = 'Minors aged 12 to 17' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Bawal ang alagang hayop',
  `description_fil` = 'Hindi pinapayagan ang mga alagang hayop sa loob ng mga unit o saanman sa lugar.'
 WHERE `scope` = 'minors' AND `title` = 'No pets allowed' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Isang parking slot bawat uupahan',
  `description_fil` = 'Isang parking slot lamang bawat uupahan. Ang karagdagan ay depende sa availability at pag-apruba ng management.'
 WHERE `scope` = 'parking' AND `title` = 'One slot per rent' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Rehistradong sasakyan lamang',
  `description_fil` = 'Ang sasakyang nakasaad lamang sa reservation ang maaaring gumamit ng slot. I-upload ang OR/CR at ipaalam sa management ang anumang pagpapalit.'
 WHERE `scope` = 'parking' AND `title` = 'Registered vehicles only' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Pumarada sa loob ng slot',
  `description_fil` = 'Pumarada lamang sa nakatalagang slot at huwag harangan ang daanan o labasan.'
 WHERE `scope` = 'parking' AND `title` = 'Park within your slot' AND (`title_fil` IS NULL OR `title_fil` = '');

-- Counter for public forms without an account to throttle on, e.g.
-- registration per IP (audit M13; 2026_10_rate_limits_and_rent_horizon.sql).
CREATE TABLE IF NOT EXISTS `rate_limit_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `action` varchar(50) NOT NULL,
  `rate_key` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rate_limit_lookup` (`action`, `rate_key`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Refund approval workflow (2026_10_panelist_gaps.sql). Security deposits are not refundable here.
CREATE TABLE IF NOT EXISTS `refund_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `rent_application_id` int(11) DEFAULT NULL,
  `type` enum('advance','overpayment','rejected_application','rejected_charge') NOT NULL,
  `invoice_id` varchar(50) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `reason` text NOT NULL,
  `status` enum('Pending Review','Info Requested','Approved','Rejected','Refunded','Cancelled') NOT NULL DEFAULT 'Pending Review',
  `decision_reason` text DEFAULT NULL,
  `payout_method` varchar(50) DEFAULT NULL,
  `payout_reference` varchar(100) DEFAULT NULL,
  `raised_by` int(11) DEFAULT NULL,
  `raised_by_role` varchar(10) NOT NULL DEFAULT 'user',
  `decided_by` int(11) DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `refunded_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_refund_user` (`user_id`, `status`),
  KEY `idx_refund_status` (`status`),
  CONSTRAINT `fk_refund_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `refund_request_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `refund_request_id` int(11) NOT NULL,
  `actor_id` int(11) DEFAULT NULL,
  `actor_role` varchar(10) NOT NULL,
  `action` varchar(30) NOT NULL,
  `message` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_refund_event_request` (`refund_request_id`),
  CONSTRAINT `fk_refund_event_request` FOREIGN KEY (`refund_request_id`) REFERENCES `refund_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Extra utility types (2026_10_panelist_gaps.sql). Charges post to invoices.services.
CREATE TABLE IF NOT EXISTS `utility_types` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(30) NOT NULL,
  `name` varchar(60) NOT NULL,
  `unit_label` varchar(20) DEFAULT NULL,
  `billing_mode` enum('metered','flat') NOT NULL DEFAULT 'flat',
  `default_rate` decimal(10,2) NOT NULL DEFAULT 0.00,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_utility_type_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `utility_reading_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `reading_id` int(11) NOT NULL,
  `type_id` int(11) NOT NULL,
  `prev_reading` decimal(10,2) DEFAULT NULL,
  `curr_reading` decimal(10,2) DEFAULT NULL,
  `consumption` decimal(10,2) DEFAULT NULL,
  `rate` decimal(10,2) NOT NULL DEFAULT 0.00,
  `amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `other_fees` decimal(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reading_type` (`reading_id`, `type_id`),
  KEY `idx_item_type` (`type_id`),
  CONSTRAINT `fk_item_reading` FOREIGN KEY (`reading_id`) REFERENCES `utility_readings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_item_type` FOREIGN KEY (`type_id`) REFERENCES `utility_types` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `utility_types` (`code`, `name`, `unit_label`, `billing_mode`, `default_rate`, `is_active`, `sort_order`) VALUES
('internet', 'Internet', NULL, 'flat', 1000.00, 0, 1),
('gas', 'Gas', 'kg', 'metered', 90.00, 0, 2);

-- Admin-defined application documents (Settings -> Application Requirements) and
-- the files applicants uploaded for them (2026_10_manager_interview_alignment.sql).
-- label_snapshot keeps a document readable after its requirement is renamed or
-- deactivated; requirement_id is NULL for a backfilled legacy NBI file.
CREATE TABLE IF NOT EXISTS `application_requirements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `label` varchar(60) NOT NULL,
  `label_fil` varchar(60) DEFAULT NULL,
  `is_required` tinyint(1) NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_app_requirements_active` (`is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `application_documents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rent_application_id` int(11) NOT NULL,
  `requirement_id` int(11) DEFAULT NULL,
  `label_snapshot` varchar(60) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_app_document_requirement` (`rent_application_id`, `requirement_id`),
  KEY `idx_app_documents_requirement` (`requirement_id`),
  KEY `idx_app_documents_path` (`file_path`),
  CONSTRAINT `fk_app_documents_application` FOREIGN KEY (`rent_application_id`) REFERENCES `rent_applications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_app_documents_requirement` FOREIGN KEY (`requirement_id`) REFERENCES `application_requirements` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Itemized move-out deposit deductions: category, reason and amount per line.
-- lease_contracts.damage_deduction / utility_deduction hold the totals.
CREATE TABLE IF NOT EXISTS `deposit_deductions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rent_application_id` int(11) NOT NULL,
  `contract_id` varchar(50) DEFAULT NULL,
  `category` enum('damage','electricity','water','unpaid_rent','other') NOT NULL,
  `reason` varchar(255) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `recorded_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_deposit_deductions_app` (`rent_application_id`),
  CONSTRAINT `fk_deposit_deductions_application` FOREIGN KEY (`rent_application_id`) REFERENCES `rent_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `application_requirements` (`id`, `label`, `label_fil`, `is_required`, `is_active`, `sort_order`) VALUES
(1, 'Valid ID (front)', 'Valid ID (harap)', 1, 1, 1),
(2, 'Valid ID (back)', 'Valid ID (likod)', 1, 1, 2);

-- 3. Default System Settings
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('system_name', 'Apartment Management System'),
('floor_rates', '{}'),
('min_household_age', '12'),
('age_categories', '[{"key":"infant","label":"Infant","min_age":0,"max_age":1,"rule":"Not allowed. Children under 12 may not live in the apartment.","rule_fil":""},{"key":"toddler","label":"Toddler","min_age":2,"max_age":4,"rule":"Not allowed. Children under 12 may not live in the apartment.","rule_fil":""},{"key":"child","label":"Child","min_age":5,"max_age":11,"rule":"Not allowed. Children under 12 may not live in the apartment.","rule_fil":""},{"key":"minor","label":"Minor","min_age":12,"max_age":17,"rule":"Allowed, with adult responsibility for their conduct. Running and playing in hallways, elevators and the parking area is not allowed.","rule_fil":""}]'),
('contact_email', 'admin@ams.com'),
('contact_phone', '+63 912 345 6789'),
('currency_symbol', '₱'),
('maintenance_auto_assign', 'true'),
('min_lease_duration', '3'),
('max_rent_ahead_months', '12'),
('payment_window_days', '3'),
('overdue_threshold_days', '15'),
('maintenance_monthly_budget', '50000'),
('tenant_responsibility_clause', 'Per the Terms & Conditions of this rent agreement, the Tenant shall be responsible for any damage or maintenance issues caused by negligence, misuse, or unauthorized modifications to the rented unit. Costs for such repairs will be billed directly to the Tenant and are excluded from the building\'s maintenance budget allocation.'),
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
-- Parking fee per month of the permit term, and whether it is posted to invoices
-- automatically ('auto') or by the admin's "Bill this month" button ('manual').
('parking_monthly_fee', '300'),
('parking_billing_mode', 'manual'),
('lease_end_reminder_days', '30'),
-- Date of the last daily notification sweep (run_notification_sweep() in config.php).
('notification_sweep_last_run', '2000-01-01'),
('landlord_name', 'Elizabeth Angcanan'),
('landlord_address', 'Tamak, Maguyam, Silang, Cavite'),
('landlord_contact', '*********** (Smart)'),
('property_address', 'Sitio Engkanto, Brgy. Maguyam, Silang, Cavite'),
('occupant_surcharge_per_person', '1000'),
-- Late fee applied automatically when an invoice lapses past its due date
-- (promote_overdue_invoices() in config.php). type: 'flat' (peso amount) or
-- 'percent' (of the invoice's recurring charges, excluding any deposit).
-- Which panel the public room preview shows: 'images' or 'floor_plan'.
('room_preview_mode', 'images'),
-- Upper bound on a unit's occupant count (lease holder + household members).
('max_occupants_per_unit', '8'),
('late_fee_enabled', 'false'),
('late_fee_type', 'flat'),
('late_fee_value', '200'),
-- SMS and email notification channels (checklist 6.6 / 6.7). sms_provider accepts
-- 'log' or 'semaphore' (the only real SMS provider); 'log' is the
-- dry-run driver, which records to notification_log and sends nothing. The
-- secret-valued keys here are masked by get_system_settings.php.
('smtp_host', 'smtp.gmail.com'),
('smtp_port', '587'),
('smtp_username', ''),
('smtp_password', ''),
('smtp_from_name', 'AMS Notifications'),
('smtp_from_email', ''),
-- log | smtp. The email mirror of sms_provider's 'log' dry-run driver: renders
-- and records the message without opening a socket.
('email_driver', 'log'),
('sms_provider', 'log'),
('sms_api_key', ''),
('sms_sender_name', 'AMS'),
-- Semaphore: post sendername only once the custom name is approved; until then
-- messages go out under the shared 'SEMAPHORE' sender.
('sms_sender_approved', '0'),
-- Spend guard: max SMS sent per day ('0' = no cap). Over the cap is 'skipped'.
('sms_daily_cap', '100'),
-- Building-wide kill switches. Both ship off: email needs SMTP credentials and
-- SMS costs money and needs a carrier-registered sender ID.
('notifications_email_enabled', '0'),
('notifications_sms_enabled', '0'),
-- queue | sync. 'sync' blocks the HTTP request and exists only for demos.
('notifications_dispatch_mode', 'queue'),
-- Quiet hours (24h, local). Overdue and urgent announcements are exempt.
('notifications_quiet_start', '21'),
('notifications_quiet_end', '07'),
-- Retention for notification_log (prune_notification_log() in config.php).
('notification_log_retention_days', '90'),
-- Claimed by the queue drain, same pattern as notification_sweep_last_run.
('notification_queue_last_run', '2000-01-01 00:00:00'),
-- Peso cost of one SMS segment, for the announcement cost preview.
('sms_unit_cost', '0.50');
