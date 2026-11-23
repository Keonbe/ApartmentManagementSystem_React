-- November 2026 workstream, merged into one file before the first prod run (CLAUDE.md rule).
-- Idempotent MySQL 8/MariaDB schema repair for SetUpDB's MariaDB-only alters;
-- the guarded charset conversions below also include generated-column tables.
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='notifications' AND column_name='status')=0, 'ALTER TABLE `notifications` ADD COLUMN `status` varchar(20) DEFAULT ''Pending''', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='notifications' AND column_name='metadata_value')=0, 'ALTER TABLE `notifications` ADD COLUMN `metadata_value` varchar(255) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='notifications' AND column_name='attachment_path')=0, 'ALTER TABLE `notifications` ADD COLUMN `attachment_path` varchar(255) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='notifications' AND column_name='is_archived')=0, 'ALTER TABLE `notifications` ADD COLUMN `is_archived` tinyint(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='notifications' AND index_name='idx_type_status')=0, 'ALTER TABLE `notifications` ADD INDEX `idx_type_status` (`type`,`status`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='notifications' AND index_name='idx_user_read')=0, 'ALTER TABLE `notifications` ADD INDEX `idx_user_read` (`user_id`,`is_read`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='invoices' AND column_name='services')=0, 'ALTER TABLE `invoices` ADD COLUMN `services` decimal(10,2) NOT NULL DEFAULT 0.00', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='invoices' AND column_name='maintenance')=0, 'ALTER TABLE `invoices` ADD COLUMN `maintenance` decimal(10,2) NOT NULL DEFAULT 0.00', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='invoices' AND column_name='late_fee')=0, 'ALTER TABLE `invoices` ADD COLUMN `late_fee` decimal(10,2) NOT NULL DEFAULT 0.00', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='invoices' AND column_name='late_fee_waived')=0, 'ALTER TABLE `invoices` ADD COLUMN `late_fee_waived` tinyint(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='invoices' AND column_name='last_reminder_date')=0, 'ALTER TABLE `invoices` ADD COLUMN `last_reminder_date` date DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='invoices' AND column_name='reminder_count')=0, 'ALTER TABLE `invoices` ADD COLUMN `reminder_count` int(11) NOT NULL DEFAULT 0', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='rent_applications' AND column_name='pre_archive_status')=0, 'ALTER TABLE `rent_applications` ADD COLUMN `pre_archive_status` varchar(20) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='rent_applications' AND column_name='terms_agreed_at')=0, 'ALTER TABLE `rent_applications` ADD COLUMN `terms_agreed_at` timestamp NULL DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='rent_applications' AND column_name='documents_verified_at')=0, 'ALTER TABLE `rent_applications` ADD COLUMN `documents_verified_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- Maintenance billing and timeline columns from SetupDB.sql.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='maintenance_requests' AND column_name='room_name')=0, 'ALTER TABLE `maintenance_requests` ADD COLUMN `room_name` varchar(50) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='maintenance_requests' AND column_name='title')=0, 'ALTER TABLE `maintenance_requests` ADD COLUMN `title` varchar(150) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='maintenance_requests' AND column_name='acknowledged_at')=0, 'ALTER TABLE `maintenance_requests` ADD COLUMN `acknowledged_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='maintenance_requests' AND column_name='started_at')=0, 'ALTER TABLE `maintenance_requests` ADD COLUMN `started_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='maintenance_requests' AND column_name='resolved_at')=0, 'ALTER TABLE `maintenance_requests` ADD COLUMN `resolved_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='maintenance_requests' AND column_name='actual_cost')=0, 'ALTER TABLE `maintenance_requests` ADD COLUMN `actual_cost` decimal(10,2) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='maintenance_requests' AND column_name='rejection_reason')=0, 'ALTER TABLE `maintenance_requests` ADD COLUMN `rejection_reason` varchar(255) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='maintenance_requests' AND column_name='is_invoiced')=0, 'ALTER TABLE `maintenance_requests` ADD COLUMN `is_invoiced` tinyint(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='maintenance_requests' AND column_name='invoice_id')=0, 'ALTER TABLE `maintenance_requests` ADD COLUMN `invoice_id` varchar(50) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='maintenance_requests' AND column_name='billing_period')=0, 'ALTER TABLE `maintenance_requests` ADD COLUMN `billing_period` varchar(50) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='maintenance_requests' AND column_name='invoiced_amount')=0, 'ALTER TABLE `maintenance_requests` ADD COLUMN `invoiced_amount` decimal(10,2) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='maintenance_requests' AND index_name='idx_maint_invoiced')=0, 'ALTER TABLE `maintenance_requests` ADD INDEX `idx_maint_invoiced` (`is_invoiced`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='maintenance_requests' AND index_name='idx_maint_status_created')=0, 'ALTER TABLE `maintenance_requests` ADD INDEX `idx_maint_status_created` (`status`,`created_at`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- Convert every existing base table. The generated columns are deterministic
-- expressions over columns converted by ALTER TABLE and remain generated.
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='activity_logs' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `activity_logs` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='advance_credits' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `advance_credits` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='announcements' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `announcements` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='application_documents' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `application_documents` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='application_requirements' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `application_requirements` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='cctv_requests' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `cctv_requests` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='complaints' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `complaints` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='contract_template_versions' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `contract_template_versions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='deposit_deductions' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `deposit_deductions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='deposit_reviews' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `deposit_reviews` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='expenses' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `expenses` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='guest_chat_links' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `guest_chat_links` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='guest_messages' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `guest_messages` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='household_members' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `household_members` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='house_rules' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `house_rules` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='inquiries' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `inquiries` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='invoice_adjustments' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `invoice_adjustments` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='invoices' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `invoices` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='lease_contracts' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `lease_contracts` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='lease_renewals' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `lease_renewals` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='login_attempts' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `login_attempts` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='maintenance_requests' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `maintenance_requests` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='messages' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `messages` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='notification_log' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `notification_log` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='notification_preferences' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `notification_preferences` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='notification_queue' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `notification_queue` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='notifications' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `notifications` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='parking_charges' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `parking_charges` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='parking_reservations' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `parking_reservations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='parking_slots' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `parking_slots` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='password_reset_requests' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `password_reset_requests` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='password_resets' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `password_resets` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='payment_proof_parts' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `payment_proof_parts` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='payment_transactions' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `payment_transactions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='rate_limit_events' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `rate_limit_events` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='rent_applications' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `rent_applications` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='refund_request_events' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `refund_request_events` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='refund_requests' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `refund_requests` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='room_transfers' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `room_transfers` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='rooms' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `rooms` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='service_catalog' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `service_catalog` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='service_categories' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `service_categories` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='service_requests' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `service_requests` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='sessions' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `sessions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='system_settings' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `system_settings` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='trusted_devices' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `trusted_devices` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='unit_reservations' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `unit_reservations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='unit_waitlist' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `unit_waitlist` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='users' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `users` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='utility_reading_items' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `utility_reading_items` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='utility_readings' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `utility_readings` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='utility_types' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `utility_types` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='visitor_logs' AND table_type='BASE TABLE') > 0, 'ALTER TABLE `visitor_logs` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;


-- ===== 2026_11_appearance_settings.sql =====
-- ===== glass_theme_settings =====
-- Tenant-side Glass theme backdrop (Admin -> Other Settings -> Glass Mode).
-- glass_bg_image: '' = the built-in apartment photo, else a site_assets/glass_bg_*
-- upload (upload_glass_background.php). Overlay 0-95 %, blur 0-20 px, tint
-- #rrggbb; update_system_settings.php enforces the same ranges.
--
-- ===== home_page_content =====
-- Home page text (Admin -> Other Settings -> Home Page): badge, heading,
-- location and description, each with a show switch and English / Filipino
-- text ('' = the app's own wording). Shape checked by normalize_home_content().
--
-- Idempotent: an existing row (a value the admin already saved) is kept.

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('glass_bg_image', ''),
('glass_overlay_opacity', '78'),
('glass_blur', '0'),
('glass_tint', '#0f172a'),
('home_content', '{"badge":{"show":true,"en":"","fil":""},"heading":{"show":true,"en":"","fil":""},"location":{"show":true,"en":"","fil":""},"description":{"show":true,"en":"","fil":""}}');

-- ===== 2026_11_cctv_auth_chat_billing.sql =====
-- ============================================================
-- 2026_11_cctv_auth_chat_billing.sql
-- One migration for the local 2026-11 workstream, merged from six per-feature
-- files that were never pushed (so no deployed database has recorded them):
--   guest_chat_links   guest inquiry chat links and flags (2026_10_guest_chat_links)
--   invoiced_amount    amount a request put on its invoice (2026_11_invoiced_amount)
--   cctv_incident_type / cctv_decision_note / cctv_footage   CCTV request rework
--   auth_security      email verification and device sign-in codes
--   paymongo_refunds   PayMongo payment id on invoices, refunds paid out through PayMongo
--   house_rules_filipino   Filipino text for the four starter house rules
--   maintenance_workflow   scheduled visit, tenant cancel request, tenant reopen reason
--   service_workflow       add-on booking visit slot, cancel request, adjusted quantity
--   service_extras        add-on slot limit, rating, categories table
-- 2026_11_appearance_settings and 2026_11_contract_end_and_preview stay as their
-- own files: they are already on origin/main and may be applied on prod.
--
-- Every change checks information_schema first and runs through a prepared
-- statement (pattern of 2026_10_prod_schema_repair.sql): safe on MySQL 8 and
-- MariaDB, through the mysql client or cron/migrate.php, and safe to re-run.
-- The two data backfills (invoiced_amount, auth_security) only touch rows that
-- still need them.
-- ============================================================

-- ===== guest_chat_links =====
-- Guest inquiry chat (#25): one-time "continue your conversation" links sent
-- by email, a throttle for reply emails, a flag for guests who proved they own
-- the thread's email, and the link from a duplicate inquiry to the existing
-- conversation it matched (that inquiry no longer receives the thread's token).

SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'guest_chat_links') = 0,
  'CREATE TABLE `guest_chat_links` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `inquiry_id` int(11) NOT NULL,
    `token_hash` char(64) NOT NULL,
    `expires_at` datetime NOT NULL,
    `used_at` datetime DEFAULT NULL,
    `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_guest_chat_links_hash` (`token_hash`),
    KEY `idx_guest_chat_links_thread` (`inquiry_id`, `used_at`),
    CONSTRAINT `fk_guest_chat_links_inquiry` FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'guest_reply_emailed_at') = 0,
  'ALTER TABLE `inquiries` ADD COLUMN `guest_reply_emailed_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'guest_verified_at') = 0,
  'ALTER TABLE `inquiries` ADD COLUMN `guest_verified_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'matched_thread_id') = 0,
  'ALTER TABLE `inquiries` ADD COLUMN `matched_thread_id` int(11) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== invoiced_amount =====
