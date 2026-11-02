-- ============================================================
-- seed_demo_full.sql: demo data for every module, in every workflow state.
--
-- Safe on a live database. It uses no fixed ids and no USE line: pick the
-- database first (mysql ... <db> < this file, or Adminer's SQL box). It adds
-- 16 demo accounts (@demo.example.com, an undeliverable domain, opted out of
-- email and SMS) next to whatever exists and touches nothing else, apart
-- from the 12 vacant rooms it fills and two optional utility types it turns on.
-- Dates are relative to today, so the data is "current" whenever it runs.
-- Undo with seed_demo_reset.sql.
--
-- Needs: SetupDB.sql schema, one admin account, and at least 12 vacant,
-- unarchived rooms. If any of that is missing, or the demo accounts already
-- exist, the guard below stops the script with a duplicate-entry error before
-- anything is written. Everything after the guard runs in one transaction.
--
-- Login: <email>@demo.example.com / tenant123 (angela.dizon is the clean
-- baseline). No announcement is addressed to All Tenants and nothing is
-- queued for delivery, so real tenants are not contacted.
--
-- WHO IS WHO (room = the n-th vacant room, A first)
--   1  Angela Dizon      clean baseline; 24-mo rent; advance rent (applied + available);
--                        split payment (cash + GCash) 4 months back; chat, household,
--                        meter readings, a service booking and a CCTV request
--   2  Benedict Mercado  2 months overdue + late fee, flagged for eviction, parking rejected
--   3  Cecilia Aguilar   payment under review (GCash proof, reused reference), plumbing ticket
--   4  Daniel Ocampo     split proof under review (GCash + BPI), parking assigned + charges
--   5  Elena Pascual    cash visit scheduled, maintenance billed to tenant, service billed
--   6  Faye Gonzales     online payment failed, unpaid advance rent, parking request pending
--   7  Gustavo Lim       online checkout in progress, extra utilities (internet, gas), parking
--   8  Hannah Soriano    rent ends next month, installment part-paid, overpayment refund
--   9  Ivan Salazar      move-out filed (deposit deductions), unused advance rent refund
--  10  Jonas Bautista    approved, move-in paid, contract draft, move-in date set
--  11  Kimberly Cruz     new application, documents uploaded (Pending Review)
--      Louie Ramirez     application sent back (Action Required: missing document)
--      Maxine Torres     application rejected
--      Nico Alvarez      application cancelled
--      Omar Castillo     approved and paid, then rejected: refund approved
--      Patricia Navarro  moved out last month, deposit applied to rent (archived)
--  plus unit hold, waitlist, guest chat, announcements, expenses and 9 months
--  of paid rent for reports.
-- ============================================================

-- Match the tables' collation: user variables take the connection's, and MySQL 8
-- defaults to utf8mb4_0900_ai_ci, which cannot be compared with utf8mb4_general_ci
-- columns (error 1267).
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

-- ---- guard: any of these inserts fails (duplicate key) when a check trips ----
DROP TEMPORARY TABLE IF EXISTS _seed_guard, _t, _m;
CREATE TEMPORARY TABLE _seed_guard (k INT NOT NULL PRIMARY KEY);
INSERT INTO _seed_guard VALUES (1);
-- no admin account
INSERT INTO _seed_guard SELECT 1 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin' AND is_archived = 0);
-- demo accounts already loaded (run seed_demo_reset.sql first)
INSERT INTO _seed_guard SELECT 1 FROM DUAL WHERE EXISTS (SELECT 1 FROM users WHERE email_address LIKE '%@demo.example.com');
-- fewer than 12 vacant rooms
INSERT INTO _seed_guard SELECT 1 FROM DUAL WHERE (SELECT COUNT(*) FROM rooms WHERE status = 'vacant' AND archived_at IS NULL) < 12;

SET @today  = CURDATE();
SET @m0     = DATE_FORMAT(@today, '%Y-%m-01');                 -- first of this month
SET @m1     = DATE_ADD(@m0, INTERVAL 1 MONTH);                 -- first of next month
SET @ts     = DATE_SUB(@m0, INTERVAL 9 MONTH);                 -- start of the 10-month history
SET @admin_id = (SELECT id FROM users WHERE role = 'admin' AND is_archived = 0 ORDER BY id LIMIT 1);
SET @pw     = '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy'; -- tenant123

SET @r1  = (SELECT id FROM rooms WHERE status = 'vacant' AND archived_at IS NULL ORDER BY id LIMIT 1 OFFSET 0);
SET @r2  = (SELECT id FROM rooms WHERE status = 'vacant' AND archived_at IS NULL ORDER BY id LIMIT 1 OFFSET 1);
SET @r3  = (SELECT id FROM rooms WHERE status = 'vacant' AND archived_at IS NULL ORDER BY id LIMIT 1 OFFSET 2);
SET @r4  = (SELECT id FROM rooms WHERE status = 'vacant' AND archived_at IS NULL ORDER BY id LIMIT 1 OFFSET 3);
SET @r5  = (SELECT id FROM rooms WHERE status = 'vacant' AND archived_at IS NULL ORDER BY id LIMIT 1 OFFSET 4);
SET @r6  = (SELECT id FROM rooms WHERE status = 'vacant' AND archived_at IS NULL ORDER BY id LIMIT 1 OFFSET 5);
SET @r7  = (SELECT id FROM rooms WHERE status = 'vacant' AND archived_at IS NULL ORDER BY id LIMIT 1 OFFSET 6);
SET @r8  = (SELECT id FROM rooms WHERE status = 'vacant' AND archived_at IS NULL ORDER BY id LIMIT 1 OFFSET 7);
SET @r9  = (SELECT id FROM rooms WHERE status = 'vacant' AND archived_at IS NULL ORDER BY id LIMIT 1 OFFSET 8);
SET @r10 = (SELECT id FROM rooms WHERE status = 'vacant' AND archived_at IS NULL ORDER BY id LIMIT 1 OFFSET 9);
SET @r11 = (SELECT id FROM rooms WHERE status = 'vacant' AND archived_at IS NULL ORDER BY id LIMIT 1 OFFSET 10);
SET @r12 = (SELECT id FROM rooms WHERE status = 'vacant' AND archived_at IS NULL ORDER BY id LIMIT 1 OFFSET 11);

-- two parking slots (of 1-3) that nobody holds yet
SET @slot1 = (SELECT s FROM (SELECT 1 AS s UNION SELECT 2 UNION SELECT 3) x WHERE s NOT IN (SELECT slot_number FROM parking_reservations WHERE status = 'Assigned' AND slot_number IS NOT NULL) ORDER BY s LIMIT 1 OFFSET 0);
SET @slot2 = (SELECT s FROM (SELECT 1 AS s UNION SELECT 2 UNION SELECT 3) x WHERE s NOT IN (SELECT slot_number FROM parking_reservations WHERE status = 'Assigned' AND slot_number IS NOT NULL) ORDER BY s LIMIT 1 OFFSET 1);
INSERT INTO _seed_guard SELECT 1 FROM DUAL WHERE @slot2 IS NULL;
-- meter readings already recorded for these rooms in the recent months would clash
INSERT INTO _seed_guard SELECT 1 FROM DUAL WHERE EXISTS (
  SELECT 1 FROM utility_readings WHERE room_name IN (@r1, @r7, @r8) AND billing_period >= DATE_FORMAT(DATE_SUB(@m0, INTERVAL 3 MONTH), '%Y-%m'));

START TRANSACTION;

-- ============================================================
-- 1. ACCOUNTS
-- ============================================================
INSERT INTO users (first_name, middle_name, last_name, contact_no, gender, email_address, password, role, sms_opt_out, email_opt_out) VALUES
('Angela',    'M.', 'Dizon',    '+63 9000000101', 'Female', 'angela.dizon@demo.example.com',    @pw, 'user', 1, 1),
('Benedict',  'R.', 'Mercado',  '+63 9000000102', 'Male',   'benedict.mercado@demo.example.com', @pw, 'user', 1, 1),
('Cecilia',   'L.', 'Aguilar',  '+63 9000000103', 'Female', 'cecilia.aguilar@demo.example.com', @pw, 'user', 1, 1),
('Daniel',    'P.', 'Ocampo',   '+63 9000000104', 'Male',   'daniel.ocampo@demo.example.com',   @pw, 'user', 1, 1),
('Elena',     'S.', 'Pascual',  '+63 9000000105', 'Female', 'elena.pascual@demo.example.com',   @pw, 'user', 1, 1),
('Faye',      'G.', 'Gonzales', '+63 9000000106', 'Female', 'faye.gonzales@demo.example.com',   @pw, 'user', 1, 1),
('Gustavo',   'T.', 'Lim',      '+63 9000000107', 'Male',   'gustavo.lim@demo.example.com',     @pw, 'user', 1, 1),
('Hannah',    'B.', 'Soriano',  '+63 9000000108', 'Female', 'hannah.soriano@demo.example.com',  @pw, 'user', 1, 1),
('Ivan',      'C.', 'Salazar',  '+63 9000000109', 'Male',   'ivan.salazar@demo.example.com',    @pw, 'user', 1, 1),
('Jonas',     'D.', 'Bautista', '+63 9000000110', 'Male',   'jonas.bautista@demo.example.com',  @pw, 'user', 1, 1),
('Kimberly',  'A.', 'Cruz',     '+63 9000000111', 'Female', 'kimberly.cruz@demo.example.com',   @pw, 'user', 1, 1),
('Louie',     'F.', 'Ramirez',  '+63 9000000112', 'Male',   'louie.ramirez@demo.example.com',   @pw, 'user', 1, 1),
('Maxine',    'H.', 'Torres',   '+63 9000000113', 'Female', 'maxine.torres@demo.example.com',   @pw, 'user', 1, 1),
('Nico',      'J.', 'Alvarez',  '+63 9000000114', 'Male',   'nico.alvarez@demo.example.com',    @pw, 'user', 1, 1),
('Omar',      'K.', 'Castillo', '+63 9000000115', 'Male',   'omar.castillo@demo.example.com',   @pw, 'user', 1, 1),
('Patricia',  'N.', 'Navarro',  '+63 9000000116', 'Female', 'patricia.navarro@demo.example.com', @pw, 'user', 1, 1);
-- Demo accounts have verified email (login.php refuses unverified ones).
UPDATE users SET email_verified_at = NOW() WHERE email_verified_at IS NULL AND email_address LIKE '%@demo.example.com';

SET @u_ana  = (SELECT id FROM users WHERE email_address = 'angela.dizon@demo.example.com');
SET @u_ben  = (SELECT id FROM users WHERE email_address = 'benedict.mercado@demo.example.com');
SET @u_cia  = (SELECT id FROM users WHERE email_address = 'cecilia.aguilar@demo.example.com');
SET @u_dan  = (SELECT id FROM users WHERE email_address = 'daniel.ocampo@demo.example.com');
SET @u_eli  = (SELECT id FROM users WHERE email_address = 'elena.pascual@demo.example.com');
SET @u_fay  = (SELECT id FROM users WHERE email_address = 'faye.gonzales@demo.example.com');
SET @u_gus  = (SELECT id FROM users WHERE email_address = 'gustavo.lim@demo.example.com');
SET @u_hal  = (SELECT id FROM users WHERE email_address = 'hannah.soriano@demo.example.com');
SET @u_ivan = (SELECT id FROM users WHERE email_address = 'ivan.salazar@demo.example.com');
SET @u_jon  = (SELECT id FROM users WHERE email_address = 'jonas.bautista@demo.example.com');
SET @u_kim  = (SELECT id FROM users WHERE email_address = 'kimberly.cruz@demo.example.com');
SET @u_lou  = (SELECT id FROM users WHERE email_address = 'louie.ramirez@demo.example.com');
SET @u_max  = (SELECT id FROM users WHERE email_address = 'maxine.torres@demo.example.com');
SET @u_nico = (SELECT id FROM users WHERE email_address = 'nico.alvarez@demo.example.com');
SET @u_omar = (SELECT id FROM users WHERE email_address = 'omar.castillo@demo.example.com');
SET @u_pia  = (SELECT id FROM users WHERE email_address = 'patricia.navarro@demo.example.com');

-- ============================================================
-- 2. RENT APPLICATIONS
-- ============================================================
INSERT INTO rent_applications
  (user_id, first_name, middle_name, last_name, contact_no, email, gender, previous_address, occupants, months_of_rent,
   room_name, monthly_rent, status, rejection_reason, move_in_date, preferred_move_in_date, requested_move_out_date,
   created_at, terms_agreed_at, documents_verified_at) VALUES
(@u_ana,  'Angela',   'M.', 'Dizon',    '+63 9000000101', 'angela.dizon@demo.example.com',    'Female', 'Brgy. Biga, Silang, Cavite',      2, 24, @r1,  (SELECT monthly_rent FROM rooms WHERE id = @r1), 'active', NULL, @ts, @ts, NULL, DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 5 DAY)),
(@u_ben,  'Benedict', 'R.', 'Mercado',  '+63 9000000102', 'benedict.mercado@demo.example.com', 'Male',   'Brgy. Maguyam, Silang, Cavite', 1, 12, @r2,  (SELECT monthly_rent FROM rooms WHERE id = @r2), 'active', NULL, @ts, @ts, NULL, DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 5 DAY)),
(@u_cia,  'Cecilia',  'L.', 'Aguilar',  '+63 9000000103', 'cecilia.aguilar@demo.example.com', 'Female', 'Dasmarinas, Cavite',            2, 12, @r3,  (SELECT monthly_rent FROM rooms WHERE id = @r3), 'active', NULL, @ts, @ts, NULL, DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 5 DAY)),
(@u_dan,  'Daniel',   'P.', 'Ocampo',   '+63 9000000104', 'daniel.ocampo@demo.example.com',   'Male',   'Tagaytay City',                 1, 12, @r4,  (SELECT monthly_rent FROM rooms WHERE id = @r4), 'active', NULL, @ts, @ts, NULL, DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 5 DAY)),
(@u_eli,  'Elena',    'S.', 'Pascual',  '+63 9000000105', 'elena.pascual@demo.example.com',   'Female', 'Imus, Cavite',                  1, 12, @r5,  (SELECT monthly_rent FROM rooms WHERE id = @r5), 'active', NULL, @ts, @ts, NULL, DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 5 DAY)),
(@u_fay,  'Faye',     'G.', 'Gonzales', '+63 9000000106', 'faye.gonzales@demo.example.com',   'Female', 'Carmona, Cavite',               1, 24, @r6,  (SELECT monthly_rent FROM rooms WHERE id = @r6), 'active', NULL, @ts, @ts, NULL, DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 5 DAY)),
(@u_gus,  'Gustavo',  'T.', 'Lim',      '+63 9000000107', 'gustavo.lim@demo.example.com',     'Male',   'Silang, Cavite',                2, 24, @r7,  (SELECT monthly_rent FROM rooms WHERE id = @r7), 'active', NULL, @ts, @ts, NULL, DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 5 DAY)),
(@u_hal,  'Hannah',   'B.', 'Soriano',  '+63 9000000108', 'hannah.soriano@demo.example.com',  'Female', 'General Trias, Cavite',         1, 12, @r8,  (SELECT monthly_rent FROM rooms WHERE id = @r8), 'active', NULL, @ts, @ts, NULL, DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 5 DAY)),
(@u_ivan, 'Ivan',     'C.', 'Salazar',  '+63 9000000109', 'ivan.salazar@demo.example.com',    'Male',   'Bacoor, Cavite',                1, 24, @r9,  (SELECT monthly_rent FROM rooms WHERE id = @r9), 'pending-move-out', NULL, @ts, @ts, DATE_ADD(@today, INTERVAL 12 DAY), DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 6 DAY), DATE_SUB(@ts, INTERVAL 5 DAY)),
(@u_jon,  'Jonas',    'D.', 'Bautista', '+63 9000000110', 'jonas.bautista@demo.example.com',  'Male',   'Trece Martires, Cavite',        1, 12, @r10, (SELECT monthly_rent FROM rooms WHERE id = @r10), 'Approved', NULL, DATE_ADD(@today, INTERVAL 3 DAY), DATE_ADD(@today, INTERVAL 3 DAY), NULL, DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY)),
(@u_kim,  'Kimberly', 'A.', 'Cruz',     '+63 9000000111', 'kimberly.cruz@demo.example.com',   'Female', 'Alfonso, Cavite',               1, 6,  @r11, (SELECT monthly_rent FROM rooms WHERE id = @r11), 'Pending Review', NULL, NULL, DATE_ADD(@today, INTERVAL 20 DAY), NULL, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), NULL),
(@u_lou,  'Louie',    'F.', 'Ramirez',  '+63 9000000112', 'louie.ramirez@demo.example.com',   'Male',   'Naic, Cavite',                  1, 12, @r11, (SELECT monthly_rent FROM rooms WHERE id = @r11), 'Action Required', 'The back of your valid ID is blurry. Please upload a clearer photo.', NULL, DATE_ADD(@today, INTERVAL 25 DAY), NULL, DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY), NULL),
(@u_max,  'Maxine',   'H.', 'Torres',   '+63 9000000113', 'maxine.torres@demo.example.com',   'Female', 'Mendez, Cavite',                2, 12, @r11, (SELECT monthly_rent FROM rooms WHERE id = @r11), 'Rejected', 'Valid ID has expired. Please apply again with a current one.', NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 20 DAY), NULL),
(@u_nico, 'Nico',     'J.', 'Alvarez',  '+63 9000000114', 'nico.alvarez@demo.example.com',    'Male',   'Amadeo, Cavite',                1, 6,  @r11, (SELECT monthly_rent FROM rooms WHERE id = @r11), 'Cancelled', 'Change of plans', NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 15 DAY), DATE_SUB(NOW(), INTERVAL 15 DAY), NULL),
(@u_omar, 'Omar',     'K.', 'Castillo', '+63 9000000115', 'omar.castillo@demo.example.com',   'Male',   'Kawit, Cavite',                 1, 12, @r11, (SELECT monthly_rent FROM rooms WHERE id = @r11), 'Rejected', 'Documents could not be verified after approval.', NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_SUB(NOW(), INTERVAL 12 DAY), NULL),
(@u_pia,  'Patricia', 'N.', 'Navarro',  '+63 9000000116', 'patricia.navarro@demo.example.com', 'Female', 'Rosario, Cavite',              1, 12, @r11, (SELECT monthly_rent FROM rooms WHERE id = @r11), 'archived', NULL, DATE_SUB(@m0, INTERVAL 12 MONTH), DATE_SUB(@m0, INTERVAL 12 MONTH), DATE_SUB(@m0, INTERVAL 1 MONTH), DATE_SUB(@m0, INTERVAL 12 MONTH), DATE_SUB(@m0, INTERVAL 12 MONTH), DATE_SUB(@m0, INTERVAL 12 MONTH));

