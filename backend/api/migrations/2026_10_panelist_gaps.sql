-- Panelist gap features (refund approval, per-floor rent, utility bill file, extra utility
-- types, scoped rules, age categories / minimum household age). One idempotent file so
-- prod runs a single migration. Merged from the six per-feature files, in order.

-- ===== refund_requests =====
-- Refund approval workflow: a tenant or admin raises a refund request for
-- advance rent or an overpayment; the admin approves, rejects (reason) or asks
-- for more info; the tenant replies or cancels; the admin records the payout.
-- Move-out security deposits are not refundable through this workflow; a deposit
-- paid on an application that never moved in is included in cancellation review.

CREATE TABLE IF NOT EXISTS `refund_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `rent_application_id` int(11) DEFAULT NULL,
  `type` enum('advance','overpayment') NOT NULL,
  `invoice_id` varchar(50) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `reason` text NOT NULL,
  `status` enum('Pending Review','Info Requested','Approved','Rejected','Refunded','Cancelled') NOT NULL DEFAULT 'Pending Review',
  `decision_reason` text DEFAULT NULL,
  `payout_method` varchar(50) DEFAULT NULL,
  `payout_reference` varchar(100) DEFAULT NULL,
  `raised_by` int(11) DEFAULT NULL,
  `raised_by_role` varchar(10) NOT NULL DEFAULT 'user',
  `decided_by` int(11) DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `refunded_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_refund_user` (`user_id`, `status`),
  KEY `idx_refund_status` (`status`),
  CONSTRAINT `fk_refund_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `refund_request_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `refund_request_id` int(11) NOT NULL,
  `actor_id` int(11) DEFAULT NULL,
  `actor_role` varchar(10) NOT NULL,
  `action` varchar(30) NOT NULL,
  `message` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_refund_event_request` (`refund_request_id`),
  CONSTRAINT `fk_refund_event_request` FOREIGN KEY (`refund_request_id`) REFERENCES `refund_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- advance_credits: a payout status and the request that holds the credit.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name='advance_credits' AND column_name='status' AND column_type LIKE '%refunded%')=0,
  'ALTER TABLE `advance_credits` MODIFY COLUMN `status` enum(''reserved'',''available'',''applied'',''cancelled'',''refund-due'',''refunded'') NOT NULL DEFAULT ''reserved''','DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name='advance_credits' AND column_name='refund_request_id')=0,
  'ALTER TABLE `advance_credits` ADD COLUMN `refund_request_id` int(11) DEFAULT NULL','DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== floor_rates =====
-- Per-floor fixed rent: the floor -> price table lives in system_settings
-- ('floor_rates', a JSON object), and rooms remember when an admin set a unit's
-- rent by hand so "apply to vacant units" does not overwrite it.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name='rooms' AND column_name='rent_is_custom')=0,
  'ALTER TABLE `rooms` ADD COLUMN `rent_is_custom` tinyint(1) NOT NULL DEFAULT 0','DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('floor_rates', '{}');

-- ===== utility_bills =====
-- Utility bill file: the admin attaches the provider's bill (PDF/image) to a
-- utility_readings row, and the tenant opens it from their Utilities page.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name='utility_readings' AND column_name='bill_file_path')=0,
  'ALTER TABLE `utility_readings` ADD COLUMN `bill_file_path` varchar(255) DEFAULT NULL','DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== utility_types =====
-- Extra utility types beyond water and electricity (internet, gas, ...), billed
-- per reading as either a metered amount (reading x rate) or a flat fee.
-- Their charge posts to the invoice's accumulating `services` column.
CREATE TABLE IF NOT EXISTS `utility_types` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(30) NOT NULL,
  `name` varchar(60) NOT NULL,
  `unit_label` varchar(20) DEFAULT NULL,
  `billing_mode` enum('metered','flat') NOT NULL DEFAULT 'flat',
  `default_rate` decimal(10,2) NOT NULL DEFAULT 0.00,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_utility_type_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `utility_reading_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `reading_id` int(11) NOT NULL,
  `type_id` int(11) NOT NULL,
  `prev_reading` decimal(10,2) DEFAULT NULL,
  `curr_reading` decimal(10,2) DEFAULT NULL,
  `consumption` decimal(10,2) DEFAULT NULL,
  `rate` decimal(10,2) NOT NULL DEFAULT 0.00,
  `amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `other_fees` decimal(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reading_type` (`reading_id`, `type_id`),
  KEY `idx_item_type` (`type_id`),
  CONSTRAINT `fk_item_reading` FOREIGN KEY (`reading_id`) REFERENCES `utility_readings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_item_type` FOREIGN KEY (`type_id`) REFERENCES `utility_types` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `utility_types` (`code`, `name`, `unit_label`, `billing_mode`, `default_rate`, `is_active`, `sort_order`) VALUES
