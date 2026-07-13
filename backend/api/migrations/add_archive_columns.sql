ALTER TABLE `rent_applications`
ADD COLUMN `archive_date` DATE DEFAULT NULL,
ADD COLUMN `archive_reason` VARCHAR(255) DEFAULT NULL,
ADD COLUMN `archive_notes` TEXT DEFAULT NULL;