SET @a_ana  = (SELECT id FROM rent_applications WHERE user_id = @u_ana  ORDER BY id DESC LIMIT 1);
SET @a_ben  = (SELECT id FROM rent_applications WHERE user_id = @u_ben  ORDER BY id DESC LIMIT 1);
SET @a_cia  = (SELECT id FROM rent_applications WHERE user_id = @u_cia  ORDER BY id DESC LIMIT 1);
SET @a_dan  = (SELECT id FROM rent_applications WHERE user_id = @u_dan  ORDER BY id DESC LIMIT 1);
SET @a_eli  = (SELECT id FROM rent_applications WHERE user_id = @u_eli  ORDER BY id DESC LIMIT 1);
SET @a_fay  = (SELECT id FROM rent_applications WHERE user_id = @u_fay  ORDER BY id DESC LIMIT 1);
SET @a_gus  = (SELECT id FROM rent_applications WHERE user_id = @u_gus  ORDER BY id DESC LIMIT 1);
SET @a_hal  = (SELECT id FROM rent_applications WHERE user_id = @u_hal  ORDER BY id DESC LIMIT 1);
SET @a_ivan = (SELECT id FROM rent_applications WHERE user_id = @u_ivan ORDER BY id DESC LIMIT 1);
SET @a_jon  = (SELECT id FROM rent_applications WHERE user_id = @u_jon  ORDER BY id DESC LIMIT 1);
SET @a_kim  = (SELECT id FROM rent_applications WHERE user_id = @u_kim  ORDER BY id DESC LIMIT 1);
SET @a_lou  = (SELECT id FROM rent_applications WHERE user_id = @u_lou  ORDER BY id DESC LIMIT 1);
SET @a_max  = (SELECT id FROM rent_applications WHERE user_id = @u_max  ORDER BY id DESC LIMIT 1);
SET @a_nico = (SELECT id FROM rent_applications WHERE user_id = @u_nico ORDER BY id DESC LIMIT 1);
SET @a_omar = (SELECT id FROM rent_applications WHERE user_id = @u_omar ORDER BY id DESC LIMIT 1);
SET @a_pia  = (SELECT id FROM rent_applications WHERE user_id = @u_pia  ORDER BY id DESC LIMIT 1);

-- A tenant who cancelled, and one who moved out last month.
UPDATE rent_applications SET cancelled_at = DATE_SUB(NOW(), INTERVAL 14 DAY) WHERE id = @a_nico;
UPDATE rent_applications SET pre_archive_status = 'moved-out', archive_date = DATE_SUB(@m0, INTERVAL 1 MONTH),
       archive_reason = 'End of Rent Term', archive_notes = 'Unit inspected, no damage.'
 WHERE id = @a_pia;
-- Jonas has a move-in date set and sent to him.
UPDATE rent_applications SET move_in_notified_at = DATE_SUB(NOW(), INTERVAL 2 DAY) WHERE id = @a_jon;

-- ---- documents against the active requirements ----
INSERT INTO application_documents (rent_application_id, requirement_id, label_snapshot, file_path)
SELECT a.id, r.id, r.label, CONCAT('../uploads/applications/demo_', a.id, '_', r.id, '.pdf')
  FROM rent_applications a
  JOIN application_requirements r ON r.is_active = 1
 WHERE a.id IN (@a_kim, @a_jon, @a_omar)
    OR (a.id = @a_lou AND r.sort_order = (SELECT MIN(sort_order) FROM application_requirements WHERE is_active = 1));