('internet', 'Internet', NULL, 'flat', 1000.00, 0, 1),
('gas', 'Gas', 'kg', 'metered', 90.00, 0, 2);

-- ===== rule_scopes =====
-- House rules can now belong to a scope: 'house' (general, the default),
-- 'parking' (shown before a parking reservation) or 'minors' (children, age
-- categories and pets: shown on the inquiry, the application and the contract).
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name='house_rules' AND column_name='scope')=0,
  'ALTER TABLE `house_rules` ADD COLUMN `scope` varchar(20) NOT NULL DEFAULT ''house''','DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- Starter rules for each new scope, only when that scope has none yet.
INSERT INTO house_rules (category, title, description, is_highlight, sort_order, scope)
SELECT * FROM (
  SELECT 'Parking' AS category, 'One slot per rent' AS title, 'Each rent may reserve one parking slot. Additional slots depend on availability and management approval.' AS description, 1 AS is_highlight, 10 AS sort_order, 'parking' AS scope UNION ALL
  SELECT 'Parking', 'Registered vehicles only', 'Only the vehicle named in your reservation may use your slot. Upload the vehicle OR/CR and report any change of vehicle to management.', 1, 20, 'parking' UNION ALL
  SELECT 'Parking', 'Park within your slot', 'Park only inside your assigned slot and never block driveways or exits. Vehicles left in the wrong place may be moved at the owner''s risk.', 0, 30, 'parking'
) AS defaults
WHERE NOT EXISTS (SELECT 1 FROM house_rules WHERE scope = 'parking');

INSERT INTO house_rules (category, title, description, is_highlight, sort_order, scope)
SELECT * FROM (
  SELECT 'Children' AS category, 'No children under 12' AS title, 'Children under 12 years old are not allowed to live in the apartment. Every household member must be declared with their age, and a household request for a child under 12 is refused.' AS description, 1 AS is_highlight, 10 AS sort_order, 'minors' AS scope UNION ALL
  SELECT 'Children', 'Minors aged 12 to 17', 'Minors 12 to 17 may live in the apartment. The tenant is responsible for their conduct, and they must follow every house rule in all common areas.', 1, 20, 'minors' UNION ALL
  SELECT 'Pets', 'No pets allowed', 'Pets are not allowed inside the units or anywhere on the premises.', 0, 30, 'minors'
) AS defaults
WHERE NOT EXISTS (SELECT 1 FROM house_rules WHERE scope = 'minors');

-- ===== minors_age_categories =====
-- Children and minors: admin-editable age categories (system_settings JSON) and
-- the age + category captured per household member.
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('min_household_age', '12'),
('age_categories', '[{"key":"infant","label":"Infant","min_age":0,"max_age":1,"rule":"Not allowed. Children under 12 may not live in the apartment.","rule_fil":""},{"key":"toddler","label":"Toddler","min_age":2,"max_age":4,"rule":"Not allowed. Children under 12 may not live in the apartment.","rule_fil":""},{"key":"child","label":"Child","min_age":5,"max_age":11,"rule":"Not allowed. Children under 12 may not live in the apartment.","rule_fil":""},{"key":"minor","label":"Minor","min_age":12,"max_age":17,"rule":"Allowed, with adult responsibility for their conduct. Running and playing in hallways, elevators and the parking area is not allowed.","rule_fil":""}]');

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name='household_members' AND column_name='age')=0,
  'ALTER TABLE `household_members` ADD COLUMN `age` tinyint(3) unsigned DEFAULT NULL','DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name='household_members' AND column_name='age_category')=0,
  'ALTER TABLE `household_members` ADD COLUMN `age_category` varchar(30) DEFAULT NULL','DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
