-- Preserve room records and tenancy/history references when an admin removes
-- a unit from active listings. Archived rooms remain available for audit.
ALTER TABLE `rooms`
  ADD COLUMN IF NOT EXISTS `archived_at` datetime DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `archived_by` int(11) DEFAULT NULL;