-- ─────────────────────────────────────────────────────────────────────────────
--  Keep Semaphore's answer on each SMS log row
--  POST /messages returns a message_id and a status (Queued / Pending / Sent /
--  Failed / Refunded) per recipient. 'sent' in notification_log only means the
--  provider accepted the message; the id is what traces it to actual delivery.
--  Idempotent: safe to re-run. Mirrored into SetupDB.sql.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `notification_log`
    ADD COLUMN IF NOT EXISTS `provider_message_id` varchar(64) DEFAULT NULL COMMENT 'Semaphore message_id' AFTER `error_message`,
    ADD COLUMN IF NOT EXISTS `provider_status` varchar(20) DEFAULT NULL COMMENT 'status Semaphore returned at send time' AFTER `provider_message_id`,
    ADD INDEX IF NOT EXISTS `idx_log_provider_msg` (`provider_message_id`);
