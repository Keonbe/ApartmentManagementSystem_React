-- ============================================================
-- 2026_10_manager_interview_alignment.sql
-- Changes from the round-2 manager interview
-- (docs/features/manager_interview_comparison.md). One section per change,
-- each under a "-- ===== name =====" header.
--
-- Every statement is idempotent (information_schema + PREPARE guards,
-- CREATE TABLE IF NOT EXISTS, NOT EXISTS on inserts), so the whole file can be
-- run again after a later section is appended.
-- ============================================================

-- ===== application_requirements =====
-- The documents an applicant uploads become an admin-defined list (Settings ->
-- Application Requirements) instead of the fixed Valid ID front/back + NBI
-- clearance. Uploaded files move to application_documents; the three legacy
-- rent_applications columns stay (nullable) but are no longer written.

CREATE TABLE IF NOT EXISTS `application_requirements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `label` varchar(60) NOT NULL,
  `label_fil` varchar(60) DEFAULT NULL,
  `is_required` tinyint(1) NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_app_requirements_active` (`is_active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- label_snapshot keeps an old document readable after its requirement is
-- renamed or deactivated; requirement_id is NULL for a backfilled NBI file.
CREATE TABLE IF NOT EXISTS `application_documents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rent_application_id` int(11) NOT NULL,
  `requirement_id` int(11) DEFAULT NULL,
  `label_snapshot` varchar(60) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_app_document_requirement` (`rent_application_id`, `requirement_id`),
  KEY `idx_app_documents_requirement` (`requirement_id`),
  KEY `idx_app_documents_path` (`file_path`),
  CONSTRAINT `fk_app_documents_application` FOREIGN KEY (`rent_application_id`) REFERENCES `rent_applications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_app_documents_requirement` FOREIGN KEY (`requirement_id`) REFERENCES `application_requirements` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Default requirements, only on an empty table (an admin's list is never touched).
INSERT INTO `application_requirements` (`label`, `label_fil`, `is_required`, `is_active`, `sort_order`)
SELECT seed.label, seed.label_fil, 1, 1, seed.sort_order FROM (
  SELECT 'Valid ID (front)' AS label, 'Valid ID (harap)' AS label_fil, 1 AS sort_order
  UNION ALL
  SELECT 'Valid ID (back)', 'Valid ID (likod)', 2
) seed
WHERE NOT EXISTS (SELECT 1 FROM `application_requirements`);

-- Legacy document columns: nullable, no longer written by rent_application.php.
ALTER TABLE `rent_applications` MODIFY `valid_id_front_path` varchar(255) DEFAULT NULL;
ALTER TABLE `rent_applications` MODIFY `valid_id_back_path` varchar(255) DEFAULT NULL;
ALTER TABLE `rent_applications` MODIFY `nbi_clearance_path` varchar(255) DEFAULT NULL;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'previous_address') = 0,
  'ALTER TABLE `rent_applications` ADD COLUMN `previous_address` varchar(255) DEFAULT NULL AFTER `gender`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- Set when an admin assigns a tenant in person (update_room.php) and attests
-- the documents were checked there; such a record has no uploaded files.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'documents_verified_at') = 0,
  'ALTER TABLE `rent_applications` ADD COLUMN `documents_verified_at` datetime DEFAULT NULL AFTER `terms_agreed_at`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- Backfill the uploaded files from the legacy columns ('placeholder' is not a
-- file). Matched on the path, so a re-run never adds a second row.
INSERT INTO `application_documents` (`rent_application_id`, `requirement_id`, `label_snapshot`, `file_path`, `uploaded_at`)
SELECT ra.id, (SELECT MIN(r.id) FROM `application_requirements` r WHERE r.label = 'Valid ID (front)'), 'Valid ID (front)', ra.valid_id_front_path, ra.created_at
FROM `rent_applications` ra
WHERE COALESCE(ra.valid_id_front_path, '') NOT IN ('', 'placeholder')
  AND NOT EXISTS (SELECT 1 FROM `application_documents` d WHERE d.rent_application_id = ra.id AND d.file_path = ra.valid_id_front_path);

INSERT INTO `application_documents` (`rent_application_id`, `requirement_id`, `label_snapshot`, `file_path`, `uploaded_at`)
SELECT ra.id, (SELECT MIN(r.id) FROM `application_requirements` r WHERE r.label = 'Valid ID (back)'), 'Valid ID (back)', ra.valid_id_back_path, ra.created_at
FROM `rent_applications` ra
WHERE COALESCE(ra.valid_id_back_path, '') NOT IN ('', 'placeholder')
  AND NOT EXISTS (SELECT 1 FROM `application_documents` d WHERE d.rent_application_id = ra.id AND d.file_path = ra.valid_id_back_path);

INSERT INTO `application_documents` (`rent_application_id`, `requirement_id`, `label_snapshot`, `file_path`, `uploaded_at`)
SELECT ra.id, NULL, 'NBI Clearance', ra.nbi_clearance_path, ra.created_at
FROM `rent_applications` ra
WHERE COALESCE(ra.nbi_clearance_path, '') NOT IN ('', 'placeholder')
  AND NOT EXISTS (SELECT 1 FROM `application_documents` d WHERE d.rent_application_id = ra.id AND d.file_path = ra.nbi_clearance_path);

-- A 'placeholder' record that got past approval was an admin's in-person
-- assignment (update_room.php): mark it verified, as the follow-up sweep
-- treated it before.
UPDATE `rent_applications`
   SET `documents_verified_at` = COALESCE(`terms_agreed_at`, `created_at`)
 WHERE `documents_verified_at` IS NULL
   AND `valid_id_front_path` = 'placeholder'
   AND `status` IN ('Approved', 'active', 'pending-move-out', 'moved-out', 'archived');

