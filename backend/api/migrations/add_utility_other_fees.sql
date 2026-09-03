-- Add Other Fees to Utility Readings

ALTER TABLE utility_readings
ADD COLUMN IF NOT EXISTS water_other_fees DECIMAL(10,2) DEFAULT 0.00 AFTER water_amount,
ADD COLUMN IF NOT EXISTS electric_other_fees DECIMAL(10,2) DEFAULT 0.00 AFTER electric_amount;
