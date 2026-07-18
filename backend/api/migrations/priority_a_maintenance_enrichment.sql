-- Priority A: Admin Maintenance & Services DB Wiring
-- Adds enrichment columns to maintenance_requests for admin tracking

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(100) DEFAULT NULL AFTER status,
  ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(10,2) DEFAULT NULL AFTER assigned_to,
  ADD COLUMN IF NOT EXISTS work_notes TEXT DEFAULT NULL AFTER estimated_cost,
  ADD COLUMN IF NOT EXISTS tenant_responsible TINYINT(1) DEFAULT 0 AFTER work_notes;
