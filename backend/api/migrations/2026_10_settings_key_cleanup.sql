-- Settings keys: one name per setting. SetupDB.sql used to seed five settings
-- under camelCase names while the Settings page saves snake_case ones, so the
-- database held two copies and any reader of the camelCase copy saw a value
-- frozen at install time (extend_lease.php read minLeaseDuration). Copy each
-- camelCase value across only when the snake_case row is missing (an existing
-- snake_case row is the live, admin-edited value), then delete the camelCase
-- row. autoFlagEviction is dropped in both spellings: the toggle was never
-- wired to anything and has been removed. Idempotent.

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'min_lease_duration', `setting_value` FROM `system_settings` WHERE `setting_key` = 'minLeaseDuration';

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'overdue_threshold_days', `setting_value` FROM `system_settings` WHERE `setting_key` = 'overdueThresholdDays';

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'maintenance_monthly_budget', `setting_value` FROM `system_settings` WHERE `setting_key` = 'maintenanceMonthlyBudget';

-- The seeded clause was stored wrapped in literal double quotes.
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'tenant_responsibility_clause', TRIM(BOTH '"' FROM `setting_value`) FROM `system_settings` WHERE `setting_key` = 'tenantResponsibilityClause';

UPDATE `system_settings`
   SET `setting_value` = TRIM(BOTH '"' FROM `setting_value`)
 WHERE `setting_key` = 'tenant_responsibility_clause' AND `setting_value` LIKE '"%"';

DELETE FROM `system_settings`
 WHERE `setting_key` IN ('minLeaseDuration', 'overdueThresholdDays', 'maintenanceMonthlyBudget',
                         'tenantResponsibilityClause', 'autoFlagEviction', 'auto_flag_eviction');
