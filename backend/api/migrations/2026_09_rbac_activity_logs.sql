-- ============================================================
-- Role-based access & activity log (checklist 8.6 / Module 11) — idempotent
-- migration for existing databases. A fresh SetupDB.sql import does not need it.
--
-- 1. login_attempts used to be created by login.php on every request. It now
--    lives in SetupDB.sql, with an (email, attempt_time) index for the new
--    per-account lockout.
-- 2. activity_logs.category values are folded into the twelve categories in
--    LOG_CATEGORIES (backend/config.php). Call sites historically wrote
--    'payment', 'invoice', 'User Management', 'Tenant Management', 'application',
--    and so on, so the Activity Log page's filters matched almost nothing.
--    log_activity() now normalises new rows; this fixes the existing ones.
--
-- Run: mysql -u root ams_db < backend/api/migrations/2026_09_rbac_activity_logs.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip_address` varchar(45) NOT NULL,
  `email` varchar(255) NOT NULL,
  `attempt_time` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ip_address` (`ip_address`,`attempt_time`),
  KEY `email_time` (`email`,`attempt_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `login_attempts` ADD INDEX IF NOT EXISTS `email_time` (`email`, `attempt_time`);

-- 3. visitor_logs.id_photo_path was written by check_in_visitor.php and read by
--    get_visitors.php but never existed in the schema, so every visitor
--    check-in — admin walk-in or tenant pre-registration — failed with a fatal
--    error at the INSERT (found while verifying the visitor ownership fix).
ALTER TABLE `visitor_logs` ADD COLUMN IF NOT EXISTS `id_photo_path` varchar(255) DEFAULT NULL AFTER `id_number`;

UPDATE `activity_logs` SET `category` = CASE LOWER(TRIM(`category`))
    WHEN 'payment' THEN 'billing' WHEN 'invoice' THEN 'billing' WHEN 'billing' THEN 'billing'
    WHEN 'user management' THEN 'user' WHEN 'user' THEN 'user'
    WHEN 'tenant management' THEN 'tenant' WHEN 'application' THEN 'tenant' WHEN 'rent_application' THEN 'tenant' WHEN 'tenant' THEN 'tenant'
    WHEN 'contract' THEN 'contract' WHEN 'document' THEN 'contract' WHEN 'lease' THEN 'contract'
    WHEN 'unit' THEN 'unit' WHEN 'room' THEN 'unit'
    WHEN 'utilities' THEN 'utilities' WHEN 'utility' THEN 'utilities'
    WHEN 'maintenance' THEN 'maintenance'
    WHEN 'service' THEN 'service' WHEN 'cctv' THEN 'service' WHEN 'parking' THEN 'service' WHEN 'visitor' THEN 'service'
    WHEN 'inquiry' THEN 'inquiry' WHEN 'reservation' THEN 'inquiry'
    WHEN 'communication' THEN 'communication' WHEN 'announcement' THEN 'communication' WHEN 'notification' THEN 'communication'
    WHEN 'auth' THEN 'auth' WHEN 'security' THEN 'auth' WHEN 'login' THEN 'auth'
    ELSE 'system'
END;
