-- ============================================================
-- 2026_11_parking_slots.sql
-- Parking slots the admin manages one by one (Admin → Parking → Slots), in
-- place of the "max_parking_slots" count and the one global vehicle-type list.
--
--   parking_slots          label, icon, the vehicle types it takes, whether an
--                          OR/CR is required, active | maintenance, archived_at
--                          (removed slots are archived so old reservations keep
--                          their label). parking_reservations.slot_number holds
--                          parking_slots.id: the slots made here get ids 1..N,
--                          so the slot numbers already assigned stay valid.
--   parking_reservations   monthly_fee (fixed when the request is made; 0 =
--                          free parking), plate / transmission / OR/CR may be
--                          empty (an e-bike has no plate; a slot may not need
--                          the OR/CR), and a tenant may hold more than one
--                          reservation (parking_max_per_tenant, checked in PHP).
--   system_settings        parking_free, parking_max_per_tenant,
--                          parking_max_duration_months; max_parking_slots and
--                          parking_allowed_vehicle_types are turned into slots
--                          and removed.
--
-- Every step checks first, so the file is safe to run again (MariaDB / MySQL 8,
-- the mysql client or cron/migrate.php).
-- ============================================================

-- 1. The slots table
CREATE TABLE IF NOT EXISTS `parking_slots` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `label` varchar(20) NOT NULL,
  `icon` varchar(20) NOT NULL DEFAULT 'motorcycle',
  `vehicle_types` varchar(255) NOT NULL DEFAULT '["motorcycle"]',
  `requires_registration` tinyint(1) NOT NULL DEFAULT 1,
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `archived_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `live_label` varchar(20) GENERATED ALWAYS AS (IF(`archived_at` IS NULL, `label`, NULL)) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_live_label` (`live_label`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2. Slots 1..N from the old settings, once (only while the table is empty).
--    N covers any slot number a reservation already uses.
SET @slots_empty := (SELECT COUNT(*) FROM `parking_slots`) = 0;
SET @old_max := COALESCE((SELECT CAST(`setting_value` AS UNSIGNED) FROM `system_settings` WHERE `setting_key` = 'max_parking_slots'), 3);
SET @old_max := LEAST(GREATEST(@old_max, COALESCE((SELECT MAX(`slot_number`) FROM `parking_reservations`), 0), 1), 100);
SET @old_types := LOWER(COALESCE((SELECT `setting_value` FROM `system_settings` WHERE `setting_key` = 'parking_allowed_vehicle_types'), '["motorcycle"]'));
SET @old_types := IF(@old_types LIKE '[%]' AND @old_types <> '[]', @old_types, '["motorcycle"]');
SET @old_icon := CASE
  WHEN @old_types LIKE '%motorcycle%' THEN 'motorcycle'
  WHEN @old_types LIKE '%sedan%' OR @old_types LIKE '%suv%' OR @old_types LIKE '%pickup%' THEN 'car'
  WHEN @old_types LIKE '%van%' THEN 'van'
  WHEN @old_types LIKE '%ebike%' THEN 'ebike'
  ELSE 'motorcycle' END;

INSERT INTO `parking_slots` (`id`, `label`, `icon`, `vehicle_types`, `requires_registration`, `status`, `sort_order`)
SELECT n.n, CAST(n.n AS CHAR), @old_icon, @old_types, 1, 'active', n.n
FROM (SELECT d1.d + d2.d * 10 + 1 AS n
      FROM (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d1
      CROSS JOIN (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d2) n
WHERE @slots_empty AND n.n <= @old_max
ORDER BY n.n;

-- 3. parking_reservations.monthly_fee, filled for existing rows from their total
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND column_name = 'monthly_fee') = 0,
  'ALTER TABLE `parking_reservations` ADD COLUMN `monthly_fee` decimal(10,2) DEFAULT NULL AFTER `total_cost`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

UPDATE `parking_reservations` SET `monthly_fee` = ROUND(`total_cost` / `duration_months`, 2)
WHERE `monthly_fee` IS NULL AND `duration_months` > 0;

-- 4. Plate, transmission and OR/CR may be empty
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND column_name = 'plate_number' AND is_nullable = 'NO') = 1,
  'ALTER TABLE `parking_reservations` MODIFY `plate_number` varchar(20) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND column_name = 'transmission' AND is_nullable = 'NO') = 1,
  'ALTER TABLE `parking_reservations` MODIFY `transmission` varchar(50) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND column_name = 'document_path' AND is_nullable = 'NO') = 1,
  'ALTER TABLE `parking_reservations` MODIFY `document_path` varchar(255) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- 5. More than one reservation per tenant: drop the one-open-per-tenant key
SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND index_name = 'uniq_open_user') > 0,
  'ALTER TABLE `parking_reservations` DROP INDEX `uniq_open_user`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND column_name = 'open_user') > 0,
  'ALTER TABLE `parking_reservations` DROP COLUMN `open_user`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- 6. Settings: the new ones, and the two the slots replace
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('parking_free', '0'),
('parking_max_per_tenant', '1'),
('parking_max_duration_months', '6');

DELETE FROM `system_settings` WHERE `setting_key` IN ('max_parking_slots', 'parking_allowed_vehicle_types');