-- The amount a service / maintenance request put on its invoice, stored at the
-- moment of posting (parking_charges.amount already does this). Reversing a
-- charge used to subtract the request's CURRENT cost, which backs out the wrong
-- amount when the cost was edited after billing.

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'service_requests' AND column_name = 'invoiced_amount') = 0,
  'ALTER TABLE `service_requests` ADD COLUMN `invoiced_amount` decimal(10,2) DEFAULT NULL AFTER `billing_period`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'maintenance_requests' AND column_name = 'invoiced_amount') = 0,
  'ALTER TABLE `maintenance_requests` ADD COLUMN `invoiced_amount` decimal(10,2) DEFAULT NULL AFTER `billing_period`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- Rows already on an invoice: the best known amount is the current cost.
UPDATE `service_requests` SET `invoiced_amount` = `total_cost`
 WHERE `is_invoiced` = 1 AND `invoice_id` IS NOT NULL AND `invoiced_amount` IS NULL;
UPDATE `maintenance_requests` SET `invoiced_amount` = COALESCE(`actual_cost`, `estimated_cost`, 0)
 WHERE `is_invoiced` = 1 AND `invoice_id` IS NOT NULL AND `invoiced_amount` IS NULL;

-- CCTV request rework (the next two sections): both columns are NULL for requests
-- filed or decided before them.

-- ===== cctv_incident_type =====
-- CCTV footage is released for incidents only: the request records what kind of
-- incident it is (cctv_request.php validates it against the configured list).

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'incident_type') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `incident_type` varchar(30) DEFAULT NULL AFTER `location_details`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== cctv_decision_note =====
-- The admin's note on a decision: where and when to view or collect the footage
-- (Approved) or why it was refused (Rejected). Shown to the tenant.

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'decision_note') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `decision_note` text DEFAULT NULL AFTER `status`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== cctv_footage =====
-- Footage the admin hands to the tenant on an Approved CCTV request: a stored
-- clip (footage_path) or a private link (footage_url), available until
-- footage_expires_at. After expiry the path and link are cleared but the date
-- stays, so My Requests can say the footage expired.

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'footage_path') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `footage_path` varchar(255) DEFAULT NULL AFTER `decision_note`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'footage_url') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `footage_url` varchar(500) DEFAULT NULL AFTER `footage_path`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'footage_attached_at') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `footage_attached_at` datetime DEFAULT NULL AFTER `footage_url`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'footage_expires_at') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `footage_expires_at` datetime DEFAULT NULL AFTER `footage_attached_at`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== auth_security =====
-- Email verification and device sign-in codes (login.php, verify_email.php,
-- verify_device.php, registration.php). Replaces the standalone script
-- add_auth_security.php so a database built from SetupDB.sql or migrated by
-- cron/migrate.php gets the same schema.
--
--   users.email_verified_at        NULL until the address is confirmed; login is
--                                  refused while it is NULL.
--   users.verification_token       emailed once at registration, cleared on use.
--   users.login_otp / _expires_at / _attempts
--                                  the six-digit code for a sign-in from a device
--                                  that is not trusted yet.
--   trusted_devices                SHA-256 of the cookie a verified device holds,
--                                  so it skips the code next time.
--
-- Accounts that exist when the columns are first added are marked verified so no
-- one is locked out. That backfill runs only on that first run (it is skipped
-- once email_verified_at exists), so re-running never verifies a new sign-up.
--
-- Every change checks information_schema first and runs through a prepared
-- statement: safe on MySQL 8 and MariaDB, through the mysql client or the
-- runner, and safe to re-run.

