-- Defense scenario data. Local dev / scratch only, never prod.
-- Run on a database seeded with seed_mock_data.sql (it relies on that file's ids;
-- seed_demo_full.sql covers the same states without fixed ids), preferably a scratch DB:
--   bash .claude/skills/db-snapshot/snapshot.sh scratch defense --seed
--   sed 's/\bams_db\b/defense/g' backend/api/migrations/seeds/seed_defense_scenarios.sql | mysql -uroot defense
-- or on dev after `/db-snapshot save`, then `/db-snapshot restore`.
-- Dates are relative to today (CURDATE()), so it can be run on the defense day.
-- Idempotent: every row is guarded by NOT EXISTS / fixed ids. Checklist:
-- docs/date_dependent_testing.md, "Defense scenario checklist".

-- 1. Split payment: Rosa (user 5) paid this month's rent in two parts, cash + GCash.
INSERT INTO invoices (id, user_id, base_rent, total_amount, billing_period, status, payment_method, paid_at, due_date)
SELECT 'INV-DEF-SPLIT', 5, 4000, 4000, DATE_FORMAT(CURDATE(), '%M %Y'), 'paid', 'Cash', NOW(), DATE_ADD(CURDATE(), INTERVAL 5 DAY) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM invoices WHERE id = 'INV-DEF-SPLIT');
INSERT INTO payment_transactions (invoice_id, amount, payment_method, reference_number)
SELECT 'INV-DEF-SPLIT', 2500, 'Cash', NULL FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM payment_transactions WHERE invoice_id = 'INV-DEF-SPLIT');
INSERT INTO payment_transactions (invoice_id, amount, payment_method, bank_name, reference_number)
SELECT 'INV-DEF-SPLIT', 1500, 'GCash', 'GCash', 'DEF-GC-0001' FROM DUAL
WHERE (SELECT COUNT(*) FROM payment_transactions WHERE invoice_id = 'INV-DEF-SPLIT') = 1;

-- 2. Single full payment: Dante (user 9) paid in one go.
INSERT INTO invoices (id, user_id, base_rent, total_amount, billing_period, status, payment_method, paid_at, due_date)
SELECT 'INV-DEF-FULL', 9, 4000, 4000, DATE_FORMAT(CURDATE(), '%M %Y'), 'paid', 'Cash', NOW(), DATE_ADD(CURDATE(), INTERVAL 5 DAY) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM invoices WHERE id = 'INV-DEF-FULL');
INSERT INTO payment_transactions (invoice_id, amount, payment_method)
SELECT 'INV-DEF-FULL', 4000, 'Cash' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM payment_transactions WHERE invoice_id = 'INV-DEF-FULL');

-- 3. Overdue invoice: Pedro (user 10), due 12 days ago, so the follow-up monitor lists him.
INSERT INTO invoices (id, user_id, base_rent, total_amount, billing_period, status, due_date)
SELECT 'INV-DEF-OVERDUE', 10, 4000, 4000, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 12 DAY), '%M %Y'), 'overdue', DATE_SUB(CURDATE(), INTERVAL 12 DAY) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM invoices WHERE id = 'INV-DEF-OVERDUE');

-- 4. Rejected after approval: Ramon's application (id 14) was approved, paid the move-in
--    invoice, then was rejected; a refund request for the paid amount is waiting.
UPDATE rent_applications SET rejection_reason = 'Documents could not be verified after approval.'
WHERE id = 14 AND status = 'Rejected' AND (rejection_reason IS NULL OR rejection_reason = '');
INSERT INTO invoices (id, user_id, rent_application_id, base_rent, security_deposit, total_amount, billing_period, status, payment_method, paid_at, due_date, cancel_reason)
SELECT 'INV-DEF-REJECTED', ra.user_id, ra.id, 4000, 4000, 8000, DATE_FORMAT(CURDATE(), '%M %Y'), 'paid', 'GCash', DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY), NULL
FROM rent_applications ra WHERE ra.id = 14 AND NOT EXISTS (SELECT 1 FROM invoices WHERE id = 'INV-DEF-REJECTED');
INSERT INTO payment_transactions (invoice_id, amount, payment_method, bank_name, reference_number)
SELECT 'INV-DEF-REJECTED', 8000, 'GCash', 'GCash', 'DEF-GC-0002' FROM invoices
WHERE id = 'INV-DEF-REJECTED' AND NOT EXISTS (SELECT 1 FROM payment_transactions WHERE invoice_id = 'INV-DEF-REJECTED');

