-- ============================================================
-- 2026_10_checkout_payment_intent.sql
-- The PayMongo payment intent behind an invoice's open checkout session.
-- A payment.failed webhook carries a payment (with payment_intent_id), not
-- the checkout session id, so paymongo_webhook.php matches failed events by
-- this column (audit N-10a). Set by create_checkout_session.php, cleared
-- with checkout_session_id. Idempotent (information_schema guard).
-- ============================================================

SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'checkout_payment_intent_id') = 0,
  'ALTER TABLE `invoices` ADD COLUMN `checkout_payment_intent_id` varchar(100) DEFAULT NULL AFTER `checkout_session_id`', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'invoices' AND index_name = 'idx_invoices_checkout_intent') = 0,
  'ALTER TABLE `invoices` ADD INDEX `idx_invoices_checkout_intent` (`checkout_payment_intent_id`)', 'DO 0');
PREPARE ams_stmt FROM @s; EXECUTE ams_stmt; DEALLOCATE PREPARE ams_stmt;
