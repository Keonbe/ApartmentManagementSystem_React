-- ============================================================
-- CLEAR AND SEED SCRIPT — ams_db
-- Truncates every operational table and restores exactly the default rows
-- SetupDB.sql inserts on a fresh import: the admin account, the 14 rooms in
-- the current 4/4/6 layout, the default system_settings, and the service
-- catalog. Never run this against production — the admin password below is
-- the shared demo password, not a real credential.
--
-- Unlike SetupDB.sql, this never drops or creates a table, so it's safe to
-- run against a database that already has the current schema. Keep the
-- inserts below byte-for-byte in sync with SetupDB.sql's "SEED DATA" section.
--
-- Usage:  mysql -u root ams_db < clear_and_seed.sql
--         mysql -u root ams_db < seed_mock_data.sql   # optional demo data
-- ============================================================

USE ams_db;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Truncate every table SetupDB.sql creates (order doesn't matter with FK
--    checks off). New tables added to SetupDB.sql should be added here too.
TRUNCATE TABLE `activity_logs`;
TRUNCATE TABLE `announcements`;
TRUNCATE TABLE `cctv_requests`;
TRUNCATE TABLE `contract_template_versions`;
TRUNCATE TABLE `invoices`;
TRUNCATE TABLE `lease_contracts`;
TRUNCATE TABLE `lease_renewals`;
TRUNCATE TABLE `maintenance_requests`;
TRUNCATE TABLE `messages`;
TRUNCATE TABLE `notifications`;
TRUNCATE TABLE `parking_reservations`;
TRUNCATE TABLE `rent_applications`;
TRUNCATE TABLE `rooms`;
TRUNCATE TABLE `system_settings`;
TRUNCATE TABLE `users`;
TRUNCATE TABLE `visitor_logs`;
TRUNCATE TABLE `inquiries`;
TRUNCATE TABLE `guest_messages`;
TRUNCATE TABLE `guest_chat_links`;
TRUNCATE TABLE `unit_reservations`;
TRUNCATE TABLE `household_members`;
TRUNCATE TABLE `expenses`;
TRUNCATE TABLE `unit_waitlist`;
TRUNCATE TABLE `notification_preferences`;
TRUNCATE TABLE `parking_charges`;
TRUNCATE TABLE `service_catalog`;
TRUNCATE TABLE `service_requests`;
TRUNCATE TABLE `utility_readings`;
TRUNCATE TABLE `sessions`;
TRUNCATE TABLE `login_attempts`;
TRUNCATE TABLE `password_resets`;
TRUNCATE TABLE `password_reset_requests`;
TRUNCATE TABLE `payment_proof_parts`;
TRUNCATE TABLE `payment_transactions`;
TRUNCATE TABLE `rate_limit_events`;
TRUNCATE TABLE `application_documents`;
TRUNCATE TABLE `deposit_deductions`;
TRUNCATE TABLE `invoice_adjustments`;
TRUNCATE TABLE `application_requirements`;

-- ============================================================
-- SEED DATA (copied from SetupDB.sql — keep both in sync)
-- ============================================================

-- 1. Default Admin User
INSERT INTO `users` (`first_name`, `last_name`, `email_address`, `password`, `role`)
VALUES ('Admin', 'User', 'admin@gmail.com', '$2y$10$kyF64U0j2xVl0PN1wiqJ5eaDR14ZhjAxjVTnRC0yLleTl9Rdi4Nli', 'admin'); -- admin123

