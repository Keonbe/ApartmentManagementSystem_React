-- ============================================================
-- 2026_11_deposit_refund_policy.sql
-- Security deposit can be refunded (it used to be applied only).
--
--   lease_contracts.deposit_refundable   1 = the unused deposit is paid back at
--                                        move-out; 0 = applied to rent / bills /
--                                        damage as before. Copied from the
--                                        deposit_refundable_default setting when
--                                        the contract is issued; existing
--                                        contracts stay 0.
--   refund_requests.type                 + 'deposit'
--   deposit_deductions.category          + 'forfeiture' (deposit withheld)
--   refund_requests.overdue_notified_at  claim column for the once-only "deposit
--                                        refund is overdue" notice
--   deposit_reviews                      a tenant's request to review a deposit
--                                        deduction / forfeiture, and the answer
--   system_settings                      deposit_refundable_default (1: new
--                                        contracts refund the deposit),
--                                        deposit_refund_days (30),
--                                        cancellation_fee (0)
--
-- Every step checks first, so the file is safe to run again (MariaDB / MySQL 8,
-- the mysql client or cron/migrate.php).
-- ============================================================

-- 1. lease_contracts.deposit_refundable
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lease_contracts' AND COLUMN_NAME = 'deposit_refundable');
SET @sql := IF(@has = 0,
  'ALTER TABLE `lease_contracts` ADD COLUMN `deposit_refundable` tinyint(1) NOT NULL DEFAULT 0 AFTER `deposit_amount`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2. refund_requests.type gains 'deposit' (restating the full list is repeatable)
ALTER TABLE `refund_requests`
  MODIFY COLUMN `type` enum('advance','overpayment','rejected_application','rejected_charge','online_payment','deposit') NOT NULL;

-- 3. deposit_deductions.category gains 'forfeiture'
ALTER TABLE `deposit_deductions`
  MODIFY COLUMN `category` enum('damage','electricity','water','unpaid_rent','other','forfeiture') NOT NULL;

-- 4. Settings
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('deposit_refundable_default', '1'),
('deposit_refund_days', '30'),
('cancellation_fee', '0');

-- 5. refund_requests.overdue_notified_at
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refund_requests' AND COLUMN_NAME = 'overdue_notified_at');
SET @sql := IF(@has = 0,
  'ALTER TABLE `refund_requests` ADD COLUMN `overdue_notified_at` datetime DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 6. deposit_reviews
CREATE TABLE IF NOT EXISTS `deposit_reviews` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rent_application_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `message` text NOT NULL,
  `status` enum('Open','Resolved') NOT NULL DEFAULT 'Open',
  `outcome` enum('upheld','adjusted') DEFAULT NULL,
  `adjusted_amount` decimal(10,2) DEFAULT NULL,
  `admin_response` text DEFAULT NULL,
  `resolved_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `resolved_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_deposit_review_app` (`rent_application_id`, `status`),
  KEY `idx_deposit_review_user` (`user_id`),
  CONSTRAINT `fk_deposit_review_app` FOREIGN KEY (`rent_application_id`) REFERENCES `rent_applications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_deposit_review_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
