-- ============================================================
-- MOCK DATA SEED: ams_db  (Jan 2026 - early Oct 2026)
-- Matched to AdminReports.jsx + get_report_data.php fields
-- Passwords: tenant123 (bcrypt)
-- Run AFTER SetupDB.sql (schema + admin + rooms + settings)
--
-- Room layout (see SetupDB.sql): 1F = A-D (PHP4,000), 2F = E-H (PHP4,000),
-- 3F = I-N (PHP3,500).
--
-- The data runs to 2026-10-02. Rent invoices from September 2026 follow the
-- rent-period rules (rent_period_start = the tenancy month's start, due that
-- day); January-August rows predate rent periods and are matched by their
-- "Month YYYY" label. Every tenancy month that started on or before
-- 2026-10-02 is billed here, because the daily sweep never back-bills a
-- month whose start has passed. September and October invoices carry rent
-- (+ parking) only: those months' meter readings are not recorded yet.
--
-- Roster (11 tenants + 1 applicant + 3 past/decided accounts across 15
-- rooms; I, J and P vacant):
--   SCRIPTED (built to exercise a specific admin feature):
--     A  Maria Santos    - clean baseline, fully paid, no issues
--     B  Jose Reyes      - Sep + Oct overdue -> eviction banner / overdueInfo
--     C  Rosa Dela Cruz  - rent term extended mid-year -> lease_renewals audit trail
--     D  Ben Flores      - flagged for eviction, Aug-Oct overdue -> Flag/Clear Eviction UI
--     E  Lita Ramos      - Approved, move-in paid + scheduled (Oct 5), contract
--                          Draft, room reserved -> Confirm Move-In
--     -  Gloria Tan      - Pending Review application only (targets room N) -> /track-application
--     K  Ana Bautista    - term ends 2026-10-15 -> rent-end reminder / expiry
--   BULK (background volume, no special scenario):
--     F  Dante Abad      - parking (Assigned, from Apr) + 1 invoiced service booking
--     G  Pedro Cruz      - 1 completed maintenance request + Pending parking request
--     H  Carlo Villanueva - parking (Assigned, from Jun)
--     L  Mark Santiago   - move-out notice filed for 2026-10-20 -> pending-move-out
--     M  Grace Mendoza   - 1 CCTV footage request
--   PAST / DECIDED (no room; the outcomes prod already has):
--     J  Paolo Garcia    - moved out 2026-09-01, archived, deposit Applied to Rent
--     -  Ramon Aquino    - Rejected application (room J)
--     -  Liza Navarro    - Cancelled application (room J)
--   VACANT:
--     I  held via an Active unit_reservations hold (walk-in inquiry)
--     J  open, no hold (last tenant: Paolo Garcia)
--     P  extra 3F unit at PHP4,000 that prod added through Admin Units
-- ============================================================

USE ams_db;

SET FOREIGN_KEY_CHECKS = 0;

-- Resolve the admin's actual id rather than hardcoding 1 - the `users` table's
-- AUTO_INCREMENT starts at 4 (see SetupDB.sql), so the admin row (inserted
-- first, no explicit id) lands on id=4 on a fresh import, but this stays
-- correct even if that ever changes.
SET @admin_id = (SELECT id FROM users WHERE role = 'admin' LIMIT 1);

-- ============================================================
-- 1. TENANT USERS  (role = 'user')
-- password: tenant123
-- ============================================================
INSERT IGNORE INTO `users` (`id`, `first_name`, `middle_name`, `last_name`, `contact_no`, `gender`, `email_address`, `password`, `role`) VALUES
(2,  'Maria',  'L.', 'Santos',      '+63 9171234501', 'Female', 'maria.santos@demo.example',     '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user'),
(3,  'Jose',   'M.', 'Reyes',       '+63 9171234502', 'Male',   'jose.reyes@demo.example',       '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user'),
(5,  'Rosa',   'D.', 'Dela Cruz',   '+63 9171234504', 'Female', 'rosa.delacruz@demo.example',    '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user'),
(6,  'Ben',    'C.', 'Flores',      '+63 9171234505', 'Male',   'ben.flores@demo.example',       '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user'),
(7,  'Lita',   'R.', 'Ramos',       '+63 9171234506', 'Female', 'lita.ramos@demo.example',       '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user'),
(8,  'Gloria', 'T.', 'Tan',         '+63 9171234508', 'Female', 'gloria.tan@demo.example',       '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user'),
(9,  'Dante',  'A.', 'Abad',        '+63 9171234507', 'Male',   'dante.abad@demo.example',       '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user'),
(10, 'Pedro',  'B.', 'Cruz',        '+63 9171234503', 'Male',   'pedro.cruz@demo.example',       '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user'),
(11, 'Carlo',  'P.', 'Villanueva',  '+63 9171234509', 'Male',   'carlo.villanueva@demo.example', '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user'),
(12, 'Ana',    'S.', 'Bautista',    '+63 9171234510', 'Female', 'ana.bautista@demo.example',     '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user'),
(13, 'Mark',   'D.', 'Santiago',    '+63 9171234511', 'Male',   'mark.santiago@demo.example',    '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user'),
(14, 'Grace',  'M.', 'Mendoza',     '+63 9171234512', 'Female', 'grace.mendoza@demo.example',    '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user'),
(15, 'Paolo',  'V.', 'Garcia',      '+63 9171234513', 'Male',   'paolo.garcia@demo.example',     '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user'),
(16, 'Ramon',  'L.', 'Aquino',      '+63 9171234514', 'Male',   'ramon.aquino@demo.example',     '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user'),
(17, 'Liza',   'C.', 'Navarro',     '+63 9171234515', 'Female', 'liza.navarro@demo.example',     '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy', 'user');

-- Seeded accounts sign in straight away (login.php refuses an unverified email).
UPDATE `users` SET `email_verified_at` = COALESCE(`email_verified_at`, CURRENT_TIMESTAMP) WHERE `email_verified_at` IS NULL;

-- ============================================================
-- 2. RENT APPLICATIONS
-- 9 'active' (moved in: A,B,C,D,F,G,H,K,M), 1 'pending-move-out' (L),
-- 1 'Approved' awaiting move-in (E), 1 'Pending Review' (room N), and the
-- decided ones: 1 'archived' (J, moved out), 1 'Rejected', 1 'Cancelled'
-- ============================================================
INSERT IGNORE INTO `rent_applications`
  (`id`, `user_id`, `first_name`, `middle_name`, `last_name`, `contact_no`, `email`, `gender`, `occupants`, `months_of_rent`, `room_name`, `monthly_rent`, `status`, `rejection_reason`, `created_at`) VALUES
(1,  2,  'Maria',  'L.', 'Santos',     '+63 9171234501', 'maria.santos@demo.example',     'Female', 1, 12, 'A', 4000.00, 'active', NULL, '2025-10-27 08:30:00'),
(2,  3,  'Jose',   'M.', 'Reyes',      '+63 9171234502', 'jose.reyes@demo.example',       'Male',   2, 24, 'B', 4000.00, 'active', NULL, '2025-09-25 09:00:00'),
(3,  5,  'Rosa',   'D.', 'Dela Cruz',  '+63 9171234504', 'rosa.delacruz@demo.example',    'Female', 1,  6, 'C', 4000.00, 'active', NULL, '2025-08-27 11:00:00'),
(4,  6,  'Ben',    'C.', 'Flores',     '+63 9171234505', 'ben.flores@demo.example',       'Male',   2, 12, 'D', 4000.00, 'active', NULL, '2025-10-27 08:00:00'),
(5,  7,  'Lita',   'R.', 'Ramos',      '+63 9171234506', 'lita.ramos@demo.example',       'Female', 1, 12, 'E', 4000.00, 'Approved', NULL, '2026-09-18 09:30:00'),
(6,  8,  'Gloria', 'T.', 'Tan',        '+63 9171234508', 'gloria.tan@demo.example',       'Female', 1,  6, 'N', 3500.00, 'Pending Review', NULL, '2026-09-28 09:00:00'),
(7,  9,  'Dante',  'A.', 'Abad',       '+63 9171234507', 'dante.abad@demo.example',       'Male',   1, 24, 'F', 4000.00, 'active', NULL, '2025-10-10 07:45:00'),
(8,  10, 'Pedro',  'B.', 'Cruz',       '+63 9171234503', 'pedro.cruz@demo.example',       'Male',   1, 24, 'G', 4000.00, 'active', NULL, '2025-09-26 10:15:00'),
(9,  11, 'Carlo',  'P.', 'Villanueva', '+63 9171234509', 'carlo.villanueva@demo.example', 'Male',   1, 12, 'H', 4000.00, 'active', NULL, '2025-11-25 09:00:00'),
(10, 12, 'Ana',    'S.', 'Bautista',   '+63 9171234510', 'ana.bautista@demo.example',     'Female', 1, 12, 'K', 3500.00, 'active', NULL, '2025-10-10 10:00:00'),
(11, 13, 'Mark',   'D.', 'Santiago',   '+63 9171234511', 'mark.santiago@demo.example',    'Male',   1, 24, 'L', 3500.00, 'active', NULL, '2025-09-15 08:30:00'),
(12, 14, 'Grace',  'M.', 'Mendoza',    '+63 9171234512', 'grace.mendoza@demo.example',    'Female', 1, 12, 'M', 3500.00, 'active', NULL, '2025-12-28 09:00:00'),
(13, 15, 'Paolo',  'V.', 'Garcia',     '+63 9171234513', 'paolo.garcia@demo.example',     'Male',   1, 12, 'J', 3500.00, 'archived', NULL, '2025-08-25 10:00:00'),
(14, 16, 'Ramon',  'L.', 'Aquino',     '+63 9171234514', 'ramon.aquino@demo.example',     'Male',   2, 12, 'J', 3500.00, 'Rejected', 'Valid ID has expired. Please apply again with a current one.', '2026-09-08 14:00:00'),
(15, 17, 'Liza',   'C.', 'Navarro',    '+63 9171234515', 'liza.navarro@demo.example',     'Female', 1,  6, 'J', 3500.00, 'Cancelled', 'Change of mind', '2026-09-20 16:00:00');

