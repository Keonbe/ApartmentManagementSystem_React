-- ============================================================
-- End-of-tenancy consolidation (audit H6 / M3 / M4) — idempotent migration
-- for existing databases.
--
-- Move-out, contract termination and tenant archiving used to cancel
-- invoices through three different, disagreeing code paths, and
-- restore_tenant.php could not tell which cancelled invoices it was actually
-- responsible for reinstating. invoices.cancel_reason records why an
-- end_tenancy() call cancelled an invoice, so restore only reverses the ones
-- it cancelled itself (not invoices cancelled for an unrelated reason).
--
-- Run: mysql -u root ams_db < backend/api/migrations/2026_09_end_tenancy.sql
-- ============================================================

ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `cancel_reason` varchar(50) DEFAULT NULL AFTER `status`;
