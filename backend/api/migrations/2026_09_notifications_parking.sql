-- ============================================================
-- Notifications & automation (Module 6), parking reservation (Module 10) and
-- activity-log coverage (8.6) — idempotent migration for existing databases.
-- A fresh SetupDB.sql import does not need it. Safe to run more than once.
--
-- Run: mysql -u root ams_db < backend/api/migrations/2026_09_notifications_parking.sql
-- ============================================================

-- ── 1. Notifications ─────────────────────────────────────────
-- The admin action queue and every inbox query filter on these columns.
ALTER TABLE `notifications` ADD INDEX IF NOT EXISTS `idx_type_status` (`type`, `status`);
ALTER TABLE `notifications` ADD INDEX IF NOT EXISTS `idx_user_read` (`user_id`, `is_read`);

-- Informational rows (announcements, billing, reminders, visitor notices) were
-- written with the column default 'Pending', which made them look like open
-- requests: a tenant's "Clear all" skipped them. Only the admin action queue and a
-- tenant's own open occupancy/lease requests are genuinely Pending.
UPDATE `notifications`
SET `status` = 'Resolved'
WHERE (`status` = 'Pending' OR `status` IS NULL OR `status` IN ('Active', 'Approved'))
  AND `type` NOT IN ('rent_application', 'maintenance_request', 'cctv_request', 'parking_reservation',
                     'service_request', 'inquiry', 'occupancy_request', 'lease_extension_request',
                     'payment_verification');

-- Queue rows whose request was already decided before resolve_admin_queue() existed.
UPDATE `notifications` n
SET n.`status` = 'Resolved', n.`is_read` = 1
WHERE n.`status` = 'Pending'
  AND n.`type` IN ('rent_application', 'maintenance_request', 'cctv_request', 'parking_reservation', 'inquiry')
  AND n.`user_id` IN (SELECT `id` FROM `users` WHERE `role` = 'admin')
  AND (
        (n.`type` = 'rent_application'    AND NOT EXISTS (SELECT 1 FROM `rent_applications` WHERE `status` = 'Pending Review'))
     OR (n.`type` = 'maintenance_request' AND NOT EXISTS (SELECT 1 FROM `maintenance_requests` WHERE `status` = 'Pending'))
     OR (n.`type` = 'cctv_request'        AND NOT EXISTS (SELECT 1 FROM `cctv_requests` WHERE `status` = 'Pending'))
     OR (n.`type` = 'parking_reservation' AND NOT EXISTS (SELECT 1 FROM `parking_reservations` WHERE `status` = 'Pending'))
     OR (n.`type` = 'inquiry'             AND NOT EXISTS (SELECT 1 FROM `inquiries` WHERE `status` = 'New'))
  );

