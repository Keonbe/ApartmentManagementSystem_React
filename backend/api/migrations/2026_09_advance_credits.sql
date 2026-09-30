-- ============================================================
-- Advance payments as monthly credits (panel feedback 2026-09-28) — idempotent
-- migration for existing databases.
--
-- An advance payment is now one "advance rent" invoice the tenant pays. Each
-- month it covers becomes a row in advance_credits. The daily sweep still
-- issues every month's rent invoice on its usual date and settles it from the
-- credit, so each month gets its own invoice and receipt when it comes up,
-- instead of all months being billed on the day of the advance payment.
--
--   invoices.advance_months   number of months an advance-rent invoice covers
--                             (NULL on every other invoice)
--   advance_credits.status    reserved   advance invoice not paid yet
--                             available  paid, waiting for its month
--                             applied    month billed and settled from it
--                             cancelled  advance cancelled or expired
--                             refund-due tenant moved out before the month
--   credit_key                period_start, except NULL once cancelled, so a
--                             month can be credited only once at a time
--
-- Run: mysql -u root ams_db < backend/api/migrations/2026_09_advance_credits.sql
-- ============================================================

ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `advance_months` tinyint(4) DEFAULT NULL AFTER `payment_group`;

CREATE TABLE IF NOT EXISTS `advance_credits` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `advance_invoice_id` varchar(50) NOT NULL,
  `user_id` int(11) NOT NULL,
  `rent_application_id` int(11) DEFAULT NULL,
  `period_start` date NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('reserved','available','applied','cancelled','refund-due') NOT NULL DEFAULT 'reserved',
  `credit_key` date GENERATED ALWAYS AS (IF(`status` = 'cancelled', NULL, `period_start`)) STORED,
  `applied_invoice_id` varchar(50) DEFAULT NULL,
  `applied_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_advance_credit_period` (`user_id`, `credit_key`),
  KEY `idx_advance_credit_invoice` (`advance_invoice_id`),
  CONSTRAINT `fk_advance_credit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_advance_credit_invoice` FOREIGN KEY (`advance_invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
