-- Filipino translations for the house rules (title_fil, description_fil).
-- Each column is added only when information_schema says it is missing, so
-- the file is safe to re-run on a database built from SetupDB.sql (which
-- already has both columns) and on MySQL 8 as well as MariaDB.

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'house_rules' AND column_name = 'title_fil') = 0,
  'ALTER TABLE `house_rules` ADD COLUMN `title_fil` VARCHAR(255) NULL AFTER `title`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'house_rules' AND column_name = 'description_fil') = 0,
  'ALTER TABLE `house_rules` ADD COLUMN `description_fil` TEXT NULL AFTER `description`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