SET @fresh = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'email_verified_at') = 0, 1, 0);

SET @s = IF(@fresh = 1, 'ALTER TABLE `users` ADD COLUMN `email_verified_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'verification_token') = 0,
  'ALTER TABLE `users` ADD COLUMN `verification_token` varchar(64) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'login_otp') = 0,
  'ALTER TABLE `users` ADD COLUMN `login_otp` varchar(6) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'login_otp_expires_at') = 0,
  'ALTER TABLE `users` ADD COLUMN `login_otp_expires_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'login_otp_attempts') = 0,
  'ALTER TABLE `users` ADD COLUMN `login_otp_attempts` tinyint(3) unsigned NOT NULL DEFAULT 0', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF(@fresh = 1, 'UPDATE `users` SET `email_verified_at` = CURRENT_TIMESTAMP WHERE `email_verified_at` IS NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

CREATE TABLE IF NOT EXISTS `trusted_devices` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `device_token` char(64) NOT NULL,
  `user_agent` varchar(512) NOT NULL DEFAULT '',
  `ip_address` varchar(45) NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_used_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_trusted_device_token` (`device_token`),
  KEY `idx_trusted_devices_user` (`user_id`),
  CONSTRAINT `fk_trusted_devices_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ===== paymongo_refunds =====
-- Online refunds through PayMongo.
--   invoices.paymongo_payment_id          the pay_... id of the online payment that settled the bill
--   refund_requests.paymongo_payment_id   the payment a refund is taken from when no invoice names it
--   refund_requests.gateway_refund_id     the re_... id PayMongo returned for the payout
--   refund_requests.gateway_status        requesting / pending / processing / succeeded / failed
--   refund_requests.type                  + 'online_payment' (an online payment AMS could not apply)

-- Cancellation review details; statements are guarded for production upgrades.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'refund_requests' AND column_name = 'payout_destination') = 0,
  'ALTER TABLE `refund_requests` ADD COLUMN `payout_destination` varchar(255) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'refund_requests' AND column_name = 'paid_amount') = 0,
  'ALTER TABLE `refund_requests` ADD COLUMN `paid_amount` decimal(10,2) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'refund_requests' AND column_name = 'deposit_amount') = 0,
  'ALTER TABLE `refund_requests` ADD COLUMN `deposit_amount` decimal(10,2) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

UPDATE `refund_requests` SET `reason` = REPLACE(`reason`, 'Application rejected after payment:', 'Application rejected by admin after payment:')
WHERE `type` = 'rejected_application' AND `raised_by_role` = 'admin' AND `reason` LIKE 'Application rejected after payment:%';

-- Tenant cancellation review: payout routing and verified paid/deposit snapshots.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'paymongo_payment_id') = 0,
  'ALTER TABLE `invoices` ADD COLUMN `paymongo_payment_id` varchar(64) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'refund_requests' AND column_name = 'paymongo_payment_id') = 0,
  'ALTER TABLE `refund_requests` ADD COLUMN `paymongo_payment_id` varchar(64) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'refund_requests' AND column_name = 'gateway_refund_id') = 0,
  'ALTER TABLE `refund_requests` ADD COLUMN `gateway_refund_id` varchar(64) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'refund_requests' AND column_name = 'gateway_status') = 0,
  'ALTER TABLE `refund_requests` ADD COLUMN `gateway_status` varchar(20) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'refund_requests' AND column_name = 'type' AND column_type LIKE '%online_payment%') = 0,
  'ALTER TABLE `refund_requests` MODIFY COLUMN `type` enum(''advance'',''overpayment'',''rejected_application'',''rejected_charge'',''online_payment'') NOT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- A payment is raised as a refund once.
SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'refund_requests' AND index_name = 'idx_refund_gateway') = 0,
  'ALTER TABLE `refund_requests` ADD KEY `idx_refund_gateway` (`gateway_refund_id`)', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ===== house_rules_filipino =====
-- Filipino text for the four starter house rules (quiet hours, smoke-free,
-- visitors, paying rent on time); the children/pets and parking starters got
-- theirs in 2026_10_panelist_gaps.sql. A rule is filled only while its Filipino
-- title is empty, so wording an admin already wrote is kept. Plain UPDATEs: safe to re-run.
UPDATE `house_rules` SET `title_fil` = 'Igalang ang oras ng katahimikan',
  `description_fil` = 'Panatilihing mahina ang ingay mula 10:00 PM hanggang 7:00 AM upang makapagpahinga ang lahat ng residente.'
 WHERE `scope` = 'house' AND `title` = 'Respect quiet hours' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Bawal manigarilyo sa loob ng gusali',
  `description_fil` = 'Hindi pinapayagan ang paninigarilyo sa loob ng mga kwarto o saanmang saradong karaniwang lugar. Panatilihing malinis ang paligid at agad na iulat ang anumang sira.'
 WHERE `scope` = 'house' AND `title` = 'Smoke-free indoor areas' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Iparehistro ang iyong mga bisita',
  `description_fil` = 'Dapat maiparehistro sa management ng apartment ang lahat ng bisita at sundin nila ang mga patakaran sa pagpasok at kaligtasan ng gusali.'
 WHERE `scope` = 'house' AND `title` = 'Register your visitors' AND (`title_fil` IS NULL OR `title_fil` = '');
UPDATE `house_rules` SET `title_fil` = 'Magbayad ng upa sa tamang oras',
  `description_fil` = 'Ang buwanang upa ay dapat bayaran sa napagkasunduang petsa. Makipag-ugnayan agad sa management kung may tanong ka tungkol sa iyong bayad.'
 WHERE `scope` = 'house' AND `title` = 'Pay rent on time' AND (`title_fil` IS NULL OR `title_fil` = '');

-- ===== maintenance_workflow =====
-- Visit scheduling (date + morning/afternoon window the admin confirms), a tenant's
-- request to cancel work already under way, and the reason a tenant gives when a
-- completed repair was not fixed.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'maintenance_requests' AND column_name = 'scheduled_date') = 0,
  'ALTER TABLE `maintenance_requests` ADD COLUMN `scheduled_date` date DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'maintenance_requests' AND column_name = 'scheduled_window') = 0,
  'ALTER TABLE `maintenance_requests` ADD COLUMN `scheduled_window` varchar(20) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'maintenance_requests' AND column_name = 'cancel_requested_at') = 0,
  'ALTER TABLE `maintenance_requests` ADD COLUMN `cancel_requested_at` datetime DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'maintenance_requests' AND column_name = 'reopen_reason') = 0,
  'ALTER TABLE `maintenance_requests` ADD COLUMN `reopen_reason` varchar(255) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ===== announcement_pinning =====
