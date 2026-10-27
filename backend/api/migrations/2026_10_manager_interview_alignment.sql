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

-- ===== child_floor_rule =====
-- The owners refuse babies and small children on the 3rd floor because of the
-- stairs; floors 1 and 2 have no age limit. Settings -> Minors & Pets edits the
-- floors and the age. The building-wide minimum age (12) becomes 0 = none, and
-- the shipped rule texts follow; anything an admin already changed is kept.
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('child_restricted_floors', '["3F"]'),
('child_restricted_below_age', '5');

UPDATE `system_settings` SET `setting_value` = '0'
 WHERE `setting_key` = 'min_household_age' AND `setting_value` = '12';

UPDATE `system_settings`
   SET `setting_value` = '[{"key":"infant","label":"Infant","min_age":0,"max_age":1,"rule":"Not allowed on the 3rd floor (stairs). Allowed on the 1st and 2nd floors.","rule_fil":""},{"key":"toddler","label":"Toddler","min_age":2,"max_age":4,"rule":"Not allowed on the 3rd floor (stairs). Allowed on the 1st and 2nd floors.","rule_fil":""},{"key":"child","label":"Child","min_age":5,"max_age":11,"rule":"Allowed, with adult supervision in common areas.","rule_fil":""},{"key":"minor","label":"Minor","min_age":12,"max_age":17,"rule":"Allowed, with adult responsibility for their conduct. Running and playing in hallways, elevators and the parking area is not allowed.","rule_fil":""}]'
 WHERE `setting_key` = 'age_categories'
   AND `setting_value` = '[{"key":"infant","label":"Infant","min_age":0,"max_age":1,"rule":"Not allowed. Children under 12 may not live in the apartment.","rule_fil":""},{"key":"toddler","label":"Toddler","min_age":2,"max_age":4,"rule":"Not allowed. Children under 12 may not live in the apartment.","rule_fil":""},{"key":"child","label":"Child","min_age":5,"max_age":11,"rule":"Not allowed. Children under 12 may not live in the apartment.","rule_fil":""},{"key":"minor","label":"Minor","min_age":12,"max_age":17,"rule":"Allowed, with adult responsibility for their conduct. Running and playing in hallways, elevators and the parking area is not allowed.","rule_fil":""}]';

-- House rules (scope 'minors'): the Filipino text first, while the English row
-- still identifies the shipped default, then the English text.
UPDATE `house_rules`
   SET `title_fil` = 'Bawal ang sanggol at maliliit na bata sa ikatlong palapag',
       `description_fil` = 'Hindi maaaring tumira sa mga unit sa ikatlong palapag ang mga batang wala pang 5 taong gulang dahil sa hagdan. Dapat ideklara ang edad ng bawat miyembro ng sambahayan.'
 WHERE `scope` = 'minors' AND `title` = 'No children under 12'
   AND `description` = 'Children under 12 years old are not allowed to live in the apartment. Every household member must be declared with their age, and a household request for a child under 12 is refused.'
   AND (COALESCE(`title_fil`, '') = '' OR (`title_fil` = 'Bawal ang batang wala pang 12 taon'
        AND `description_fil` = 'Hindi pinapayagang tumira sa apartment ang mga batang wala pang 12 taong gulang. Dapat ideklara ang edad ng bawat miyembro ng sambahayan.'));
UPDATE `house_rules`
   SET `title` = 'No babies or small children on the 3rd floor',
       `description` = 'Children under 5 years old cannot live in the 3rd-floor units because of the stairs. Every household member must be declared with their age.'
 WHERE `scope` = 'minors' AND `title` = 'No children under 12'
   AND `description` = 'Children under 12 years old are not allowed to live in the apartment. Every household member must be declared with their age, and a household request for a child under 12 is refused.';

