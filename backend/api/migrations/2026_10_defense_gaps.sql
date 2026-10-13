-- Defense gaps: refunds on rejection after approval, total-only utility
-- records, the payment window, Filipino text for the minors/parking rules.
-- Idempotent: every statement checks information_schema first.

-- ===== refund_types =====
-- A refund can also come from a rejected application or a rejected paid charge.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name='refund_requests' AND column_name='type' AND column_type LIKE '%rejected_application%')=0,
  'ALTER TABLE `refund_requests` MODIFY COLUMN `type` enum(''advance'',''overpayment'',''rejected_application'',''rejected_charge'') NOT NULL','DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== utility_total_only =====
-- A reading row can hold just a total the tenant paid in full (no meter reading).
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name='utility_readings' AND column_name='entry_mode')=0,
  'ALTER TABLE `utility_readings` ADD COLUMN `entry_mode` enum(''metered'',''total'') NOT NULL DEFAULT ''metered''','DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name='utility_readings' AND column_name='total_amount')=0,
  'ALTER TABLE `utility_readings` ADD COLUMN `total_amount` decimal(10,2) DEFAULT NULL','DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== payment_window =====
-- When a checkout claimed the invoice (status 'processing'); the payment window
-- job releases it once the window passes.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name='invoices' AND column_name='processing_since')=0,
  'ALTER TABLE `invoices` ADD COLUMN `processing_since` datetime DEFAULT NULL','DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('payment_window_days', '3');

-- Checkouts already open when this runs start their window now.
UPDATE `invoices` SET `processing_since` = NOW() WHERE `status` = 'processing' AND `processing_since` IS NULL;

-- ===== rules_filipino =====
-- Filipino text for the starter children/pets and parking rules, only while the
-- admin has not written one.
UPDATE `house_rules` SET `title_fil` = 'Bawal ang batang wala pang 12 taon',
  `description_fil` = 'Hindi pinapayagang tumira sa apartment ang mga batang wala pang 12 taong gulang. Dapat ideklara ang edad ng bawat miyembro ng sambahayan.'
 WHERE `scope` = 'minors' AND `title` = 'No children under 12' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Mga menor de edad (12 hanggang 17)',
  `description_fil` = 'Maaaring tumira ang mga menor de edad na 12 hanggang 17. Responsable ang nangungupahan sa kanilang asal at dapat nilang sundin ang lahat ng patakaran.'
 WHERE `scope` = 'minors' AND `title` = 'Minors aged 12 to 17' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Bawal ang alagang hayop',
  `description_fil` = 'Hindi pinapayagan ang mga alagang hayop sa loob ng mga unit o saanman sa lugar.'
 WHERE `scope` = 'minors' AND `title` = 'No pets allowed' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Isang parking slot bawat uupahan',
  `description_fil` = 'Isang parking slot lamang bawat uupahan. Ang karagdagan ay depende sa availability at pag-apruba ng management.'
 WHERE `scope` = 'parking' AND `title` = 'One slot per rent' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Rehistradong sasakyan lamang',
  `description_fil` = 'Ang sasakyang nakasaad lamang sa reservation ang maaaring gumamit ng slot. I-upload ang OR/CR at ipaalam sa management ang anumang pagpapalit.'
 WHERE `scope` = 'parking' AND `title` = 'Registered vehicles only' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Pumarada sa loob ng slot',
  `description_fil` = 'Pumarada lamang sa nakatalagang slot at huwag harangan ang daanan o labasan.'
 WHERE `scope` = 'parking' AND `title` = 'Park within your slot' AND (`title_fil` IS NULL OR `title_fil` = '');