-- An admin can pin a few sent announcements to the top of the tenants' feed.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'announcements' AND column_name = 'is_pinned') = 0,
  'ALTER TABLE `announcements` ADD COLUMN `is_pinned` tinyint(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ===== service_workflow =====
-- Add-on bookings: the visit the admin confirms (date + morning/afternoon window), a tenant's
-- request to cancel an approved booking, and the originally booked quantity/total kept when
-- the admin adjusts the quantity at completion (NULL = never adjusted).
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'service_requests' AND column_name = 'scheduled_date') = 0,
  'ALTER TABLE `service_requests` ADD COLUMN `scheduled_date` date DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'service_requests' AND column_name = 'scheduled_window') = 0,
  'ALTER TABLE `service_requests` ADD COLUMN `scheduled_window` varchar(20) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'service_requests' AND column_name = 'cancel_requested_at') = 0,
  'ALTER TABLE `service_requests` ADD COLUMN `cancel_requested_at` datetime DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'service_requests' AND column_name = 'booked_quantity') = 0,
  'ALTER TABLE `service_requests` ADD COLUMN `booked_quantity` decimal(10,2) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'service_requests' AND column_name = 'booked_total_cost') = 0,
  'ALTER TABLE `service_requests` ADD COLUMN `booked_total_cost` decimal(10,2) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ===== service_extras =====
-- Add-on services: an optional per-slot booking limit on each catalog item, a tenant's rating
-- of a completed booking, and categories as data (the three starters keep working).
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'service_catalog' AND column_name = 'max_per_slot') = 0,
  'ALTER TABLE `service_catalog` ADD COLUMN `max_per_slot` int(11) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'service_requests' AND column_name = 'rating') = 0,
  'ALTER TABLE `service_requests` ADD COLUMN `rating` tinyint(4) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'service_requests' AND column_name = 'rating_comment') = 0,
  'ALTER TABLE `service_requests` ADD COLUMN `rating_comment` varchar(255) DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'service_requests' AND column_name = 'rated_at') = 0,
  'ALTER TABLE `service_requests` ADD COLUMN `rated_at` datetime DEFAULT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
CREATE TABLE IF NOT EXISTS `service_categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category_key` varchar(20) NOT NULL,
  `label` varchar(60) NOT NULL,
  `label_fil` varchar(60) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_service_category_key` (`category_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
INSERT IGNORE INTO `service_categories` (`category_key`, `label`, `label_fil`, `sort_order`) VALUES
('cleaning', 'Cleaning', 'Paglilinis', 1),
('laundry', 'Laundry', 'Labada', 2),
('other', 'Other services', 'Iba pang serbisyo', 3);

-- ===== 2026_11_contract_end_and_preview.sql =====
-- ===== preview_page_hero =====
-- Preview page hero (Admin -> Other Settings -> Preview Page): photo ('' =
-- built-in, else a site_assets/preview_hero_* upload from
-- upload_preview_image.php), badge / title / location each with a show switch
-- and English / Filipino text ('' = the app's own wording), and the feature
-- chips. Shape checked by normalize_preview_hero() in config.php.
--
-- ===== contract_end =====
-- Admin -> Other Settings -> Contract End. extension_deadline_days: tenants may
-- request an extension until this many days before the rent ends (0 = no
-- deadline). The rent-end reminder can be switched off, and its email / SMS
-- separately ('1' / '0'). upcoming_rooms_enabled: Preview lists units that
-- will free up. lease_end_reminder_days already exists (default 30).
--
-- Idempotent: an existing row (a value the admin already saved) is kept.

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('preview_hero', '{"image":"","badge":{"show":true,"en":"","fil":""},"title":{"show":true,"en":"","fil":""},"location":{"show":true,"en":"","fil":""},"features":[{"en":"Motorcycle Parking","fil":"Paradahan ng Motor"},{"en":"Bathroom per Room","fil":"Banyo sa Bawat Kwarto"}]}'),
('extension_deadline_days', '0'),
('lease_end_reminders_enabled', '1'),
('lease_end_reminder_email', '1'),
('lease_end_reminder_sms', '1'),
('upcoming_rooms_enabled', '1');

-- ===== 2026_11_login_otp_controls.sql =====
-- ===== login_otp_controls =====
-- Admin → Other Settings → Sign-in Codes (login_otp_settings.php).
-- login_otp_enabled: '1' = a tenant signing in on a device it has not seen
--   gets an emailed 6-digit code (login.php / verify_device.php); '0' = no code
--   for anyone who follows the default. Starts on, as before this setting.
-- users.login_otp_mode: 'default' follows that switch, 'on' always asks this
--   account for a code on a new device, 'off' never does. Admins never get one.
-- Idempotent: an existing column or saved setting is kept.

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'login_otp_mode') = 0,
  'ALTER TABLE `users` ADD COLUMN `login_otp_mode` enum(''default'',''on'',''off'') NOT NULL DEFAULT ''default''', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('login_otp_enabled', '1');

-- ===== 2026_11_guest_chat_end.sql =====
-- Guest inquiry chat: "End chat on this device" now closes the chat on the
-- server instead of deleting the guest's key from the browser. The chat stays
-- readable on that device, but nobody can send in it any more, and Messages
-- lists it under Archived (guest_chat.php action=end_chat).
-- Idempotent: the column is added only when missing.

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inquiries' AND COLUMN_NAME = 'guest_chat_ended_at') = 0,
  'ALTER TABLE `inquiries` ADD COLUMN `guest_chat_ended_at` datetime DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===== 2026_11_guest_chat_resolution.sql =====
-- Guest inquiry chat: the admin can ask "Did this answer your question?" in the
-- chat (guest_messages.kind = 'resolution_check'); the guest answers with
-- Problem resolved / Not yet (resolution_answer). The guest's "End chat on this
-- device" appears only after a "resolved" answer (guest_chat.php).
-- Idempotent: each column is added only when missing.

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guest_messages' AND COLUMN_NAME = 'kind') = 0,
  'ALTER TABLE `guest_messages` ADD COLUMN `kind` enum(''text'',''resolution_check'') NOT NULL DEFAULT ''text'' AFTER `sender_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guest_messages' AND COLUMN_NAME = 'resolution_answer') = 0,
  'ALTER TABLE `guest_messages` ADD COLUMN `resolution_answer` enum(''resolved'',''not_yet'') DEFAULT NULL AFTER `reply_to_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guest_messages' AND COLUMN_NAME = 'resolution_answered_at') = 0,
  'ALTER TABLE `guest_messages` ADD COLUMN `resolution_answered_at` datetime DEFAULT NULL AFTER `resolution_answer`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===== 2026_11_last_login.sql =====
-- users.last_login_at: when the account last signed in (login.php, and
-- verify_device.php after a sign-in code). NULL = never signed in, so the
-- first sign-in can greet "Welcome" instead of "Welcome back".
-- Idempotent: the column is added only when missing. When it is added, the
-- accounts that already exist count as having signed in, except those still
-- waiting for their verification link (they cannot have signed in yet).

SET @missing := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'last_login_at') = 0;