UPDATE `house_rules`
   SET `title_fil` = 'Mga bata at menor de edad (5 hanggang 17)',
       `description_fil` = 'Maaaring tumira sa alinmang palapag ang mga bata at menor de edad na 5 hanggang 17 taong gulang. Responsable ang nangungupahan sa kanilang asal at dapat nilang sundin ang lahat ng patakaran sa mga common area.'
 WHERE `scope` = 'minors' AND `title` = 'Minors aged 12 to 17'
   AND `description` = 'Minors 12 to 17 may live in the apartment. The tenant is responsible for their conduct, and they must follow every house rule in all common areas.'
   AND (COALESCE(`title_fil`, '') = '' OR (`title_fil` = 'Mga menor de edad (12 hanggang 17)'
        AND `description_fil` = 'Maaaring tumira ang mga menor de edad na 12 hanggang 17. Responsable ang nangungupahan sa kanilang asal at dapat nilang sundin ang lahat ng patakaran.'));
UPDATE `house_rules`
   SET `title` = 'Minors and older children',
       `description` = 'Children and minors aged 5 to 17 may live on any floor. The tenant is responsible for their conduct, and they must follow every house rule in all common areas.'
 WHERE `scope` = 'minors' AND `title` = 'Minors aged 12 to 17'
   AND `description` = 'Minors 12 to 17 may live in the apartment. The tenant is responsible for their conduct, and they must follow every house rule in all common areas.';

-- ===== utility_provider_bill =====
-- Utilities are billed from the provider bill (Meralco / Prime Water): entry
-- mode 'bill' stores the bill amounts in water_amount / electric_amount, and a
-- meter reading is optional information (NULL when not taken).
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'utility_readings' AND column_name = 'entry_mode' AND column_type LIKE '%''bill''%') = 0,
  'ALTER TABLE `utility_readings` MODIFY `entry_mode` enum(''metered'',''total'',''bill'') NOT NULL DEFAULT ''metered''', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== deposit_deductions =====
