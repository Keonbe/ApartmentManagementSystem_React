-- ============================================================
-- Rent periods and advance payments (panel feedback 2026-09-26) — idempotent
-- migration for existing databases.
--
-- Rent is now billed per tenancy month, anchored on the lease start
-- (generate_due_rent_invoices() in config.php, run by the daily sweep), and a
-- tenant can prepay several months at once, each month still getting its own
-- invoice and receipt.
--
--   rent_period_start  the first day of the tenancy month a rent invoice bills
--                      (NULL on non-rent invoices and on older rows)
--   rent_period_key    rent_period_start, except NULL once the invoice is
--                      cancelled, so a cancelled month can be billed again
--   payment_group      'ADV-…' on the invoices of one advance payment, which
--                      are paid together
--
-- The unique key on (user_id, rent_period_key) makes billing a month
-- claim-first: no two writers can create the same tenancy month twice.
--
-- Also fixes the move-in invoice, which stored billing_period as 'YYYY-MM'
-- while every other writer uses 'Month YYYY', and marks it as tenancy month 0.
--
-- Run: mysql -u root ams_db < backend/api/migrations/2026_09_rent_periods_advance.sql
-- ============================================================

ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `rent_period_start` date DEFAULT NULL AFTER `billing_period`;
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `rent_period_key` date GENERATED ALWAYS AS (IF(`status` = 'cancelled', NULL, `rent_period_start`)) STORED AFTER `rent_period_start`;
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `payment_group` varchar(40) DEFAULT NULL AFTER `rent_period_key`;
ALTER TABLE `invoices` ADD UNIQUE KEY IF NOT EXISTS `uq_invoice_rent_period` (`user_id`, `rent_period_key`);
ALTER TABLE `invoices` ADD KEY IF NOT EXISTS `idx_invoice_payment_group` (`payment_group`);

-- Move-in invoices: 'YYYY-MM' → 'Month YYYY'.
UPDATE `invoices`
   SET `billing_period` = DATE_FORMAT(STR_TO_DATE(CONCAT(`billing_period`, '-01'), '%Y-%m-%d'), '%M %Y')
 WHERE `billing_period` REGEXP '^[0-9]{4}-[0-9]{2}$';

-- Move-in invoices are tenancy month 0 (settle_invoice() moves it to the
-- payment date when the move-in is paid). IGNORE skips a row that would
-- collide with a month already marked.
UPDATE IGNORE `invoices` i
  JOIN `lease_contracts` lc ON lc.rent_application_id = i.rent_application_id
   SET i.rent_period_start = lc.lease_start
 WHERE i.security_deposit > 0 AND i.rent_period_start IS NULL AND lc.lease_start IS NOT NULL;
