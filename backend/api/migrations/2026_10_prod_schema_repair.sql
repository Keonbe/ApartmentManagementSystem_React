-- ============================================================
-- 2026_10_prod_schema_repair.sql
-- Finishes migrations that schema_migrations records as applied but that
-- only partly ran on MySQL 8 (prod dump, 2026-10-03). cron/migrate.php strips
-- "IF NOT EXISTS" and sends each file through multi_query(); the first
-- "duplicate column" error (1060) stops the server from running the rest of
-- that file, and the runner still records the file as applied. Prod was left
-- without these columns/indexes, so e.g. get_invoices.php fails with
-- "Unknown column 'rent_period_start'" (HTTP 500).
--
-- Every change checks information_schema first and runs through a prepared
-- statement, so no statement here can fail on a database that already has
-- it: safe on MySQL 8 and MariaDB, through the mysql client or the runner,
-- and safe to re-run. The data backfills repeat the skipped parts of the
-- original migrations; each is idempotent on its own.
-- ============================================================

-- 1. Missing columns
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'maintenance') = 0,
  'ALTER TABLE `invoices` ADD COLUMN `maintenance` decimal(10,2) NOT NULL DEFAULT 0.00', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'rent_period_start') = 0,
  'ALTER TABLE `invoices` ADD COLUMN `rent_period_start` date DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'rent_period_key') = 0,
  'ALTER TABLE `invoices` ADD COLUMN `rent_period_key` date GENERATED ALWAYS AS (IF(`status` = ''cancelled'', NULL, `rent_period_start`)) STORED', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'payment_group') = 0,
  'ALTER TABLE `invoices` ADD COLUMN `payment_group` varchar(40) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'advance_months') = 0,
  'ALTER TABLE `invoices` ADD COLUMN `advance_months` tinyint(4) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_contracts' AND column_name = 'template_version_id') = 0,
  'ALTER TABLE `lease_contracts` ADD COLUMN `template_version_id` int(11) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'maintenance_requests' AND column_name = 'is_invoiced') = 0,
  'ALTER TABLE `maintenance_requests` ADD COLUMN `is_invoiced` tinyint(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'maintenance_requests' AND column_name = 'invoice_id') = 0,
  'ALTER TABLE `maintenance_requests` ADD COLUMN `invoice_id` varchar(50) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'maintenance_requests' AND column_name = 'billing_period') = 0,
  'ALTER TABLE `maintenance_requests` ADD COLUMN `billing_period` varchar(50) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notification_log' AND column_name = 'provider_message_id') = 0,
  'ALTER TABLE `notification_log` ADD COLUMN `provider_message_id` varchar(64) DEFAULT NULL COMMENT ''Semaphore message_id''', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notification_log' AND column_name = 'provider_status') = 0,
  'ALTER TABLE `notification_log` ADD COLUMN `provider_status` varchar(20) DEFAULT NULL COMMENT ''status Semaphore returned at send time''', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notifications' AND column_name = 'audience') = 0,
  'ALTER TABLE `notifications` ADD COLUMN `audience` varchar(20) NOT NULL DEFAULT ''tenant''', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rooms' AND column_name = 'gallery') = 0,
  'ALTER TABLE `rooms` ADD COLUMN `gallery` JSON DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rooms' AND column_name = 'archived_at') = 0,
  'ALTER TABLE `rooms` ADD COLUMN `archived_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rooms' AND column_name = 'archived_by') = 0,
  'ALTER TABLE `rooms` ADD COLUMN `archived_by` int(11) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'sms_consent_at') = 0,
  'ALTER TABLE `users` ADD COLUMN `sms_consent_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- 2. Missing indexes (the unique key goes on before the rent-period backfill,
--    as in 2026_09_rent_periods_advance.sql, so UPDATE IGNORE skips collisions)
SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'invoices' AND index_name = 'uq_invoice_rent_period') = 0,
  'ALTER TABLE `invoices` ADD UNIQUE KEY `uq_invoice_rent_period` (`user_id`, `rent_period_key`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'invoices' AND index_name = 'idx_invoice_payment_group') = 0,
  'ALTER TABLE `invoices` ADD KEY `idx_invoice_payment_group` (`payment_group`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'maintenance_requests' AND index_name = 'idx_maint_invoiced') = 0,
  'ALTER TABLE `maintenance_requests` ADD INDEX `idx_maint_invoiced` (`is_invoiced`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'notification_log' AND index_name = 'idx_log_provider_msg') = 0,
  'ALTER TABLE `notification_log` ADD INDEX `idx_log_provider_msg` (`provider_message_id`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- 3. Skipped data backfills
-- 2026_09_rent_periods_advance.sql: move-in invoices 'YYYY-MM' -> 'Month YYYY',
-- and they are tenancy month 0.
UPDATE `invoices`
   SET `billing_period` = DATE_FORMAT(STR_TO_DATE(CONCAT(`billing_period`, '-01'), '%Y-%m-%d'), '%M %Y')
 WHERE `billing_period` REGEXP '^[0-9]{4}-[0-9]{2}$';

UPDATE IGNORE `invoices` i
  JOIN `lease_contracts` lc ON lc.rent_application_id = i.rent_application_id
   SET i.rent_period_start = lc.lease_start
 WHERE i.security_deposit > 0 AND i.rent_period_start IS NULL AND lc.lease_start IS NOT NULL;

-- 2026_09_deposit_status.sql: a draft contract's deposit is 'Pending' until
-- the move-in invoice is paid.
ALTER TABLE `lease_contracts` MODIFY `deposit_status` varchar(50) DEFAULT 'Pending';
UPDATE `lease_contracts` lc
SET lc.deposit_status = 'Pending'
WHERE lc.status = 'draft' AND lc.deposit_status = 'Held'
  AND NOT EXISTS (SELECT 1 FROM `invoices` i
                  WHERE i.rent_application_id = lc.rent_application_id
                    AND i.security_deposit > 0 AND i.status = 'paid');

-- 2026_10_rent_wording.sql (also covers the snake_case copy of the clause
-- that the settings page writes)
UPDATE `system_settings`
   SET `setting_value` = REPLACE(REPLACE(`setting_value`, 'this lease agreement', 'this rent agreement'), 'the leased unit', 'the rented unit')
 WHERE `setting_key` IN ('tenantResponsibilityClause', 'tenant_responsibility_clause')
   AND `setting_value` = '"Per the Terms & Conditions of this lease agreement, the Tenant shall be responsible for any damage or maintenance issues caused by negligence, misuse, or unauthorized modifications to the leased unit. Costs for such repairs will be billed directly to the Tenant and are excluded from the building''s maintenance budget allocation."';
UPDATE `rent_applications` SET `archive_reason` = 'End of Rent Term' WHERE `archive_reason` = 'End of Lease';
