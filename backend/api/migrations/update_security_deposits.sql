-- Migration: 3.9 Security Deposit Tracking Columns
-- Add columns to lease_contracts table if they do not exist

ALTER TABLE `lease_contracts` ADD COLUMN IF NOT EXISTS `deposit_status` VARCHAR(50) DEFAULT 'Held';
ALTER TABLE `lease_contracts` ADD COLUMN IF NOT EXISTS `damage_deduction` DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE `lease_contracts` ADD COLUMN IF NOT EXISTS `utility_deduction` DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE `lease_contracts` ADD COLUMN IF NOT EXISTS `refund_amount` DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE `lease_contracts` ADD COLUMN IF NOT EXISTS `refund_date` DATE DEFAULT NULL;