SET @sql := IF(@missing,
  'ALTER TABLE `users` ADD COLUMN `last_login_at` datetime DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@missing,
  'UPDATE `users` SET `last_login_at` = NOW() WHERE `last_login_at` IS NULL AND `verification_token` IS NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===== 2026_11_parking_slots.sql =====
-- ============================================================
-- 2026_11_parking_slots.sql
-- Parking slots the admin manages one by one (Admin → Parking → Slots), in
-- place of the "max_parking_slots" count and the one global vehicle-type list.
--
--   parking_slots          label, icon, the vehicle types it takes, whether an
--                          OR/CR is required, active | maintenance, archived_at
--                          (removed slots are archived so old reservations keep
--                          their label). parking_reservations.slot_number holds
--                          parking_slots.id: the slots made here get ids 1..N,
--                          so the slot numbers already assigned stay valid.
--   parking_reservations   monthly_fee (fixed when the request is made; 0 =
--                          free parking), plate / transmission / OR/CR may be
--                          empty (an e-bike has no plate; a slot may not need
--                          the OR/CR), and a tenant may hold more than one
--                          reservation (parking_max_per_tenant, checked in PHP).
--   system_settings        parking_free, parking_max_per_tenant,
--                          parking_max_duration_months; max_parking_slots and
--                          parking_allowed_vehicle_types are turned into slots
--                          and removed.
--
-- Every step checks first, so the file is safe to run again (MariaDB / MySQL 8,
-- the mysql client or cron/migrate.php).
-- ============================================================

-- 1. The slots table
CREATE TABLE IF NOT EXISTS `parking_slots` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `label` varchar(20) NOT NULL,
  `icon` varchar(20) NOT NULL DEFAULT 'motorcycle',
  `vehicle_types` varchar(255) NOT NULL DEFAULT '["motorcycle"]',
  `requires_registration` tinyint(1) NOT NULL DEFAULT 1,
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `archived_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `live_label` varchar(20) GENERATED ALWAYS AS (IF(`archived_at` IS NULL, `label`, NULL)) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_live_label` (`live_label`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2. Slots 1..N from the old settings, once (only while the table is empty).
--    N covers any slot number a reservation already uses.
SET @slots_empty := (SELECT COUNT(*) FROM `parking_slots`) = 0;
SET @old_max := COALESCE((SELECT CAST(`setting_value` AS UNSIGNED) FROM `system_settings` WHERE `setting_key` = 'max_parking_slots'), 3);
SET @old_max := LEAST(GREATEST(@old_max, COALESCE((SELECT MAX(`slot_number`) FROM `parking_reservations`), 0), 1), 100);
SET @old_types := LOWER(COALESCE((SELECT `setting_value` FROM `system_settings` WHERE `setting_key` = 'parking_allowed_vehicle_types'), '["motorcycle"]'));
SET @old_types := IF(@old_types LIKE '[%]' AND @old_types <> '[]', @old_types, '["motorcycle"]');
SET @old_icon := CASE
  WHEN @old_types LIKE '%motorcycle%' THEN 'motorcycle'
  WHEN @old_types LIKE '%sedan%' OR @old_types LIKE '%suv%' OR @old_types LIKE '%pickup%' THEN 'car'
  WHEN @old_types LIKE '%van%' THEN 'van'
  WHEN @old_types LIKE '%ebike%' THEN 'ebike'
  ELSE 'motorcycle' END;

INSERT INTO `parking_slots` (`id`, `label`, `icon`, `vehicle_types`, `requires_registration`, `status`, `sort_order`)
SELECT n.n, CAST(n.n AS CHAR), @old_icon, @old_types, 1, 'active', n.n
FROM (SELECT d1.d + d2.d * 10 + 1 AS n
      FROM (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d1
      CROSS JOIN (SELECT 0 AS d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d2) n
WHERE @slots_empty AND n.n <= @old_max
ORDER BY n.n;

-- 3. parking_reservations.monthly_fee, filled for existing rows from their total
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND column_name = 'monthly_fee') = 0,
  'ALTER TABLE `parking_reservations` ADD COLUMN `monthly_fee` decimal(10,2) DEFAULT NULL AFTER `total_cost`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

UPDATE `parking_reservations` SET `monthly_fee` = ROUND(`total_cost` / `duration_months`, 2)
WHERE `monthly_fee` IS NULL AND `duration_months` > 0;

-- 4. Plate, transmission and OR/CR may be empty
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND column_name = 'plate_number' AND is_nullable = 'NO') = 1,
  'ALTER TABLE `parking_reservations` MODIFY `plate_number` varchar(20) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND column_name = 'transmission' AND is_nullable = 'NO') = 1,
  'ALTER TABLE `parking_reservations` MODIFY `transmission` varchar(50) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND column_name = 'document_path' AND is_nullable = 'NO') = 1,
  'ALTER TABLE `parking_reservations` MODIFY `document_path` varchar(255) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- 5. More than one reservation per tenant: drop the one-open-per-tenant key
SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND index_name = 'uniq_open_user') > 0,
  'ALTER TABLE `parking_reservations` DROP INDEX `uniq_open_user`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'parking_reservations' AND column_name = 'open_user') > 0,
  'ALTER TABLE `parking_reservations` DROP COLUMN `open_user`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- 6. Settings: the new ones, and the two the slots replace
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('parking_free', '0'),
('parking_max_per_tenant', '1'),
('parking_max_duration_months', '6');

DELETE FROM `system_settings` WHERE `setting_key` IN ('max_parking_slots', 'parking_allowed_vehicle_types');

-- ===== 2026_11_deposit_refund_policy.sql =====
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


-- ===== 2026_11_rent_control.sql =====
-- RA 9653 (Rent Control Act of 2009) compliance, 2026-11-13.
--   lease_renewals.previous_rent   the rent before a renewal; the yearly rent-control
--                                  cap is measured from the first raise of the year
--   lease_contracts.eviction_ground the RA 9653 Sec. 9 ground of an eviction flag or
--                                  termination (arrears, sublease, owner_use,
--                                  condemnation, lease_expired, mutual)
--   settings rent_cap_percent / rent_cap_max_covered_rent / rent_cap_valid_until
--                                  NHSB Resolution 2024-01: 1% in 2026 for units
--                                  at PHP 10,000 a month or less
--   every held deposit is refundable (Sec. 7: only itemized loss is kept)
--   a percentage late fee is at most 5% (Civil Code Art. 1229)
-- Idempotent; guarded for production (MySQL 8, one statement at a time).

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_renewals' AND column_name = 'previous_rent') = 0,
  'ALTER TABLE `lease_renewals` ADD COLUMN `previous_rent` decimal(10,2) DEFAULT NULL AFTER `new_lease_end`', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_contracts' AND column_name = 'eviction_ground') = 0,
  'ALTER TABLE `lease_contracts` ADD COLUMN `eviction_ground` varchar(30) DEFAULT NULL AFTER `eviction_status`', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('rent_cap_percent', '1'),
('rent_cap_max_covered_rent', '10000'),
('rent_cap_valid_until', '2026-12-31');

UPDATE `system_settings` SET `setting_value` = '1' WHERE `setting_key` = 'deposit_refundable_default';
UPDATE `lease_contracts` SET `deposit_refundable` = 1 WHERE `deposit_refundable` = 0 AND `deposit_status` IN ('Held', 'Pending');

UPDATE `system_settings` SET `setting_value` = '5'
WHERE `setting_key` = 'late_fee_value'
  AND (SELECT v FROM (SELECT `setting_value` AS v FROM `system_settings` WHERE `setting_key` = 'late_fee_type') t) = 'percent'
  AND CAST(`setting_value` AS DECIMAL(10,2)) > 5;


-- ===== 2026_11_registration_consent.sql =====
-- Registration consent (RA 10173), 2026-11-13.
--   users.terms_agreed_at  when the person ticked the Terms and Privacy Notice box
--   users.terms_version    the version of those texts they agreed to (the
--                          "Last updated" date of ams-react/src/config/legalContent.js)
-- Accounts created before this have NULL in both.
-- Idempotent; guarded for production (MySQL 8, one statement at a time).

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'terms_agreed_at') = 0,
  'ALTER TABLE `users` ADD COLUMN `terms_agreed_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'terms_version') = 0,
  'ALTER TABLE `users` ADD COLUMN `terms_version` varchar(20) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== 2026_11_rejected_proof_path.sql =====
