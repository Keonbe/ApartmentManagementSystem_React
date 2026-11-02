-- ============================================================
-- 2026_11_invoiced_amount.sql
-- The amount a service / maintenance request put on its invoice, stored at the
-- moment of posting (parking_charges.amount already does this). Reversing a
-- charge used to subtract the request's CURRENT cost, which backs out the wrong
-- amount when the cost was edited after billing.
--
-- Guarded through information_schema + PREPARE, so it is safe to re-run, on
-- MySQL 8 and MariaDB, through the mysql client or cron/migrate.php.
-- ============================================================

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'service_requests' AND column_name = 'invoiced_amount') = 0,
  'ALTER TABLE `service_requests` ADD COLUMN `invoiced_amount` decimal(10,2) DEFAULT NULL AFTER `billing_period`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'maintenance_requests' AND column_name = 'invoiced_amount') = 0,
  'ALTER TABLE `maintenance_requests` ADD COLUMN `invoiced_amount` decimal(10,2) DEFAULT NULL AFTER `billing_period`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- Rows already on an invoice: the best known amount is the current cost.
UPDATE `service_requests` SET `invoiced_amount` = `total_cost`
 WHERE `is_invoiced` = 1 AND `invoice_id` IS NOT NULL AND `invoiced_amount` IS NULL;
UPDATE `maintenance_requests` SET `invoiced_amount` = COALESCE(`actual_cost`, `estimated_cost`, 0)
 WHERE `is_invoiced` = 1 AND `invoice_id` IS NOT NULL AND `invoiced_amount` IS NULL;