-- ============================================================
-- 3. ROOMS
-- ============================================================
UPDATE rooms SET status = 'occupied', occupants = 2, tenant_name = 'Angela Dizon',      lease_start = @ts, lease_end = DATE_ADD(@ts, INTERVAL 24 MONTH) WHERE id = @r1;
UPDATE rooms SET status = 'occupied', occupants = 1, tenant_name = 'Benedict Mercado',  lease_start = @ts, lease_end = DATE_ADD(@ts, INTERVAL 12 MONTH) WHERE id = @r2;
UPDATE rooms SET status = 'occupied', occupants = 2, tenant_name = 'Cecilia Aguilar',   lease_start = @ts, lease_end = DATE_ADD(@ts, INTERVAL 12 MONTH) WHERE id = @r3;
UPDATE rooms SET status = 'occupied', occupants = 1, tenant_name = 'Daniel Ocampo',     lease_start = @ts, lease_end = DATE_ADD(@ts, INTERVAL 12 MONTH) WHERE id = @r4;
UPDATE rooms SET status = 'occupied', occupants = 1, tenant_name = 'Elena Pascual',     lease_start = @ts, lease_end = DATE_ADD(@ts, INTERVAL 12 MONTH) WHERE id = @r5;
UPDATE rooms SET status = 'occupied', occupants = 1, tenant_name = 'Faye Gonzales',     lease_start = @ts, lease_end = DATE_ADD(@ts, INTERVAL 24 MONTH) WHERE id = @r6;
UPDATE rooms SET status = 'occupied', occupants = 2, tenant_name = 'Gustavo Lim',       lease_start = @ts, lease_end = DATE_ADD(@ts, INTERVAL 24 MONTH) WHERE id = @r7;
UPDATE rooms SET status = 'occupied', occupants = 1, tenant_name = 'Hannah Soriano',    lease_start = DATE_SUB(@m1, INTERVAL 12 MONTH), lease_end = @m1 WHERE id = @r8;
UPDATE rooms SET status = 'occupied', occupants = 1, tenant_name = 'Ivan Salazar',      lease_start = @ts, lease_end = DATE_ADD(@ts, INTERVAL 24 MONTH) WHERE id = @r9;
UPDATE rooms SET status = 'reserved', occupants = 1, tenant_name = 'Jonas Bautista',    lease_start = @today, lease_end = DATE_ADD(@today, INTERVAL 12 MONTH) WHERE id = @r10;
UPDATE rooms SET last_tenant = 'Patricia Navarro', last_inspection_date = DATE_SUB(@m0, INTERVAL 1 MONTH) WHERE id = @r11;
-- Hannah's tenancy runs to the first of next month: her application says so too.
UPDATE rent_applications SET move_in_date = DATE_SUB(@m1, INTERVAL 12 MONTH) WHERE id = @a_hal;

-- ============================================================
-- 4. CONTRACTS  (the active template version, if the server has one)
-- ============================================================
SET @tpl = (SELECT MAX(id) FROM contract_template_versions);
INSERT INTO lease_contracts (id, rent_application_id, deposit_amount, lease_start, lease_end, status, eviction_status, deposit_status, template_version_id, generated_at) VALUES
('CTR-DEMO-ANA',  @a_ana,  (SELECT monthly_rent FROM rooms WHERE id = @r1),  @ts, DATE_ADD(@ts, INTERVAL 24 MONTH), 'active',           NULL,      'Held', @tpl, DATE_SUB(@ts, INTERVAL 5 DAY)),
('CTR-DEMO-BEN',  @a_ben,  (SELECT monthly_rent FROM rooms WHERE id = @r2),  @ts, DATE_ADD(@ts, INTERVAL 12 MONTH), 'eviction-pending', 'flagged', 'Held', @tpl, DATE_SUB(@ts, INTERVAL 5 DAY)),
('CTR-DEMO-CIA',  @a_cia,  (SELECT monthly_rent FROM rooms WHERE id = @r3),  @ts, DATE_ADD(@ts, INTERVAL 12 MONTH), 'active',           NULL,      'Held', @tpl, DATE_SUB(@ts, INTERVAL 5 DAY)),
('CTR-DEMO-DAN',  @a_dan,  (SELECT monthly_rent FROM rooms WHERE id = @r4),  @ts, DATE_ADD(@ts, INTERVAL 12 MONTH), 'active',           NULL,      'Held', @tpl, DATE_SUB(@ts, INTERVAL 5 DAY)),
('CTR-DEMO-ELI',  @a_eli,  (SELECT monthly_rent FROM rooms WHERE id = @r5),  @ts, DATE_ADD(@ts, INTERVAL 12 MONTH), 'active',           NULL,      'Held', @tpl, DATE_SUB(@ts, INTERVAL 5 DAY)),
('CTR-DEMO-FAY',  @a_fay,  (SELECT monthly_rent FROM rooms WHERE id = @r6),  @ts, DATE_ADD(@ts, INTERVAL 24 MONTH), 'active',           NULL,      'Held', @tpl, DATE_SUB(@ts, INTERVAL 5 DAY)),
('CTR-DEMO-GUS',  @a_gus,  (SELECT monthly_rent FROM rooms WHERE id = @r7),  @ts, DATE_ADD(@ts, INTERVAL 24 MONTH), 'active',           NULL,      'Held', @tpl, DATE_SUB(@ts, INTERVAL 5 DAY)),
('CTR-DEMO-HAL',  @a_hal,  (SELECT monthly_rent FROM rooms WHERE id = @r8),  DATE_SUB(@m1, INTERVAL 12 MONTH), @m1,  'active',           NULL,      'Held', @tpl, DATE_SUB(@m1, INTERVAL 12 MONTH)),
('CTR-DEMO-IVAN', @a_ivan, (SELECT monthly_rent FROM rooms WHERE id = @r9),  @ts, DATE_ADD(@ts, INTERVAL 24 MONTH), 'active',           NULL,      'Held', @tpl, DATE_SUB(@ts, INTERVAL 5 DAY)),
('CTR-DEMO-JON',  @a_jon,  (SELECT monthly_rent FROM rooms WHERE id = @r10), @today, DATE_ADD(@today, INTERVAL 12 MONTH), 'draft',     NULL,      'Held', @tpl, DATE_SUB(NOW(), INTERVAL 4 DAY)),
('CTR-DEMO-PIA',  @a_pia,  (SELECT monthly_rent FROM rooms WHERE id = @r11), DATE_SUB(@m0, INTERVAL 12 MONTH), DATE_SUB(@m0, INTERVAL 1 MONTH), 'expired', NULL, 'Applied to Rent', @tpl, DATE_SUB(@m0, INTERVAL 12 MONTH));

UPDATE lease_contracts SET damage_deduction = 0, utility_deduction = 0, refund_amount = 0, refund_date = DATE_SUB(@m0, INTERVAL 1 MONTH) WHERE id = 'CTR-DEMO-PIA';
UPDATE lease_contracts SET damage_deduction = 800, utility_deduction = 150 WHERE id = 'CTR-DEMO-IVAN';
-- Hannah extended her rent once: 6 months added to the original 6.
INSERT INTO lease_renewals (contract_id, added_months, previous_lease_end, new_lease_end, rent_at_renewal, approved_by, created_at)
VALUES ('CTR-DEMO-HAL', 6, DATE_SUB(@m1, INTERVAL 6 MONTH), @m1, (SELECT monthly_rent FROM rooms WHERE id = @r8), @admin_id, DATE_SUB(@m1, INTERVAL 7 MONTH));

