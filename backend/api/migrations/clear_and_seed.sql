-- ============================================================
-- CLEAN RESET AND SEED SCRIPT — ams_db
-- Clears most tables and seeds admin, minimum 5 user accounts,
-- specified rooms, and system settings.
-- ============================================================

USE ams_db;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Clear all operational tables
TRUNCATE TABLE `invoices`;
TRUNCATE TABLE `lease_contracts`;
TRUNCATE TABLE `rent_applications`;
TRUNCATE TABLE `maintenance_requests`;
TRUNCATE TABLE `parking_reservations`;
TRUNCATE TABLE `cctv_requests`;
TRUNCATE TABLE `notifications`;
TRUNCATE TABLE `announcements`;
TRUNCATE TABLE `activity_logs`;

-- 2. Clear core data tables
TRUNCATE TABLE `users`;
TRUNCATE TABLE `rooms`;
TRUNCATE TABLE `system_settings`;

-- Reset AUTO_INCREMENT counters
ALTER TABLE `users`                 AUTO_INCREMENT = 1;
ALTER TABLE `rent_applications`     AUTO_INCREMENT = 1;
ALTER TABLE `maintenance_requests`  AUTO_INCREMENT = 1;
ALTER TABLE `parking_reservations`  AUTO_INCREMENT = 1;
ALTER TABLE `cctv_requests`         AUTO_INCREMENT = 1;
ALTER TABLE `notifications`         AUTO_INCREMENT = 1;
ALTER TABLE `announcements`         AUTO_INCREMENT = 1;
ALTER TABLE `activity_logs`         AUTO_INCREMENT = 1;

-- 3. Seed Users
-- Admin password: admin123
-- Tenant passwords: tenant123
INSERT INTO `users` (`id`, `first_name`, `last_name`, `email_address`, `password`, `role`) VALUES
(1, 'Admin', 'User', 'admin@gmail.com', '$2y$10$kyF64U0j2xVl0PN1wiqJ5eaDR14ZhjAxjVTnRC0yLleTl9Rdi4Nli', 'admin'), -- password: admin123
(2, 'Maria', 'Santos', 'maria.santos@gmail.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC//wjChp3/LK3MNjEa2', 'user'), -- password: tenant123
(3, 'Jose', 'Reyes', 'jose.reyes@gmail.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC//wjChp3/LK3MNjEa2', 'user'), -- password: tenant123
(4, 'Pedro', 'Cruz', 'pedro.cruz@gmail.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC//wjChp3/LK3MNjEa2', 'user'), -- password: tenant123
(5, 'Rosa', 'Dela Cruz', 'rosa.delacruz@gmail.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC//wjChp3/LK3MNjEa2', 'user'), -- password: tenant123
(6, 'Ben', 'Flores', 'ben.flores@gmail.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC//wjChp3/LK3MNjEa2', 'user'); -- password: tenant123

-- Add avatar_url column to users if not exists (migrated in SetupDB)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255) DEFAULT NULL;

-- 4. Seed Rooms
-- 1F: 5 rooms, 4000 price
-- 2F: 4 rooms, 4000 price
-- 3F: 4 rooms, 3500 price
INSERT INTO `rooms` (`id`, `type`, `floor`, `monthly_rent`, `status`, `tenant_name`, `lease_start`, `lease_end`, `last_tenant`, `maintenance_flag`, `occupants`) VALUES
('A', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('B', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('C', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('D', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('E', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('F', 'Studio', '2F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('G', 'Studio', '2F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('H', 'Studio', '2F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('I', 'Studio', '2F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('J', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('K', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('L', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('M', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0);

-- 5. Seed Default System Settings
INSERT INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('system_name', 'Apartment Management System'),
('contact_email', 'admin@ams.com'),
('contact_phone', '+63 912 345 6789'),
('currency_symbol', '₱'),
('maintenance_auto_assign', 'true'),
('minLeaseDuration', '3'),
('overdueThresholdDays', '15'),
('autoFlagEviction', 'true'),
('maintenanceMonthlyBudget', '50000'),
('tenantResponsibilityClause', '"Per the Terms & Conditions of this lease agreement, the Tenant shall be responsible for any damage or maintenance issues caused by negligence, misuse, or unauthorized modifications to the leased unit. Costs for such repairs will be billed directly to the Tenant and are excluded from the building\'s maintenance budget allocation."');

SET FOREIGN_KEY_CHECKS = 1;