-- 2. Initial Units
-- Layout: 1F = A-D (4 rooms, PHP4,000), 2F = E-H (4 rooms, PHP4,000), 3F = I-N (6 rooms, PHP3,500).
-- 3F is deliberately kept as exactly I/J/K/L/M/N because RentApplication.jsx
-- hardcodes that letter set to derive the PHP3,500 rate without querying
-- rooms.floor (used only as a fallback before the real rooms.monthly_rent loads).
INSERT INTO `rooms` (`id`, `type`, `floor`, `monthly_rent`, `status`, `tenant_name`, `lease_start`, `lease_end`, `last_tenant`, `maintenance_flag`, `occupants`) VALUES
('A', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('B', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('C', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('D', 'Studio', '1F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('E', 'Studio', '2F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('F', 'Studio', '2F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('G', 'Studio', '2F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('H', 'Studio', '2F', 4000, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('I', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('J', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('K', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('L', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('M', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0),
('N', 'Studio', '3F', 3500, 'vacant', NULL, NULL, NULL, NULL, 0, 0);

-- 3. Service catalog (admin can re-price, deactivate or add more from /admin-services)
INSERT INTO `service_catalog`
  (`category`, `name`, `description`, `price`, `pricing_unit`, `min_quantity`, `max_quantity`, `lead_time_days`, `icon`, `is_active`, `sort_order`) VALUES
('cleaning', 'Standard Unit Cleaning', 'General sweeping, mopping, dusting and bathroom sanitation for a studio or one-bedroom unit.', 500.00, 'session', 1, 1, 1, 'faBroom', 1, 10),
('cleaning', 'Deep Cleaning', 'Intensive scrubbing of kitchen, bathroom grout, appliances and hard-to-reach fixtures.', 1200.00, 'session', 1, 1, 2, 'faBroom', 1, 20),
('laundry', 'Wash & Fold', 'Machine wash, dry and fold of regular garments, billed per kilogram.', 60.00, 'kg', 1, 20, 1, 'faTshirt', 1, 30),
('laundry', 'Dry Cleaning', 'Professional dry cleaning for suits, gowns and delicate fabrics, billed per item.', 250.00, 'item', 1, 15, 2, 'faTshirt', 1, 40),
('other', 'Pest Control Treatment', 'Scheduled unit-level pest control and follow-up inspection.', 900.00, 'session', 1, 1, 3, 'faConciergeBell', 1, 50);

-- 4. Default application requirements (Settings -> Application Requirements)
INSERT INTO `application_requirements` (`id`, `label`, `label_fil`, `is_required`, `is_active`, `sort_order`) VALUES
(1, 'Valid ID (front)', 'Valid ID (harap)', 1, 1, 1),
(2, 'Valid ID (back)', 'Valid ID (likod)', 1, 1, 2);

-- 5. Default System Settings
INSERT INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('system_name', 'Apartment Management System'),
('contact_email', 'admin@ams.com'),
('contact_phone', '+63 912 345 6789'),
('currency_symbol', '₱'),
('maintenance_auto_assign', 'true'),
('min_lease_duration', '3'),
('max_rent_ahead_months', '12'),
('overdue_threshold_days', '15'),
('maintenance_monthly_budget', '50000'),
('tenant_responsibility_clause', 'Per the Terms & Conditions of this rent agreement, the Tenant shall be responsible for any damage or maintenance issues caused by negligence, misuse, or unauthorized modifications to the rented unit. Costs for such repairs will be billed directly to the Tenant and are excluded from the building''s maintenance budget allocation.'),
('payment_mode', 'manual'),
('payment_sandbox_enabled', '0'),
('payment_ch_gcash_sandbox', '1'),
('payment_ch_bank_sandbox', '1'),
('payment_ch_maya', '1'),
('payment_ch_gcash_manual', '1'),
('payment_ch_bank_manual', '1'),
('payment_ch_in_person', '1'),
('visitor_overstay_hours', '24'),
('service_visitor_management_active', 'true'),
('service_cleaning_active', 'true'),
('service_laundry_active', 'true'),
('service_other_active', 'true'),
('reservation_hold_days', '7'),
('max_parking_slots', '3'),
('parking_allowed_vehicle_types', '["motorcycle"]'),
('parking_monthly_fee', '300'),
('parking_billing_mode', 'manual'),
('lease_end_reminder_days', '30'),
('move_out_min_notice_days', '15'),
('move_out_max_notice_days', '30'),
('move_in_min_days', '0'),
('move_in_max_days', '365'),
('duplicate_reference_policy', 'warn'),
('notification_sweep_last_run', '2000-01-01'),
('landlord_name', 'Elizabeth Angcanan'),
('landlord_address', 'Tamak, Maguyam, Silang, Cavite'),
('landlord_contact', '*********** (Smart)'),
('property_address', 'Sitio Engkanto, Brgy. Maguyam, Silang, Cavite'),
('occupant_surcharge_per_person', '1000'),
('room_preview_mode', 'images'),
('max_occupants_per_unit', '8'),
('glass_bg_image', ''),
('glass_overlay_opacity', '78'),
('glass_blur', '0'),
('glass_tint', '#0f172a'),
('home_content', '{"badge":{"show":true,"en":"","fil":""},"heading":{"show":true,"en":"","fil":""},"location":{"show":true,"en":"","fil":""},"description":{"show":true,"en":"","fil":""}}'),
('preview_hero', '{"image":"","badge":{"show":true,"en":"","fil":""},"title":{"show":true,"en":"","fil":""},"location":{"show":true,"en":"","fil":""},"features":[{"en":"Motorcycle Parking","fil":"Paradahan ng Motor"},{"en":"Bathroom per Room","fil":"Banyo sa Bawat Kwarto"}]}'),
('extension_deadline_days', '0'),
('lease_end_reminders_enabled', '1'),
('lease_end_reminder_email', '1'),
('lease_end_reminder_sms', '1'),
('upcoming_rooms_enabled', '1'),
('late_fee_enabled', 'false'),
('late_fee_type', 'flat'),
('late_fee_value', '200'),
('min_household_age', '0'),
('child_restricted_floors', '["3F"]'),
('child_restricted_below_age', '5'),
('age_categories', '[{"key":"infant","label":"Infant","min_age":0,"max_age":1,"rule":"Not allowed on the 3rd floor (stairs). Allowed on the 1st and 2nd floors.","rule_fil":""},{"key":"toddler","label":"Toddler","min_age":2,"max_age":4,"rule":"Not allowed on the 3rd floor (stairs). Allowed on the 1st and 2nd floors.","rule_fil":""},{"key":"child","label":"Child","min_age":5,"max_age":11,"rule":"Allowed, with adult supervision in common areas.","rule_fil":""},{"key":"minor","label":"Minor","min_age":12,"max_age":17,"rule":"Allowed, with adult responsibility for their conduct. Running and playing in hallways, elevators and the parking area is not allowed.","rule_fil":""}]');

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Database cleared and reset to SetupDB.sql defaults.' AS status;
