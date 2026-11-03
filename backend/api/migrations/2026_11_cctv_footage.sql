-- ============================================================
-- 2026_11_cctv_footage.sql
-- Footage the admin hands to the tenant on an Approved CCTV request: a stored
-- clip (footage_path) or a private link (footage_url), available until
-- footage_expires_at. After expiry the path and link are cleared but the date
-- stays, so My Requests can say the footage expired.
--
-- Guarded through information_schema + PREPARE, so it is safe to re-run.
-- ============================================================

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'footage_path') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `footage_path` varchar(255) DEFAULT NULL AFTER `decision_note`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'footage_url') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `footage_url` varchar(500) DEFAULT NULL AFTER `footage_path`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'footage_attached_at') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `footage_attached_at` datetime DEFAULT NULL AFTER `footage_url`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'footage_expires_at') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `footage_expires_at` datetime DEFAULT NULL AFTER `footage_attached_at`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
