-- ============================================================
-- Audit Phase 4 — billing integrity (H8, H9, M12, H10, M8). Idempotent
-- migration for existing databases.
--
-- H10 needs somewhere to post a tenant-caused repair charge without mixing
-- it into "services" (add-on bookings) in the Reports revenue breakdown, so
-- invoices gets its own `maintenance` column, accumulated the same way
-- `services` already is (never overwritten — see post_service_charge()).
--
-- maintenance_requests gets the same claim-first billing columns
-- service_requests already has (is_invoiced / invoice_id / billing_period),
-- so post_maintenance_charge()/reverse_maintenance_charge() can claim a
-- ticket exactly once before any money moves.
--
-- Run: mysql -u root ams_db < backend/api/migrations/2026_09_billing_integrity.sql
-- ============================================================

ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `maintenance` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `services`;

ALTER TABLE `maintenance_requests` ADD COLUMN IF NOT EXISTS `is_invoiced` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `maintenance_requests` ADD COLUMN IF NOT EXISTS `invoice_id` varchar(50) DEFAULT NULL;
ALTER TABLE `maintenance_requests` ADD COLUMN IF NOT EXISTS `billing_period` varchar(50) DEFAULT NULL;

ALTER TABLE `maintenance_requests` ADD INDEX IF NOT EXISTS `idx_maint_invoiced` (`is_invoiced`);
