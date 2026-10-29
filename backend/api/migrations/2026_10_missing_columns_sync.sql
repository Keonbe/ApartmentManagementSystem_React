-- Sync missing columns on live database
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'amount_paid') = 0,
  'ALTER TABLE invoices ADD COLUMN amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'proof_amount') = 0,
  'ALTER TABLE invoices ADD COLUMN proof_amount DECIMAL(10,2) DEFAULT NULL AFTER amount_paid', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'previous_address') = 0,
  'ALTER TABLE rent_applications ADD COLUMN previous_address VARCHAR(255) DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'documents_verified_at') = 0,
  'ALTER TABLE rent_applications ADD COLUMN documents_verified_at DATETIME DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rooms' AND column_name = 'available_date') = 0,
  'ALTER TABLE rooms ADD COLUMN available_date DATE DEFAULT NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rooms' AND column_name = 'room_name') = 0,
  'ALTER TABLE rooms ADD COLUMN room_name VARCHAR(50) GENERATED ALWAYS AS (id) VIRTUAL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

