-- ============================================================
-- 2026_10_guest_chat_links.sql
-- Guest inquiry chat (#25): one-time "continue your conversation" links sent
-- by email, a throttle for reply emails, a flag for guests who proved they own
-- the thread's email, and the link from a duplicate inquiry to the existing
-- conversation it matched (that inquiry no longer receives the thread's token).
--
-- Every change checks information_schema first and runs through a prepared
-- statement (pattern of 2026_10_prod_schema_repair.sql): safe on MySQL 8 and
-- MariaDB, through the mysql client or cron/migrate.php, and safe to re-run.
-- ============================================================

SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'guest_chat_links') = 0,
  'CREATE TABLE `guest_chat_links` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `inquiry_id` int(11) NOT NULL,
    `token_hash` char(64) NOT NULL,
    `expires_at` datetime NOT NULL,
    `used_at` datetime DEFAULT NULL,
    `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_guest_chat_links_hash` (`token_hash`),
    KEY `idx_guest_chat_links_thread` (`inquiry_id`, `used_at`),
    CONSTRAINT `fk_guest_chat_links_inquiry` FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'guest_reply_emailed_at') = 0,
  'ALTER TABLE `inquiries` ADD COLUMN `guest_reply_emailed_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'guest_verified_at') = 0,
  'ALTER TABLE `inquiries` ADD COLUMN `guest_verified_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'matched_thread_id') = 0,
  'ALTER TABLE `inquiries` ADD COLUMN `matched_thread_id` int(11) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
