-- ============================================================
-- Migration: utility_audit_fixes.sql
-- Fixes: #1 billing_period normalization, #5 user_id FK,
--        #6 invoices.billing_period index, #7 room_name FK
-- ============================================================

-- #1: Normalize old "Month YYYY" billing_period values to "YYYY-MM"
UPDATE invoices
SET billing_period = DATE_FORMAT(
    STR_TO_DATE(CONCAT('01 ', billing_period), '%d %M %Y'),
    '%Y-%m'
)
WHERE billing_period REGEXP '^[A-Za-z]';

-- #6: Shrink billing_period to VARCHAR(7) and add index
ALTER TABLE invoices MODIFY COLUMN billing_period VARCHAR(7) NOT NULL;
CREATE INDEX idx_invoices_billing_period ON invoices(billing_period);
CREATE INDEX idx_invoices_user_period ON invoices(user_id, billing_period);

-- #5: FK on utility_readings.user_id (safe — column is already nullable)
ALTER TABLE utility_readings
    ADD CONSTRAINT fk_ur_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- #7: FK on utility_readings.room_name → rooms.id
-- Only safe to add if all existing room_name values exist in rooms.id
-- Run this manually after verifying: SELECT DISTINCT room_name FROM utility_readings WHERE room_name NOT IN (SELECT id FROM rooms);
-- ALTER TABLE utility_readings
--     ADD CONSTRAINT fk_ur_room
--     FOREIGN KEY (room_name) REFERENCES rooms(id);
