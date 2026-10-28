-- ============================================================
-- seed_demo_reset.sql: undoes seed_demo_full.sql.
-- Removes the @demo.example.com accounts and everything that belongs to them
-- (applications, contracts, invoices, payments, parking, requests, chat,
-- notifications), the demo inquiries, holds and waitlist entries, the demo
-- announcements, expenses and log rows, and puts the rooms they held back to
-- vacant. Real accounts and data are not touched. No USE line: select the
-- database first. Safe to run when nothing was loaded.
-- ============================================================

-- Match the tables' collation (MySQL 8 defaults to utf8mb4_0900_ai_ci: error 1267).
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

DROP TEMPORARY TABLE IF EXISTS demo_users;
CREATE TEMPORARY TABLE demo_users (id INT PRIMARY KEY)
  SELECT id FROM users WHERE email_address LIKE '%@demo.example.com' AND role = 'user';

DROP TEMPORARY TABLE IF EXISTS demo_apps;
CREATE TEMPORARY TABLE demo_apps (id INT PRIMARY KEY)
  SELECT ra.id FROM rent_applications ra JOIN demo_users du ON du.id = ra.user_id;

DROP TEMPORARY TABLE IF EXISTS demo_contracts;
CREATE TEMPORARY TABLE demo_contracts (id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci PRIMARY KEY)
  SELECT lc.id FROM lease_contracts lc JOIN demo_apps da ON da.id = lc.rent_application_id;

-- Admin queue rows point at demo records as '<type>:<id>'; collect them before
-- the records go (one base table per branch: MySQL cannot open a temporary
-- table twice in one query).
DROP TEMPORARY TABLE IF EXISTS demo_refs;
CREATE TEMPORARY TABLE demo_refs (ref VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci PRIMARY KEY)
  SELECT CONCAT('rent_application:', ra.id) AS ref FROM rent_applications ra JOIN users u ON u.id = ra.user_id WHERE u.email_address LIKE '%@demo.example.com'
  UNION SELECT CONCAT('move_out_request:', ra.id) FROM rent_applications ra JOIN users u ON u.id = ra.user_id WHERE u.email_address LIKE '%@demo.example.com'
  UNION SELECT CONCAT('maintenance_request:', m.id) FROM maintenance_requests m JOIN users u ON u.id = m.user_id WHERE u.email_address LIKE '%@demo.example.com'
  UNION SELECT CONCAT('cctv_request:', c.id) FROM cctv_requests c JOIN users u ON u.id = c.user_id WHERE u.email_address LIKE '%@demo.example.com'
  UNION SELECT CONCAT('service_request:', s.id) FROM service_requests s JOIN users u ON u.id = s.user_id WHERE u.email_address LIKE '%@demo.example.com'
  UNION SELECT CONCAT('parking_reservation:', p.id) FROM parking_reservations p JOIN users u ON u.id = p.user_id WHERE u.email_address LIKE '%@demo.example.com'
  UNION SELECT CONCAT('household_request:', h.id) FROM household_members h JOIN rent_applications ra ON ra.id = h.rent_application_id JOIN users u ON u.id = ra.user_id WHERE u.email_address LIKE '%@demo.example.com'
  UNION SELECT CONCAT('visitor_log:', v.id) FROM visitor_logs v JOIN users u ON u.id = v.user_id WHERE u.email_address LIKE '%@demo.example.com'
  UNION SELECT CONCAT('payment_verification:', i.id) FROM invoices i JOIN users u ON u.id = i.user_id WHERE u.email_address LIKE '%@demo.example.com'
  UNION SELECT CONCAT('cash_payment_declared:', i.id) FROM invoices i JOIN users u ON u.id = i.user_id WHERE u.email_address LIKE '%@demo.example.com';

-- 1. Notifications and delivery history
DELETE n FROM notifications n JOIN demo_users du ON du.id = n.user_id;
DELETE n FROM notifications n JOIN demo_refs dr ON dr.ref = n.metadata_value;
DELETE FROM notifications WHERE metadata_value = 'demo:overdue';
DELETE np FROM notification_preferences np JOIN demo_users du ON du.id = np.user_id;
DELETE nq FROM notification_queue nq JOIN demo_users du ON du.id = nq.user_id;
DELETE nl FROM notification_log nl JOIN demo_users du ON du.id = nl.user_id;

