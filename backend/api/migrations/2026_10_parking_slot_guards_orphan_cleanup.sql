-- ============================================================
-- 2026_10_parking_slot_guards_orphan_cleanup.sql
-- 1. parking_reservations.active_slot / open_user: the generated columns
--    behind "one active reservation per slot" and "one open request per
--    tenant". SetupDB.sql declared them with MariaDB's PERSISTENT keyword,
--    which MySQL 8 rejects, so prod (MySQL 8.4) never got them. GENERATED
--    ALWAYS AS (...) VIRTUAL works on both. Not STORED: MySQL 8 refuses a
--    stored generated column over user_id, whose FK is ON DELETE CASCADE
--    (error 1215); virtual columns are exempt and can still be unique-indexed.
-- 2. Rows that point at an invoice that no longer exists (prod dump
--    2026-10-27: invoices empty while payment_transactions, parking_charges
--    still reference it). Source rows that can be billed again are unlinked;
--    pure ledger rows of a missing invoice are deleted. A no-op wherever
--    every reference resolves, so safe after the invoices are restored.
--
-- Every change checks information_schema / the data first and runs through
-- a prepared statement: safe on MySQL 8 and MariaDB, through the mysql
-- client or cron/migrate.php, and safe to re-run.
-- ============================================================

-- 1. parking_reservations guard columns
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND column_name = 'active_slot') = 0,
  'ALTER TABLE `parking_reservations` ADD COLUMN `active_slot` int GENERATED ALWAYS AS (IF(`status` = ''Assigned'', `slot_number`, NULL)) VIRTUAL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND column_name = 'open_user') = 0,
  'ALTER TABLE `parking_reservations` ADD COLUMN `open_user` int GENERATED ALWAYS AS (IF(`status` IN (''Pending'', ''Assigned''), `user_id`, NULL)) VIRTUAL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- The unique keys are added only when existing rows already satisfy them,
-- so the migration can never fail on data that broke the rule earlier.
SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND index_name = 'uniq_active_slot') = 0
    AND (SELECT COUNT(*) FROM (SELECT 1 FROM `parking_reservations` WHERE `status` = 'Assigned' AND `slot_number` IS NOT NULL GROUP BY `slot_number` HAVING COUNT(*) > 1) d) = 0,
  'ALTER TABLE `parking_reservations` ADD UNIQUE KEY `uniq_active_slot` (`active_slot`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND index_name = 'uniq_open_user') = 0
    AND (SELECT COUNT(*) FROM (SELECT 1 FROM `parking_reservations` WHERE `status` IN ('Pending', 'Assigned') AND `user_id` IS NOT NULL GROUP BY `user_id` HAVING COUNT(*) > 1) d) = 0,
  'ALTER TABLE `parking_reservations` ADD UNIQUE KEY `uniq_open_user` (`open_user`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- 2. Rows whose invoice is gone
-- Ledger rows of a missing invoice carry no meaning without it.
DELETE FROM `payment_transactions` WHERE NOT EXISTS (SELECT 1 FROM `invoices` i WHERE i.id = `payment_transactions`.invoice_id);
DELETE FROM `invoice_adjustments` WHERE NOT EXISTS (SELECT 1 FROM `invoices` i WHERE i.id = `invoice_adjustments`.invoice_id);
DELETE FROM `parking_charges` WHERE `invoice_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `invoices` i WHERE i.id = `parking_charges`.invoice_id);
-- A split-payment part is keyed by an invoice id or an advance payment group.
DELETE FROM `payment_proof_parts` WHERE NOT EXISTS (SELECT 1 FROM `invoices` i WHERE i.id = `payment_proof_parts`.payment_key OR i.payment_group = `payment_proof_parts`.payment_key);

-- Billable source rows stay, and go back to "not yet invoiced".
UPDATE `utility_readings` SET `is_invoiced` = 0, `invoice_id` = NULL
 WHERE `invoice_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `invoices` i WHERE i.id = `utility_readings`.invoice_id);
UPDATE `service_requests` SET `is_invoiced` = 0, `invoice_id` = NULL
 WHERE `invoice_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `invoices` i WHERE i.id = `service_requests`.invoice_id);
UPDATE `maintenance_requests` SET `is_invoiced` = 0, `invoice_id` = NULL
 WHERE `invoice_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `invoices` i WHERE i.id = `maintenance_requests`.invoice_id);
