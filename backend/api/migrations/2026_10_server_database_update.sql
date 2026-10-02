-- ==============================================================================
-- Apartment Management System (AMS) - Server Database Update Migration
-- Tailored for server dump: C:\Users\Gboy4\Downloads\serverdb.sql (MySQL 8.4+)
-- 
-- SAFE & NON-DESTRUCTIVE:
-- - Does NOT drop or delete any existing tables or rows.
-- - Adds missing tables, columns, indexes, and generated keys.
-- - Enables full Contract Editor functionality and rent advance credits.
-- ==============================================================================

SET NAMES utf8mb4;
SET foreign_key_checks = 1;

-- ------------------------------------------------------------------------------
-- 1. CONTRACT EDITOR & TEMPLATE VERSIONING
-- ------------------------------------------------------------------------------

-- Stores all versions of the customizable lease contract template.
CREATE TABLE IF NOT EXISTS `contract_template_versions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `version` int(11) NOT NULL,
  `content` longtext NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_template_version` (`version`),
  KEY `fk_template_user` (`created_by`),
  CONSTRAINT `fk_template_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Pins which contract template version was issued to a tenant, plus signature image paths.
ALTER TABLE `lease_contracts` 
  ADD COLUMN IF NOT EXISTS `template_version_id` int(11) DEFAULT NULL AFTER `notarized_lease_path`,
  ADD COLUMN IF NOT EXISTS `tenant_signature_path` text DEFAULT NULL AFTER `generated_at`,
  ADD COLUMN IF NOT EXISTS `owner_signature_path` text DEFAULT NULL AFTER `tenant_signature_path`;

-- ------------------------------------------------------------------------------
-- 2. INVOICES, ADVANCE RENT & PERIOD KEYS
-- ------------------------------------------------------------------------------

-- Required columns for rent period tracking and prepaid advance rent months.
ALTER TABLE `invoices` 
  ADD COLUMN IF NOT EXISTS `rent_period_start` date DEFAULT NULL AFTER `billing_period`,
  ADD COLUMN IF NOT EXISTS `rent_period_key` date GENERATED ALWAYS AS (IF(`status` = 'cancelled', NULL, `rent_period_start`)) STORED AFTER `rent_period_start`,
  ADD COLUMN IF NOT EXISTS `advance_months` tinyint(4) DEFAULT NULL AFTER `payment_group`;

-- Keys to avoid duplicate monthly billing and speed up payment group queries.
ALTER TABLE `invoices` ADD UNIQUE KEY IF NOT EXISTS `uq_invoice_rent_period` (`user_id`, `rent_period_key`);
ALTER TABLE `invoices` ADD KEY IF NOT EXISTS `idx_invoice_payment_group` (`payment_group`);

-- Monthly advance credit ledger for prepaid tenancies.
CREATE TABLE IF NOT EXISTS `advance_credits` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `advance_invoice_id` varchar(50) NOT NULL,
  `user_id` int(11) NOT NULL,
  `rent_application_id` int(11) DEFAULT NULL,
  `period_start` date NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('reserved','available','applied','cancelled','refund-due') NOT NULL DEFAULT 'reserved',
  `credit_key` date GENERATED ALWAYS AS (IF(`status` = 'cancelled', NULL, `period_start`)) STORED,
  `applied_invoice_id` varchar(50) DEFAULT NULL,
  `applied_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_advance_credit_period` (`user_id`, `credit_key`),
  KEY `idx_advance_credit_invoice` (`advance_invoice_id`),
  CONSTRAINT `fk_advance_credit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_advance_credit_invoice` FOREIGN KEY (`advance_invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ------------------------------------------------------------------------------
-- 3. ROOMS & NOTIFICATIONS SYSTEM UPDATES
-- ------------------------------------------------------------------------------

-- Room gallery images (used in public room showcase & unit preview).
ALTER TABLE `rooms` 
  ADD COLUMN IF NOT EXISTS `gallery` JSON DEFAULT NULL AFTER `last_inspection_date`;

-- Audience targeting on in-app notifications.
ALTER TABLE `notifications` 
  ADD COLUMN IF NOT EXISTS `audience` varchar(20) NOT NULL DEFAULT 'tenant' AFTER `type`;

-- User SMS consent timestamp tracking.
ALTER TABLE `users` 
  ADD COLUMN IF NOT EXISTS `sms_consent_at` datetime DEFAULT NULL AFTER `sms_opt_out`;

-- SMS provider delivery message IDs and response statuses.
ALTER TABLE `notification_log`
  ADD COLUMN IF NOT EXISTS `provider_message_id` varchar(64) DEFAULT NULL COMMENT 'Semaphore message_id' AFTER `error_message`,
  ADD COLUMN IF NOT EXISTS `provider_status` varchar(20) DEFAULT NULL COMMENT 'status Semaphore returned at send time' AFTER `provider_message_id`,
  ADD INDEX IF NOT EXISTS `idx_log_provider_msg` (`provider_message_id`);

-- ------------------------------------------------------------------------------
-- 4. DATA INTEGRITY NORMALIZATION (NON-DESTRUCTIVE)
-- ------------------------------------------------------------------------------

-- Standardize move-in invoice billing period format from 'YYYY-MM' to 'Month YYYY'.
UPDATE `invoices`
   SET `billing_period` = DATE_FORMAT(STR_TO_DATE(CONCAT(`billing_period`, '-01'), '%Y-%m-%d'), '%M %Y')
 WHERE `billing_period` REGEXP '^[0-9]{4}-[0-9]{2}$';

-- Link existing move-in invoices to their lease contract start date (tenancy month 0).
UPDATE IGNORE `invoices` i
  JOIN `lease_contracts` lc ON lc.rent_application_id = i.rent_application_id
   SET i.rent_period_start = lc.lease_start
 WHERE i.security_deposit > 0 AND i.rent_period_start IS NULL AND lc.lease_start IS NOT NULL;
