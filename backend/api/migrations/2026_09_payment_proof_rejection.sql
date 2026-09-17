-- ============================================================
-- Payment proof rejection (audit C3) — idempotent migration for existing databases.
--
-- pay_bill.php used to move any non-cash invoice to 'pending-verification'
-- with no proof and no way out except recording the payment outright. There
-- was also no admin action to reject a bogus/insufficient proof, so a stuck
-- invoice had nowhere to go. reject_payment_proof.php now records why a
-- proof was rejected before returning the invoice to 'overdue' or 'pending'.
--
-- Run: mysql -u root ams_db < backend/api/migrations/2026_09_payment_proof_rejection.sql
-- ============================================================

ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `proof_rejection_reason` varchar(255) DEFAULT NULL AFTER `proof_of_payment_path`;
