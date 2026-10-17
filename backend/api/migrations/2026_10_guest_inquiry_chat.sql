-- Guest messaging is stored separately from user-to-user messages so existing
-- sender/receiver foreign keys and registered chat semantics remain unchanged.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'thread_type') = 0,
  "ALTER TABLE inquiries ADD COLUMN thread_type ENUM('registered','guest') NOT NULL DEFAULT 'registered'", 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'guest_token') = 0,
  'ALTER TABLE inquiries ADD COLUMN guest_token varchar(64) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND index_name = 'uq_inquiries_guest_token') = 0,
  'ALTER TABLE inquiries ADD UNIQUE KEY uq_inquiries_guest_token (guest_token)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'guest_name') = 0,
  'ALTER TABLE inquiries ADD COLUMN guest_name varchar(150) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'guest_email') = 0,
  'ALTER TABLE inquiries ADD COLUMN guest_email varchar(150) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'guest_phone') = 0,
  'ALTER TABLE inquiries ADD COLUMN guest_phone varchar(30) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'unit_of_interest') = 0,
  'ALTER TABLE inquiries ADD COLUMN unit_of_interest varchar(50) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

CREATE TABLE IF NOT EXISTS guest_messages (
  id int NOT NULL AUTO_INCREMENT,
  inquiry_id int NOT NULL,
  sender_role enum('admin','guest') NOT NULL,
  sender_id int DEFAULT NULL,
  message text NOT NULL,
  attachment_path varchar(255) DEFAULT NULL,
  reply_to_id int DEFAULT NULL,
  is_read tinyint(1) NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY idx_guest_messages_thread (inquiry_id, id),
  CONSTRAINT fk_guest_messages_inquiry FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  CONSTRAINT fk_guest_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'guest_messages' AND column_name = 'attachment_path') = 0,
  'ALTER TABLE guest_messages ADD COLUMN attachment_path varchar(255) DEFAULT NULL AFTER message', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- Replies are optional; add outside API requests so both POST and GET can use
-- this column immediately after the migration has been applied.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'guest_messages' AND column_name = 'reply_to_id') = 0,
  'ALTER TABLE guest_messages ADD COLUMN reply_to_id int DEFAULT NULL AFTER attachment_path', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'guest_messages' AND column_name = 'is_read') = 0,
  'ALTER TABLE guest_messages ADD COLUMN is_read tinyint(1) NOT NULL DEFAULT 0 AFTER reply_to_id', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;