-- ============================================================
-- 5. DEPOSIT DEDUCTIONS (Ivan's move-out clearance)
-- ============================================================
INSERT INTO deposit_deductions (rent_application_id, contract_id, category, reason, amount, recorded_by) VALUES
(@a_ivan, 'CTR-DEMO-IVAN', 'damage', 'Wall repaint and door hinge repair', 800.00, @admin_id),
(@a_ivan, 'CTR-DEMO-IVAN', 'water',  'Unpaid water bill, last month',     150.00, @admin_id);

-- ============================================================
-- 6. RENT INVOICES: 10 months for nine tenants, built from two helper tables.
--    n = 0 is this month's bill, which carries each tenant's workflow state.
-- ============================================================
CREATE TEMPORARY TABLE _t (tag VARCHAR(8) NOT NULL PRIMARY KEY, uid INT NOT NULL, aid INT NOT NULL, rent DECIMAL(10,2) NOT NULL, fullname VARCHAR(100) NOT NULL);
INSERT INTO _t
SELECT 'ana',  @u_ana,  @a_ana,  monthly_rent, 'Angela Dizon'     FROM rent_applications WHERE id = @a_ana  UNION ALL
SELECT 'ben',  @u_ben,  @a_ben,  monthly_rent, 'Benedict Mercado' FROM rent_applications WHERE id = @a_ben  UNION ALL
SELECT 'cia',  @u_cia,  @a_cia,  monthly_rent, 'Cecilia Aguilar'  FROM rent_applications WHERE id = @a_cia  UNION ALL
SELECT 'dan',  @u_dan,  @a_dan,  monthly_rent, 'Daniel Ocampo'    FROM rent_applications WHERE id = @a_dan  UNION ALL
SELECT 'eli',  @u_eli,  @a_eli,  monthly_rent, 'Elena Pascual'    FROM rent_applications WHERE id = @a_eli  UNION ALL
SELECT 'fay',  @u_fay,  @a_fay,  monthly_rent, 'Faye Gonzales'    FROM rent_applications WHERE id = @a_fay  UNION ALL
SELECT 'gus',  @u_gus,  @a_gus,  monthly_rent, 'Gustavo Lim'      FROM rent_applications WHERE id = @a_gus  UNION ALL
SELECT 'hal',  @u_hal,  @a_hal,  monthly_rent, 'Hannah Soriano'   FROM rent_applications WHERE id = @a_hal  UNION ALL
SELECT 'ivan', @u_ivan, @a_ivan, monthly_rent, 'Ivan Salazar'     FROM rent_applications WHERE id = @a_ivan;

CREATE TEMPORARY TABLE _m (n INT NOT NULL PRIMARY KEY, ps DATE NOT NULL);
INSERT INTO _m VALUES (0, @m0), (1, DATE_SUB(@m0, INTERVAL 1 MONTH)), (2, DATE_SUB(@m0, INTERVAL 2 MONTH)),
  (3, DATE_SUB(@m0, INTERVAL 3 MONTH)), (4, DATE_SUB(@m0, INTERVAL 4 MONTH)), (5, DATE_SUB(@m0, INTERVAL 5 MONTH)),
  (6, DATE_SUB(@m0, INTERVAL 6 MONTH)), (7, DATE_SUB(@m0, INTERVAL 7 MONTH)), (8, DATE_SUB(@m0, INTERVAL 8 MONTH)),
  (9, DATE_SUB(@m0, INTERVAL 9 MONTH));

INSERT INTO invoices
  (id, user_id, rent_application_id, base_rent, water, electricity, parking, late_fee, total_amount, amount_paid,
   payment_method, payment_reference, sender_name, bank_name, payment_gateway, checkout_session_id, checkout_payment_intent_id,
   processing_since, scheduled_date, scheduled_time_slot, billing_period, rent_period_start, status, paid_at, due_date, created_at)
SELECT CONCAT('INV-DEMO-', DATE_FORMAT(x.ps, '%Y%m'), '-', UPPER(x.tag)), x.uid, x.aid, x.rent, x.w, x.e, x.pk, x.lf,
       x.rent + x.w + x.e + x.pk + x.lf,
       IF(x.st = 'paid', x.rent + x.w + x.e + x.pk + x.lf, 0),
       CASE WHEN x.st = 'paid' THEN x.lbl
            WHEN x.st = 'pending-verification' THEN IF(x.tag = 'dan', 'Split payment', 'GCash')
            WHEN x.st = 'scheduled' THEN 'Cash on Hand'
            WHEN x.st IN ('payment-failed', 'processing') THEN 'GCash' END,
       CASE WHEN x.st = 'paid' AND x.lbl <> 'Cash' THEN CONCAT('DM', DATE_FORMAT(x.ps, '%y%m'), LPAD(x.uid, 5, '0'))
            WHEN x.st = 'pending-verification' AND x.tag = 'cia' THEN 'DM-REUSED-0001' END,
       IF(x.st IN ('paid', 'pending-verification') AND NOT (x.st = 'paid' AND x.lbl = 'Cash'), x.fullname, NULL),
       IF(x.st = 'paid' AND x.lbl = 'BPI', 'BPI', NULL),
       CASE WHEN x.st = 'scheduled' THEN 'in_person' WHEN x.st IN ('payment-failed', 'processing') THEN 'paymongo_sandbox' END,
       IF(x.st = 'processing', CONCAT('cs_demo_', x.tag), NULL),
       IF(x.st = 'processing', CONCAT('pi_demo_', x.tag), NULL),
       IF(x.st = 'processing', NOW(), NULL),
       IF(x.st = 'scheduled', DATE_ADD(@today, INTERVAL 2 DAY), NULL),
       IF(x.st = 'scheduled', 'morning', NULL),
       DATE_FORMAT(x.ps, '%M %Y'), x.ps, x.st,
       IF(x.st = 'paid', DATE_SUB(DATE_ADD(x.ps, INTERVAL 9 HOUR), INTERVAL (x.uid % 3) DAY), NULL),
       x.ps, DATE_SUB(x.ps, INTERVAL 7 DAY)
  FROM (SELECT t.*, m.n, m.ps,
               CASE WHEN m.n >= 2 THEN 'paid'
                    WHEN t.tag = 'ben' THEN 'overdue'
                    WHEN m.n = 1 THEN 'paid'
                    ELSE CASE t.tag WHEN 'cia' THEN 'pending-verification' WHEN 'dan' THEN 'pending-verification'
                                    WHEN 'eli' THEN 'scheduled' WHEN 'fay' THEN 'payment-failed'
                                    WHEN 'gus' THEN 'processing' ELSE 'paid' END END AS st,
               IF(m.n >= 1, 250 + ((t.uid * 7 + m.n * 13) % 9) * 10, 0)     AS w,
               IF(m.n >= 1, 700 + ((t.uid * 11 + m.n * 17) % 10) * 25, 0)   AS e,
               IF(t.tag = 'dan' AND m.n <= 5, 300, 0)                       AS pk,
               IF(t.tag = 'ben' AND m.n = 1, 200, 0)                        AS lf,
               ELT(((t.uid + m.n) % 4) + 1, 'GCash', 'Cash', 'BPI', 'GCash') AS lbl
          FROM _t t CROSS JOIN _m m) x;

-- Upcoming (next month) bills, issued ahead the way the daily sweep does.
INSERT INTO invoices
  (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, payment_method, billing_period, rent_period_start, status, paid_at, due_date, created_at)
SELECT CONCAT('INV-DEMO-', DATE_FORMAT(@m1, '%Y%m'), '-', UPPER(t.tag)), t.uid, t.aid, t.rent, t.rent,
       IF(t.tag = 'ana', t.rent, IF(t.tag = 'hal', 2000, 0)),
       IF(t.tag = 'ana', 'Advance credit', NULL),
       DATE_FORMAT(@m1, '%M %Y'), @m1, IF(t.tag = 'ana', 'paid', 'pending'),
       IF(t.tag = 'ana', NOW(), NULL), @m1, NOW()
  FROM _t t WHERE t.tag IN ('ana', 'hal', 'dan');

-- Benedict's bill from two months back was paid late, with a late fee.
UPDATE invoices SET late_fee = 200, total_amount = total_amount + 200,
       amount_paid = amount_paid + 200
 WHERE id = CONCAT('INV-DEMO-', DATE_FORMAT(DATE_SUB(@m0, INTERVAL 2 MONTH), '%Y%m'), '-BEN') AND status = 'paid';

-- Elena: a cleaning booked and billed two months back, and a repair billed to her last month.
UPDATE invoices SET services = 500, total_amount = total_amount + 500, amount_paid = amount_paid + 500
 WHERE id = CONCAT('INV-DEMO-', DATE_FORMAT(DATE_SUB(@m0, INTERVAL 2 MONTH), '%Y%m'), '-ELI');
UPDATE invoices SET maintenance = 800, total_amount = total_amount + 800, amount_paid = amount_paid + 800
 WHERE id = CONCAT('INV-DEMO-', DATE_FORMAT(DATE_SUB(@m0, INTERVAL 1 MONTH), '%Y%m'), '-ELI');

-- Cecilia's pending proof reuses a reference that Angela paid with earlier: the duplicate check flags it.
UPDATE invoices SET payment_method = 'GCash', payment_reference = 'DM-REUSED-0001', sender_name = 'Angela Dizon', bank_name = NULL
 WHERE id = CONCAT('INV-DEMO-', DATE_FORMAT(DATE_SUB(@m0, INTERVAL 3 MONTH), '%Y%m'), '-ANA');

-- Admin corrected an electricity charge on Gustavo's last bill (Adjust invoice).
SET @adj_inv = CONCAT('INV-DEMO-', DATE_FORMAT(DATE_SUB(@m0, INTERVAL 2 MONTH), '%Y%m'), '-GUS');
SET @adj_old = (SELECT total_amount FROM invoices WHERE id = @adj_inv);
UPDATE invoices SET electricity = electricity - 150, total_amount = total_amount - 150, amount_paid = amount_paid - 150 WHERE id = @adj_inv;
INSERT INTO invoice_adjustments (invoice_id, admin_id, reason, old_total, new_total, changes, created_at)
VALUES (@adj_inv, @admin_id, 'Meter was misread; corrected after re-checking the reading.', @adj_old, @adj_old - 150,
        CONCAT('{"electricity":{"from":', (SELECT electricity + 150 FROM invoices WHERE id = @adj_inv), ',"to":', (SELECT electricity FROM invoices WHERE id = @adj_inv), '}}'),
        DATE_SUB(NOW(), INTERVAL 40 DAY));

-- ============================================================
-- 7. PAYMENTS
-- ============================================================
-- Angela paid one bill in two parts, four months back: cash first, GCash for the rest.
SET @split_inv = CONCAT('INV-DEMO-', DATE_FORMAT(DATE_SUB(@m0, INTERVAL 4 MONTH), '%Y%m'), '-ANA');
INSERT INTO payment_transactions (invoice_id, amount, payment_method, bank_name, reference_number, recorded_by, created_at)
SELECT @split_inv, 2500, 'cash', NULL, NULL, @admin_id, DATE_SUB(paid_at, INTERVAL 1 DAY) FROM invoices WHERE id = @split_inv;
INSERT INTO payment_transactions (invoice_id, amount, payment_method, bank_name, reference_number, recorded_by, created_at)
SELECT @split_inv, total_amount - 2500, 'gcash', NULL, 'DM-SPLIT-0001', @admin_id, paid_at FROM invoices WHERE id = @split_inv;
UPDATE invoices SET payment_method = 'Split payment' WHERE id = @split_inv;

-- Hannah is paying next month's bill in instalments: 2000 so far.
INSERT INTO payment_transactions (invoice_id, amount, payment_method, bank_name, reference_number, recorded_by, created_at)
VALUES (CONCAT('INV-DEMO-', DATE_FORMAT(@m1, '%Y%m'), '-HAL'), 2000, 'cash', NULL, NULL, @admin_id, DATE_SUB(NOW(), INTERVAL 2 DAY));

-- Every other paid bill has one transaction for its full amount, recorded by the admin.
INSERT INTO payment_transactions (invoice_id, amount, payment_method, bank_name, reference_number, recorded_by, created_at)
SELECT i.id, i.total_amount,
       CASE i.payment_method WHEN 'Cash' THEN 'cash' WHEN 'GCash' THEN 'gcash' WHEN 'BPI' THEN 'bank_transfer' ELSE 'cash' END,
       IF(i.payment_method = 'BPI', 'BPI', NULL), i.payment_reference, @admin_id, i.paid_at
  FROM invoices i
 WHERE i.id LIKE 'INV-DEMO-%' AND i.status = 'paid' AND i.paid_at IS NOT NULL AND i.payment_method <> 'Advance credit'
   AND NOT EXISTS (SELECT 1 FROM payment_transactions p WHERE p.invoice_id = i.id);

-- Daniel's split submission awaiting review: GCash part and BPI part.
INSERT INTO payment_proof_parts (payment_key, position, method, bank_name, amount, reference_number)
SELECT i.id, 1, 'gcash', NULL, ROUND(i.total_amount * 0.6, 2), 'DM-DAN-GC-01' FROM invoices i WHERE i.id = CONCAT('INV-DEMO-', DATE_FORMAT(@m0, '%Y%m'), '-DAN');
INSERT INTO payment_proof_parts (payment_key, position, method, bank_name, amount, reference_number)
SELECT i.id, 2, 'bank_transfer', 'BPI', i.total_amount - ROUND(i.total_amount * 0.6, 2), 'DM-DAN-BP-02' FROM invoices i WHERE i.id = CONCAT('INV-DEMO-', DATE_FORMAT(@m0, '%Y%m'), '-DAN');

-- ============================================================
-- 8. ADVANCE RENT
-- ============================================================
-- Angela prepaid three months: next month (applied to its bill), then two still available.
INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, payment_method, payment_reference, sender_name, billing_period, status, paid_at, due_date, advance_months, created_at)
SELECT 'INV-DEMO-ADV-ANA', @u_ana, @a_ana, rent * 3, rent * 3, rent * 3, 'GCash', 'DM-ADV-ANA-01', 'Angela Dizon',
       CONCAT('Advance rent: ', DATE_FORMAT(@m1, '%b %Y'), ' – ', DATE_FORMAT(DATE_ADD(@m1, INTERVAL 2 MONTH), '%b %Y')),
       'paid', DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(@today, INTERVAL 3 DAY), 3, DATE_SUB(NOW(), INTERVAL 9 DAY)
  FROM _t WHERE tag = 'ana';
