-- ============================================================
-- SEED RESET SCRIPT — ams_db
-- Wipes ONLY mock data inserted by seed_mock_data.sql.
-- Preserves: admin user (id=1), rooms schema, system_settings.
-- Safe to run before re-seeding.
-- ============================================================

USE ams_db;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Remove mock invoices (all INV- prefixed IDs from seed)
DELETE FROM `invoices` WHERE `id` LIKE 'INV-2025%-2'
   OR `id` LIKE 'INV-2025%-3'
   OR `id` LIKE 'INV-2025%-4'
   OR `id` LIKE 'INV-2025%-5'
   OR `id` LIKE 'INV-2025%-6'
   OR `id` LIKE 'INV-2025%-7'
   OR `id` LIKE 'INV-2025%-8'
   OR `id` LIKE 'INV-2026%-2'
   OR `id` LIKE 'INV-2026%-3'
   OR `id` LIKE 'INV-2026%-4'
   OR `id` LIKE 'INV-2026%-5'
   OR `id` LIKE 'INV-2026%-6'
   OR `id` LIKE 'INV-2026%-7'
   OR `id` LIKE 'INV-2026%-8';

-- 2. Remove mock lease contracts
DELETE FROM `lease_contracts` WHERE `id` IN ('LC-0001','LC-0002','LC-0003','LC-0004','LC-0005');

-- 3. Remove mock rent applications (ids 1–10)
DELETE FROM `rent_applications` WHERE `id` BETWEEN 1 AND 10;

-- 4. Remove mock maintenance requests (user_id 2–9)
DELETE FROM `maintenance_requests` WHERE `user_id` BETWEEN 2 AND 9;

-- 5. Remove mock parking reservations (user_id 2–9)
DELETE FROM `parking_reservations` WHERE `user_id` BETWEEN 2 AND 9;

-- 6. Remove mock CCTV requests (user_id 2–9)
DELETE FROM `cctv_requests` WHERE `user_id` BETWEEN 2 AND 9;

-- 7. Remove mock notifications (user_id 2–9)
DELETE FROM `notifications` WHERE `user_id` BETWEEN 2 AND 9;

-- 8. Remove mock announcements (5 seed announcements by title)
DELETE FROM `announcements` WHERE `title` IN (
  'Scheduled Water Interruption – February 8, 2025',
  'Monthly Rent Due – March 15, 2025',
  'Updated Building Rules – No Smoking Policy',
  'Elevator Inspection – May 20, 2025',
  'Year-End Reminders & Holiday Schedule'
);

-- 9. Remove mock activity logs (performed_by = 1, created 2025-2026)
DELETE FROM `activity_logs`
WHERE `performed_by` = 1
  AND `created_at` BETWEEN '2025-01-01 00:00:00' AND '2026-12-31 23:59:59';

-- 10. Remove mock tenant users (ids 2–9)
DELETE FROM `users` WHERE `id` BETWEEN 2 AND 9;

-- 11. Reset rooms back to vacant
UPDATE `rooms` SET
  `status` = 'vacant',
  `tenant_name` = NULL,
  `lease_start` = NULL,
  `lease_end` = NULL,
  `occupants` = 0,
  `maintenance_flag` = 0
WHERE `id` IN ('D','G','H','K','L','M','N','E','I');

-- 12. Reset AUTO_INCREMENT counters for clean re-seed
ALTER TABLE `users`                 AUTO_INCREMENT = 2;
ALTER TABLE `rent_applications`     AUTO_INCREMENT = 1;
ALTER TABLE `maintenance_requests`  AUTO_INCREMENT = 1;
ALTER TABLE `parking_reservations`  AUTO_INCREMENT = 1;
ALTER TABLE `cctv_requests`         AUTO_INCREMENT = 1;
ALTER TABLE `notifications`         AUTO_INCREMENT = 1;
ALTER TABLE `announcements`         AUTO_INCREMENT = 1;
ALTER TABLE `activity_logs`         AUTO_INCREMENT = 1;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- Reset complete. DB now contains only:
--   admin user (id=1, admin@gmail.com)
--   14 vacant rooms (as per SetupDB.sql)
--   system_settings
-- ============================================================