-- 8. Refund request (from the rejection above, as update_tenant_status.php would raise it).
INSERT INTO refund_requests (user_id, rent_application_id, type, invoice_id, amount, reason, raised_by, raised_by_role)
SELECT ra.user_id, ra.id, 'rejected_application', 'INV-DEF-REJECTED', 8000, 'Application rejected after payment: Documents could not be verified after approval.', 1, 'admin'
FROM rent_applications ra WHERE ra.id = 14 AND ra.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM invoices WHERE id = 'INV-DEF-REJECTED')
  AND NOT EXISTS (SELECT 1 FROM refund_requests WHERE invoice_id = 'INV-DEF-REJECTED');
INSERT INTO refund_request_events (refund_request_id, actor_id, actor_role, action, message)
SELECT r.id, 1, 'admin', 'raised', r.reason FROM refund_requests r
WHERE r.invoice_id = 'INV-DEF-REJECTED' AND NOT EXISTS (SELECT 1 FROM refund_request_events e WHERE e.refund_request_id = r.id);

-- 5. Scheduled move-in: Lita (app 5, Approved, unit E, move-in invoice paid) moves in 3 days from today.
UPDATE rent_applications SET move_in_date = DATE_ADD(CURDATE(), INTERVAL 3 DAY), preferred_move_in_date = DATE_ADD(CURDATE(), INTERVAL 3 DAY)
WHERE id = 5 AND status = 'Approved';

-- Documents outstanding: Gloria (app 6) was asked to re-upload her valid ID.
UPDATE rent_applications SET status = 'Action Required', rejection_reason = 'Please upload a clear copy of your valid ID (front and back).'
WHERE id = 6 AND status = 'Pending Review';

-- 7. Visitor overstay: Maria's guest checked in 2 days ago and is still in (the next notification poll
--    queues a Visitor Overstay alert once the overstay threshold, 24 h by default, has passed).
INSERT INTO visitor_logs (user_id, room_name, visitor_name, contact_number, purpose, status, check_in_at, expected_at, expected_check_out_at)
SELECT 2, 'A', 'DEF Overstay Guest', '09171234567', 'Family visit', 'checked_in', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM visitor_logs WHERE visitor_name = 'DEF Overstay Guest');

-- 6. Utility reading: Carlo (unit H) has a metered reading last month; Pedro (unit G) has a
--    total-only record this month. Both are not billed yet, so "Sync to invoice" can be shown.
INSERT INTO utility_readings (room_name, user_id, billing_period, reading_date, water_prev_reading, water_curr_reading, water_rate_per_unit, water_consumption, water_amount, electric_prev_reading, electric_curr_reading, electric_rate_per_unit, electric_consumption, electric_amount, entry_mode, notes, recorded_by)
SELECT 'H', 11, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m'), DATE_SUB(CURDATE(), INTERVAL 10 DAY), 0, 12, 40, 12, 480, 0, 150, 12, 150, 1800, 'metered', 'DEF scenario: metered reading', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM utility_readings WHERE room_name = 'H' AND billing_period = DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m'));
INSERT INTO utility_readings (room_name, user_id, billing_period, reading_date, entry_mode, total_amount, notes, recorded_by)
SELECT 'G', 10, DATE_FORMAT(CURDATE(), '%Y-%m'), CURDATE(), 'total', 1850.50, 'DEF scenario: tenant paid the full amount at the desk', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM utility_readings WHERE room_name = 'G' AND billing_period = DATE_FORMAT(CURDATE(), '%Y-%m'));

-- Payment window: Carlo (user 11) started an online checkout 4 days ago and abandoned it.
-- The next notification poll (or cron/daily_sweep.php) releases it.
INSERT INTO invoices (id, user_id, base_rent, total_amount, billing_period, status, due_date, checkout_session_id, payment_gateway, processing_since)
SELECT 'INV-DEF-ABANDONED', 11, 4000, 4000, DATE_FORMAT(CURDATE(), '%M %Y'), 'processing', DATE_ADD(CURDATE(), INTERVAL 5 DAY), 'cs_def_abandoned', 'paymongo', DATE_SUB(NOW(), INTERVAL 4 DAY) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM invoices WHERE id = 'INV-DEF-ABANDONED');

-- Installments (2026_10_manager_interview_alignment.sql): a paid invoice was paid in full.
UPDATE `invoices` SET `amount_paid` = `total_amount` WHERE `status` = 'paid' AND `amount_paid` = 0;