INSERT INTO payment_transactions (invoice_id, amount, payment_method, reference_number, recorded_by, created_at)
SELECT 'INV-DEMO-ADV-ANA', total_amount, 'gcash', 'DM-ADV-ANA-01', @admin_id, paid_at FROM invoices WHERE id = 'INV-DEMO-ADV-ANA';
INSERT INTO advance_credits (advance_invoice_id, user_id, rent_application_id, period_start, amount, status, applied_invoice_id, applied_at)
SELECT 'INV-DEMO-ADV-ANA', @u_ana, @a_ana, DATE_ADD(@m1, INTERVAL k.n MONTH), t.rent,
       IF(k.n = 0, 'applied', 'available'),
       IF(k.n = 0, CONCAT('INV-DEMO-', DATE_FORMAT(@m1, '%Y%m'), '-ANA'), NULL), IF(k.n = 0, NOW(), NULL)
  FROM _t t CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2) k WHERE t.tag = 'ana';

-- Faye started an advance payment of two months and has not paid it yet.
INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date, advance_months, created_at)
SELECT 'INV-DEMO-ADV-FAY', @u_fay, @a_fay, rent * 2, rent * 2,
       CONCAT('Advance rent: ', DATE_FORMAT(@m1, '%b %Y'), ' – ', DATE_FORMAT(DATE_ADD(@m1, INTERVAL 1 MONTH), '%b %Y')),
       'pending', DATE_ADD(@today, INTERVAL 2 DAY), 2, NOW()
  FROM _t WHERE tag = 'fay';
INSERT INTO advance_credits (advance_invoice_id, user_id, rent_application_id, period_start, amount, status)
SELECT 'INV-DEMO-ADV-FAY', @u_fay, @a_fay, DATE_ADD(@m1, INTERVAL k.n MONTH), t.rent, 'reserved'
  FROM _t t CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1) k WHERE t.tag = 'fay';

-- Ivan prepaid two months and is moving out first: the unused months are due back.
INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, payment_method, payment_reference, sender_name, billing_period, status, paid_at, due_date, advance_months, created_at)
SELECT 'INV-DEMO-ADV-IVAN', @u_ivan, @a_ivan, rent * 2, rent * 2, rent * 2, 'GCash', 'DM-ADV-IVAN-01', 'Ivan Salazar',
       CONCAT('Advance rent: ', DATE_FORMAT(DATE_ADD(@m1, INTERVAL 1 MONTH), '%b %Y'), ' – ', DATE_FORMAT(DATE_ADD(@m1, INTERVAL 2 MONTH), '%b %Y')),
       'paid', DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(@today, INTERVAL 18 DAY), 2, DATE_SUB(NOW(), INTERVAL 22 DAY)
  FROM _t WHERE tag = 'ivan';
INSERT INTO payment_transactions (invoice_id, amount, payment_method, reference_number, recorded_by, created_at)
SELECT 'INV-DEMO-ADV-IVAN', total_amount, 'gcash', 'DM-ADV-IVAN-01', @admin_id, paid_at FROM invoices WHERE id = 'INV-DEMO-ADV-IVAN';
INSERT INTO advance_credits (advance_invoice_id, user_id, rent_application_id, period_start, amount, status)
SELECT 'INV-DEMO-ADV-IVAN', @u_ivan, @a_ivan, DATE_ADD(@m1, INTERVAL k.n + 1 MONTH), t.rent, 'refund-due'
  FROM _t t CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1) k WHERE t.tag = 'ivan';

-- ============================================================
-- 9. MOVE-IN INVOICES, REFUNDS
-- ============================================================
-- Jonas: first month plus a deposit equal to one month, paid; waiting for move-in day.
INSERT INTO invoices (id, user_id, rent_application_id, base_rent, security_deposit, total_amount, amount_paid, payment_method, payment_reference, sender_name, billing_period, status, paid_at, due_date, created_at)
SELECT 'INV-DEMO-MOVEIN-JON', @u_jon, @a_jon, monthly_rent, monthly_rent, monthly_rent * 2, monthly_rent * 2, 'GCash', 'DM-MOVEIN-JON-01', 'Jonas Bautista',
       DATE_FORMAT(@today, '%M %Y'), 'paid', DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_ADD(@today, INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY)
  FROM rent_applications WHERE id = @a_jon;
-- Omar: same, then his application was rejected after he had paid.
INSERT INTO invoices (id, user_id, rent_application_id, base_rent, security_deposit, total_amount, amount_paid, payment_method, payment_reference, sender_name, billing_period, status, paid_at, due_date, created_at, cancel_reason)
SELECT 'INV-DEMO-MOVEIN-OMAR', @u_omar, @a_omar, monthly_rent, monthly_rent, monthly_rent * 2, monthly_rent * 2, 'GCash', 'DM-MOVEIN-OMAR-01', 'Omar Castillo',
       DATE_FORMAT(DATE_SUB(@today, INTERVAL 10 DAY), '%M %Y'), 'paid', DATE_SUB(NOW(), INTERVAL 9 DAY), DATE_SUB(@today, INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 11 DAY), NULL
  FROM rent_applications WHERE id = @a_omar;
INSERT INTO payment_transactions (invoice_id, amount, payment_method, reference_number, recorded_by, created_at)
SELECT id, total_amount, 'gcash', payment_reference, @admin_id, paid_at FROM invoices WHERE id IN ('INV-DEMO-MOVEIN-JON', 'INV-DEMO-MOVEIN-OMAR');

-- Patricia's last two bills, before she moved out.
INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, payment_method, billing_period, rent_period_start, status, paid_at, due_date, created_at)
SELECT CONCAT('INV-DEMO-', DATE_FORMAT(DATE_SUB(@m0, INTERVAL k.n MONTH), '%Y%m'), '-PIA'), @u_pia, @a_pia, monthly_rent, monthly_rent, monthly_rent, 'Cash',
       DATE_FORMAT(DATE_SUB(@m0, INTERVAL k.n MONTH), '%M %Y'), DATE_SUB(@m0, INTERVAL k.n MONTH), 'paid',
       DATE_ADD(DATE_SUB(@m0, INTERVAL k.n MONTH), INTERVAL 9 HOUR), DATE_SUB(@m0, INTERVAL k.n MONTH), DATE_SUB(@m0, INTERVAL k.n + 1 MONTH)
  FROM rent_applications CROSS JOIN (SELECT 2 AS n UNION ALL SELECT 3) k WHERE id = @a_pia;
INSERT INTO payment_transactions (invoice_id, amount, payment_method, recorded_by, created_at)
SELECT id, total_amount, 'cash', @admin_id, paid_at FROM invoices WHERE user_id = @u_pia;

-- Refund requests, each with its timeline.
INSERT INTO refund_requests (user_id, rent_application_id, type, invoice_id, amount, reason, status, decision_reason, payout_method, raised_by, raised_by_role, decided_by, decided_at, created_at) VALUES
(@u_ivan, @a_ivan, 'advance',              'INV-DEMO-ADV-IVAN',   (SELECT rent * 2 FROM _t WHERE tag = 'ivan'), 'Moving out before the two prepaid months; asking for the unused rent back.', 'Pending Review', NULL, NULL, @u_ivan, 'user', NULL, NULL, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(@u_hal,  @a_hal,  'overpayment',          CONCAT('INV-DEMO-', DATE_FORMAT(DATE_SUB(@m0, INTERVAL 3 MONTH), '%Y%m'), '-HAL'), 200, 'I paid this bill twice by mistake.', 'Info Requested', 'Please send the GCash reference of the second payment.', NULL, @u_hal, 'user', NULL, NULL, DATE_SUB(NOW(), INTERVAL 5 DAY)),
(@u_omar, @a_omar, 'rejected_application', 'INV-DEMO-MOVEIN-OMAR', (SELECT monthly_rent * 2 FROM rent_applications WHERE id = @a_omar), 'Application rejected after the move-in payment was made.', 'Approved', 'Full amount returned to the tenant.', 'GCash', @admin_id, 'admin', @admin_id, DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 8 DAY));
INSERT INTO refund_request_events (refund_request_id, actor_id, actor_role, action, message, created_at)
SELECT id, raised_by, raised_by_role, 'raised', reason, created_at FROM refund_requests WHERE user_id IN (@u_ivan, @u_hal, @u_omar);
INSERT INTO refund_request_events (refund_request_id, actor_id, actor_role, action, message, created_at)
SELECT id, @admin_id, 'admin', 'request_info', decision_reason, DATE_SUB(NOW(), INTERVAL 4 DAY) FROM refund_requests WHERE user_id = @u_hal;
INSERT INTO refund_request_events (refund_request_id, actor_id, actor_role, action, message, created_at)
SELECT id, @admin_id, 'admin', 'approve', decision_reason, decided_at FROM refund_requests WHERE user_id = @u_omar;
UPDATE advance_credits SET refund_request_id = (SELECT id FROM refund_requests WHERE user_id = @u_ivan AND type = 'advance' LIMIT 1) WHERE advance_invoice_id = 'INV-DEMO-ADV-IVAN';

-- ============================================================
-- 10. UTILITIES  (two extra bill types switched on; they are optional settings)
-- ============================================================
UPDATE utility_types SET is_active = 1 WHERE code IN ('internet', 'gas');
SET @t_net = (SELECT id FROM utility_types WHERE code = 'internet' LIMIT 1);
SET @t_gas = (SELECT id FROM utility_types WHERE code = 'gas' LIMIT 1);

-- The last two months for Angela, Gustavo and Hannah, matching the water and electricity on their bills.
INSERT INTO utility_readings
  (room_name, user_id, billing_period, reading_date, entry_mode, water_prev_reading, water_curr_reading, water_rate_per_unit, water_consumption, water_amount, water_other_fees,
   electric_prev_reading, electric_curr_reading, electric_rate_per_unit, electric_consumption, electric_amount, electric_other_fees, total_amount, is_invoiced, invoice_id, recorded_by, created_at)
SELECT ra.room_name, i.user_id, DATE_FORMAT(i.rent_period_start, '%Y-%m'), LAST_DAY(DATE_SUB(i.rent_period_start, INTERVAL 1 MONTH)),
       IF(i.user_id = @u_hal, 'total', 'metered'),
       100, 100 + ROUND(i.water / 40, 2), 40, ROUND(i.water / 40, 2), i.water, 0,
       2000, 2000 + ROUND(i.electricity / 12, 2), 12, ROUND(i.electricity / 12, 2), i.electricity, 0,
       i.water + i.electricity, 1, i.id, @admin_id, DATE_SUB(i.rent_period_start, INTERVAL 1 DAY)
  FROM invoices i JOIN rent_applications ra ON ra.id = i.rent_application_id
 WHERE i.user_id IN (@u_ana, @u_gus, @u_hal) AND i.status = 'paid'
   AND i.rent_period_start IN (DATE_SUB(@m0, INTERVAL 1 MONTH), DATE_SUB(@m0, INTERVAL 2 MONTH));
