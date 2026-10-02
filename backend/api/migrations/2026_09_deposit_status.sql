-- ============================================================
-- Security deposit status (payments audit, 2026-09-30) — idempotent
-- migration for existing databases. A fresh SetupDB.sql import does not
-- need it. Safe to run more than once.
--
-- Run: mysql -u root ams_db < backend/api/migrations/2026_09_deposit_status.sql
-- ============================================================

-- deposit_status used to default to 'Held' from the moment the draft
-- contract was created at approval — before the tenant paid anything — so
-- the deposit ledger counted unpaid deposits as held. A new contract now
-- starts 'Pending'; settle_invoice() moves it to 'Held' when the move-in
-- invoice (security_deposit > 0) is paid.
--
-- Values: Pending → Held → Applied to Rent | Applied to Bills/Damages
-- (move-out / termination), or Not Collected (terminated before payment).
ALTER TABLE `lease_contracts` MODIFY `deposit_status` varchar(50) DEFAULT 'Pending';

-- Draft contracts whose move-in invoice is not paid yet hold no deposit.
UPDATE `lease_contracts` lc
SET lc.deposit_status = 'Pending'
WHERE lc.status = 'draft' AND lc.deposit_status = 'Held'
  AND NOT EXISTS (SELECT 1 FROM `invoices` i
                  WHERE i.rent_application_id = lc.rent_application_id
                    AND i.security_deposit > 0 AND i.status = 'paid');