-- Per-category in-app opt-outs (checklist 6.8). No row = enabled.
CREATE TABLE IF NOT EXISTS `notification_preferences` (
  `user_id` int(11) NOT NULL,
  `category` varchar(40) NOT NULL,
  `in_app_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`, `category`),
  CONSTRAINT `fk_notif_pref_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ── 2. Parking ───────────────────────────────────────────────
ALTER TABLE `parking_reservations` ADD COLUMN IF NOT EXISTS `slot_number` int(11) DEFAULT NULL AFTER `status`;
ALTER TABLE `parking_reservations` ADD COLUMN IF NOT EXISTS `assigned_at` datetime DEFAULT NULL AFTER `slot_number`;
ALTER TABLE `parking_reservations` ADD COLUMN IF NOT EXISTS `released_at` datetime DEFAULT NULL AFTER `assigned_at`;
ALTER TABLE `parking_reservations` ADD COLUMN IF NOT EXISTS `release_reason` varchar(255) DEFAULT NULL AFTER `released_at`;
ALTER TABLE `parking_reservations` ADD COLUMN IF NOT EXISTS `rejection_reason` varchar(255) DEFAULT NULL AFTER `release_reason`;

-- 'Approved' and 'Active' were accepted or counted but mean the same as Assigned.
UPDATE `parking_reservations` SET `status` = 'Assigned' WHERE `status` IN ('Approved', 'Active');
UPDATE `parking_reservations` SET `assigned_at` = `created_at` WHERE `status` = 'Assigned' AND `assigned_at` IS NULL;

-- A tenant could hold several open reservations. Keep each tenant's newest open
-- row and cancel the rest, so the one-open-reservation key below can be added.
UPDATE `parking_reservations` p
JOIN (
    SELECT `user_id`, MAX(`id`) AS keep_id
    FROM `parking_reservations`
    WHERE `status` IN ('Pending', 'Assigned')
    GROUP BY `user_id`
    HAVING COUNT(*) > 1
) d ON d.`user_id` = p.`user_id`
SET p.`status` = 'Cancelled', p.`released_at` = NOW(), p.`release_reason` = 'Duplicate open reservation closed by migration'
WHERE p.`status` IN ('Pending', 'Assigned') AND p.`id` <> d.keep_id;

-- Give existing Assigned rows slots 1..n in the order they were assigned.
SET @slot := (SELECT COALESCE(MAX(`slot_number`), 0) FROM `parking_reservations` WHERE `status` = 'Assigned');
UPDATE `parking_reservations`
SET `slot_number` = (@slot := @slot + 1)
WHERE `status` = 'Assigned' AND `slot_number` IS NULL
ORDER BY `assigned_at`, `id`;

-- The database itself refuses two active reservations on one slot, and two open
-- reservations for one tenant — so a race between two requests cannot slip past
-- the application checks.
ALTER TABLE `parking_reservations`
  ADD COLUMN IF NOT EXISTS `active_slot` int(11) AS (IF(`status` = 'Assigned', `slot_number`, NULL)) PERSISTENT;
ALTER TABLE `parking_reservations`
  ADD COLUMN IF NOT EXISTS `open_user` int(11) AS (IF(`status` IN ('Pending', 'Assigned'), `user_id`, NULL)) PERSISTENT;
ALTER TABLE `parking_reservations` ADD UNIQUE INDEX IF NOT EXISTS `uniq_active_slot` (`active_slot`);
ALTER TABLE `parking_reservations` ADD UNIQUE INDEX IF NOT EXISTS `uniq_open_user` (`open_user`);

-- One row per reservation per billed month. Inserting the row is the claim, so the
-- same month can never be billed twice (manual button, auto sweep, or both).
CREATE TABLE IF NOT EXISTS `parking_charges` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `reservation_id` int(11) NOT NULL,
  `billing_period` char(7) NOT NULL,
  `invoice_id` varchar(50) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_reservation_period` (`reservation_id`, `billing_period`),
  CONSTRAINT `fk_parking_charge_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `parking_reservations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ── 3. Activity log ──────────────────────────────────────────
ALTER TABLE `activity_logs` ADD INDEX IF NOT EXISTS `idx_created` (`created_at`);
ALTER TABLE `activity_logs` ADD INDEX IF NOT EXISTS `idx_category` (`category`);

-- Contract actions were filed under 'tenant', room updates under 'system'.
UPDATE `activity_logs` SET `category` = 'contract'
WHERE `category` = 'tenant'
  AND `action` IN ('Created Contract', 'Activated Contract', 'Updated Contract Status', 'Flagged Eviction',
                   'Cleared Eviction Flag', 'Uploaded Lease Document', 'Deleted Lease Document', 'Expired Contracts');
UPDATE `activity_logs` SET `category` = 'unit' WHERE `category` = 'system' AND `action` IN ('Updated Room', 'Update Room', 'Updated Unit');

-- snake_case action names → Title Case, matching every other entry.
UPDATE `activity_logs` SET `action` = CASE `action`
    WHEN 'create'          THEN 'Created Invoice'
    WHEN 'record_reading'  THEN 'Recorded Utility Reading'
    WHEN 'delete_reading'  THEN 'Deleted Utility Reading'
    WHEN 'sync_invoice'    THEN 'Synced Utility Charges'
    WHEN 'batch_reminder'  THEN 'Sent Payment Reminders'
    WHEN 'send_reminder'   THEN 'Sent Payment Reminder'
    ELSE `action` END
WHERE `action` IN ('create', 'record_reading', 'delete_reading', 'sync_invoice', 'batch_reminder', 'send_reminder');

-- ── 4. Settings ──────────────────────────────────────────────
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('parking_monthly_fee', '300'),
('parking_billing_mode', 'manual'),
('notification_sweep_last_run', '2000-01-01');
