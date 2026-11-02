-- ============================================================
-- 2026_11_cctv_requests.sql
-- CCTV request rework: incident type, and the admin's decision note.
-- Both columns are guarded through information_schema + PREPARE, so this file
-- is safe to re-run, on MySQL 8 and MariaDB, through the mysql client or
-- cron/migrate.php. Both are NULL for requests filed/decided before them.
-- ============================================================

-- ===== 2026_11_cctv_incident_type =====
-- CCTV footage is released for incidents only: the request records what kind of
-- incident it is (cctv_request.php validates it against the configured list).

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'incident_type') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `incident_type` varchar(30) DEFAULT NULL AFTER `location_details`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== 2026_11_cctv_decision_note =====
-- The admin's note on a decision: where and when to view or collect the footage
-- (Approved) or why it was refused (Rejected). Shown to the tenant.

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'decision_note') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `decision_note` text DEFAULT NULL AFTER `status`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
