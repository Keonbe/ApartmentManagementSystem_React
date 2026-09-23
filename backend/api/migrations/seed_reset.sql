-- ============================================================
-- SEED RESET SCRIPT — ams_db
-- Removes the demo data inserted by seed_mock_data.sql, plus anything the
-- seeded tenant accounts created afterwards (invoices, requests, sessions...).
-- Preserves: the admin account, rooms, system_settings, service_catalog, and
-- any rows that don't belong to the seed.
--
-- Rows are matched on stable values (tenant emails, the seed's inquiry emails,
-- announcement titles, audit timestamps), never on id ranges, so this stays
-- correct however the ids were assigned. Keep it in step with
-- seed_mock_data.sql; CI imports the seed, runs this file and checks the result.
--
-- Usage:  mysql -u root ams_db < seed_reset.sql
--         mysql -u root ams_db < seed_mock_data.sql   # optional re-seed
-- ============================================================

USE ams_db;

SET FOREIGN_KEY_CHECKS = 0;

SET @admin_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1);

-- The seed's tenant accounts (12, including Gloria Tan's pending applicant).
DROP TEMPORARY TABLE IF EXISTS seed_users;
CREATE TEMPORARY TABLE seed_users (id INT PRIMARY KEY)
  SELECT id FROM users WHERE role = 'user' AND email_address IN (
    'maria.santos@gmail.com', 'jose.reyes@gmail.com', 'rosa.delacruz@gmail.com',
    'ben.flores@gmail.com', 'lita.ramos@gmail.com', 'gloria.tan@gmail.com',
    'dante.abad@gmail.com', 'pedro.cruz@gmail.com', 'carlo.villanueva@gmail.com',
    'ana.bautista@gmail.com', 'mark.santiago@gmail.com', 'grace.mendoza@gmail.com'
  );

-- Their applications and contracts, resolved before anything is deleted.
DROP TEMPORARY TABLE IF EXISTS seed_apps;
CREATE TEMPORARY TABLE seed_apps (id INT PRIMARY KEY)
  SELECT ra.id FROM rent_applications ra JOIN seed_users su ON su.id = ra.user_id;

DROP TEMPORARY TABLE IF EXISTS seed_contracts;
CREATE TEMPORARY TABLE seed_contracts (id VARCHAR(50) PRIMARY KEY)
  SELECT lc.id FROM lease_contracts lc JOIN seed_apps sa ON sa.id = lc.rent_application_id;

DROP TEMPORARY TABLE IF EXISTS seed_parking;
CREATE TEMPORARY TABLE seed_parking (id INT PRIMARY KEY)
  SELECT pr.id FROM parking_reservations pr JOIN seed_users su ON su.id = pr.user_id;

-- 1. Tenancy records
DELETE lr FROM lease_renewals lr JOIN seed_contracts sc ON sc.id = lr.contract_id;
DELETE lc FROM lease_contracts lc JOIN seed_contracts sc ON sc.id = lc.id;
DELETE hm FROM household_members hm JOIN seed_apps sa ON sa.id = hm.rent_application_id;
DELETE ra FROM rent_applications ra JOIN seed_apps sa ON sa.id = ra.id;

-- 2. Billing
DELETE pc FROM parking_charges pc JOIN seed_parking sp ON sp.id = pc.reservation_id;
DELETE i FROM invoices i JOIN seed_users su ON su.id = i.user_id;
DELETE ur FROM utility_readings ur JOIN seed_users su ON su.id = ur.user_id;

-- 3. Requests
DELETE pr FROM parking_reservations pr JOIN seed_parking sp ON sp.id = pr.id;
DELETE mr FROM maintenance_requests mr JOIN seed_users su ON su.id = mr.user_id;
DELETE cr FROM cctv_requests cr JOIN seed_users su ON su.id = cr.user_id;
DELETE sr FROM service_requests sr JOIN seed_users su ON su.id = sr.user_id;
DELETE vl FROM visitor_logs vl JOIN seed_users su ON su.id = vl.user_id;

