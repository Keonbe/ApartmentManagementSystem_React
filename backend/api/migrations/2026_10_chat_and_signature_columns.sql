-- ============================================================
-- 2026_10_chat_and_signature_columns.sql
-- Brings a dev or self-hosted database up to what production already has,
-- and adds one new column.
--
-- `messages`: production got attachment_path and reply_to_id from the
-- runtime ALTER TABLE that send_message.php and get_chat_history.php used to
-- run. A database nobody chatted on never got them, so get_conversations.php
-- failed there. Those endpoints no longer alter the table; this file does.
-- On production both columns exist, so both statements do nothing.
--
-- `lease_contracts`: tenant_signature_path and owner_signature_path come from
-- 2026_10_server_database_update.sql, which some databases recorded as
-- applied without the columns being created.
--
-- `invoices`: late_fee_waived is new. An admin who waives a late fee sets it,
-- and promote_overdue_invoices() then leaves that invoice's fee at 0.
--
-- Every change checks information_schema first and runs through a prepared
-- statement (pattern: 2026_10_prod_schema_repair.sql), so nothing here can
-- fail or duplicate on a database that already has it. No DROP and no data
-- changes.
-- ============================================================

-- 1. Chat table, for a database nobody ever chatted on: the endpoints used to
-- create it on first use. Skipped wherever the table exists (production, dev).
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'messages') = 0,
  'CREATE TABLE `messages` (
     `id` int(11) NOT NULL AUTO_INCREMENT,
     `sender_id` int(11) NOT NULL,
     `receiver_id` int(11) NOT NULL,
     `message` text NOT NULL,
     `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
     `is_read` tinyint(1) NOT NULL DEFAULT 0,
     `attachment_path` varchar(255) DEFAULT NULL,
     `reply_to_id` int(11) DEFAULT NULL,
     PRIMARY KEY (`id`),
     KEY `fk_sender` (`sender_id`),
     KEY `async_receiver` (`receiver_id`),
     CONSTRAINT `fk_messages_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
     CONSTRAINT `fk_messages_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- Chat columns on a table that predates them (same definition and order as
-- production)
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'messages') = 1
        AND (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'messages' AND column_name = 'attachment_path') = 0,
  'ALTER TABLE `messages` ADD COLUMN `attachment_path` varchar(255) DEFAULT NULL AFTER `is_read`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'messages') = 1
        AND (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'messages' AND column_name = 'reply_to_id') = 0,
  'ALTER TABLE `messages` ADD COLUMN `reply_to_id` int(11) DEFAULT NULL AFTER `attachment_path`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- 2. Contract e-signature image paths
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_contracts' AND column_name = 'tenant_signature_path') = 0,
  'ALTER TABLE `lease_contracts` ADD COLUMN `tenant_signature_path` text DEFAULT NULL AFTER `generated_at`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_contracts' AND column_name = 'owner_signature_path') = 0,
  'ALTER TABLE `lease_contracts` ADD COLUMN `owner_signature_path` text DEFAULT NULL AFTER `tenant_signature_path`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- 3. Late fee waived by an admin (adjust_invoice.php)
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'late_fee_waived') = 0,
  'ALTER TABLE `invoices` ADD COLUMN `late_fee_waived` tinyint(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
