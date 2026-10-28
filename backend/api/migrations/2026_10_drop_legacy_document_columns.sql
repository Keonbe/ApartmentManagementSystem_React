-- ============================================================
-- 2026_10_drop_legacy_document_columns.sql
-- Drops rent_applications.valid_id_front_path, valid_id_back_path and
-- nbi_clearance_path. Uploads have lived in application_documents since the
-- manager-interview changes (October 2026); nothing reads these columns.
--
-- Before each drop, any real file path still only in the old column is copied
-- to application_documents (the same backfill the manager-interview migration
-- ran; 'placeholder' is not a file). Every step checks information_schema
-- first, so the file is safe to run again and on a database that never had
-- the columns.
-- ============================================================

SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

-- 1. Backfill anything not yet copied
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'valid_id_front_path') = 1,
  'INSERT INTO `application_documents` (`rent_application_id`, `requirement_id`, `label_snapshot`, `file_path`, `uploaded_at`)
   SELECT ra.id, (SELECT MIN(r.id) FROM `application_requirements` r WHERE r.label = ''Valid ID (front)''), ''Valid ID (front)'', ra.valid_id_front_path, ra.created_at
     FROM `rent_applications` ra
    WHERE COALESCE(ra.valid_id_front_path, '''') NOT IN ('''', ''placeholder'')
      AND NOT EXISTS (SELECT 1 FROM `application_documents` d WHERE d.rent_application_id = ra.id AND d.file_path = ra.valid_id_front_path)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'valid_id_back_path') = 1,
  'INSERT INTO `application_documents` (`rent_application_id`, `requirement_id`, `label_snapshot`, `file_path`, `uploaded_at`)
   SELECT ra.id, (SELECT MIN(r.id) FROM `application_requirements` r WHERE r.label = ''Valid ID (back)''), ''Valid ID (back)'', ra.valid_id_back_path, ra.created_at
     FROM `rent_applications` ra
    WHERE COALESCE(ra.valid_id_back_path, '''') NOT IN ('''', ''placeholder'')
      AND NOT EXISTS (SELECT 1 FROM `application_documents` d WHERE d.rent_application_id = ra.id AND d.file_path = ra.valid_id_back_path)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'nbi_clearance_path') = 1,
  'INSERT INTO `application_documents` (`rent_application_id`, `requirement_id`, `label_snapshot`, `file_path`, `uploaded_at`)
   SELECT ra.id, NULL, ''NBI Clearance'', ra.nbi_clearance_path, ra.created_at
     FROM `rent_applications` ra
    WHERE COALESCE(ra.nbi_clearance_path, '''') NOT IN ('''', ''placeholder'')
      AND NOT EXISTS (SELECT 1 FROM `application_documents` d WHERE d.rent_application_id = ra.id AND d.file_path = ra.nbi_clearance_path)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- 2. Drop the columns
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'valid_id_front_path') = 1,
  'ALTER TABLE `rent_applications` DROP COLUMN `valid_id_front_path`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'valid_id_back_path') = 1,
  'ALTER TABLE `rent_applications` DROP COLUMN `valid_id_back_path`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'nbi_clearance_path') = 1,
  'ALTER TABLE `rent_applications` DROP COLUMN `nbi_clearance_path`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
