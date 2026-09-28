-- Approval, payment, and actual occupancy are separate lifecycle events.
ALTER TABLE rent_applications
  ADD COLUMN IF NOT EXISTS preferred_move_in_date date DEFAULT NULL AFTER months_of_rent,
  ADD COLUMN IF NOT EXISTS move_in_date date DEFAULT NULL AFTER preferred_move_in_date,
  ADD COLUMN IF NOT EXISTS move_in_notified_at datetime DEFAULT NULL AFTER move_in_date,
  ADD COLUMN IF NOT EXISTS cancelled_at datetime DEFAULT NULL AFTER rejection_reason;
