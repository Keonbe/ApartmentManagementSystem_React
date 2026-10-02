-- Wording: AMS handles rent, not leases, so stored text a user reads says
-- "rent". Schema, column and key names (lease_contracts, lease_end,
-- minLeaseDuration) are unchanged. Idempotent: each UPDATE only matches the
-- old wording.

-- The default tenant-responsibility clause, only while it is still the shipped
-- default (an admin-edited clause is left alone).
UPDATE `system_settings`
   SET `setting_value` = REPLACE(REPLACE(`setting_value`, 'this lease agreement', 'this rent agreement'), 'the leased unit', 'the rented unit')
 WHERE `setting_key` = 'tenantResponsibilityClause'
   AND `setting_value` = '"Per the Terms & Conditions of this lease agreement, the Tenant shall be responsible for any damage or maintenance issues caused by negligence, misuse, or unauthorized modifications to the leased unit. Costs for such repairs will be billed directly to the Tenant and are excluded from the building''s maintenance budget allocation."';

-- The archive reason the Tenants page offered by default.
UPDATE `rent_applications` SET `archive_reason` = 'End of Rent Term' WHERE `archive_reason` = 'End of Lease';
