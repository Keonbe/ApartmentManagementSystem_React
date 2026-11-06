-- Guest inquiry chat: the admin can ask "Did this answer your question?" in the
-- chat (guest_messages.kind = 'resolution_check'); the guest answers with
-- Problem resolved / Not yet (resolution_answer). The guest's "End chat on this
-- device" appears only after a "resolved" answer (guest_chat.php).
-- Idempotent: each column is added only when missing.

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guest_messages' AND COLUMN_NAME = 'kind') = 0,
  'ALTER TABLE `guest_messages` ADD COLUMN `kind` enum(''text'',''resolution_check'') NOT NULL DEFAULT ''text'' AFTER `sender_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guest_messages' AND COLUMN_NAME = 'resolution_answer') = 0,
  'ALTER TABLE `guest_messages` ADD COLUMN `resolution_answer` enum(''resolved'',''not_yet'') DEFAULT NULL AFTER `reply_to_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guest_messages' AND COLUMN_NAME = 'resolution_answered_at') = 0,
  'ALTER TABLE `guest_messages` ADD COLUMN `resolution_answered_at` datetime DEFAULT NULL AFTER `resolution_answer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