-- Move-out clearance itemizes what is taken from the deposit: one row per
-- deduction with a category, a reason and an amount. lease_contracts keeps
-- damage_deduction (damage + other) and utility_deduction (electricity + water
-- + unpaid rent) as the totals every existing reader uses.
CREATE TABLE IF NOT EXISTS `deposit_deductions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rent_application_id` int(11) NOT NULL,
  `contract_id` varchar(50) DEFAULT NULL,
  `category` enum('damage','electricity','water','unpaid_rent','other') NOT NULL,
  `reason` varchar(255) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `recorded_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_deposit_deductions_app` (`rent_application_id`),
  CONSTRAINT `fk_deposit_deductions_application` FOREIGN KEY (`rent_application_id`) REFERENCES `rent_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ===== partial_payments =====
-- Installments: any single invoice can be paid in parts. amount_paid is the
-- running sum of its payment_transactions parts (cached so list endpoints do
-- not query per row); balance = total_amount - amount_paid. proof_amount is
-- the part a tenant declared with a proof (NULL = the whole balance).
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'amount_paid') = 0,
  'ALTER TABLE `invoices` ADD COLUMN `amount_paid` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `total_amount`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'proof_amount') = 0,
  'ALTER TABLE `invoices` ADD COLUMN `proof_amount` decimal(10,2) DEFAULT NULL AFTER `amount_paid`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- Paid invoices were paid in full.
UPDATE `invoices` SET `amount_paid` = `total_amount` WHERE `status` = 'paid' AND `amount_paid` = 0;

-- ===== move_out_notice =====
-- The move-out notice window (was fixed at 15-30 days in record_move_out.php and
-- MyRoom.jsx) becomes two admin settings, Settings -> Rental.
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'move_out_min_notice_days', '15' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `system_settings` WHERE `setting_key` = 'move_out_min_notice_days');
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'move_out_max_notice_days', '30' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `system_settings` WHERE `setting_key` = 'move_out_max_notice_days');

-- ===== move_in_window =====
-- The preferred move-in date window (rent_application.php, resubmit_date.php;
-- config.php move_in_window_days()) becomes two admin settings, Settings ->
-- Rental: earliest 0 days (today) and latest 365 days from today.
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'move_in_min_days', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `system_settings` WHERE `setting_key` = 'move_in_min_days');
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'move_in_max_days', '365' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `system_settings` WHERE `setting_key` = 'move_in_max_days');

-- ===== invoice_adjustments =====
-- Billing disputes (manager interview Q13): every invoice adjustment
-- (adjust_invoice.php) needs a reason and keeps a before/after record.
-- `changes` is JSON {line: [old, new]} for the lines that changed.
CREATE TABLE IF NOT EXISTS `invoice_adjustments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `invoice_id` varchar(50) NOT NULL,
  `admin_id` int(11) DEFAULT NULL,
  `reason` varchar(255) NOT NULL,
  `old_total` decimal(10,2) NOT NULL,
  `new_total` decimal(10,2) NOT NULL,
  `changes` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_invoice_adjustments_invoice` (`invoice_id`),
  KEY `idx_invoice_adjustments_admin` (`admin_id`),
  CONSTRAINT `fk_invoice_adjustments_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_invoice_adjustments_admin` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ===== duplicate_reference =====
-- Reused payment references (manager interview Q22): the same GCash/bank
-- reference on a different payment is flagged to the admin ('warn') or refused
-- ('block'), Settings -> Payments. The lookup columns and indexes are in the
-- reference_norm section below.
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'duplicate_reference_policy', 'warn' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `system_settings` WHERE `setting_key` = 'duplicate_reference_policy');

-- ===== reference_norm =====
-- The reference as compared (config.php normalize_payment_reference(): spaces,
-- tabs, line breaks and dashes removed, upper case; NULL when nothing is left),
-- stored and indexed so the reuse lookups seek. Replaces the raw-column
-- indexes an earlier run of this file added.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payment_transactions' AND column_name = 'reference_norm') = 0,
  "ALTER TABLE `payment_transactions` ADD COLUMN `reference_norm` varchar(100) GENERATED ALWAYS AS (NULLIF(UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`reference_number`, ' ', ''), '-', ''), '\\t', ''), '\\r', ''), '\\n', '')), '')) STORED AFTER `reference_number`", 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payment_proof_parts' AND column_name = 'reference_norm') = 0,
  "ALTER TABLE `payment_proof_parts` ADD COLUMN `reference_norm` varchar(100) GENERATED ALWAYS AS (NULLIF(UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`reference_number`, ' ', ''), '-', ''), '\\t', ''), '\\r', ''), '\\n', '')), '')) STORED AFTER `reference_number`", 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'reference_norm') = 0,
  "ALTER TABLE `invoices` ADD COLUMN `reference_norm` varchar(100) GENERATED ALWAYS AS (NULLIF(UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`payment_reference`, ' ', ''), '-', ''), '\\t', ''), '\\r', ''), '\\n', '')), '')) STORED AFTER `payment_reference`", 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'payment_transactions' AND index_name = 'idx_payment_transactions_reference_norm') = 0,
  'ALTER TABLE `payment_transactions` ADD INDEX `idx_payment_transactions_reference_norm` (`reference_norm`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'payment_proof_parts' AND index_name = 'idx_payment_proof_parts_reference_norm') = 0,
  'ALTER TABLE `payment_proof_parts` ADD INDEX `idx_payment_proof_parts_reference_norm` (`reference_norm`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'invoices' AND index_name = 'idx_invoices_reference_norm') = 0,
  'ALTER TABLE `invoices` ADD INDEX `idx_invoices_reference_norm` (`reference_norm`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'payment_transactions' AND index_name = 'idx_payment_transactions_reference') > 0,
  'ALTER TABLE `payment_transactions` DROP INDEX `idx_payment_transactions_reference`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'payment_proof_parts' AND index_name = 'idx_payment_proof_parts_reference') > 0,
  'ALTER TABLE `payment_proof_parts` DROP INDEX `idx_payment_proof_parts_reference`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'invoices' AND index_name = 'idx_invoices_payment_reference') > 0,
  'ALTER TABLE `invoices` DROP INDEX `idx_invoices_payment_reference`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== cctv_privacy_consent =====
-- The CCTV request form makes the tenant tick a Data Privacy consent box; it
-- was never sent or kept. cctv_request.php now requires it and records when.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'privacy_consent_at') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `privacy_consent_at` datetime DEFAULT NULL AFTER `reason_request`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
