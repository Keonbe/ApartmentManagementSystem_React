-- ============================================================
-- Contract & Document Generation (Module 9) and Visitor Management
-- (Module 12) — idempotent migration for existing databases.
-- A fresh SetupDB.sql import does not need it. Safe to run more than once.
--
-- Run: mysql -u root ams_db < backend/api/migrations/2026_09_contracts_visitors.sql
-- ============================================================

-- ── 1. Contracts ─────────────────────────────────────────────
-- Termination (new update_contract_status.php action) needs its own reason
-- and timestamp, distinct from the move-out settlement fields already on
-- this table (deposit_status/damage_deduction/etc., which only apply to a
-- voluntary end-of-lease move-out).
ALTER TABLE `lease_contracts` ADD COLUMN IF NOT EXISTS `termination_reason` text DEFAULT NULL AFTER `eviction_status`;
ALTER TABLE `lease_contracts` ADD COLUMN IF NOT EXISTS `terminated_at` datetime DEFAULT NULL AFTER `termination_reason`;

-- Claim column for the once-per-contract lease-end reminder sent by the
-- daily sweep (run_notification_sweep() -> send_lease_end_reminders()).
ALTER TABLE `lease_contracts` ADD COLUMN IF NOT EXISTS `renewal_reminder_sent_at` datetime DEFAULT NULL AFTER `terminated_at`;

-- create_contract.php never checked for an existing contract before
-- inserting, so the admin "Generate Contract" button could create a second
-- lease_contracts row for an application that already had one; every
-- consumer query (get_contracts.php, my_room.php, get_rooms.php) then joins
-- with LIMIT 1 and picks between the two arbitrarily. One contract per
-- application, enforced at the database.
ALTER TABLE `lease_contracts` ADD UNIQUE INDEX IF NOT EXISTS `uniq_contract_app` (`rent_application_id`);

-- ── 2. Visitors ──────────────────────────────────────────────
-- Expected arrival time for a tenant's pre-registration (checked at
-- check-in-time approval, distinct from check_in_at which is stamped only
-- when the visitor is actually approved/admitted).
ALTER TABLE `visitor_logs` ADD COLUMN IF NOT EXISTS `expected_at` datetime DEFAULT NULL AFTER `check_in_at`;

-- Claim column so the overstay alert (alert_overstayed_visitors(), called
-- from get_notifications.php on every poll) fires exactly once per visit
-- instead of re-notifying on every subsequent page load.
ALTER TABLE `visitor_logs` ADD COLUMN IF NOT EXISTS `overstay_alerted_at` datetime DEFAULT NULL AFTER `checkout_notes`;

-- A tenant can now cancel their own pending pre-registration, and a
-- moved-out/archived tenant's pending registrations are auto-cancelled
-- (cancel_user_visitor_registrations(), called next to release_user_parking()).
ALTER TABLE `visitor_logs` MODIFY COLUMN `status`
  enum('pending_approval','checked_in','checked_out','overstayed','denied','cancelled')
  NOT NULL DEFAULT 'pending_approval';

-- ── 3. Settings ──────────────────────────────────────────────
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('lease_end_reminder_days', '30');
