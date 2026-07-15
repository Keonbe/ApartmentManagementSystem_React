-- Priority 9: Data Integrity & Remaining Schema Fixes

-- 1. Add user_id to rent_applications
ALTER TABLE rent_applications
ADD COLUMN IF NOT EXISTS user_id INT DEFAULT NULL AFTER id,
ADD CONSTRAINT fk_rent_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- 2. Add status to parking_reservations
ALTER TABLE parking_reservations
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Pending' AFTER plate_number;

-- 3. Add archive columns to rent_applications if missing
ALTER TABLE rent_applications
ADD COLUMN IF NOT EXISTS archive_date DATE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS archive_reason VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS archive_notes TEXT DEFAULT NULL;

-- 4. Invoices and lease_contracts currently use VARCHAR ID. We will leave them for now but ensure we use a standard generator format in PHP for future inserts.
