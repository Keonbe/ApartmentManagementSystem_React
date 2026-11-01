-- ============================================================
-- 2026_10_deployed_server_sync.sql
-- Synchronizes the deployed server database (serverdb.sql) with
-- the current AMS codebase updates:
-- 1. Creates `rent_advance_credits` ledger table
-- 2. Restores `NBI Clearance` application requirement (id 3)
-- 3. Safely backfills & drops legacy rent_applications document columns
-- 4. Idempotently adds `reference_norm` generated columns (if not already present)
-- 5. Adds missing performance indexes
-- 6. Adds QR Ph channel, QR slots, and Pay Bills service settings
-- 7. Records applied migrations in `schema_migrations`
-- ============================================================

SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;
SET time_zone = '+00:00';
SET foreign_key_checks = 0;

-- 1. Create missing rent_advance_credits table
CREATE TABLE IF NOT EXISTS `rent_advance_credits` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `source_invoice_id` varchar(50) NOT NULL,
  `period_start` date NOT NULL,
  `period_label` varchar(50) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('reserved','available','applied','cancelled','refund-due','refunded') NOT NULL DEFAULT 'reserved',
  `credit_key` date GENERATED ALWAYS AS (IF(`status` = 'cancelled', NULL, `period_start`)) STORED,
  `applied_invoice_id` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_advance_credit_slot` (`user_id`, `credit_key`),
  KEY `idx_advance_credits_source` (`source_invoice_id`),
  KEY `idx_advance_credits_applied` (`applied_invoice_id`),
  CONSTRAINT `fk_advance_credits_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2. Restore NBI Clearance in application_requirements and link documents
