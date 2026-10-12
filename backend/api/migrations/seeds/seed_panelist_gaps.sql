-- Dev demo data for the panelist-gap features (refunds, floor rent, utility bill + proof,
-- extra utilities, minors). Local dev only; run once on a seeded ams_db:
--   mysql -uroot ams_db < backend/api/migrations/seeds/seed_panelist_gaps.sql
-- Restore with /db-snapshot. Never run on prod.

-- Floor rent table (does not change existing units until "Apply to vacant units")
UPDATE system_settings SET setting_value = '{"1F":4000,"2F":4500,"3F":3500}' WHERE setting_key = 'floor_rates';

-- Extra utilities on
UPDATE utility_types SET is_active = 1 WHERE code IN ('internet', 'gas');

-- Refunds: Maria (user 2) has two unused advance months, refund-due, and a 200 overpayment on August
INSERT INTO advance_credits (advance_invoice_id, user_id, rent_application_id, period_start, amount, status)
SELECT 'INV-202610-4B413651', 2, NULL, '2027-01-01', 4000, 'refund-due' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM advance_credits WHERE user_id = 2 AND period_start = '2027-01-01');
INSERT INTO advance_credits (advance_invoice_id, user_id, rent_application_id, period_start, amount, status)
SELECT 'INV-202610-4B413651', 2, NULL, '2027-02-01', 4000, 'refund-due' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM advance_credits WHERE user_id = 2 AND period_start = '2027-02-01');
INSERT INTO payment_transactions (invoice_id, amount, payment_method)
SELECT 'INV-202608-2', 200, 'Cash' FROM DUAL
WHERE (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE invoice_id = 'INV-202608-2') <= 5160;

-- Refunds: Jose (user 3) already asked for something and management asked for more info
INSERT INTO refund_requests (user_id, type, amount, reason, status, decision_reason, raised_by, raised_by_role)
SELECT 3, 'overpayment', 150, 'I paid my August rent twice by mistake.', 'Info Requested', 'Please send the GCash reference of the second payment.', 3, 'user' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM refund_requests WHERE user_id = 3 AND reason LIKE 'I paid my August%');
INSERT INTO refund_request_events (refund_request_id, actor_id, actor_role, action, message)
SELECT r.id, 3, 'user', 'raised', r.reason FROM refund_requests r
WHERE r.user_id = 3 AND r.reason LIKE 'I paid my August%' AND NOT EXISTS (SELECT 1 FROM refund_request_events e WHERE e.refund_request_id = r.id);
INSERT INTO refund_request_events (refund_request_id, actor_id, actor_role, action, message)
SELECT r.id, 1, 'admin', 'request_info', r.decision_reason FROM refund_requests r
WHERE r.user_id = 3 AND r.reason LIKE 'I paid my August%' AND (SELECT COUNT(*) FROM refund_request_events e WHERE e.refund_request_id = r.id) = 1;

-- Utility bill + proof: Ana's (user 12) August reading gets a bill file, and its invoice is unpaid
UPDATE utility_readings SET bill_file_path = 'uploads/utility_bills/bill_demoseed0000000000000000000001.pdf' WHERE id = 4;
UPDATE invoices SET status = 'pending', paid_at = NULL WHERE id = 'INV-202608-12' AND status = 'paid';

-- Minors: Maria already has a pending child on her household list
INSERT INTO household_members (rent_application_id, full_name, relationship, age, age_category, status)
SELECT ra.id, 'Baby Santos', 'Child', 3, 'toddler', 'Pending' FROM rent_applications ra
WHERE ra.user_id = 2 AND ra.status IN ('Approved','active','pending-move-out')
  AND NOT EXISTS (SELECT 1 FROM household_members h WHERE h.rent_application_id = ra.id AND h.full_name = 'Baby Santos')
ORDER BY ra.id DESC LIMIT 1;