-- Paolo moved out at the end of his term (update_tenant_status.php
-- 'moved-out', then archive_tenant.php), as prod's archived tenancies look.
UPDATE `rent_applications`
   SET `move_in_date` = '2025-09-01', `requested_move_out_date` = '2026-09-01',
       `pre_archive_status` = 'moved-out', `archive_date` = '2026-09-01',
       `archive_reason` = 'End of Rent Term', `archive_notes` = 'Unit inspected, no damage.'
 WHERE `id` = 13;
-- Liza cancelled her own application (cancel_application.php).
UPDATE `rent_applications` SET `cancelled_at` = '2026-09-23 08:15:00' WHERE `id` = 15;
-- No document files ship with the seed (uploads/ is not in git). The tenancies
-- past approval are recorded as checked in person, as an admin assignment
-- (update_room.php) is, so the follow-up monitor does not flag them; Gloria's
-- Pending Review application has no documents and cannot be approved until
-- she uploads them. Previous addresses for the demo applicants.
UPDATE `rent_applications` SET `documents_verified_at` = `created_at`
 WHERE `id` BETWEEN 1 AND 13 AND `status` NOT IN ('Pending Review', 'Rejected', 'Cancelled');
UPDATE `rent_applications` SET `previous_address` = 'Brgy. Biga, Silang, Cavite' WHERE `id` BETWEEN 1 AND 15;

-- Rosa's rent term was extended mid-year: +9 months on top of the original 6
-- (see lease_renewals below), so her application reflects the final total.
UPDATE `rent_applications` SET `months_of_rent` = 15 WHERE `id` = 3;

-- Lita: approved Sep 22, move-in paid Sep 25, move-in date set and sent
-- Sep 26 (schedule_move_in.php). The admin confirms it on the day.
UPDATE `rent_applications`
   SET `preferred_move_in_date` = '2026-10-05', `move_in_date` = '2026-10-05', `move_in_notified_at` = '2026-09-26 10:00:00'
 WHERE `id` = 5;
UPDATE `rent_applications` SET `preferred_move_in_date` = '2026-10-15' WHERE `id` = 6;

-- ============================================================
-- 3. ROOMS
-- 10 occupied; E reserved for Lita (approval holds the unit with the
-- approval-day term, which the move-in confirm rewrites from the move-in date)
-- ============================================================
UPDATE `rooms` SET `status` = 'occupied', `tenant_name` = 'Maria Santos',      `lease_start` = '2025-11-01', `lease_end` = '2026-11-01', `occupants` = 1 WHERE `id` = 'A';
UPDATE `rooms` SET `status` = 'occupied', `tenant_name` = 'Jose Reyes',        `lease_start` = '2025-10-01', `lease_end` = '2027-10-01', `occupants` = 2 WHERE `id` = 'B';
UPDATE `rooms` SET `status` = 'occupied', `tenant_name` = 'Rosa Dela Cruz',    `lease_start` = '2025-09-01', `lease_end` = '2026-12-01', `occupants` = 1 WHERE `id` = 'C';
UPDATE `rooms` SET `status` = 'occupied', `tenant_name` = 'Ben Flores',        `lease_start` = '2025-11-01', `lease_end` = '2026-11-01', `occupants` = 2 WHERE `id` = 'D';
UPDATE `rooms` SET `status` = 'reserved', `tenant_name` = 'Lita Ramos',        `lease_start` = '2026-09-22', `lease_end` = '2027-09-22', `occupants` = 1 WHERE `id` = 'E';
UPDATE `rooms` SET `status` = 'occupied', `tenant_name` = 'Dante Abad',        `lease_start` = '2025-10-15', `lease_end` = '2027-10-15', `occupants` = 1 WHERE `id` = 'F';
UPDATE `rooms` SET `status` = 'occupied', `tenant_name` = 'Pedro Cruz',        `lease_start` = '2025-10-01', `lease_end` = '2027-10-01', `occupants` = 1 WHERE `id` = 'G';
UPDATE `rooms` SET `status` = 'occupied', `tenant_name` = 'Carlo Villanueva',  `lease_start` = '2025-12-01', `lease_end` = '2026-12-01', `occupants` = 1 WHERE `id` = 'H';
UPDATE `rooms` SET `status` = 'occupied', `tenant_name` = 'Ana Bautista',      `lease_start` = '2025-10-15', `lease_end` = '2026-10-15', `occupants` = 1 WHERE `id` = 'K';
UPDATE `rooms` SET `status` = 'occupied', `tenant_name` = 'Mark Santiago',     `lease_start` = '2025-09-20', `lease_end` = '2027-09-20', `occupants` = 1 WHERE `id` = 'L';
UPDATE `rooms` SET `status` = 'occupied', `tenant_name` = 'Grace Mendoza',     `lease_start` = '2026-01-05', `lease_end` = '2027-01-05', `occupants` = 1 WHERE `id` = 'M';
-- I: held via an Active unit_reservations hold (see section 11) - stays 'vacant' in rooms.status
-- J: open; end_tenancy() left Paolo as last_tenant when he moved out
-- N: vacant, Gloria's Pending Review application targets it but it is not yet occupied
UPDATE `rooms` SET `last_tenant` = 'Paolo Garcia', `last_inspection_date` = '2026-09-01' WHERE `id` = 'J';
-- P: the extra 3F unit prod added through Admin Units (not in SetupDB.sql)
INSERT IGNORE INTO `rooms` (`id`, `type`, `floor`, `monthly_rent`, `status`, `occupants`) VALUES
('P', 'Studio', '3F', 4000.00, 'vacant', 0);

-- ============================================================
-- 4. RENT CONTRACTS (one per Approved/active application; Gloria's Pending
--    application has none yet)
-- ============================================================
INSERT IGNORE INTO `lease_contracts` (`id`, `rent_application_id`, `deposit_amount`, `lease_start`, `lease_end`, `status`, `eviction_status`, `signed_lease_path`, `notarized_lease_path`, `deposit_status`, `generated_at`) VALUES
('LC-0001', 1,  4000.00, '2025-11-01', '2026-11-01', 'active',           NULL,      'placeholder', 'placeholder', 'Held', '2025-10-27 09:00:00'),
('LC-0002', 2,  4000.00, '2025-10-01', '2027-10-01', 'active',           NULL,      'placeholder', 'placeholder', 'Held', '2025-09-25 10:00:00'),
('LC-0003', 3,  4000.00, '2025-09-01', '2026-12-01', 'active',           NULL,      'placeholder', 'placeholder', 'Held', '2025-08-27 12:00:00'),
('LC-0004', 4,  4000.00, '2025-11-01', '2026-11-01', 'eviction-pending', 'flagged', 'placeholder', 'placeholder', 'Held', '2025-10-27 09:00:00'),
('LC-0005', 5,  4000.00, '2026-09-22', '2027-09-22', 'draft',            NULL,      NULL,          NULL,          'Held', '2026-09-22 10:00:00'),
('LC-0006', 7,  4000.00, '2025-10-15', '2027-10-15', 'active',           NULL,      'placeholder', 'placeholder', 'Held', '2025-10-10 08:30:00'),
('LC-0007', 8,  4000.00, '2025-10-01', '2027-10-01', 'active',           NULL,      'placeholder', 'placeholder', 'Held', '2025-09-26 11:00:00'),
('LC-0008', 9,  4000.00, '2025-12-01', '2026-12-01', 'active',           NULL,      'placeholder', 'placeholder', 'Held', '2025-11-25 10:00:00'),
('LC-0009', 10, 3500.00, '2025-10-15', '2026-10-15', 'active',           NULL,      'placeholder', 'placeholder', 'Held', '2025-10-10 11:00:00'),
('LC-0010', 11, 3500.00, '2025-09-20', '2027-09-20', 'active',           NULL,      'placeholder', 'placeholder', 'Held', '2025-09-15 09:30:00'),
('LC-0011', 12, 3500.00, '2026-01-05', '2027-01-05', 'active',           NULL,      'placeholder', 'placeholder', 'Held', '2025-12-28 10:00:00'),
('LC-0012', 13, 3500.00, '2025-09-01', '2026-09-01', 'expired',          NULL,      'placeholder', 'placeholder', 'Applied to Rent', '2025-08-25 11:00:00');

-- Paolo's move-out clearance: no deductions, deposit is non-refundable.
UPDATE `lease_contracts`
   SET `damage_deduction` = 0.00, `utility_deduction` = 0.00, `refund_amount` = 0.00, `refund_date` = '2026-09-01'
 WHERE `id` = 'LC-0012';

-- Rosa's mid-year extension: original 6-month term (lease_end 2026-03-01)
-- extended by 9 months to 2026-12-01. lease_contracts.lease_end above
-- already reflects the post-extension date; this is the audit record.
INSERT IGNORE INTO `lease_renewals` (`contract_id`, `added_months`, `previous_lease_end`, `new_lease_end`, `rent_at_renewal`, `approved_by`, `created_at`) VALUES
('LC-0003', 9, '2026-03-01', '2026-12-01', 4000.00, @admin_id, '2026-07-05 10:30:00');

-- Moved-in tenancies carry their move-in date (the same rule as
-- 2026_09_backfill_active_tenancies.sql).
UPDATE `rent_applications` ra
  JOIN `lease_contracts` lc ON lc.rent_application_id = ra.id
   SET ra.move_in_date = lc.lease_start
 WHERE ra.status = 'active' AND ra.move_in_date IS NULL;

