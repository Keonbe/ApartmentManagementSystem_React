-- Move-in lifecycle backfill (after 2026_09_application_move_in_lifecycle.sql).
-- Before that lifecycle, paying the move-in invoice left a moved-in tenant's
-- application 'Approved'. Now 'Approved' means "not moved in yet" and only
-- 'active' grants the tenant pages, so an Approved application whose unit is
-- already occupied by that applicant is an existing tenancy: mark it 'active'
-- and record its move-in date from the room's lease start. Idempotent.
UPDATE rent_applications ra
JOIN rooms r ON r.id = ra.room_name
SET ra.status = 'active',
    ra.move_in_date = COALESCE(ra.move_in_date, r.lease_start)
WHERE ra.status = 'Approved'
  AND r.status = 'occupied'
  AND r.tenant_name = CONCAT(ra.first_name, ' ', ra.last_name);