-- 4. Inquiries, holds and the waitlist (Katrina and Noel are walk-ins without accounts)
DELETE FROM unit_reservations
  WHERE email = 'katrina.v@gmail.com' OR user_id IN (SELECT id FROM seed_users);
DELETE FROM unit_waitlist
  WHERE user_id IN (SELECT id FROM seed_users);
DELETE FROM inquiries
  WHERE email IN ('katrina.v@gmail.com', 'noel.ramirez@gmail.com')
     OR user_id IN (SELECT id FROM seed_users);

-- 5. Notifications: the tenants' own, plus the admin queue rows the seed adds
DELETE n FROM notifications n JOIN seed_users su ON su.id = n.user_id;
DELETE np FROM notification_preferences np JOIN seed_users su ON su.id = np.user_id;
DELETE FROM notifications
  WHERE user_id = @admin_id AND (title, created_at) IN (
    ('New CCTV Request',        '2026-07-21 09:00:00'),
    ('New Maintenance Request', '2026-08-06 09:00:00'),
    ('New Service Booking',     '2026-08-18 10:00:00'),
    ('New Rent Application',    '2026-08-20 09:00:00'),
    ('New Parking Reservation', '2026-08-22 11:00:00')
  );

-- 6. Announcements and the seeded audit trail
DELETE FROM announcements WHERE title IN (
  'Scheduled Water Interruption - February 8, 2026',
  'Monthly Rent Due - March 15, 2026',
  'Updated Building Rules - No Smoking Policy',
  'Elevator Inspection - June 20, 2026',
  'Service Catalog Now Available'
);

DELETE FROM activity_logs
  WHERE performed_by = @admin_id AND (action, created_at) IN (
    ('Approved Application',             '2025-10-27 09:00:00'),
    ('Approved Application',             '2025-09-25 10:00:00'),
    ('Approved Application',             '2025-08-27 12:00:00'),
    ('Approved Application',             '2026-07-29 10:00:00'),
    ('Approved Lease Extension',         '2026-07-05 10:30:00'),
    ('Updated Contract Eviction Status', '2026-08-16 11:00:00'),
    ('Resolved Maintenance',             '2026-02-10 14:00:00'),
    ('Resolved Maintenance',             '2026-04-12 13:00:00'),
    ('Verified Payment',                 '2026-08-14 09:00:00'),
    ('Reserved Unit',                    '2026-08-28 14:30:00')
  );

-- 7. Rooms the seed occupied go back to SetupDB's vacant state
--    (last_tenant and maintenance_flag are left as they are).
UPDATE rooms
   SET status = 'vacant', tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0
 WHERE tenant_name IN (
   'Maria Santos', 'Jose Reyes', 'Rosa Dela Cruz', 'Ben Flores', 'Lita Ramos', 'Dante Abad',
   'Pedro Cruz', 'Carlo Villanueva', 'Ana Bautista', 'Mark Santiago', 'Grace Mendoza'
 );

-- 8. The accounts themselves, with their sessions and sign-in history
DELETE s FROM sessions s JOIN seed_users su ON su.id = s.user_id;
DELETE FROM login_attempts WHERE email IN (SELECT email_address FROM users u JOIN seed_users su ON su.id = u.id);
DELETE FROM password_resets WHERE email IN (SELECT email_address FROM users u JOIN seed_users su ON su.id = u.id);
DELETE FROM password_reset_requests WHERE email IN (SELECT email_address FROM users u JOIN seed_users su ON su.id = u.id);
DELETE u FROM users u JOIN seed_users su ON su.id = u.id;

DROP TEMPORARY TABLE seed_parking;
DROP TEMPORARY TABLE seed_contracts;
DROP TEMPORARY TABLE seed_apps;
DROP TEMPORARY TABLE seed_users;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Seed data removed. Re-import seed_mock_data.sql to restore the demo.' AS status;
