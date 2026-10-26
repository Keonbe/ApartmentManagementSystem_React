-- Payment transaction ledger and originating-bank metadata.
-- Invoice identifiers are varchar(50) values (e.g. INV-...), so invoice_id
-- uses the same type to retain a real foreign key.

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
  CONSTRAINT `fk_payment_transactions_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE,
  KEY `idx_payment_transactions_recorder` (`recorded_by`),
  CONSTRAINT `fk_payment_transactions_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Added only when missing (information_schema guard), so a re-run, or a run
-- on a database built from SetupDB.sql, does not stop on error 1060.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'bank_name') = 0,
  'ALTER TABLE `invoices` ADD COLUMN `bank_name` varchar(100) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- Preserve historical payment data as one ledger row per paid invoice.
INSERT INTO `payment_transactions`
  (`invoice_id`, `amount`, `payment_method`, `bank_name`, `reference_number`, `created_at`)
SELECT i.`id`, i.`total_amount`,
       CASE
         WHEN LOWER(COALESCE(i.`payment_method`, '')) REGEXP 'cash|in.person' THEN 'cash'
         WHEN LOWER(COALESCE(i.`payment_method`, '')) LIKE '%gcash%' THEN 'gcash'
         WHEN LOWER(COALESCE(i.`payment_method`, '')) REGEXP 'bank|bdo|bpi|metrobank|landbank|rcbc|unionbank|security bank' THEN 'bank_transfer'
         WHEN LOWER(COALESCE(i.`payment_method`, '')) REGEXP 'card|credit' THEN 'credit_card'
         ELSE LOWER(COALESCE(NULLIF(i.`payment_method`, ''), NULLIF(i.`payment_gateway`, ''), 'other'))
       END,
       CASE
         WHEN UPPER(COALESCE(i.`payment_method`, '')) LIKE '%BDO%' THEN 'BDO'
         WHEN UPPER(COALESCE(i.`payment_method`, '')) LIKE '%BPI%' THEN 'BPI'
         WHEN UPPER(COALESCE(i.`payment_method`, '')) LIKE '%METROBANK%' THEN 'Metrobank'
         WHEN UPPER(COALESCE(i.`payment_method`, '')) LIKE '%LANDBANK%' THEN 'Landbank'
         WHEN UPPER(COALESCE(i.`payment_method`, '')) LIKE '%RCBC%' THEN 'RCBC'
         WHEN UPPER(COALESCE(i.`payment_method`, '')) LIKE '%UNIONBANK%' THEN 'UnionBank'
         WHEN UPPER(COALESCE(i.`payment_method`, '')) LIKE '%SECURITY BANK%' THEN 'Security Bank'
         ELSE i.`bank_name`
       END,
       i.`payment_reference`, COALESCE(i.`paid_at`, i.`created_at`)
FROM `invoices` i
WHERE i.`status` = 'paid'
  AND i.`id` NOT IN (SELECT pt.`invoice_id` FROM `payment_transactions` pt);