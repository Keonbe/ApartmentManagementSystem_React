-- ============================================================
-- 2026_10_announcement_attachment.sql
-- announcements.attachment_path: the file an admin attached when sending.
-- The tenants' copies live on notifications.attachment_path; this lets the
-- admin's history show that a file went out and open it.
-- Guarded on information_schema, so it does nothing where the column exists.
-- ============================================================
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'announcements' AND column_name = 'attachment_path') = 0,
  'ALTER TABLE `announcements` ADD COLUMN `attachment_path` varchar(255) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- Announcements sent before the column existed: their tenants' notifications
-- already carry the file, so copy it back (same title, created in the same
-- moment). Only fills rows that are still empty.
UPDATE `announcements` a
SET a.`attachment_path` = (
  SELECT n.`attachment_path` FROM `notifications` n
  WHERE n.`title` = a.`title` AND n.`attachment_path` IS NOT NULL
    AND ABS(TIMESTAMPDIFF(SECOND, n.`created_at`, a.`created_at`)) <= 5
  LIMIT 1)
WHERE a.`attachment_path` IS NULL;