INSERT INTO `application_requirements` (`id`, `label`, `label_fil`, `is_required`, `is_active`, `sort_order`)
VALUES (3, 'NBI Clearance', 'NBI Clearance', 0, 1, 3)
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`), `is_active` = 1, `sort_order` = 3;

UPDATE `application_documents` 
SET `requirement_id` = 3 
WHERE `label_snapshot` = 'NBI Clearance' AND `requirement_id` IS NULL;

-- 3. Safely backfill and drop legacy document columns from rent_applications
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'valid_id_front_path') = 1,
  'INSERT INTO `application_documents` (`rent_application_id`, `requirement_id`, `label_snapshot`, `file_path`, `uploaded_at`)
   SELECT ra.id, (SELECT MIN(r.id) FROM `application_requirements` r WHERE r.label = ''Valid ID (front)''), ''Valid ID (front)'', ra.valid_id_front_path, ra.created_at
     FROM `rent_applications` ra
    WHERE COALESCE(ra.valid_id_front_path, '''') NOT IN ('''', ''placeholder'')
      AND NOT EXISTS (SELECT 1 FROM `application_documents` d WHERE d.rent_application_id = ra.id AND d.file_path = ra.valid_id_front_path)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'valid_id_back_path') = 1,
  'INSERT INTO `application_documents` (`rent_application_id`, `requirement_id`, `label_snapshot`, `file_path`, `uploaded_at`)
   SELECT ra.id, (SELECT MIN(r.id) FROM `application_requirements` r WHERE r.label = ''Valid ID (back)''), ''Valid ID (back)'', ra.valid_id_back_path, ra.created_at
     FROM `rent_applications` ra
    WHERE COALESCE(ra.valid_id_back_path, '''') NOT IN ('''', ''placeholder'')
      AND NOT EXISTS (SELECT 1 FROM `application_documents` d WHERE d.rent_application_id = ra.id AND d.file_path = ra.valid_id_back_path)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'nbi_clearance_path') = 1,
  'INSERT INTO `application_documents` (`rent_application_id`, `requirement_id`, `label_snapshot`, `file_path`, `uploaded_at`)
   SELECT ra.id, 3, ''NBI Clearance'', ra.nbi_clearance_path, ra.created_at
     FROM `rent_applications` ra
    WHERE COALESCE(ra.nbi_clearance_path, '''') NOT IN ('''', ''placeholder'')
      AND NOT EXISTS (SELECT 1 FROM `application_documents` d WHERE d.rent_application_id = ra.id AND d.file_path = ra.nbi_clearance_path)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'valid_id_front_path') = 1,
  'ALTER TABLE `rent_applications` DROP COLUMN `valid_id_front_path`', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'valid_id_back_path') = 1,
  'ALTER TABLE `rent_applications` DROP COLUMN `valid_id_back_path`', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'nbi_clearance_path') = 1,
  'ALTER TABLE `rent_applications` DROP COLUMN `nbi_clearance_path`', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Idempotently add reference_norm generated columns (if missing)
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'reference_norm') = 0,
  'ALTER TABLE `invoices` ADD COLUMN `reference_norm` varchar(100) GENERATED ALWAYS AS (NULLIF(UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`payment_reference`, '' '', ''''), ''-'', ''''), ''\t'', ''''), ''\r'', ''''), ''\n'', '''')), '''')) STORED AFTER `payment_reference`, ADD KEY `idx_invoices_reference_norm` (`reference_norm`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payment_transactions' AND column_name = 'reference_norm') = 0,
  'ALTER TABLE `payment_transactions` ADD COLUMN `reference_norm` varchar(100) GENERATED ALWAYS AS (NULLIF(UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`reference_number`, '' '', ''''), ''-'', ''''), ''\t'', ''''), ''\r'', ''''), ''\n'', '''')), '''')) STORED AFTER `reference_number`, ADD KEY `idx_payment_transactions_reference_norm` (`reference_norm`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payment_proof_parts' AND column_name = 'reference_norm') = 0,
  'ALTER TABLE `payment_proof_parts` ADD COLUMN `reference_norm` varchar(100) GENERATED ALWAYS AS (NULLIF(UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`reference_number`, '' '', ''''), ''-'', ''''), ''\t'', ''''), ''\r'', ''''), ''\n'', '''')), '''')) STORED AFTER `reference_number`, ADD KEY `idx_payment_proof_parts_reference_norm` (`reference_norm`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. Add missing performance indexes (if missing)
SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'invoice_adjustments' AND index_name = 'idx_adjustments_invoice') = 0,
  'ALTER TABLE `invoice_adjustments` ADD KEY `idx_adjustments_invoice` (`invoice_id`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'maintenance_requests' AND index_name = 'idx_maint_invoiced') = 0,
  'ALTER TABLE `maintenance_requests` ADD KEY `idx_maint_invoiced` (`is_invoiced`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'notifications' AND index_name = 'idx_type_status') = 0,
  'ALTER TABLE `notifications` ADD KEY `idx_type_status` (`type`, `status`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'notifications' AND index_name = 'idx_user_read') = 0,
  'ALTER TABLE `notifications` ADD KEY `idx_user_read` (`user_id`, `is_read`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. Insert new system settings keys (QR Ph channels, QR slots, pay bills toggle)
INSERT INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('payment_ch_qrph_manual', '1'),
('qrph_active_slot', '1'),
('qrph_slots', '[{"slot":1,"label":"QR Ph Slot 1","image_path":"","account_name":"","account_number":""},{"slot":2,"label":"QR Ph Slot 2","image_path":"","account_name":"","account_number":""},{"slot":3,"label":"QR Ph Slot 3","image_path":"","account_name":"","account_number":""},{"slot":4,"label":"QR Ph Slot 4","image_path":"","account_name":"","account_number":""},{"slot":5,"label":"QR Ph Slot 5","image_path":"","account_name":"","account_number":""}]'),
('service_pay_bills_active', 'true')
ON DUPLICATE KEY UPDATE `setting_key` = `setting_key`;

-- 7. Record applied migrations. schema_migrations is created by cron/migrate.php; a
-- database built straight from SetupDB.sql does not have it, so skip the insert then.
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'schema_migrations') = 1,
  'INSERT IGNORE INTO `schema_migrations` (`migration_name`) VALUES (''2026_10_qrph_payment_settings.sql''), (''2026_10_parking_slot_guards_orphan_cleanup.sql''), (''2026_10_drop_legacy_document_columns.sql''), (''2026_10_fix_notification_encoding.sql''), (''2026_10_missing_columns_sync.sql''), (''2026_10_restore_application_requirements.sql''), (''2026_10_add_reference_norm_and_tables.sql'')', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET foreign_key_checks = 1;