-- Mark filed a move-out notice on Oct 1 for Oct 20 (record_move_out.php:
-- 15-30 days' notice). He stays in the unit until the admin clears him.
UPDATE `rent_applications` SET `status` = 'pending-move-out', `requested_move_out_date` = '2026-10-20' WHERE `id` = 11;

-- ============================================================
-- 5. INVOICES  (Jan 2026 - Oct 2026)
-- status: 'paid' | 'pending' | 'overdue' | 'pending-verification'
-- get_report_data.php sums: base_rent, water, electricity, parking, services
-- methodsBreakdown buckets: 'Cash', 'GCash', 'BDO', 'BPI' (DESK_PAYMENT_METHODS)
-- Parking is PHP300/month (parking_monthly_fee) from the permit's first month;
-- each parked month has a parking_charges claim row (section 7).
-- ============================================================

-- Maria Santos (user 2, app 1, room A) - clean, fully paid
INSERT IGNORE INTO `invoices` (`id`,`user_id`,`rent_application_id`,`base_rent`,`water`,`electricity`,`parking`,`services`,`total_amount`,`security_deposit`,`payment_method`,`payment_reference`,`sender_name`,`billing_period`,`rent_period_start`,`status`,`paid_at`,`due_date`,`created_at`) VALUES
('INV-202601-2', 2, 1, 4000, 310, 870, 0, 0, 5180, 0, 'GCash', '2026010001',     'Maria Santos', 'January 2026',   NULL,         'paid', '2026-01-14 09:00:00', '2026-01-15', '2026-01-01 08:00:00'),
('INV-202602-2', 2, 1, 4000, 290, 850, 0, 0, 5140, 0, 'GCash', '2026020001',     'Maria Santos', 'February 2026',  NULL,         'paid', '2026-02-14 09:30:00', '2026-02-15', '2026-02-01 08:00:00'),
('INV-202603-2', 2, 1, 4000, 300, 890, 0, 0, 5190, 0, 'BDO',   'BDO-2026030001', 'Maria Santos', 'March 2026',     NULL,         'paid', '2026-03-15 10:00:00', '2026-03-15', '2026-03-01 08:00:00'),
('INV-202604-2', 2, 1, 4000, 320, 900, 0, 0, 5220, 0, 'GCash', '2026040001',     'Maria Santos', 'April 2026',     NULL,         'paid', '2026-04-14 10:00:00', '2026-04-15', '2026-04-01 08:00:00'),
('INV-202605-2', 2, 1, 4000, 310, 860, 0, 0, 5170, 0, 'GCash', '2026050001',     'Maria Santos', 'May 2026',       NULL,         'paid', '2026-05-15 09:00:00', '2026-05-15', '2026-05-01 08:00:00'),
('INV-202606-2', 2, 1, 4000, 280, 910, 0, 0, 5190, 0, 'BPI',   'BPI-2026060001', 'Maria Santos', 'June 2026',      NULL,         'paid', '2026-06-14 10:30:00', '2026-06-15', '2026-06-01 08:00:00'),
('INV-202607-2', 2, 1, 4000, 300, 880, 0, 0, 5180, 0, 'GCash', '2026070001',     'Maria Santos', 'July 2026',      NULL,         'paid', '2026-07-14 09:00:00', '2026-07-15', '2026-07-01 08:00:00'),
('INV-202608-2', 2, 1, 4000, 295, 865, 0, 0, 5160, 0, 'GCash', '2026080001',     'Maria Santos', 'August 2026',    NULL,         'paid', '2026-08-14 09:30:00', '2026-08-15', '2026-08-01 08:00:00'),
('INV-202609-2', 2, 1, 4000, 0, 0, 0, 0, 4000, 0, 'GCash', '2026090001',     'Maria Santos', 'September 2026', '2026-09-01', 'paid', '2026-09-01 09:00:00', '2026-09-01', '2026-08-25 00:05:00'),
('INV-202610-2', 2, 1, 4000,   0,   0, 0, 0, 4000, 0, 'GCash', '2026100001',     'Maria Santos', 'October 2026',   '2026-10-01', 'paid', '2026-10-01 09:00:00', '2026-10-01', '2026-09-24 00:05:00');

-- Jose Reyes (user 3, app 2, room B) - September & October overdue
INSERT IGNORE INTO `invoices` (`id`,`user_id`,`rent_application_id`,`base_rent`,`water`,`electricity`,`parking`,`services`,`total_amount`,`security_deposit`,`payment_method`,`payment_reference`,`sender_name`,`billing_period`,`rent_period_start`,`status`,`paid_at`,`due_date`,`created_at`) VALUES
('INV-202601-3', 3, 2, 4000, 380, 960, 0, 0, 5340, 0, 'BDO',   'BDO-2026010002', 'Jose Reyes', 'January 2026',   NULL,         'paid', '2026-01-15 10:00:00', '2026-01-15', '2026-01-01 08:00:00'),
('INV-202602-3', 3, 2, 4000, 350, 940, 0, 0, 5290, 0, 'BPI',   'BPI-2026020002', 'Jose Reyes', 'February 2026',  NULL,         'paid', '2026-02-14 11:00:00', '2026-02-15', '2026-02-01 08:00:00'),
('INV-202603-3', 3, 2, 4000, 360, 980, 0, 0, 5340, 0, 'GCash', '2026030002',     'Jose Reyes', 'March 2026',     NULL,         'paid', '2026-03-14 10:00:00', '2026-03-15', '2026-03-01 08:00:00'),
('INV-202604-3', 3, 2, 4000, 370, 950, 0, 0, 5320, 0, 'GCash', '2026040002',     'Jose Reyes', 'April 2026',     NULL,         'paid', '2026-04-15 09:00:00', '2026-04-15', '2026-04-01 08:00:00'),
('INV-202605-3', 3, 2, 4000, 340, 930, 0, 0, 5270, 0, 'Cash',  NULL,             'Jose Reyes', 'May 2026',       NULL,         'paid', '2026-05-14 11:00:00', '2026-05-15', '2026-05-01 08:00:00'),
('INV-202606-3', 3, 2, 4000, 360, 970, 0, 0, 5330, 0, 'GCash', '2026060002',     'Jose Reyes', 'June 2026',      NULL,         'paid', '2026-06-14 10:00:00', '2026-06-15', '2026-06-01 08:00:00'),
('INV-202607-3', 3, 2, 4000, 380, 960, 0, 0, 5340, 0, 'GCash', '2026070002',     'Jose Reyes', 'July 2026',      NULL,         'paid', '2026-07-15 10:00:00', '2026-07-15', '2026-07-01 08:00:00'),
('INV-202608-3', 3, 2, 4000, 355, 945, 0, 0, 5300, 0, 'GCash', '2026080002',     'Jose Reyes', 'August 2026',    NULL,         'paid', '2026-08-15 10:00:00', '2026-08-15', '2026-08-01 08:00:00'),
('INV-202609-3', 3, 2, 4000, 0, 0, 0, 0, 4000, 0, NULL, NULL, NULL,                       'September 2026', '2026-09-01', 'overdue', NULL,             '2026-09-01', '2026-08-25 00:05:00'),
('INV-202610-3', 3, 2, 4000,   0,   0, 0, 0, 4000, 0, NULL, NULL, NULL,                       'October 2026',   '2026-10-01', 'overdue', NULL,             '2026-10-01', '2026-09-24 00:05:00');

-- Rosa Dela Cruz (user 5, app 3, room C) - fully paid
INSERT IGNORE INTO `invoices` (`id`,`user_id`,`rent_application_id`,`base_rent`,`water`,`electricity`,`parking`,`services`,`total_amount`,`security_deposit`,`payment_method`,`payment_reference`,`sender_name`,`billing_period`,`rent_period_start`,`status`,`paid_at`,`due_date`,`created_at`) VALUES
('INV-202601-5', 5, 3, 4000, 260, 800, 0, 0, 5060, 0, 'Cash',  NULL,             'Rosa Dela Cruz', 'January 2026',   NULL,         'paid', '2026-01-15 09:00:00', '2026-01-15', '2026-01-01 08:00:00'),
('INV-202602-5', 5, 3, 4000, 270, 820, 0, 0, 5090, 0, 'GCash', '2026020003',     'Rosa Dela Cruz', 'February 2026',  NULL,         'paid', '2026-02-14 10:00:00', '2026-02-15', '2026-02-01 08:00:00'),
('INV-202603-5', 5, 3, 4000, 280, 840, 0, 0, 5120, 0, 'GCash', '2026030003',     'Rosa Dela Cruz', 'March 2026',     NULL,         'paid', '2026-03-15 09:30:00', '2026-03-15', '2026-03-01 08:00:00'),
('INV-202604-5', 5, 3, 4000, 260, 810, 0, 0, 5070, 0, 'BDO',   'BDO-2026040003', 'Rosa Dela Cruz', 'April 2026',     NULL,         'paid', '2026-04-14 10:00:00', '2026-04-15', '2026-04-01 08:00:00'),
('INV-202605-5', 5, 3, 4000, 270, 820, 0, 0, 5090, 0, 'GCash', '2026050003',     'Rosa Dela Cruz', 'May 2026',       NULL,         'paid', '2026-05-15 09:00:00', '2026-05-15', '2026-05-01 08:00:00'),
('INV-202606-5', 5, 3, 4000, 265, 815, 0, 0, 5080, 0, 'GCash', '2026060003',     'Rosa Dela Cruz', 'June 2026',      NULL,         'paid', '2026-06-14 09:00:00', '2026-06-15', '2026-06-01 08:00:00'),
('INV-202607-5', 5, 3, 4000, 275, 825, 0, 0, 5100, 0, 'BPI',   'BPI-2026070003', 'Rosa Dela Cruz', 'July 2026',      NULL,         'paid', '2026-07-15 09:00:00', '2026-07-15', '2026-07-01 08:00:00'),
('INV-202608-5', 5, 3, 4000, 268, 812, 0, 0, 5080, 0, 'GCash', '2026080003',     'Rosa Dela Cruz', 'August 2026',    NULL,         'paid', '2026-08-14 10:00:00', '2026-08-15', '2026-08-01 08:00:00'),
('INV-202609-5', 5, 3, 4000, 0, 0, 0, 0, 4000, 0, 'GCash', '2026090003',     'Rosa Dela Cruz', 'September 2026', '2026-09-01', 'paid', '2026-09-01 10:00:00', '2026-09-01', '2026-08-25 00:05:00'),
('INV-202610-5', 5, 3, 4000,   0,   0, 0, 0, 4000, 0, 'GCash', '2026100003',     'Rosa Dela Cruz', 'October 2026',   '2026-10-01', 'paid', '2026-10-01 10:00:00', '2026-10-01', '2026-09-24 00:05:00');

-- Ben Flores (user 6, app 4, room D) - flagged for eviction, August-October overdue
INSERT IGNORE INTO `invoices` (`id`,`user_id`,`rent_application_id`,`base_rent`,`water`,`electricity`,`parking`,`services`,`total_amount`,`security_deposit`,`payment_method`,`payment_reference`,`sender_name`,`billing_period`,`rent_period_start`,`status`,`paid_at`,`due_date`,`created_at`) VALUES
('INV-202601-6', 6, 4, 4000, 400, 1100, 0, 0, 5500, 0, 'BDO',   'BDO-2026010004', 'Ben Flores', 'January 2026',   NULL,         'paid', '2026-01-14 09:00:00', '2026-01-15', '2026-01-01 08:00:00'),
('INV-202602-6', 6, 4, 4000, 380, 1080, 0, 0, 5460, 0, 'Cash',  NULL,             'Ben Flores', 'February 2026',  NULL,         'paid', '2026-02-15 10:00:00', '2026-02-15', '2026-02-01 08:00:00'),
('INV-202603-6', 6, 4, 4000, 390, 1050, 0, 0, 5440, 0, 'GCash', '2026030004',     'Ben Flores', 'March 2026',     NULL,         'paid', '2026-03-14 09:30:00', '2026-03-15', '2026-03-01 08:00:00'),
('INV-202604-6', 6, 4, 4000, 400, 1100, 0, 0, 5500, 0, 'BPI',   'BPI-2026040004', 'Ben Flores', 'April 2026',     NULL,         'paid', '2026-04-14 10:00:00', '2026-04-15', '2026-04-01 08:00:00'),
('INV-202605-6', 6, 4, 4000, 380, 1060, 0, 0, 5440, 0, 'GCash', '2026050004',     'Ben Flores', 'May 2026',       NULL,         'paid', '2026-05-15 09:30:00', '2026-05-15', '2026-05-01 08:00:00'),
('INV-202606-6', 6, 4, 4000, 400, 1090, 0, 0, 5490, 0, 'GCash', '2026060004',     'Ben Flores', 'June 2026',      NULL,         'paid', '2026-06-15 09:30:00', '2026-06-15', '2026-06-01 08:00:00'),
('INV-202607-6', 6, 4, 4000, 390, 1080, 0, 0, 5470, 0, 'GCash', '2026070004',     'Ben Flores', 'July 2026',      NULL,         'paid', '2026-07-15 09:30:00', '2026-07-15', '2026-07-01 08:00:00'),
('INV-202608-6', 6, 4, 4000, 405, 1100, 0, 0, 5505, 0, NULL, NULL, NULL,                       'August 2026',    NULL,         'overdue', NULL,             '2026-08-15', '2026-08-01 08:00:00'),
('INV-202609-6', 6, 4, 4000, 0, 0, 0, 0, 4000, 0, NULL, NULL, NULL,                       'September 2026', '2026-09-01', 'overdue', NULL,             '2026-09-01', '2026-08-25 00:05:00'),
('INV-202610-6', 6, 4, 4000,   0,    0, 0, 0, 4000, 0, NULL, NULL, NULL,                       'October 2026',   '2026-10-01', 'overdue', NULL,             '2026-10-01', '2026-09-24 00:05:00');

-- Lita Ramos (user 7, app 5, room E) - move-in invoice (1 month advance + deposit),
-- paid. rent_period_start stays NULL until the move-in is confirmed, which
-- relabels it to the month the tenancy starts (update_tenant_status.php).
INSERT IGNORE INTO `invoices` (`id`,`user_id`,`rent_application_id`,`base_rent`,`water`,`electricity`,`parking`,`services`,`total_amount`,`security_deposit`,`payment_method`,`payment_reference`,`sender_name`,`billing_period`,`status`,`paid_at`,`due_date`,`created_at`) VALUES
('INV-202609-7', 7, 5, 4000, 0, 0, 0, 0, 8000, 4000, 'GCash', '2026090005', 'Lita Ramos', 'September 2026', 'paid', '2026-09-25 10:00:00', '2026-09-29', '2026-09-22 10:00:00');

-- Dante Abad (user 9, app 7, room F) - parking from April + 1 service booking (March)
INSERT IGNORE INTO `invoices` (`id`,`user_id`,`rent_application_id`,`base_rent`,`water`,`electricity`,`parking`,`services`,`total_amount`,`security_deposit`,`payment_method`,`payment_reference`,`sender_name`,`billing_period`,`rent_period_start`,`status`,`paid_at`,`due_date`,`created_at`) VALUES
('INV-202601-9', 9, 7, 4000, 270, 800,   0, 0,   5070, 0, 'GCash', '2026010006',     'Dante Abad', 'January 2026',   NULL,         'paid', '2026-01-15 10:00:00', '2026-01-15', '2026-01-01 08:00:00'),
('INV-202602-9', 9, 7, 4000, 255, 780,   0, 0,   5035, 0, 'GCash', '2026020006',     'Dante Abad', 'February 2026',  NULL,         'paid', '2026-02-14 09:30:00', '2026-02-15', '2026-02-01 08:00:00'),
('INV-202603-9', 9, 7, 4000, 265, 795,   0, 500, 5560, 0, 'BDO',   'BDO-2026030006', 'Dante Abad', 'March 2026',     NULL,         'paid', '2026-03-15 10:00:00', '2026-03-15', '2026-03-01 08:00:00'),
('INV-202604-9', 9, 7, 4000, 270, 810, 300, 0,   5380, 0, 'GCash', '2026040006',     'Dante Abad', 'April 2026',     NULL,         'paid', '2026-04-14 09:30:00', '2026-04-15', '2026-04-01 08:00:00'),
('INV-202605-9', 9, 7, 4000, 260, 790, 300, 0,   5350, 0, 'GCash', '2026050006',     'Dante Abad', 'May 2026',       NULL,         'paid', '2026-05-15 10:00:00', '2026-05-15', '2026-05-01 08:00:00'),
('INV-202606-9', 9, 7, 4000, 265, 800, 300, 0,   5365, 0, 'BPI',   'BPI-2026060006', 'Dante Abad', 'June 2026',      NULL,         'paid', '2026-06-14 09:00:00', '2026-06-15', '2026-06-01 08:00:00'),
('INV-202607-9', 9, 7, 4000, 255, 775, 300, 0,   5330, 0, 'GCash', '2026070006',     'Dante Abad', 'July 2026',      NULL,         'paid', '2026-07-15 09:30:00', '2026-07-15', '2026-07-01 08:00:00'),
('INV-202608-9', 9, 7, 4000, 270, 805, 300, 0,   5375, 0, 'GCash', '2026080006',     'Dante Abad', 'August 2026',    NULL,         'paid', '2026-08-14 10:00:00', '2026-08-15', '2026-08-01 08:00:00'),
('INV-202609-9', 9, 7, 4000,   0,   0, 300, 0,   4300, 0, 'GCash', '2026090006',     'Dante Abad', 'September 2026', '2026-09-15', 'paid', '2026-09-15 10:00:00', '2026-09-15', '2026-09-08 00:05:00');

-- Pedro Cruz (user 10, app 8, room G) - fully paid
INSERT IGNORE INTO `invoices` (`id`,`user_id`,`rent_application_id`,`base_rent`,`water`,`electricity`,`parking`,`services`,`total_amount`,`security_deposit`,`payment_method`,`payment_reference`,`sender_name`,`billing_period`,`rent_period_start`,`status`,`paid_at`,`due_date`,`created_at`) VALUES
('INV-202601-10', 10, 8, 4000, 290, 830, 0, 0, 5120, 0, 'GCash', '2026010007',     'Pedro Cruz', 'January 2026',   NULL,         'paid', '2026-01-15 10:00:00', '2026-01-15', '2026-01-01 08:00:00'),
('INV-202602-10', 10, 8, 4000, 300, 860, 0, 0, 5160, 0, 'GCash', '2026020007',     'Pedro Cruz', 'February 2026',  NULL,         'paid', '2026-02-14 09:00:00', '2026-02-15', '2026-02-01 08:00:00'),
('INV-202603-10', 10, 8, 4000, 280, 840, 0, 0, 5120, 0, 'Cash',  NULL,             'Pedro Cruz', 'March 2026',     NULL,         'paid', '2026-03-14 10:30:00', '2026-03-15', '2026-03-01 08:00:00'),
('INV-202604-10', 10, 8, 4000, 310, 870, 0, 0, 5180, 0, 'GCash', '2026040007',     'Pedro Cruz', 'April 2026',     NULL,         'paid', '2026-04-15 09:00:00', '2026-04-15', '2026-04-01 08:00:00'),
('INV-202605-10', 10, 8, 4000, 290, 850, 0, 0, 5140, 0, 'GCash', '2026050007',     'Pedro Cruz', 'May 2026',       NULL,         'paid', '2026-05-15 10:00:00', '2026-05-15', '2026-05-01 08:00:00'),
('INV-202606-10', 10, 8, 4000, 300, 880, 0, 0, 5180, 0, 'BDO',   'BDO-2026060007', 'Pedro Cruz', 'June 2026',      NULL,         'paid', '2026-06-15 09:30:00', '2026-06-15', '2026-06-01 08:00:00'),
('INV-202607-10', 10, 8, 4000, 295, 860, 0, 0, 5155, 0, 'GCash', '2026070007',     'Pedro Cruz', 'July 2026',      NULL,         'paid', '2026-07-14 10:00:00', '2026-07-15', '2026-07-01 08:00:00'),
('INV-202608-10', 10, 8, 4000, 305, 870, 0, 0, 5175, 0, 'GCash', '2026080007',     'Pedro Cruz', 'August 2026',    NULL,         'paid', '2026-08-15 09:00:00', '2026-08-15', '2026-08-01 08:00:00'),
('INV-202609-10', 10, 8, 4000, 0, 0, 0, 0, 4000, 0, 'GCash', '2026090007',     'Pedro Cruz', 'September 2026', '2026-09-01', 'paid', '2026-09-01 11:00:00', '2026-09-01', '2026-08-25 00:05:00'),
('INV-202610-10', 10, 8, 4000,   0,   0, 0, 0, 4000, 0, 'BDO',   'BDO-2026100007', 'Pedro Cruz', 'October 2026',   '2026-10-01', 'paid', '2026-10-01 11:00:00', '2026-10-01', '2026-09-24 00:05:00');

-- Carlo Villanueva (user 11, app 9, room H) - parking from June, fully paid
INSERT IGNORE INTO `invoices` (`id`,`user_id`,`rent_application_id`,`base_rent`,`water`,`electricity`,`parking`,`services`,`total_amount`,`security_deposit`,`payment_method`,`payment_reference`,`sender_name`,`billing_period`,`rent_period_start`,`status`,`paid_at`,`due_date`,`created_at`) VALUES
('INV-202601-11', 11, 9, 4000, 250, 760,   0, 0, 5010, 0, 'GCash', '2026010008',     'Carlo Villanueva', 'January 2026',   NULL,         'paid', '2026-01-14 09:00:00', '2026-01-15', '2026-01-01 08:00:00'),
('INV-202602-11', 11, 9, 4000, 260, 780,   0, 0, 5040, 0, 'GCash', '2026020008',     'Carlo Villanueva', 'February 2026',  NULL,         'paid', '2026-02-15 10:00:00', '2026-02-15', '2026-02-01 08:00:00'),
('INV-202603-11', 11, 9, 4000, 245, 770,   0, 0, 5015, 0, 'BPI',   'BPI-2026030008', 'Carlo Villanueva', 'March 2026',     NULL,         'paid', '2026-03-14 09:30:00', '2026-03-15', '2026-03-01 08:00:00'),
('INV-202604-11', 11, 9, 4000, 255, 790,   0, 0, 5045, 0, 'GCash', '2026040008',     'Carlo Villanueva', 'April 2026',     NULL,         'paid', '2026-04-15 10:00:00', '2026-04-15', '2026-04-01 08:00:00'),
('INV-202605-11', 11, 9, 4000, 260, 780,   0, 0, 5040, 0, 'GCash', '2026050008',     'Carlo Villanueva', 'May 2026',       NULL,         'paid', '2026-05-14 09:00:00', '2026-05-15', '2026-05-01 08:00:00'),
('INV-202606-11', 11, 9, 4000, 250, 770, 300, 0, 5320, 0, 'BDO',   'BDO-2026060008', 'Carlo Villanueva', 'June 2026',      NULL,         'paid', '2026-06-15 09:30:00', '2026-06-15', '2026-06-01 08:00:00'),
('INV-202607-11', 11, 9, 4000, 260, 785, 300, 0, 5345, 0, 'GCash', '2026070008',     'Carlo Villanueva', 'July 2026',      NULL,         'paid', '2026-07-14 10:00:00', '2026-07-15', '2026-07-01 08:00:00'),
('INV-202608-11', 11, 9, 4000, 245, 760, 300, 0, 5305, 0, 'GCash', '2026080008',     'Carlo Villanueva', 'August 2026',    NULL,         'paid', '2026-08-15 09:00:00', '2026-08-15', '2026-08-01 08:00:00'),
('INV-202609-11', 11, 9, 4000,   0,   0, 300, 0, 4300, 0, 'GCash', '2026090008',     'Carlo Villanueva', 'September 2026', '2026-09-01', 'paid', '2026-09-01 09:30:00', '2026-09-01', '2026-08-25 00:05:00'),
('INV-202610-11', 11, 9, 4000,   0,   0,   0, 0, 4000, 0, 'GCash', '2026100008',     'Carlo Villanueva', 'October 2026',   '2026-10-01', 'paid', '2026-10-01 09:30:00', '2026-10-01', '2026-09-24 00:05:00');

-- Ana Bautista (user 12, app 10, room K, 3F) - fully paid; term ends 2026-10-15
INSERT IGNORE INTO `invoices` (`id`,`user_id`,`rent_application_id`,`base_rent`,`water`,`electricity`,`parking`,`services`,`total_amount`,`security_deposit`,`payment_method`,`payment_reference`,`sender_name`,`billing_period`,`rent_period_start`,`status`,`paid_at`,`due_date`,`created_at`) VALUES
('INV-202601-12', 12, 10, 3500, 260, 800, 0, 0, 4560, 0, 'GCash', '2026010009',     'Ana Bautista', 'January 2026',   NULL,         'paid', '2026-01-15 09:00:00', '2026-01-15', '2026-01-01 08:00:00'),
('INV-202602-12', 12, 10, 3500, 270, 820, 0, 0, 4590, 0, 'GCash', '2026020009',     'Ana Bautista', 'February 2026',  NULL,         'paid', '2026-02-14 10:00:00', '2026-02-15', '2026-02-01 08:00:00'),
('INV-202603-12', 12, 10, 3500, 280, 840, 0, 0, 4620, 0, 'BDO',   'BDO-2026030009', 'Ana Bautista', 'March 2026',     NULL,         'paid', '2026-03-15 09:30:00', '2026-03-15', '2026-03-01 08:00:00'),
('INV-202604-12', 12, 10, 3500, 260, 810, 0, 0, 4570, 0, 'GCash', '2026040009',     'Ana Bautista', 'April 2026',     NULL,         'paid', '2026-04-14 10:00:00', '2026-04-15', '2026-04-01 08:00:00'),
('INV-202605-12', 12, 10, 3500, 270, 820, 0, 0, 4590, 0, 'GCash', '2026050009',     'Ana Bautista', 'May 2026',       NULL,         'paid', '2026-05-15 09:00:00', '2026-05-15', '2026-05-01 08:00:00'),
('INV-202606-12', 12, 10, 3500, 265, 815, 0, 0, 4580, 0, 'Cash',  NULL,             'Ana Bautista', 'June 2026',      NULL,         'paid', '2026-06-14 09:00:00', '2026-06-15', '2026-06-01 08:00:00'),
('INV-202607-12', 12, 10, 3500, 275, 825, 0, 0, 4600, 0, 'GCash', '2026070009',     'Ana Bautista', 'July 2026',      NULL,         'paid', '2026-07-15 09:00:00', '2026-07-15', '2026-07-01 08:00:00'),
('INV-202608-12', 12, 10, 3500, 268, 812, 0, 0, 4580, 0, 'GCash', '2026080009',     'Ana Bautista', 'August 2026',    NULL,         'paid', '2026-08-14 10:00:00', '2026-08-15', '2026-08-01 08:00:00'),
('INV-202609-12', 12, 10, 3500, 0, 0, 0, 0, 3500, 0, 'GCash', '2026090009',     'Ana Bautista', 'September 2026', '2026-09-15', 'paid', '2026-09-15 09:00:00', '2026-09-15', '2026-09-08 00:05:00');

-- Mark Santiago (user 13, app 11, room L, 3F) - fully paid
INSERT IGNORE INTO `invoices` (`id`,`user_id`,`rent_application_id`,`base_rent`,`water`,`electricity`,`parking`,`services`,`total_amount`,`security_deposit`,`payment_method`,`payment_reference`,`sender_name`,`billing_period`,`rent_period_start`,`status`,`paid_at`,`due_date`,`created_at`) VALUES
('INV-202601-13', 13, 11, 3500, 250, 760, 0, 0, 4510, 0, 'GCash', '2026010010',     'Mark Santiago', 'January 2026',   NULL,         'paid', '2026-01-14 10:00:00', '2026-01-15', '2026-01-01 08:00:00'),
('INV-202602-13', 13, 11, 3500, 260, 780, 0, 0, 4540, 0, 'GCash', '2026020010',     'Mark Santiago', 'February 2026',  NULL,         'paid', '2026-02-15 09:00:00', '2026-02-15', '2026-02-01 08:00:00'),
('INV-202603-13', 13, 11, 3500, 245, 770, 0, 0, 4515, 0, 'BPI',   'BPI-2026030010', 'Mark Santiago', 'March 2026',     NULL,         'paid', '2026-03-14 10:00:00', '2026-03-15', '2026-03-01 08:00:00'),
('INV-202604-13', 13, 11, 3500, 255, 790, 0, 0, 4545, 0, 'GCash', '2026040010',     'Mark Santiago', 'April 2026',     NULL,         'paid', '2026-04-15 09:30:00', '2026-04-15', '2026-04-01 08:00:00'),
('INV-202605-13', 13, 11, 3500, 260, 780, 0, 0, 4540, 0, 'GCash', '2026050010',     'Mark Santiago', 'May 2026',       NULL,         'paid', '2026-05-14 09:00:00', '2026-05-15', '2026-05-01 08:00:00'),
('INV-202606-13', 13, 11, 3500, 250, 770, 0, 0, 4520, 0, 'BDO',   'BDO-2026060010', 'Mark Santiago', 'June 2026',      NULL,         'paid', '2026-06-15 10:00:00', '2026-06-15', '2026-06-01 08:00:00'),
('INV-202607-13', 13, 11, 3500, 260, 785, 0, 0, 4545, 0, 'GCash', '2026070010',     'Mark Santiago', 'July 2026',      NULL,         'paid', '2026-07-14 09:00:00', '2026-07-15', '2026-07-01 08:00:00'),
('INV-202608-13', 13, 11, 3500, 245, 760, 0, 0, 4505, 0, 'GCash', '2026080010',     'Mark Santiago', 'August 2026',    NULL,         'paid', '2026-08-15 10:00:00', '2026-08-15', '2026-08-01 08:00:00'),
('INV-202609-13', 13, 11, 3500, 0, 0, 0, 0, 3500, 0, 'GCash', '2026090010',     'Mark Santiago', 'September 2026', '2026-09-20', 'paid', '2026-09-20 10:00:00', '2026-09-20', '2026-09-13 00:05:00');

-- Grace Mendoza (user 14, app 12, room M, 3F) - moved in Jan 2026, fully paid
INSERT IGNORE INTO `invoices` (`id`,`user_id`,`rent_application_id`,`base_rent`,`water`,`electricity`,`parking`,`services`,`total_amount`,`security_deposit`,`payment_method`,`payment_reference`,`sender_name`,`billing_period`,`rent_period_start`,`status`,`paid_at`,`due_date`,`created_at`) VALUES
('INV-202601-14', 14, 12, 3500, 255, 775, 0, 0, 8030, 3500, 'GCash', '2026010011',     'Grace Mendoza', 'January 2026',   '2026-01-05', 'paid', '2026-01-10 09:00:00', '2026-01-12', '2026-01-05 08:00:00'),
('INV-202602-14', 14, 12, 3500, 265, 795, 0, 0, 4560, 0,    'GCash', '2026020011',     'Grace Mendoza', 'February 2026',  NULL,         'paid', '2026-02-14 10:00:00', '2026-02-15', '2026-02-01 08:00:00'),
('INV-202603-14', 14, 12, 3500, 250, 780, 0, 0, 4530, 0,    'BDO',   'BDO-2026030011', 'Grace Mendoza', 'March 2026',     NULL,         'paid', '2026-03-15 09:30:00', '2026-03-15', '2026-03-01 08:00:00'),
('INV-202604-14', 14, 12, 3500, 260, 800, 0, 0, 4560, 0,    'GCash', '2026040011',     'Grace Mendoza', 'April 2026',     NULL,         'paid', '2026-04-14 10:00:00', '2026-04-15', '2026-04-01 08:00:00'),
('INV-202605-14', 14, 12, 3500, 255, 785, 0, 0, 4540, 0,    'GCash', '2026050011',     'Grace Mendoza', 'May 2026',       NULL,         'paid', '2026-05-15 09:00:00', '2026-05-15', '2026-05-01 08:00:00'),
('INV-202606-14', 14, 12, 3500, 270, 810, 0, 0, 4580, 0,    'BPI',   'BPI-2026060011', 'Grace Mendoza', 'June 2026',      NULL,         'paid', '2026-06-14 09:00:00', '2026-06-15', '2026-06-01 08:00:00'),
('INV-202607-14', 14, 12, 3500, 260, 795, 0, 0, 4555, 0,    'GCash', '2026070011',     'Grace Mendoza', 'July 2026',      NULL,         'paid', '2026-07-15 09:00:00', '2026-07-15', '2026-07-01 08:00:00'),
('INV-202608-14', 14, 12, 3500, 265, 800, 0, 0, 4565, 0,    'GCash', '2026080011',     'Grace Mendoza', 'August 2026',    NULL,         'paid', '2026-08-14 10:00:00', '2026-08-15', '2026-08-01 08:00:00'),
('INV-202609-14', 14, 12, 3500, 0, 0, 0, 0, 3500, 0,    'GCash', '2026090011',     'Grace Mendoza', 'September 2026', '2026-09-05', 'paid', '2026-09-05 10:00:00', '2026-09-05', '2026-08-29 00:05:00');

-- Paolo Garcia (user 15, app 13, room J, 3F) - paid through August, moved out
-- 2026-09-01 when his term ended, so no September invoice
INSERT IGNORE INTO `invoices` (`id`,`user_id`,`rent_application_id`,`base_rent`,`water`,`electricity`,`parking`,`services`,`total_amount`,`security_deposit`,`payment_method`,`payment_reference`,`sender_name`,`billing_period`,`rent_period_start`,`status`,`paid_at`,`due_date`,`created_at`) VALUES
('INV-202601-15', 15, 13, 3500, 240, 720, 0, 0, 4460, 0, 'Cash',  NULL,             'Paolo Garcia', 'January 2026',   NULL, 'paid', '2026-01-15 16:00:00', '2026-01-15', '2026-01-01 08:00:00'),
('INV-202602-15', 15, 13, 3500, 235, 710, 0, 0, 4445, 0, 'GCash', '2026020012',     'Paolo Garcia', 'February 2026',  NULL, 'paid', '2026-02-14 12:00:00', '2026-02-15', '2026-02-01 08:00:00'),
('INV-202603-15', 15, 13, 3500, 245, 730, 0, 0, 4475, 0, 'GCash', '2026030012',     'Paolo Garcia', 'March 2026',     NULL, 'paid', '2026-03-15 11:00:00', '2026-03-15', '2026-03-01 08:00:00'),
('INV-202604-15', 15, 13, 3500, 250, 760, 0, 0, 4510, 0, 'Cash',  NULL,             'Paolo Garcia', 'April 2026',     NULL, 'paid', '2026-04-15 16:30:00', '2026-04-15', '2026-04-01 08:00:00'),
('INV-202605-15', 15, 13, 3500, 255, 790, 0, 0, 4545, 0, 'BDO',   'BDO-2026050012', 'Paolo Garcia', 'May 2026',       NULL, 'paid', '2026-05-14 13:00:00', '2026-05-15', '2026-05-01 08:00:00'),
('INV-202606-15', 15, 13, 3500, 250, 800, 0, 0, 4550, 0, 'GCash', '2026060012',     'Paolo Garcia', 'June 2026',      NULL, 'paid', '2026-06-15 10:00:00', '2026-06-15', '2026-06-01 08:00:00'),
('INV-202607-15', 15, 13, 3500, 245, 780, 0, 0, 4525, 0, 'GCash', '2026070012',     'Paolo Garcia', 'July 2026',      NULL, 'paid', '2026-07-14 11:00:00', '2026-07-15', '2026-07-01 08:00:00'),
('INV-202608-15', 15, 13, 3500, 240, 750, 0, 0, 4490, 0, 'Cash',  NULL,             'Paolo Garcia', 'August 2026',    NULL, 'paid', '2026-08-14 15:00:00', '2026-08-15', '2026-08-01 08:00:00');

-- ============================================================
-- 6. MAINTENANCE REQUESTS
-- issue_category: Plumbing | Electrical | Structural/Physical | Water Supply | General Maintenance | Others
-- urgency: Urgent | High | Medium | Low
-- status: Pending | In Progress | Completed | Rejected | Cancelled
-- ============================================================
INSERT IGNORE INTO `maintenance_requests` (`id`, `user_id`, `room_name`, `issue_category`, `urgency`, `preferred_date`, `preferred_time`, `description`, `permission_to_enter`, `status`, `assigned_to`, `estimated_cost`, `actual_cost`, `work_notes`, `tenant_responsible`, `created_at`, `acknowledged_at`, `started_at`, `resolved_at`) VALUES
(1, 10, 'G', 'Plumbing',            'High',   '2026-02-10', 'Morning',   'Kitchen faucet leaking severely, water damage risk.',   1, 'Completed',   'Jun Delos Santos', 1500.00, 1500.00, 'Replaced faucet cartridge. Fixed.',           0, '2026-02-08 09:00:00', '2026-02-08 11:00:00', '2026-02-10 08:00:00', '2026-02-10 15:30:00'),
(2, 12, 'K', 'General Maintenance', 'Low',    '2026-03-05', 'Afternoon', 'Exhaust fan in bathroom making rattling noise.',        0, 'Completed',   'Rodel Agustin',     600.00,  600.00, 'Tightened housing screws, lubricated motor.', 0, '2026-03-03 10:00:00', '2026-03-03 14:00:00', '2026-03-05 13:00:00', '2026-03-05 16:00:00'),
(3, 3,  'B', 'Electrical',          'High',   '2026-04-12', 'Morning',   'Circuit breaker tripping repeatedly in living area.',   1, 'Completed',   'Mar Bernardo',     2200.00, 2200.00, 'Replaced faulty breaker unit. Resolved.',     0, '2026-04-10 08:30:00', '2026-04-10 09:15:00', '2026-04-12 08:00:00', '2026-04-12 12:00:00'),
(4, 9,  'F', 'General Maintenance', 'Low',    '2026-05-20', 'Morning',   'Ants near kitchen counter, minor infestation.',         0, 'Completed',   'AMS Pest Control',  800.00,  800.00, 'Applied bait stations. Clear after 1 week.',  0, '2026-05-18 09:00:00', '2026-05-18 13:00:00', '2026-05-20 09:00:00', '2026-05-27 10:00:00'),
(5, 6,  'D', 'Plumbing',            'Medium', '2026-09-16', 'Afternoon', 'Slow drain in bathroom, possible clogging.',            1, 'In Progress', 'Jun Delos Santos',    NULL,    NULL, NULL,                                          1, '2026-09-14 10:00:00', '2026-09-14 15:00:00', '2026-09-16 13:00:00', NULL),
(6, 13, 'L', 'Structural/Physical', 'Low',    '2026-10-06', 'Morning',   'Window screen torn, insects getting in.',               0, 'Pending',     NULL,                  NULL,    NULL, NULL,                                          0, '2026-09-24 09:00:00', NULL,                  NULL,                  NULL),
(7, 11, 'H', 'Electrical',          'Medium', '2026-10-05', 'Morning',   'Light switch in bathroom flickering intermittently.',   1, 'Pending',     NULL,                  NULL,    NULL, NULL,                                          0, '2026-09-29 09:00:00', NULL,                  NULL,                  NULL);

-- ============================================================
-- 7. PARKING RESERVATIONS + CHARGES
-- max_parking_slots = 3 (system_settings). Only Assigned rows hold a slot:
-- slots 1 and 2 are taken, slot 3 is free, so approving Pedro's Pending
-- request (id 3) fills the lot. total_cost = months x parking_monthly_fee (300).
-- Permit 1 runs Apr 2026 - Mar 2027, permit 2 Jun - Nov 2026.
-- vehicle_type lowercase 'motorcycle' matches parking_allowed_vehicle_types default.
-- ============================================================
INSERT IGNORE INTO `parking_reservations` (`id`, `user_id`, `vehicle_type`, `vehicle_model`, `plate_number`, `status`, `slot_number`, `assigned_at`, `transmission`, `duration_months`, `total_cost`, `document_path`, `created_at`) VALUES
(1, 9,  'motorcycle', 'Honda Click 125i', 'ABC-1234', 'Assigned', 1,    '2026-04-01 09:00:00', 'Automatic', 12, 3600.00, 'placeholder', '2026-03-28 09:00:00'),
(2, 11, 'motorcycle', 'Yamaha Nmax 155',  'DEF-9012', 'Assigned', 2,    '2026-06-01 10:00:00', 'Automatic', 6,  1800.00, 'placeholder', '2026-05-29 10:00:00'),
(3, 10, 'motorcycle', 'Suzuki Raider 150','GHI-3456', 'Pending',  NULL, NULL,                  'Manual',    3,   900.00, 'placeholder', '2026-09-28 11:00:00');

-- One claim row per billed month (post_parking_charge()). October is left
-- unbilled for both permits so the Sync Parking button / auto sweep has work.
INSERT IGNORE INTO `parking_charges` (`reservation_id`, `billing_period`, `invoice_id`, `amount`, `created_at`) VALUES
(1, '2026-04', 'INV-202604-9',  300.00, '2026-04-01 09:00:00'),
(1, '2026-05', 'INV-202605-9',  300.00, '2026-05-01 08:00:00'),
(1, '2026-06', 'INV-202606-9',  300.00, '2026-06-01 08:00:00'),
(1, '2026-07', 'INV-202607-9',  300.00, '2026-07-01 08:00:00'),
(1, '2026-08', 'INV-202608-9',  300.00, '2026-08-01 08:00:00'),
(1, '2026-09', 'INV-202609-9',  300.00, '2026-09-08 00:05:00'),
(2, '2026-06', 'INV-202606-11', 300.00, '2026-06-01 10:00:00'),
(2, '2026-07', 'INV-202607-11', 300.00, '2026-07-01 08:00:00'),
(2, '2026-08', 'INV-202608-11', 300.00, '2026-08-01 08:00:00'),
(2, '2026-09', 'INV-202609-11', 300.00, '2026-08-25 00:05:00');

-- ============================================================
-- 8. CCTV REQUESTS
-- status: Pending | Approved | Rejected
-- ============================================================
INSERT IGNORE INTO `cctv_requests` (`user_id`, `incident_date`, `incident_time`, `location_details`, `reason_request`, `status`, `created_at`) VALUES
(14, '2026-05-15', '22:30', '3F Hallway',    'Suspicious individual seen near the stairwell. Need footage review.', 'Approved', '2026-05-16 08:00:00'),
(2,  '2026-09-27', '14:00', 'Parking Area',  'Motorbike scratched at parking lot, need footage to identify party.', 'Pending',  '2026-09-28 09:00:00');

-- ============================================================
-- 9. SERVICE BOOKINGS
-- Dante's March cleaning is Completed + already invoiced (see invoices above).
-- ============================================================
SET @svc_cleaning = (SELECT id FROM service_catalog WHERE name = 'Standard Unit Cleaning' LIMIT 1);
SET @svc_laundry   = (SELECT id FROM service_catalog WHERE name = 'Wash & Fold' LIMIT 1);
SET @svc_pest      = (SELECT id FROM service_catalog WHERE name = 'Pest Control Treatment' LIMIT 1);

INSERT IGNORE INTO `service_requests` (`user_id`, `service_id`, `room_name`, `service_name`, `category`, `unit_price`, `pricing_unit`, `quantity`, `total_cost`, `preferred_date`, `preferred_time_slot`, `notes`, `status`, `is_invoiced`, `invoice_id`, `billing_period`, `completed_at`, `created_at`) VALUES
(9,  @svc_cleaning, 'F', 'Standard Unit Cleaning', 'cleaning', 500.00, 'session', 1,  500.00, '2026-03-10', 'Morning',   'Please focus on kitchen area.', 'Completed', 1, 'INV-202603-9', 'March 2026', '2026-03-10 12:00:00', '2026-03-05 09:00:00'),
(2,  @svc_laundry,  'A', 'Wash & Fold',            'laundry',   60.00, 'kg',      5,  300.00, '2026-10-06', 'Afternoon', 'Regular garments, 5kg load.',    'Pending',   0, NULL, NULL, NULL, '2026-09-29 10:00:00'),
(12, @svc_pest,     'K', 'Pest Control Treatment', 'other',    900.00, 'session', 1,  900.00, '2026-10-07', 'Morning',   'Small ant trail near window.',   'Approved',  0, NULL, NULL, NULL, '2026-09-27 09:30:00');

-- ============================================================
-- 10. VISITOR LOGS
-- ============================================================
INSERT IGNORE INTO `visitor_logs` (`user_id`, `room_name`, `visitor_name`, `contact_number`, `id_type`, `id_number`, `purpose`, `vehicle_plate`, `status`, `check_in_at`, `expected_check_out_at`, `check_out_at`, `created_by`, `created_at`) VALUES
(2,  'A', 'Liza Santos',      '+63 9182345601', 'Driver\'s License', 'N01-23-456789', 'Family visit',      NULL,        'checked_out', '2026-06-14 14:00:00', '2026-06-14 19:00:00', '2026-06-14 18:30:00', @admin_id, '2026-06-14 13:55:00'),
(5,  'C', 'Carmen Dela Cruz', '+63 9182345602', 'UMID',              'CRN-0011223344', 'Overnight guest',   NULL,        'checked_out', '2026-07-02 19:00:00', '2026-07-03 10:00:00', '2026-07-03 09:00:00', @admin_id, '2026-07-02 18:50:00'),
(9,  'F', 'Ricky Abad',       '+63 9182345603', 'Driver\'s License', 'N02-34-567890',  'Delivery pickup',   'XYZ-7890',  'checked_in',  '2026-09-30 16:00:00', '2026-09-30 17:00:00', NULL,                   @admin_id, '2026-09-30 15:58:00'),
(11, 'H', 'Unknown Visitor',  '+63 9182345604', NULL,                NULL,             'Claimed maintenance visit, no prior notice.', NULL, 'denied', '2026-09-27 20:00:00', NULL, NULL, @admin_id, '2026-09-27 19:58:00');

-- ============================================================
-- 11. INQUIRIES + UNIT RESERVATIONS
-- Room I is held (Active); Room J is genuinely open (no inquiry/hold).
-- ============================================================
INSERT IGNORE INTO `inquiries` (`id`, `user_id`, `full_name`, `email`, `contact_no`, `room_name`, `occupants`, `preferred_move_in`, `message`, `source`, `status`, `viewing_date`, `handled_by`, `created_at`) VALUES
(1, NULL, 'Katrina Villareal', 'katrina.v@demo.example', '+63 9201234567', 'I', 1, '2026-10-15', 'Interested in a 3F unit, likes that it is quieter at the top.', 'web', 'Reserved', '2026-09-26 14:00:00', @admin_id, '2026-09-24 10:00:00'),
(2, NULL, 'Noel Ramirez',      'noel.ramirez@demo.example', '+63 9201234568', 'J', 1, '2026-10-20', 'Asking about monthly rate and deposit terms for 3F.', 'web', 'Contacted', NULL, @admin_id, '2026-09-29 11:00:00'),
(3, 11,   'Carlo Villanueva',  'carlo.villanueva@demo.example', '+63 9171234509', 'H', 1, '2025-12-01', 'Inquired before applying; later converted to a full application.', 'walk-in', 'Converted', '2025-11-20 10:00:00', @admin_id, '2025-11-18 09:00:00');

INSERT IGNORE INTO `unit_reservations` (`inquiry_id`, `user_id`, `room_name`, `reserved_for_name`, `contact_no`, `email`, `hold_expires_at`, `reservation_fee`, `status`, `notes`, `created_by`, `created_at`) VALUES
(1, NULL, 'I', 'Katrina Villareal', '+63 9201234567', 'katrina.v@demo.example', '2026-10-10', 500.00, 'Active', 'Held after in-person viewing, awaiting application submission.', @admin_id, '2026-09-26 14:30:00');

-- ============================================================
-- 12. ANNOUNCEMENTS + NOTIFICATIONS
-- ============================================================
INSERT IGNORE INTO `announcements` (`tag`, `title`, `body`, `send_to`, `channels`, `status`, `recipient_count`, `created_at`) VALUES
('Maintenance', 'Scheduled Water Interruption - February 8, 2026', 'Water supply will be interrupted from 8AM to 12PM on Feb 8 for pipe maintenance.', 'All Tenants', '["SMS","Email"]', 'sent', 12, '2026-02-05 09:00:00'),
('Reminder',    'Monthly Rent Due - March 15, 2026',               'Rent for March is due on the 15th. Please submit payment on time to avoid late fees.', 'All Tenants', '["Email"]', 'sent', 12, '2026-03-10 08:00:00'),
('Policy',      'Updated Building Rules - No Smoking Policy',      'Effective May 1, smoking is prohibited in all units and common areas.', 'All Tenants', '["SMS","Email"]', 'sent', 12, '2026-04-28 10:00:00'),
('Maintenance', 'Elevator Inspection - June 20, 2026',             'Elevator inspection on June 20 from 9AM-3PM. Please use the stairwell.', 'All Tenants', '["Email"]', 'sent', 12, '2026-06-18 09:00:00'),
('Reminder',    'Service Catalog Now Available',                   'Book cleaning, laundry and pest control add-ons directly from the Services page.', 'All Tenants', '["Email"]', 'sent', 12, '2026-08-01 09:00:00');

-- Informational rows are 'Resolved'; only the admin action queue is 'Pending'.
-- Queue rows carry metadata_value '<type>:<id>' so the decision endpoint can
-- resolve the matching row (resolve_admin_queue() in config.php). Titles and
-- types follow the endpoints that write them (update_tenant_status.php,
-- schedule_move_in.php, create_announcement.php: a Reminder is type 'action').
SET @pending_maint = (SELECT id FROM maintenance_requests WHERE room_name = 'H' AND status = 'Pending' ORDER BY id DESC LIMIT 1);
SET @pending_cctv  = (SELECT id FROM cctv_requests WHERE user_id = 2 AND status = 'Pending' ORDER BY id DESC LIMIT 1);
SET @pending_svc   = (SELECT id FROM service_requests WHERE user_id = 2 AND status = 'Pending' ORDER BY id DESC LIMIT 1);
SET @pending_app   = (SELECT id FROM rent_applications WHERE user_id = 8 AND status = 'Pending Review' ORDER BY id DESC LIMIT 1);

INSERT IGNORE INTO `notifications` (`user_id`, `title`, `message`, `type`, `status`, `metadata_value`, `is_read`, `created_at`) VALUES
(2,  'Application Approved', 'Your rent application for Unit A has been approved.', 'application_update', 'Resolved', NULL, 1, '2025-10-27 09:00:00'),
(3,  'Application Approved', 'Your rent application for Unit B has been approved.', 'application_update', 'Resolved', NULL, 1, '2025-09-25 10:00:00'),
(5,  'Application Approved', 'Your rent application for Unit C has been approved.', 'application_update', 'Resolved', NULL, 1, '2025-08-27 12:00:00'),
(6,  'Application Approved', 'Your rent application for Unit D has been approved.', 'application_update', 'Resolved', NULL, 1, '2025-10-27 09:00:00'),
(7,  'Application Approved', 'Your rent application for Unit E has been approved.', 'application_update', 'Resolved', NULL, 1, '2026-09-22 10:00:00'),
(7,  'Your Move-In Date',    'Your initial payment has been confirmed. Your move-in date for Unit E is October 5, 2026.', 'application_update', 'Resolved', NULL, 0, '2026-09-26 10:00:00'),
(15, 'Move-Out Completed',   'Your move-out has been completed and your clearance recorded. Thank you for staying with us.', 'move_out_update', 'Resolved', NULL, 1, '2026-09-01 10:00:00'),
(16, 'Application Rejected', 'Your rent application for Unit J has been rejected. Reason: Valid ID has expired. Please apply again with a current one.', 'application_update', 'Resolved', NULL, 1, '2026-09-10 11:00:00'),
(2,  'Monthly Rent Due - March 15, 2026', 'Rent for March is due on the 15th. Please submit payment on time to avoid late fees.', 'action', 'Resolved', NULL, 1, '2026-03-10 08:00:00'),
(3,  'Monthly Rent Due - March 15, 2026', 'Rent for March is due on the 15th. Please submit payment on time to avoid late fees.', 'action', 'Resolved', NULL, 1, '2026-03-10 08:00:00'),
(5,  'Monthly Rent Due - March 15, 2026', 'Rent for March is due on the 15th. Please submit payment on time to avoid late fees.', 'action', 'Resolved', NULL, 0, '2026-03-10 08:00:00'),
(@admin_id, 'Move-In Scheduled',       'Unit E move-in is set for October 5, 2026. Confirm the move-in once the tenant has moved in.', 'rent_application', 'Pending', 'rent_application:5', 0, '2026-09-26 10:00:00'),
(@admin_id, 'New CCTV Request',        'A new CCTV footage request has been submitted for an incident at Parking Area.', 'cctv_request',        'Pending', CONCAT('cctv_request:', @pending_cctv),         0, '2026-09-28 09:00:00'),
(@admin_id, 'New Maintenance Request', 'A new maintenance request (Electrical - Medium) has been submitted.',      'maintenance_request', 'Pending', CONCAT('maintenance_request:', @pending_maint), 0, '2026-09-29 09:00:00'),
(@admin_id, 'New Service Booking',     'A new laundry booking ("Wash & Fold") has been submitted for Oct 6, 2026.', 'service_request',     'Pending', CONCAT('service_request:', @pending_svc),       0, '2026-09-29 10:00:00'),
(@admin_id, 'New Rent Application',    'Gloria Tan submitted a rent application for Room N.',                        'rent_application',    'Pending', CONCAT('rent_application:', @pending_app),      0, '2026-09-28 09:00:00'),
(@admin_id, 'New Parking Reservation', 'A new parking reservation request for plate GHI-3456 has been submitted.', 'parking_reservation', 'Pending', 'parking_reservation:3',                    0, '2026-09-28 11:00:00'),
(@admin_id, 'Move-Out Notice Filed',   'A tenant filed a move-out notice for Room L, scheduled 2026-10-20. Clearance and final billing required.', 'move_out_request', 'Pending', 'move_out_request:11', 0, '2026-10-01 18:00:00');

-- ============================================================
-- 13. ACTIVITY LOGS (admin audit)
-- Actions and details use the wording the endpoints log today.
-- ============================================================
INSERT IGNORE INTO `activity_logs` (`category`, `action`, `details`, `performed_by`, `created_at`) VALUES
('tenant',      'Updated Tenant Status',  'Application ID: 1, New Status: Approved',  @admin_id, '2025-10-27 09:00:00'),
('tenant',      'Updated Tenant Status',  'Application ID: 2, New Status: Approved',  @admin_id, '2025-09-25 10:00:00'),
('tenant',      'Updated Tenant Status',  'Application ID: 3, New Status: Approved',  @admin_id, '2025-08-27 12:00:00'),
('tenant',      'Updated Tenant Status',  'Application ID: 4, New Status: Approved',  @admin_id, '2025-10-27 09:05:00'),
('tenant',      'Updated Tenant Status',  'Application ID: 5, New Status: Approved',  @admin_id, '2026-09-22 10:00:00'),
('billing',     'Recorded Payment',       'Invoice INV-202609-7 settled via GCash',   @admin_id, '2026-09-25 10:00:00'),
('tenant',      'Scheduled Move-In',      'Application ID: 5, Date: 2026-10-05',      @admin_id, '2026-09-26 10:00:00'),
('contract',    'Approved Rent Extension', 'User ID: 5 - Contract LC-0003 extended by 9 month(s): 2026-03-01 to 2026-12-01', @admin_id, '2026-07-05 10:30:00'),
('contract',    'Flagged Eviction',       'Contract: LC-0004',                        @admin_id, '2026-09-20 11:00:00'),
('maintenance', 'Updated Maintenance Ticket #1', 'Status: In Progress -> Completed',  @admin_id, '2026-02-10 15:30:00'),
('maintenance', 'Updated Maintenance Ticket #3', 'Status: In Progress -> Completed',  @admin_id, '2026-04-12 12:00:00'),
('billing',     'Recorded Payment',       'Invoice INV-202609-2 settled via GCash',   @admin_id, '2026-09-01 09:00:00'),
('inquiry',     'Reserved Unit',          'Unit I held for Katrina Villareal until +14 days (Reservation ID: 1)', @admin_id, '2026-09-26 14:30:00'),
('tenant',      'Completed Move Out & Clearance', 'Application ID: 13, Unit inspected, no damage.; deposit covered the balance in full', @admin_id, '2026-09-01 10:00:00'),
('tenant',      'Archived Tenant',        'Application ID: 13, Reason: End of Rent Term, Notes: Unit inspected, no damage.', @admin_id, '2026-09-01 10:05:00'),
('tenant',      'Updated Tenant Status',  'Application ID: 14, New Status: Rejected', @admin_id, '2026-09-10 11:00:00'),
('tenant',      'Requested Move Out',     'Application ID: 11, Room: L, Scheduled: 2026-10-20', 13, '2026-10-01 18:00:00');

-- ============================================================
-- 14. UTILITY READINGS (checklist 8.7)
-- July + August 2026 for Room A (Maria) and Room K (Ana), already billed.
-- Amount + other fees on each row equal the water/electricity line items on the
-- matching seeded invoice, so readings and invoices reconcile. No September
-- reading is seeded (the September/October invoices are rent-only): tests
-- record one and sync it.
-- ============================================================
INSERT IGNORE INTO `utility_readings`
  (`room_name`,`user_id`,`billing_period`,`reading_date`,
   `water_prev_reading`,`water_curr_reading`,`water_rate_per_unit`,`water_consumption`,`water_amount`,`water_other_fees`,
   `electric_prev_reading`,`electric_curr_reading`,`electric_rate_per_unit`,`electric_consumption`,`electric_amount`,`electric_other_fees`,
   `is_invoiced`,`invoice_id`,`notes`,`recorded_by`,`created_at`) VALUES
('A', 2,  '2026-07', '2026-07-31', 100.00, 107.50, 40.00, 7.50, 300.00,  0.00, 2000.00, 2073.00, 12.00, 73.00, 876.00, 4.00, 1, 'INV-202607-2',  NULL, @admin_id, '2026-07-31 16:00:00'),
('A', 2,  '2026-08', '2026-08-31', 107.50, 114.50, 40.00, 7.00, 280.00, 15.00, 2073.00, 2145.00, 12.00, 72.00, 864.00, 1.00, 1, 'INV-202608-2',  NULL, @admin_id, '2026-08-31 16:00:00'),
('K', 12, '2026-07', '2026-07-31',  80.00,  86.50, 40.00, 6.50, 260.00, 15.00, 1500.00, 1568.00, 12.00, 68.00, 816.00, 9.00, 1, 'INV-202607-12', NULL, @admin_id, '2026-07-31 16:30:00'),
('K', 12, '2026-08', '2026-08-31',  86.50,  93.20, 40.00, 6.70, 268.00,  0.00, 1568.00, 1635.00, 12.00, 67.00, 804.00, 8.00, 1, 'INV-202608-12', NULL, @admin_id, '2026-08-31 16:30:00');

-- ============================================================
-- 15. RENT PERIODS (2026_09_rent_periods_advance.sql)
-- Rent invoices from September 2026 carry rent_period_start inline (above),
-- as does Grace's January move-in invoice (tenancy month 0). Lita's move-in
-- invoice stays NULL until her move-in is confirmed. The January-August rent
-- invoices predate rent periods and are matched by their "Month YYYY" label;
-- the daily sweep bills each tenancy month from the next one that starts on
-- or after today.
-- ============================================================

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- CREDENTIALS REFERENCE
-- All mock tenant passwords: tenant123
--
-- SCRIPTED test accounts (each built for a specific admin-feature test):
--   maria.santos@demo.example   Room A  - clean baseline, fully paid, no issues
--   jose.reyes@demo.example     Room B  - Sep+Oct overdue -> eviction banner / overdueInfo
--   rosa.delacruz@demo.example  Room C  - rent term extended mid-year -> lease_renewals audit trail
--   ben.flores@demo.example     Room D  - eviction-pending, Aug-Oct overdue -> Flag/Clear Eviction UI
--   lita.ramos@demo.example     Room E  - Approved, move-in paid + scheduled Oct 5, room reserved,
--                                      contract Draft -> Confirm Move-In (tenant stays on Track Application)
--   gloria.tan@demo.example     No room - Pending Review application (targets Room N) -> /track-application
--   ana.bautista@demo.example   Room K  (3F) - term ends 2026-10-15 -> rent-end reminder / expiry
--
-- BULK / background accounts:
--   dante.abad@demo.example        Room F  - parking (Assigned, Apr 2026 - Mar 2027) + 1 invoiced service booking
--   pedro.cruz@demo.example        Room G  - 1 completed maintenance request + Pending parking request
--   carlo.villanueva@demo.example  Room H  - parking (Assigned, Jun - Nov 2026)
--   mark.santiago@demo.example     Room L  (3F) - paid up; move-out notice for 2026-10-20 (pending-move-out)
--   grace.mendoza@demo.example     Room M  (3F) - has an approved CCTV request
--
-- PAST / DECIDED (no current room):
--   paolo.garcia@demo.example   ex-Room J - moved out 2026-09-01, archived, contract expired
--   ramon.aquino@demo.example   Rejected application (room J, expired valid ID)
--   liza.navarro@demo.example   Cancelled application (room J, "Change of mind")
--
-- VACANT:
--   Room I - held via an Active unit_reservations hold until 2026-10-10 (Katrina Villareal)
--   Room J - open, no hold; last tenant Paolo Garcia
--   Room P - extra 3F unit (PHP4,000) matching prod; not in SetupDB.sql
--   Room N - open; Gloria Tan's Pending Review application targets it but hasn't been approved
-- ============================================================

-- Installments (2026_10_manager_interview_alignment.sql): a paid invoice was paid in full.
UPDATE `invoices` SET `amount_paid` = `total_amount` WHERE `status` = 'paid' AND `amount_paid` = 0;
