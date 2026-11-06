-- Guest inquiry chat: "End chat on this device" now closes the chat on the
-- server instead of deleting the guest's key from the browser. The chat stays
-- readable on that device, but nobody can send in it any more, and Messages
-- lists it under Archived (guest_chat.php action=end_chat).
-- Idempotent: the column is added only when missing.

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inquiries' AND COLUMN_NAME = 'guest_chat_ended_at') = 0,
  'ALTER TABLE `inquiries` ADD COLUMN `guest_chat_ended_at` datetime DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