-- A rejected payment proof keeps its file for the admin (reject_payment_proof.php copies the
-- path here before clearing proof_of_payment_path, which pay_bill.php needs empty to ask for a
-- new proof). 2026-11-14. Idempotent; guarded for production.

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'rejected_proof_path') = 0,
  'ALTER TABLE `invoices` ADD COLUMN `rejected_proof_path` varchar(255) DEFAULT NULL AFTER `proof_rejection_reason`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;


-- ===== 2026_11_emergency_contact.sql =====
-- Emergency contact (SPRINT 186): who to call if something happens to a tenant.
--   users.emergency_*             the tenant's current contact (edited in Profile Settings)
--   rent_applications.emergency_* the contact given on that application (a snapshot)
-- Nullable: accounts and applications created before this have none; the rent
-- application form requires them for every new or resubmitted application.
-- Idempotent; guarded for production (MySQL 8, one statement at a time).

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'emergency_name') = 0,
  'ALTER TABLE `users` ADD COLUMN `emergency_name` varchar(100) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'emergency_relationship') = 0,
  'ALTER TABLE `users` ADD COLUMN `emergency_relationship` varchar(50) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'emergency_phone') = 0,
  'ALTER TABLE `users` ADD COLUMN `emergency_phone` varchar(30) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'emergency_name') = 0,
  'ALTER TABLE `rent_applications` ADD COLUMN `emergency_name` varchar(100) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'emergency_relationship') = 0,
  'ALTER TABLE `rent_applications` ADD COLUMN `emergency_relationship` varchar(50) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'emergency_phone') = 0,
  'ALTER TABLE `rent_applications` ADD COLUMN `emergency_phone` varchar(30) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;


-- ===== 2026_11_announcement_recipients.sql =====
-- announcements.send_to also holds 'Tenants: 2,3,5' (an announcement addressed to chosen tenants,
-- by user id, up to ANNOUNCEMENT_MAX_CHOSEN_TENANTS), so it grows from varchar(50). 2026-11-14.
-- Idempotent; guarded for production.

SET @s = IF((SELECT COALESCE(MAX(character_maximum_length), 0) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'announcements' AND column_name = 'send_to') < 600,
  'ALTER TABLE `announcements` MODIFY COLUMN `send_to` varchar(600) NOT NULL DEFAULT ''All Tenants''', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;


-- ===== 2026_11_complaints.sql =====
-- Complaints (SPRINT 189, checklist 7.7): a tenant files a complaint with a
-- category; the admin works it Open -> In Review -> Resolved. The conversation
-- itself stays in `messages`; messages that belong to a complaint carry its id.
--   complaints          one row per complaint (status lives here)
--   messages.complaint_id  the complaint a message belongs to (NULL for ordinary chat)
-- Idempotent; guarded for production (MySQL 8, one statement at a time).

SET @s = IF((SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'complaints') = 0,
  'CREATE TABLE `complaints` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `user_id` int(11) NOT NULL,
    `category` enum("Maintenance","Billing","Neighbor","Noise","Staff","Other") NOT NULL,
    `status` enum("Open","In Review","Resolved") NOT NULL DEFAULT "Open",
    `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
    `resolved_at` datetime DEFAULT NULL,
    `resolved_by` int(11) DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_complaints_user_status` (`user_id`, `status`),
    KEY `idx_complaints_status` (`status`, `created_at`),
    CONSTRAINT `fk_complaints_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_complaints_resolver` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'messages' AND column_name = 'complaint_id') = 0,
  'ALTER TABLE `messages` ADD COLUMN `complaint_id` int(11) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'messages' AND index_name = 'idx_messages_complaint') = 0,
  'ALTER TABLE `messages` ADD KEY `idx_messages_complaint` (`complaint_id`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'messages' AND constraint_name = 'fk_messages_complaint') = 0,
  'ALTER TABLE `messages` ADD CONSTRAINT `fk_messages_complaint` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`id`) ON DELETE SET NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== refund_payout_proof =====
-- (SPRINT 182, audit P-13) A refund paid out by hand keeps a proof file: the stored
-- path under uploads/refunds/. Nullable: older and cash payouts have none.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'refund_requests' AND column_name = 'payout_proof_path') = 0,
  'ALTER TABLE `refund_requests` ADD COLUMN `payout_proof_path` varchar(255) DEFAULT NULL AFTER `payout_destination`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== cctv_privacy_consent =====
-- When the tenant agreed to the CCTV privacy notice (cctv_request.php writes it on
-- every new request). It was added to SetupDB.sql without a migration, so a
-- database built before it could not save a CCTV request.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cctv_requests' AND column_name = 'privacy_consent_at') = 0,
  'ALTER TABLE `cctv_requests` ADD COLUMN `privacy_consent_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== inquiry_admin_seen =====
-- (SPRINT 225) When an admin first opened the inquiry (Inquiries chat window or its
-- guest chat in Messages). NULL = nobody has looked yet: only those count as New in
-- the list, the sidebar and the Dashboard. Existing inquiries past New are marked
-- seen at their last update, so only untouched New ones stay new.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'admin_seen_at') = 0,
  'ALTER TABLE `inquiries` ADD COLUMN `admin_seen_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

UPDATE `inquiries` SET `admin_seen_at` = `updated_at`, `updated_at` = `updated_at` WHERE `admin_seen_at` IS NULL AND `status` <> 'New';