-- This month's readings are in, not yet billed. Gustavo's include internet and gas.
INSERT INTO utility_readings
  (room_name, user_id, billing_period, reading_date, entry_mode, water_prev_reading, water_curr_reading, water_rate_per_unit, water_consumption, water_amount, water_other_fees,
   electric_prev_reading, electric_curr_reading, electric_rate_per_unit, electric_consumption, electric_amount, electric_other_fees, total_amount, is_invoiced, notes, recorded_by, created_at)
VALUES
(@r1, @u_ana, DATE_FORMAT(@today, '%Y-%m'), DATE_SUB(@today, INTERVAL 1 DAY), 'metered', 120, 127.5, 40, 7.5, 300, 0, 2200, 2275, 12, 75, 900, 0, 1200, 0, NULL, @admin_id, NOW()),
(@r7, @u_gus, DATE_FORMAT(@today, '%Y-%m'), DATE_SUB(@today, INTERVAL 1 DAY), 'metered', 90, 97, 40, 7, 280, 0, 1800, 1872, 12, 72, 864, 0, 2504, 0, 'Includes internet and gas.', @admin_id, NOW());
SET @rd_gus = (SELECT id FROM utility_readings WHERE user_id = @u_gus AND is_invoiced = 0 ORDER BY id DESC LIMIT 1);
INSERT INTO utility_reading_items (reading_id, type_id, prev_reading, curr_reading, consumption, rate, amount, other_fees) VALUES
(@rd_gus, @t_net, NULL, NULL, NULL, 1000, 1000, 0),
(@rd_gus, @t_gas, 0, 4, 4, 90, 360, 0);

-- ============================================================
-- 11. PARKING
-- ============================================================
INSERT INTO parking_reservations (user_id, vehicle_type, vehicle_model, plate_number, status, slot_number, assigned_at, released_at, release_reason, rejection_reason, transmission, duration_months, total_cost, document_path, created_at) VALUES
(@u_dan, 'Motorcycle', 'Honda Click 125', 'DMO-1234', 'Assigned', @slot1, DATE_SUB(@m0, INTERVAL 5 MONTH), NULL, NULL, NULL, 'Automatic', 6, 1800, 'uploads/parking/demo_cr.pdf', DATE_SUB(@m0, INTERVAL 5 MONTH)),
(@u_gus, 'Motorcycle', 'Yamaha Mio',      'DMO-5678', 'Assigned', @slot2, DATE_SUB(@today, INTERVAL 20 DAY), NULL, NULL, NULL, 'Automatic', 3, 900,  'uploads/parking/demo_cr.pdf', DATE_SUB(@today, INTERVAL 22 DAY)),
(@u_fay, 'Motorcycle', 'Suzuki Raider',   'DMO-9012', 'Pending',  NULL, NULL, NULL, NULL, NULL, 'Manual',    3, 900,  'uploads/parking/demo_cr.pdf', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(@u_ben, 'Motorcycle', 'Honda Wave',      'DMO-3456', 'Rejected', NULL, NULL, NULL, NULL, 'All slots are taken for now.', 'Manual', 2, 600, 'uploads/parking/demo_cr.pdf', DATE_SUB(NOW(), INTERVAL 9 DAY)),
(@u_pia, 'Motorcycle', 'Kawasaki Fury',   'DMO-7890', 'Released', 3,    DATE_SUB(@m0, INTERVAL 6 MONTH), DATE_SUB(@m0, INTERVAL 1 MONTH), 'Tenant moved out', NULL, 'Manual', 6, 1800, 'uploads/parking/demo_cr.pdf', DATE_SUB(@m0, INTERVAL 6 MONTH));
INSERT INTO parking_charges (reservation_id, billing_period, invoice_id, amount)
SELECT p.id, DATE_FORMAT(i.rent_period_start, '%Y-%m'), i.id, i.parking
  FROM invoices i JOIN parking_reservations p ON p.user_id = i.user_id AND p.status = 'Assigned'
 WHERE i.user_id = @u_dan AND i.parking > 0;

-- ============================================================
-- 12. MAINTENANCE
-- ============================================================
INSERT INTO maintenance_requests (user_id, room_name, issue_category, urgency, preferred_date, preferred_time, title, description, permission_to_enter, status, assigned_to, estimated_cost, actual_cost, tenant_responsible, work_notes, rejection_reason, acknowledged_at, started_at, resolved_at, is_invoiced, invoice_id, billing_period, created_at) VALUES
(@u_cia, @r3, 'Plumbing',            'High',   DATE_ADD(@today, INTERVAL 1 DAY),  'Morning',   'Leaking kitchen faucet', 'The kitchen faucet drips all day and the sink area is wet.', 1, 'Pending',     NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(@u_dan, @r4, 'Electrical',          'Medium', DATE_ADD(@today, INTERVAL 2 DAY),  'Afternoon', 'Outlet not working', 'The outlet beside the bed has no power.', 1, 'In Progress', 'Mang Rey', 600, NULL, 0, 'Replacement outlet ordered.', NULL, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), NULL, 0, NULL, NULL, DATE_SUB(NOW(), INTERVAL 5 DAY)),
(@u_eli, @r5, 'General Maintenance', 'Low',    DATE_SUB(@today, INTERVAL 35 DAY), 'Morning',   'Broken door lock', 'The bedroom door lock was damaged and had to be replaced.', 1, 'Completed', 'Mang Rey', 700, 800, 1, 'Lock replaced; damage caused by the tenant, billed to the next invoice.', NULL, DATE_SUB(@today, INTERVAL 36 DAY), DATE_SUB(@today, INTERVAL 35 DAY), DATE_SUB(@today, INTERVAL 34 DAY), 1, CONCAT('INV-DEMO-', DATE_FORMAT(DATE_SUB(@m0, INTERVAL 1 MONTH), '%Y%m'), '-ELI'), DATE_FORMAT(DATE_SUB(@m0, INTERVAL 1 MONTH), '%M %Y'), DATE_SUB(@today, INTERVAL 37 DAY)),
(@u_ana, @r1, 'Plumbing',            'Medium', DATE_SUB(@today, INTERVAL 50 DAY), 'Morning',   'Slow bathroom drain', 'Water drains slowly in the shower.', 1, 'Completed', 'Mang Rey', 400, 350, 0, 'Drain cleared.', NULL, DATE_SUB(@today, INTERVAL 51 DAY), DATE_SUB(@today, INTERVAL 50 DAY), DATE_SUB(@today, INTERVAL 49 DAY), 0, NULL, NULL, DATE_SUB(@today, INTERVAL 52 DAY)),
(@u_fay, @r6, 'Structural/Physical', 'Low',    DATE_ADD(@today, INTERVAL 5 DAY),  'Afternoon', 'Hairline wall crack', 'A thin crack by the window frame.', 0, 'Rejected', NULL, NULL, NULL, 0, NULL, 'Cosmetic only; scheduled with the next repainting.', NULL, NULL, NULL, 0, NULL, NULL, DATE_SUB(NOW(), INTERVAL 6 DAY));

-- ============================================================
-- 13. SERVICE BOOKINGS
-- ============================================================
SET @svc_clean = (SELECT id FROM service_catalog WHERE name = 'Standard Unit Cleaning' LIMIT 1);
SET @svc_wash  = (SELECT id FROM service_catalog WHERE name = 'Wash & Fold' LIMIT 1);
SET @svc_pest  = (SELECT id FROM service_catalog WHERE name = 'Pest Control Treatment' LIMIT 1);
INSERT INTO service_requests (user_id, service_id, room_name, service_name, category, unit_price, pricing_unit, quantity, total_cost, preferred_date, preferred_time_slot, notes, status, admin_notes, cancelled_reason, is_invoiced, invoice_id, billing_period, completed_at, created_at) VALUES
(@u_eli, @svc_clean, @r5, 'Standard Unit Cleaning', 'cleaning', 500.00, 'session', 1, 500.00, DATE_SUB(@today, INTERVAL 65 DAY), 'Morning', 'Focus on the kitchen.', 'Completed', NULL, NULL, 1, CONCAT('INV-DEMO-', DATE_FORMAT(DATE_SUB(@m0, INTERVAL 2 MONTH), '%Y%m'), '-ELI'), DATE_FORMAT(DATE_SUB(@m0, INTERVAL 2 MONTH), '%M %Y'), DATE_SUB(@today, INTERVAL 65 DAY), DATE_SUB(@today, INTERVAL 70 DAY)),
(@u_ana, @svc_wash,  @r1, 'Wash & Fold',            'laundry',   60.00, 'kg',      5, 300.00, DATE_ADD(@today, INTERVAL 4 DAY),  'Afternoon', 'Regular garments, 5 kg.', 'Pending', NULL, NULL, 0, NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(@u_cia, @svc_pest,  @r3, 'Pest Control Treatment', 'other',    900.00, 'session', 1, 900.00, DATE_ADD(@today, INTERVAL 6 DAY),  'Morning',   'Ants near the window.',   'Approved', 'Booked with the pest control team.', NULL, 0, NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 3 DAY)),
(@u_dan, @svc_clean, @r4, 'Standard Unit Cleaning', 'cleaning', 500.00, 'session', 1, 500.00, DATE_ADD(@today, INTERVAL 3 DAY),  'Morning',   NULL, 'Cancelled', NULL, 'Tenant changed the schedule.', 0, NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 4 DAY));

