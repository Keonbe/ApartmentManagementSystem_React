-- Add reference_norm generated columns and create rent_advance_credits if missing.
-- Each ALTER checks information_schema first (pattern of 2026_10_prod_schema_repair.sql),
-- so the file also runs on a database that already has the columns (SetupDB.sql, or a
-- server this ran on before) and can be re-run.

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'reference_norm') = 0,
  'ALTER TABLE `invoices` ADD COLUMN `reference_norm` varchar(100) GENERATED ALWAYS AS (NULLIF(UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`payment_reference`, '' '', ''''), ''-'', ''''), ''\t'', ''''), ''\r'', ''''), ''\n'', '''')), '''')) STORED AFTER `payment_reference`, ADD KEY `idx_invoices_reference_norm` (`reference_norm`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payment_transactions' AND column_name = 'reference_norm') = 0,
  'ALTER TABLE `payment_transactions` ADD COLUMN `reference_norm` varchar(100) GENERATED ALWAYS AS (NULLIF(UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`reference_number`, '' '', ''''), ''-'', ''''), ''\t'', ''''), ''\r'', ''''), ''\n'', '''')), '''')) STORED AFTER `reference_number`, ADD KEY `idx_payment_transactions_reference_norm` (`reference_norm`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payment_proof_parts' AND column_name = 'reference_norm') = 0,
  'ALTER TABLE `payment_proof_parts` ADD COLUMN `reference_norm` varchar(100) GENERATED ALWAYS AS (NULLIF(UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`reference_number`, '' '', ''''), ''-'', ''''), ''\t'', ''''), ''\r'', ''''), ''\n'', '''')), '''')) STORED AFTER `reference_number`, ADD KEY `idx_payment_proof_parts_reference_norm` (`reference_norm`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

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

