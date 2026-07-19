-- Priority 10: Payments Proof Upload Fields
-- Adds columns to track payment references and image proofs for digital payments

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS proof_of_payment_path VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS sender_name VARCHAR(150) DEFAULT NULL;