-- ============================================================
-- 14. CCTV REQUESTS
-- ============================================================
INSERT INTO cctv_requests (user_id, incident_date, incident_time, location_details, reason_request, privacy_consent_at, status, created_at) VALUES
(@u_ana, DATE_SUB(@today, INTERVAL 2 DAY), '8:00 PM - 9:00 PM', 'Parking Area', 'A package left at my door went missing.', NOW(), 'Pending', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(@u_cia, DATE_SUB(@today, INTERVAL 20 DAY), '10:00 PM - 11:00 PM', 'Main Gate', 'A motorcycle was scratched while parked.', DATE_SUB(NOW(), INTERVAL 19 DAY), 'Approved', DATE_SUB(NOW(), INTERVAL 19 DAY)),
(@u_ben, DATE_SUB(@today, INTERVAL 30 DAY), '3:00 PM - 4:00 PM', 'Hallway', 'Loud noise from the hallway.', DATE_SUB(NOW(), INTERVAL 29 DAY), 'Rejected', DATE_SUB(NOW(), INTERVAL 29 DAY));

-- ============================================================
-- 15. VISITORS
-- ============================================================
INSERT INTO visitor_logs (user_id, room_name, visitor_name, contact_number, id_type, id_number, purpose, vehicle_plate, status, expected_at, expected_check_out_at, check_in_at, check_out_at, overstay_alerted_at, checkout_notes, admin_notes, created_by, created_at) VALUES
(@u_ana,  @r1, 'Lourdes Dizon',  '+63 9000000201', "Driver's License", 'N01-11-111111', 'Family visit', NULL, 'pending_approval', DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 1 DAY) + INTERVAL 4 HOUR, DATE_ADD(NOW(), INTERVAL 1 DAY), NULL, NULL, NULL, NULL, @u_ana, NOW()),
(@u_cia,  @r3, 'Marco Aguilar',  '+63 9000000202', 'UMID',             'CRN-0000000001', 'Brings groceries', NULL, 'checked_in', DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_ADD(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), NULL, NULL, NULL, NULL, @admin_id, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
(@u_dan,  @r4, 'Ricky Ocampo',   '+63 9000000203', "Driver's License", 'N02-22-222222', 'Overnight guest', 'XYZ-4321', 'overstayed', DATE_SUB(NOW(), INTERVAL 9 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 9 HOUR), NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL, NULL, @admin_id, DATE_SUB(NOW(), INTERVAL 9 HOUR)),
(@u_eli,  @r5, 'Carmen Pascual', '+63 9000000204', 'Passport',        'P1234567A',     'Family visit', NULL, 'checked_out', DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY) + INTERVAL 5 HOUR, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY) + INTERVAL 4 HOUR, NULL, 'Left on time.', NULL, @admin_id, DATE_SUB(NOW(), INTERVAL 3 DAY)),
(@u_fay,  @r6, 'Unknown Caller', '+63 9000000205', NULL,               NULL,            'Claimed to be a repairman, no prior notice.', NULL, 'denied', DATE_SUB(NOW(), INTERVAL 6 DAY), NULL, DATE_SUB(NOW(), INTERVAL 6 DAY), NULL, NULL, NULL, 'No work order on file.', @admin_id, DATE_SUB(NOW(), INTERVAL 6 DAY)),
(@u_gus,  @r7, 'Dina Lim',       '+63 9000000206', 'UMID',             'CRN-0000000002', 'Dinner visit', NULL, 'cancelled', DATE_ADD(NOW(), INTERVAL 2 DAY), DATE_ADD(NOW(), INTERVAL 2 DAY) + INTERVAL 3 HOUR, DATE_ADD(NOW(), INTERVAL 2 DAY), NULL, NULL, NULL, NULL, @u_gus, DATE_SUB(NOW(), INTERVAL 1 DAY));