-- ===== chat_followups =====
-- (SPRINT 226) "Is it resolved?" in account chats, like guest chats already have:
-- messages.kind = 'resolution_check' is the office asking (about an inquiry or a
-- problem report), answered by the tenant with resolution_answer. inquiry_id ties a
-- message to the inquiry it answers (Inquiries chat window). Two follow-up settings:
-- an inquiry nobody replied to for N days closes itself, a report the office
-- answered and the tenant left for N days resolves itself (0 = never).
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'messages' AND column_name = 'kind') = 0,
  'ALTER TABLE `messages` ADD COLUMN `kind` enum(''text'',''resolution_check'') NOT NULL DEFAULT ''text''', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'messages' AND column_name = 'resolution_answer') = 0,
  'ALTER TABLE `messages` ADD COLUMN `resolution_answer` enum(''resolved'',''not_yet'') DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'messages' AND column_name = 'resolution_answered_at') = 0,
  'ALTER TABLE `messages` ADD COLUMN `resolution_answered_at` datetime DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'messages' AND column_name = 'inquiry_id') = 0,
  'ALTER TABLE `messages` ADD COLUMN `inquiry_id` int(11) DEFAULT NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'messages' AND index_name = 'idx_messages_inquiry') = 0,
  'ALTER TABLE `messages` ADD KEY `idx_messages_inquiry` (`inquiry_id`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'messages' AND constraint_name = 'fk_messages_inquiry') = 0,
  'ALTER TABLE `messages` ADD CONSTRAINT `fk_messages_inquiry` FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries` (`id`) ON DELETE SET NULL', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('inquiry_auto_close_days', '30'),
('complaint_auto_resolve_days', '14');

-- ===== guest_token_hash =====
-- (SPRINT 82) inquiries.guest_token now holds the sha256 of the token the guest's
-- browser keeps. guest_token_hashed marks which rows are already hashed, so this
-- section can run twice without hashing a hash: add the column (existing rows: 0),
-- hash every row still at 0, then make new rows default to 1 (the application
-- writes hashes from now on). The PHP and this update must ship together.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inquiries' AND column_name = 'guest_token_hashed') = 0,
  'ALTER TABLE `inquiries` ADD COLUMN `guest_token_hashed` tinyint(1) NOT NULL DEFAULT 0 AFTER `guest_token`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

UPDATE `inquiries` SET `guest_token` = SHA2(`guest_token`, 256), `guest_token_hashed` = 1 WHERE `guest_token` IS NOT NULL AND `guest_token_hashed` = 0;
UPDATE `inquiries` SET `guest_token_hashed` = 1 WHERE `guest_token` IS NULL AND `guest_token_hashed` = 0;

ALTER TABLE `inquiries` ALTER COLUMN `guest_token_hashed` SET DEFAULT 1;

-- ===== messages_conversation_indexes =====
-- (SPRINT 206) get_conversations.php reads one person's messages as two index-friendly
-- halves (sent: sender_id first; received: receiver_id first) and ranks them per partner.
-- Each composite index serves one half and the ORDER BY created_at.
SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'messages' AND index_name = 'idx_messages_sender_receiver_created') = 0,
  'ALTER TABLE `messages` ADD KEY `idx_messages_sender_receiver_created` (`sender_id`, `receiver_id`, `created_at`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'messages' AND index_name = 'idx_messages_receiver_sender_created') = 0,
  'ALTER TABLE `messages` ADD KEY `idx_messages_receiver_sender_created` (`receiver_id`, `sender_id`, `created_at`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== erasure_and_terms_version =====
-- (SPRINT 177) users.anonymized_at: set when the office anonymized a former tenant's
-- account on request (RA 10173 right to erasure); the row stays so invoices and
-- payments keep their records. rent_applications.terms_version: which Terms version
-- the applicant agreed to (users already has it).
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'anonymized_at') = 0,
  'ALTER TABLE `users` ADD COLUMN `anonymized_at` datetime DEFAULT NULL AFTER `is_archived`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'terms_version') = 0,
  'ALTER TABLE `rent_applications` ADD COLUMN `terms_version` varchar(20) DEFAULT NULL AFTER `terms_agreed_at`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== floor_rates_default =====
-- (SPRINT 80) Settings -> Floor Rent shipped empty ('{}'), so a new unit had no
-- price. The manager's rates are the default now: 1F and 2F 4,000, 3F 3,500. A
-- database where an admin already set rates keeps them; only an empty value is
-- filled.
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('floor_rates', '{"1F": 4000, "2F": 4000, "3F": 3500}');
UPDATE `system_settings` SET `setting_value` = '{"1F": 4000, "2F": 4000, "3F": 3500}' WHERE `setting_key` = 'floor_rates' AND TRIM(`setting_value`) IN ('', '{}', '[]');

-- ===== signed_contract_review =====
-- (SPRINT 239) The tenant's signed copy of the rent contract (a photo or a PDF from
-- Track Application) is checked by the office before it counts: pending -> accepted,
-- or rejected with a note, after which the tenant uploads a new copy. NULL with a file
-- = a copy from before this review existed, treated as accepted. A copy still on a
-- draft contract is put in the queue to check.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_contracts' AND column_name = 'signed_lease_uploaded_at') = 0,
  'ALTER TABLE `lease_contracts` ADD COLUMN `signed_lease_uploaded_at` datetime DEFAULT NULL AFTER `signed_lease_path`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_contracts' AND column_name = 'signed_lease_review') = 0,
  'ALTER TABLE `lease_contracts` ADD COLUMN `signed_lease_review` enum(''pending'',''accepted'',''rejected'') DEFAULT NULL AFTER `signed_lease_uploaded_at`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_contracts' AND column_name = 'signed_lease_review_note') = 0,
  'ALTER TABLE `lease_contracts` ADD COLUMN `signed_lease_review_note` varchar(255) DEFAULT NULL AFTER `signed_lease_review`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_contracts' AND column_name = 'signed_lease_reviewed_at') = 0,
  'ALTER TABLE `lease_contracts` ADD COLUMN `signed_lease_reviewed_at` datetime DEFAULT NULL AFTER `signed_lease_review_note`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_contracts' AND column_name = 'signed_lease_reviewed_by') = 0,
  'ALTER TABLE `lease_contracts` ADD COLUMN `signed_lease_reviewed_by` int(11) DEFAULT NULL AFTER `signed_lease_reviewed_at`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

UPDATE `lease_contracts` SET `signed_lease_review` = 'pending'
 WHERE `status` = 'draft' AND `signed_lease_path` IS NOT NULL AND `signed_lease_path` <> '' AND `signed_lease_review` IS NULL;

-- ===== notarized_contract =====
-- (SPRINT 240) Notarizing the rent contract in person. The tenant takes the signed
-- contract to a notary and tells the office from My Room (notarized_ready_at, admin
-- queue type notarized_contract); the office marks it received on Contracts
-- (notarized_at / notarized_by). A scan in notarized_lease_path counts as notarized too.
-- contract_require_notarized ('1' / '0', Contracts page settings) decides whether a
-- contract without a notarized copy counts as missing documents.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_contracts' AND column_name = 'notarized_ready_at') = 0,
  'ALTER TABLE `lease_contracts` ADD COLUMN `notarized_ready_at` datetime DEFAULT NULL AFTER `notarized_lease_path`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_contracts' AND column_name = 'notarized_at') = 0,
  'ALTER TABLE `lease_contracts` ADD COLUMN `notarized_at` datetime DEFAULT NULL AFTER `notarized_ready_at`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_contracts' AND column_name = 'notarized_by') = 0,
  'ALTER TABLE `lease_contracts` ADD COLUMN `notarized_by` int(11) DEFAULT NULL AFTER `notarized_at`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('contract_require_notarized', '1');

