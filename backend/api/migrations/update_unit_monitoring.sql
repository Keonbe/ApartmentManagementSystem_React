-- Migration: 2.4 Unit Status Monitoring Attributes
-- Add columns to rooms table if they do not exist

ALTER TABLE `rooms` ADD COLUMN IF NOT EXISTS `room_condition` VARCHAR(100) DEFAULT 'Good';
ALTER TABLE `rooms` ADD COLUMN IF NOT EXISTS `furnishing_status` VARCHAR(50) DEFAULT 'Unfurnished';
ALTER TABLE `rooms` ADD COLUMN IF NOT EXISTS `last_inspection_date` DATE DEFAULT NULL;