-- 2. Payments, refunds and bills
DELETE e FROM refund_request_events e JOIN refund_requests r ON r.id = e.refund_request_id JOIN demo_users du ON du.id = r.user_id;
DELETE r FROM refund_requests r JOIN demo_users du ON du.id = r.user_id;
DELETE ppp FROM payment_proof_parts ppp JOIN invoices i ON i.id = ppp.payment_key JOIN demo_users du ON du.id = i.user_id;
DELETE pt FROM payment_transactions pt JOIN invoices i ON i.id = pt.invoice_id JOIN demo_users du ON du.id = i.user_id;
DELETE ia FROM invoice_adjustments ia JOIN invoices i ON i.id = ia.invoice_id JOIN demo_users du ON du.id = i.user_id;
DELETE ac FROM advance_credits ac JOIN demo_users du ON du.id = ac.user_id;
DELETE pc FROM parking_charges pc JOIN parking_reservations pr ON pr.id = pc.reservation_id JOIN demo_users du ON du.id = pr.user_id;
DELETE uri FROM utility_reading_items uri JOIN utility_readings ur ON ur.id = uri.reading_id JOIN demo_users du ON du.id = ur.user_id;
DELETE ur FROM utility_readings ur JOIN demo_users du ON du.id = ur.user_id;
DELETE i FROM invoices i JOIN demo_users du ON du.id = i.user_id;

-- 3. Contracts, household, documents
DELETE lr FROM lease_renewals lr JOIN demo_contracts dc ON dc.id = lr.contract_id;
DELETE dd FROM deposit_deductions dd JOIN demo_apps da ON da.id = dd.rent_application_id;
DELETE lc FROM lease_contracts lc JOIN demo_contracts dc ON dc.id = lc.id;
DELETE hm FROM household_members hm JOIN demo_apps da ON da.id = hm.rent_application_id;
DELETE ad FROM application_documents ad JOIN demo_apps da ON da.id = ad.rent_application_id;

-- 4. Requests
DELETE pr FROM parking_reservations pr JOIN demo_users du ON du.id = pr.user_id;
DELETE mr FROM maintenance_requests mr JOIN demo_users du ON du.id = mr.user_id;
DELETE cr FROM cctv_requests cr JOIN demo_users du ON du.id = cr.user_id;
DELETE sr FROM service_requests sr JOIN demo_users du ON du.id = sr.user_id;
DELETE vl FROM visitor_logs vl JOIN demo_users du ON du.id = vl.user_id;

-- 5. Chat, inquiries, holds, waitlist
DELETE m FROM messages m JOIN demo_users du ON du.id = m.sender_id;
DELETE m FROM messages m JOIN demo_users du ON du.id = m.receiver_id;
DELETE gm FROM guest_messages gm JOIN inquiries q ON q.id = gm.inquiry_id WHERE q.email LIKE '%@demo.example.com';
DELETE FROM unit_reservations WHERE email LIKE '%@demo.example.com' OR user_id IN (SELECT id FROM demo_users);
DELETE FROM unit_waitlist WHERE email LIKE '%@demo.example.com' OR user_id IN (SELECT id FROM demo_users);
DELETE FROM inquiries WHERE email LIKE '%@demo.example.com' OR user_id IN (SELECT id FROM demo_users);

-- 6. Rooms they held go back to vacant
UPDATE rooms SET status = 'vacant', tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0
 WHERE id IN (SELECT room_name FROM rent_applications WHERE id IN (SELECT id FROM demo_apps))
   AND status IN ('occupied', 'reserved');
UPDATE rooms SET last_tenant = NULL, last_inspection_date = NULL WHERE last_tenant = 'Patricia Navarro';

-- 7. Applications, then the admin-side demo rows
DELETE ra FROM rent_applications ra JOIN demo_apps da ON da.id = ra.id;
DELETE al FROM activity_logs al JOIN demo_users du ON du.id = al.performed_by;
DELETE FROM activity_logs WHERE details LIKE 'Demo: %';
DELETE FROM announcements WHERE title IN ('Water interruption this Saturday', 'Rent due reminder') AND channels = '["in-app"]';
DELETE FROM expenses WHERE description IN ('Common-area electricity and water', 'Cleaning supplies and light bulbs', 'Caretaker salary', 'Common-area repairs', 'Barangay fees and permits');

-- 8. Accounts, sessions and sign-in records
DELETE s FROM sessions s JOIN demo_users du ON du.id = s.user_id;
DELETE FROM login_attempts WHERE email LIKE '%@demo.example.com';
DELETE FROM password_resets WHERE email LIKE '%@demo.example.com';
DELETE FROM password_reset_requests WHERE email LIKE '%@demo.example.com';
DELETE u FROM users u JOIN demo_users du ON du.id = u.id;

DROP TEMPORARY TABLE demo_refs;
DROP TEMPORARY TABLE demo_contracts;
DROP TEMPORARY TABLE demo_apps;
DROP TEMPORARY TABLE demo_users;

SELECT 'demo data removed' AS status;