-- ===== contract_renewal_history =====
-- (SPRINT 241) Tenant contract history and renewed contract signing.
-- When a rent term is extended (extend_tenancy), the previous signed contract is preserved
-- in lease_renewals (previous_signed_lease_path), and the extended term requires an updated
-- signed contract from the tenant. ViewContract features the uploaded signed document as the
-- primary view, with history navigation for past renewals/terms.

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_renewals' AND column_name = 'previous_signed_lease_path') = 0,
  'ALTER TABLE `lease_renewals` ADD COLUMN `previous_signed_lease_path` varchar(255) DEFAULT NULL AFTER `rent_at_renewal`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'lease_renewals' AND column_name = 'previous_notarized_lease_path') = 0,
  'ALTER TABLE `lease_renewals` ADD COLUMN `previous_notarized_lease_path` varchar(255) DEFAULT NULL AFTER `previous_signed_lease_path`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== list_paging_indexes =====
-- Server-side list paging: Admin Payments reads only the open bills
-- (get_invoices.php ?view=desk, WHERE status IN (...)) and the maintenance board
-- reads open tickets plus recently closed ones (?closedDays=), so both filter on status.
SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'invoices' AND index_name = 'idx_invoices_status_due') = 0,
  'ALTER TABLE `invoices` ADD KEY `idx_invoices_status_due` (`status`, `due_date`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'maintenance_requests' AND index_name = 'idx_maint_status_created') = 0,
  'ALTER TABLE `maintenance_requests` ADD KEY `idx_maint_status_created` (`status`, `created_at`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

-- ===== final_period_proration =====
-- Settings -> Payments "Prorate the final rent period" (off by default, so billing
-- stays by whole tenancy months until the owner turns it on). The move-out
-- clearance records the day the tenant actually left in rent_applications.moved_out_date;
-- with the setting on, the last rent period is charged rent / 30 per day up to that day.
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rent_applications' AND column_name = 'moved_out_date') = 0,
  'ALTER TABLE `rent_applications` ADD COLUMN `moved_out_date` date DEFAULT NULL AFTER `requested_move_out_date`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('prorate_final_period', '0');

-- ===== room_transfers =====
-- A tenant moved to another unit without moving out (transfer_room.php): the same
-- rent application, contract and rent anniversary; one row per move, kept as the
-- paper trail (the contract shows the current room). new_rent applies from
-- effective_period_start; the deposit is matched to it by a top-up invoice
-- (deposit_invoice_id) or a refund request for the excess (refund_request_id).
CREATE TABLE IF NOT EXISTS `room_transfers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rent_application_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `from_room` varchar(50) NOT NULL,
  `to_room` varchar(50) NOT NULL,
  `old_rent` decimal(10,2) NOT NULL,
  `new_rent` decimal(10,2) NOT NULL,
  `old_deposit` decimal(10,2) NOT NULL DEFAULT 0.00,
  `new_deposit` decimal(10,2) NOT NULL DEFAULT 0.00,
  `effective_period_start` date DEFAULT NULL,
  `deposit_invoice_id` varchar(50) DEFAULT NULL,
  `refund_request_id` int(11) DEFAULT NULL,
  `reason` varchar(255) NOT NULL,
  `transferred_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_room_transfers_app` (`rent_application_id`),
  CONSTRAINT `fk_room_transfers_app` FOREIGN KEY (`rent_application_id`) REFERENCES `rent_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ===== utility_multiple_bills =====
-- Allow attaching multiple provider bills (electricity + water) to a utility reading
-- by storing JSON array of paths in bill_file_path text.
ALTER TABLE `utility_readings` MODIFY `bill_file_path` text DEFAULT NULL;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
  ('utility_auto_sync', '1'),
  ('utility_default_billing_mode', 'merge'),
  ('utility_allow_tenant_self_pay', '1');

-- ===== recover_unlinked_current_contracts =====
-- Older deployed data can have active/draft contracts with a NULL
-- rent_application_id. The Contracts page then classifies every one as a past
-- tenant. Link only uniquely matched current applications: same rent/deposit,
-- move-in and lease start within seven days, and current application plus
-- active/draft contract statuses. Ambiguous or incomplete rows stay untouched.
DROP TEMPORARY TABLE IF EXISTS `ams_contract_link_candidates`;
CREATE TEMPORARY TABLE `ams_contract_link_candidates` (
  `contract_id` varchar(50) NOT NULL,
  `rent_application_id` int(11) NOT NULL,
  PRIMARY KEY (`contract_id`),
  UNIQUE KEY `uq_ams_contract_link_app` (`rent_application_id`)
) ENGINE=MEMORY DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `ams_contract_link_candidates` (`contract_id`, `rent_application_id`)
SELECT contract_candidates.`contract_id`, contract_candidates.`rent_application_id`
  FROM (
    SELECT lc.`id` AS `contract_id`, MIN(ra.`id`) AS `rent_application_id`
      FROM `lease_contracts` lc
      JOIN `rent_applications` ra
        ON ra.`status` IN ('active', 'Approved', 'pending-move-out')
       AND ra.`move_in_date` IS NOT NULL
       AND ra.`monthly_rent` = lc.`deposit_amount`
       AND ABS(DATEDIFF(lc.`lease_start`, ra.`move_in_date`)) <= 7
     WHERE lc.`rent_application_id` IS NULL
       AND lc.`status` IN ('active', 'draft')
     GROUP BY lc.`id`
    HAVING COUNT(*) = 1
  ) AS contract_candidates
  JOIN (
    SELECT app_candidates.`rent_application_id`
      FROM (
        SELECT lc.`id` AS `contract_id`, ra.`id` AS `rent_application_id`
          FROM `lease_contracts` lc
          JOIN `rent_applications` ra
            ON ra.`status` IN ('active', 'Approved', 'pending-move-out')
           AND ra.`move_in_date` IS NOT NULL
           AND ra.`monthly_rent` = lc.`deposit_amount`
           AND ABS(DATEDIFF(lc.`lease_start`, ra.`move_in_date`)) <= 7
         WHERE lc.`rent_application_id` IS NULL
           AND lc.`status` IN ('active', 'draft')
      ) AS app_candidates
     GROUP BY app_candidates.`rent_application_id`
    HAVING COUNT(*) = 1
  ) AS unique_applications
    ON unique_applications.`rent_application_id` = contract_candidates.`rent_application_id`;

UPDATE `lease_contracts` lc
JOIN `ams_contract_link_candidates` candidates ON candidates.`contract_id` = lc.`id`
   SET lc.`rent_application_id` = candidates.`rent_application_id`
 WHERE lc.`rent_application_id` IS NULL;

DROP TEMPORARY TABLE IF EXISTS `ams_contract_link_candidates`;