-- ============================================================
-- 16. INQUIRIES, UNIT HOLD, WAITLIST, GUEST CHAT
-- ============================================================
INSERT INTO inquiries (user_id, full_name, email, contact_no, room_name, occupants, preferred_move_in, message, source, status, viewing_date, handled_by, thread_type, guest_token, guest_name, guest_email, guest_phone, unit_of_interest, created_at) VALUES
(NULL,   'Katrina Villareal', 'katrina.v@demo.example.com', '+63 9000000301', @r12, 1, DATE_ADD(@today, INTERVAL 14 DAY), 'Interested in this unit. Is it still available for next month?', 'web', 'Reserved', DATE_SUB(NOW(), INTERVAL 2 DAY), @admin_id, 'guest', SHA2('demo-guest-katrina', 256), 'Katrina Villareal', 'katrina.v@demo.example.com', '+63 9000000301', @r12, DATE_SUB(NOW(), INTERVAL 4 DAY)),
(NULL,   'Noel Ramirez',      'noel.ramirez@demo.example.com', '+63 9000000302', @r11, 1, DATE_ADD(@today, INTERVAL 21 DAY), 'What is the monthly rate and the deposit?', 'web', 'New', NULL, NULL, 'guest', SHA2('demo-guest-noel', 256), 'Noel Ramirez', 'noel.ramirez@demo.example.com', '+63 9000000302', @r11, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(@u_kim, 'Kimberly Cruz',     'kimberly.cruz@demo.example.com', '+63 9000000111', @r11, 1, DATE_ADD(@today, INTERVAL 20 DAY), 'Asked about the unit before applying.', 'walk-in', 'Converted', DATE_SUB(NOW(), INTERVAL 6 DAY), @admin_id, 'registered', NULL, NULL, NULL, NULL, @r11, DATE_SUB(NOW(), INTERVAL 7 DAY)),
(NULL,   'Pedro Dela Rosa',   'pedro.dr@demo.example.com', '+63 9000000303', @r2, 1, NULL, 'Not interested anymore.', 'web', 'Closed', NULL, @admin_id, 'guest', SHA2('demo-guest-pedro', 256), 'Pedro Dela Rosa', 'pedro.dr@demo.example.com', '+63 9000000303', @r2, DATE_SUB(NOW(), INTERVAL 30 DAY));
UPDATE inquiries SET closed_reason = 'Guest found another place.' WHERE email = 'pedro.dr@demo.example.com';
SET @inq_kat = (SELECT id FROM inquiries WHERE email = 'katrina.v@demo.example.com' ORDER BY id DESC LIMIT 1);
INSERT INTO unit_reservations (inquiry_id, user_id, room_name, reserved_for_name, contact_no, email, hold_expires_at, reservation_fee, status, notes, created_by, created_at) VALUES
(@inq_kat, NULL, @r12, 'Katrina Villareal', '+63 9000000301', 'katrina.v@demo.example.com', DATE_ADD(@today, INTERVAL 7 DAY), 500.00, 'Active', 'Held after the viewing, waiting for her application.', @admin_id, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(NULL, NULL, @r11, 'Old Hold', '+63 9000000304', 'oldhold@demo.example.com', DATE_SUB(@today, INTERVAL 10 DAY), 500.00, 'Expired', 'Hold lapsed without an application.', @admin_id, DATE_SUB(NOW(), INTERVAL 24 DAY));
INSERT INTO unit_waitlist (inquiry_id, user_id, room_name, full_name, contact_no, email, status, created_by, created_at) VALUES
(NULL, NULL, @r2, 'Rico Manalo', '+63 9000000305', 'rico.m@demo.example.com', 'Waiting', @admin_id, DATE_SUB(NOW(), INTERVAL 3 DAY));
INSERT INTO guest_messages (inquiry_id, sender_role, sender_id, message, is_read, created_at) VALUES
(@inq_kat, 'guest', NULL,      'Hello, is the unit still available for next month?', 1, DATE_SUB(NOW(), INTERVAL 4 DAY)),
(@inq_kat, 'admin', @admin_id, 'Yes, it is. You can view it this week.',              1, DATE_SUB(NOW(), INTERVAL 4 DAY) + INTERVAL 20 MINUTE),
(@inq_kat, 'guest', NULL,      'Thursday afternoon works for me. Thank you!',         0, DATE_SUB(NOW(), INTERVAL 3 DAY));

-- ============================================================
-- 17. HOUSEHOLD
-- ============================================================
INSERT INTO household_members (rent_application_id, full_name, relationship, contact_no, age, age_category, status, added_at) VALUES
(@a_ana, 'Lourdes Dizon', 'Parent', NULL, 58, NULL, 'Active', DATE_SUB(@ts, INTERVAL 5 DAY)),
(@a_ana, 'Baby Dizon',    'Child',  NULL, 3,  'toddler', 'Pending', NULL),
(@a_cia, 'Marco Aguilar', 'Sibling', NULL, 24, NULL, 'Active', DATE_SUB(@ts, INTERVAL 5 DAY)),
(@a_gus, 'Dina Lim',      'Spouse', NULL, 31, NULL, 'Active', DATE_SUB(@ts, INTERVAL 5 DAY));

-- ============================================================
-- 18. CHAT (tenant <-> admin)
-- ============================================================
INSERT INTO messages (sender_id, receiver_id, message, is_read, created_at) VALUES
(@u_ana,   @admin_id, 'Hi, may I ask when the water interruption will be?', 1, DATE_SUB(NOW(), INTERVAL 2 DAY));
SET @msg1 = LAST_INSERT_ID();
INSERT INTO messages (sender_id, receiver_id, message, is_read, reply_to_id, created_at) VALUES
(@admin_id, @u_ana,   'Good day! It is this Saturday, 8 AM to 12 NN.', 1, @msg1, DATE_SUB(NOW(), INTERVAL 2 DAY) + INTERVAL 15 MINUTE),
(@u_ana,   @admin_id, 'Thank you. Can I fill my buckets the night before?', 1, NULL, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(@admin_id, @u_ana,   'Of course, please do.', 0, NULL, DATE_SUB(NOW(), INTERVAL 1 DAY) + INTERVAL 10 MINUTE),
(@u_cia,   @admin_id, 'The faucet leak is getting worse. Can someone come tomorrow?', 0, NULL, DATE_SUB(NOW(), INTERVAL 3 HOUR));

-- ============================================================
-- 19. ANNOUNCEMENTS (each addressed to one demo unit, in-app only)
-- ============================================================
INSERT INTO announcements (tag, title, body, send_to, channels, status, scheduled_date, recipient_count, created_at) VALUES
('Maintenance', 'Water interruption this Saturday', 'Water will be off from 8 AM to 12 NN for pipe maintenance. Please store water the night before.', CONCAT('Unit ', @r1), '["in-app"]', 'sent', NULL, 1, DATE_SUB(NOW(), INTERVAL 2 DAY)),
('Reminder',    'Rent due reminder',               'Rent for next month is due on the 1st. Pay early to avoid a late fee.',                                CONCAT('Unit ', @r2), '["in-app"]', 'scheduled', DATE_ADD(NOW(), INTERVAL 5 DAY), 1, NOW());

-- ============================================================
-- 20. NOTIFICATIONS  (admin queue rows are 'Pending' only for records that really are pending)
-- ============================================================
SET @inv_cia  = CONCAT('INV-DEMO-', DATE_FORMAT(@m0, '%Y%m'), '-CIA');
SET @inv_dan  = CONCAT('INV-DEMO-', DATE_FORMAT(@m0, '%Y%m'), '-DAN');
SET @inv_eli  = CONCAT('INV-DEMO-', DATE_FORMAT(@m0, '%Y%m'), '-ELI');
SET @maint_c  = (SELECT id FROM maintenance_requests WHERE user_id = @u_cia AND status = 'Pending' ORDER BY id DESC LIMIT 1);
SET @cctv_a   = (SELECT id FROM cctv_requests WHERE user_id = @u_ana AND status = 'Pending' ORDER BY id DESC LIMIT 1);
SET @svc_a    = (SELECT id FROM service_requests WHERE user_id = @u_ana AND status = 'Pending' ORDER BY id DESC LIMIT 1);
SET @park_f   = (SELECT id FROM parking_reservations WHERE user_id = @u_fay AND status = 'Pending' ORDER BY id DESC LIMIT 1);
SET @hh_a     = (SELECT id FROM household_members WHERE rent_application_id = @a_ana AND status = 'Pending' ORDER BY id DESC LIMIT 1);
SET @vis_a    = (SELECT id FROM visitor_logs WHERE user_id = @u_ana AND status = 'pending_approval' ORDER BY id DESC LIMIT 1);
INSERT INTO notifications (user_id, title, message, type, status, metadata_value, is_read, is_archived, created_at) VALUES
(@admin_id, 'Payment Needs Verification',  'Cecilia Aguilar submitted a GCash payment for review.',                    'payment_verification', 'Pending', CONCAT('payment_verification:', @inv_cia), 0, 0, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(@admin_id, 'Split Payment Needs Verification', 'Daniel Ocampo submitted a GCash and BPI split payment for review.',  'payment_verification', 'Pending', CONCAT('payment_verification:', @inv_dan), 0, 0, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(@admin_id, 'In-Person Payment Scheduled', 'Elena Pascual scheduled a cash payment visit for the morning slot.',       'cash_payment_declared', 'Pending', CONCAT('cash_payment_declared:', @inv_eli), 0, 0, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(@admin_id, 'New Rent Application',        'Kimberly Cruz submitted a rent application.',                              'rent_application',     'Pending', CONCAT('rent_application:', @a_kim), 0, 0, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(@admin_id, 'New Maintenance Request',     'A new plumbing request (High) has been submitted.',                         'maintenance_request',  'Pending', CONCAT('maintenance_request:', @maint_c), 0, 0, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(@admin_id, 'New CCTV Request',            'A new CCTV footage request has been submitted for the parking area.',      'cctv_request',         'Pending', CONCAT('cctv_request:', @cctv_a), 0, 0, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(@admin_id, 'New Service Booking',         'A new laundry booking ("Wash & Fold") has been submitted.',                'service_request',      'Pending', CONCAT('service_request:', @svc_a), 0, 0, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(@admin_id, 'New Parking Reservation',     'A new parking request for plate DMO-9012 has been submitted.',             'parking_reservation',  'Pending', CONCAT('parking_reservation:', @park_f), 0, 0, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(@admin_id, 'Household Member Request',    'Angela Dizon asked to add a child to her household.',                      'household_request',    'Pending', CONCAT('household_request:', @hh_a), 0, 0, DATE_SUB(NOW(), INTERVAL 3 DAY)),
(@admin_id, 'Visitor Awaiting Approval',   'Lourdes Dizon is expected at Room ' , 'visitor_log', 'Pending', CONCAT('visitor_log:', @vis_a), 0, 0, NOW()),
(@admin_id, 'Move-Out Notice Filed',       'Ivan Salazar filed a move-out notice. Clearance and final billing required.', 'move_out_request', 'Pending', CONCAT('move_out_request:', @a_ivan), 0, 0, DATE_SUB(NOW(), INTERVAL 4 DAY)),
(@admin_id, 'Overdue Payment',             'Benedict Mercado has two overdue bills.',                                  'overdue',              'Resolved', 'demo:overdue', 1, 0, DATE_SUB(NOW(), INTERVAL 6 DAY)),
(@u_ben,   'Payment Overdue',              'Your rent is overdue. Please settle it to avoid further action.',          'overdue',              'Resolved', NULL, 0, 0, DATE_SUB(NOW(), INTERVAL 6 DAY)),
(@u_ben,   'Rent Due Reminder',            'Your rent is due on the 1st.',                                             'rent_due',             'Resolved', NULL, 1, 1, DATE_SUB(NOW(), INTERVAL 40 DAY)),
(@u_ana,   'Payment Received',             'Your advance rent payment was confirmed. Three months are credited.',      'payment',              'Resolved', NULL, 0, 0, DATE_SUB(NOW(), INTERVAL 6 DAY)),
(@u_ana,   'Water interruption this Saturday', 'Water will be off from 8 AM to 12 NN for pipe maintenance.',           'action',               'Resolved', NULL, 0, 0, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(@u_jon,   'Application Approved',         'Your rent application has been approved. Your move-in date is set.',       'application_update',   'Resolved', NULL, 0, 0, DATE_SUB(NOW(), INTERVAL 4 DAY)),
(@u_lou,   'Action Required',              'Please upload a clearer photo of the back of your valid ID.',              'document_followup',    'Resolved', NULL, 0, 0, DATE_SUB(NOW(), INTERVAL 3 DAY)),
(@u_max,   'Application Rejected',         'Your rent application was rejected. Reason: Valid ID has expired.',        'application_update',   'Resolved', NULL, 1, 0, DATE_SUB(NOW(), INTERVAL 19 DAY)),
(@u_omar,  'Refund Approved',              'Your refund of the move-in payment was approved.',                         'payment',              'Resolved', NULL, 0, 0, DATE_SUB(NOW(), INTERVAL 7 DAY)),
(@u_hal,   'More Information Needed',      'Please send the GCash reference of the second payment.',                   'payment_followup',     'Resolved', NULL, 0, 0, DATE_SUB(NOW(), INTERVAL 4 DAY)),
(@u_hal,   'Rent Ending Soon',             'Your rent ends next month. Ask the office about extending.',               'contract_update',      'Resolved', NULL, 0, 0, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(@u_ivan,  'Move-Out Update',              'Your move-out notice was received.',                                       'move_out_update',      'Resolved', NULL, 1, 0, DATE_SUB(NOW(), INTERVAL 4 DAY));
UPDATE notifications SET message = CONCAT('Lourdes Dizon is expected at Room ', @r1, ' tomorrow.') WHERE metadata_value = CONCAT('visitor_log:', @vis_a);

-- Everyone keeps email and SMS off, plus one in-app preference as a sample.
INSERT INTO notification_preferences (user_id, category, in_app_enabled, sms_enabled, email_enabled)
SELECT id, 'billing', 1, 0, 0 FROM users WHERE email_address LIKE '%@demo.example.com';

-- Delivery history only (sent / failed / skipped); nothing is left to send.
INSERT INTO notification_queue (user_id, channel, event_type, payload, status, attempts, max_attempts, next_attempt_at, error_message, created_at, processed_at) VALUES
(@u_ben, 'email', 'overdue', '{"subject":"Payment overdue","body":"Your rent is overdue."}', 'sent',   1, 3, DATE_SUB(NOW(), INTERVAL 6 DAY), NULL, DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY)),
(@u_ben, 'sms',   'overdue', '{"body":"Your rent is overdue."}',                              'failed', 3, 3, DATE_SUB(NOW(), INTERVAL 6 DAY), 'Recipient number is not reachable.', DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY));
INSERT INTO notification_log (user_id, channel, event_type, recipient, subject, message_body, status, error_message, sent_at) VALUES
(@u_ben, 'in-app', 'overdue',  'benedict.mercado@demo.example.com', 'Payment Overdue', 'Your rent is overdue.', 'sent',    NULL, DATE_SUB(NOW(), INTERVAL 6 DAY)),
(@u_ben, 'email',  'overdue',  'benedict.mercado@demo.example.com', 'Payment Overdue', 'Your rent is overdue.', 'skipped', 'Recipient opted out of email.', DATE_SUB(NOW(), INTERVAL 6 DAY)),
(@u_ben, 'sms',    'overdue',  '+63 9000000102',                    NULL,              'Your rent is overdue.', 'failed',  'Recipient number is not reachable.', DATE_SUB(NOW(), INTERVAL 6 DAY));

-- ============================================================
-- 21. EXPENSES (nine months, for the reports and budget views)
-- ============================================================
INSERT INTO expenses (category, amount, expense_date, description, created_by)
SELECT c.category, c.base + ((m.n * 37) % 5) * c.step, DATE_ADD(m.ps, INTERVAL c.day - 1 DAY), c.descr, @admin_id
  FROM _m m
  CROSS JOIN (SELECT 'utilities' AS category, 9000 AS base, 150 AS step, 5 AS day, 'Common-area electricity and water' AS descr
        UNION ALL SELECT 'supplies',       2200, 100, 10, 'Cleaning supplies and light bulbs'
        UNION ALL SELECT 'salaries',      12000,   0, 28, 'Caretaker salary'
        UNION ALL SELECT 'repairs_common', 1500, 400, 15, 'Common-area repairs'
        UNION ALL SELECT 'taxes_fees',     2500,   0, 20, 'Barangay fees and permits') c;

-- ============================================================
-- 22. ACTIVITY LOG  (shown in the admin log viewer; each detail starts with "Demo:")
-- ============================================================
INSERT INTO activity_logs (category, action, details, performed_by, created_at) VALUES
('tenant',      'Updated Tenant Status',    'Demo: Application ID: 1, New Status: Approved',                @admin_id, DATE_SUB(NOW(), INTERVAL 280 DAY)),
('billing',     'Recorded Payment',         CONCAT('Demo: Invoice ', @split_inv, ' settled via Cash and GCash'), @admin_id, DATE_SUB(NOW(), INTERVAL 120 DAY)),
('contract',    'Flagged Eviction',         'Demo: Contract: CTR-DEMO-BEN',                                 @admin_id, DATE_SUB(NOW(), INTERVAL 8 DAY)),
('contract',    'Approved Rent Extension',  'Demo: Contract CTR-DEMO-HAL extended by 6 month(s)',           @admin_id, DATE_SUB(NOW(), INTERVAL 190 DAY)),
('billing',     'Adjusted Invoice',         CONCAT('Demo: Invoice ', @adj_inv, ', electricity corrected'),  @admin_id, DATE_SUB(NOW(), INTERVAL 40 DAY)),
('billing',     'Created Advance Payment',  'Demo: Invoice INV-DEMO-ADV-ANA: 3 month(s)',                   @u_ana,    DATE_SUB(NOW(), INTERVAL 9 DAY)),
('maintenance', 'Updated Maintenance Ticket', 'Demo: Status: In Progress -> Completed',                     @admin_id, DATE_SUB(NOW(), INTERVAL 34 DAY)),
('tenant',      'Requested Move Out',       'Demo: Application ID: Ivan Salazar, Scheduled in 12 days',     @u_ivan,   DATE_SUB(NOW(), INTERVAL 4 DAY)),
('inquiry',     'Reserved Unit',            'Demo: Unit held for Katrina Villareal for 7 days',             @admin_id, DATE_SUB(NOW(), INTERVAL 2 DAY)),
('service',     'Denied Visitor',           'Demo: Visitor denied at Room entry, no prior notice',          @admin_id, DATE_SUB(NOW(), INTERVAL 6 DAY)),
('tenant',      'Updated Tenant Status',    'Demo: Application ID: Maxine Torres, New Status: Rejected',    @admin_id, DATE_SUB(NOW(), INTERVAL 19 DAY)),
('tenant',      'Completed Move Out & Clearance', 'Demo: Patricia Navarro, deposit applied to rent',        @admin_id, DATE_SUB(@m0, INTERVAL 1 MONTH)),
('communication', 'Created Announcement',   'Demo: Title: Water interruption this Saturday; To: one unit',  @admin_id, DATE_SUB(NOW(), INTERVAL 2 DAY)),
('system',      'Updated Utility Types',    'Demo: Internet and Gas switched on',                           @admin_id, DATE_SUB(NOW(), INTERVAL 1 DAY));

COMMIT;

DROP TEMPORARY TABLE IF EXISTS _seed_guard;
DROP TEMPORARY TABLE IF EXISTS _t;
DROP TEMPORARY TABLE IF EXISTS _m;

SELECT 'demo data loaded' AS status,
       (SELECT COUNT(*) FROM users WHERE email_address LIKE '%@demo.example.com') AS demo_users,
       (SELECT COUNT(*) FROM invoices WHERE id LIKE 'INV-DEMO-%') AS demo_invoices,
       (SELECT COUNT(*) FROM payment_transactions WHERE invoice_id LIKE 'INV-DEMO-%') AS demo_payments;
