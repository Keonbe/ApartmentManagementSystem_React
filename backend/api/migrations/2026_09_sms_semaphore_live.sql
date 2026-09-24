-- ─────────────────────────────────────────────────────────────────────────────
--  Live Semaphore SMS driver — settings it needs
--  Follows 2026_09_sms_email_channels.sql, which created every other SMS key.
--  Idempotent: INSERT IGNORE, safe to re-run. Mirrored into SetupDB.sql.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
-- Semaphore delivers under the shared 'SEMAPHORE' sender until a custom sender
-- name is approved (1-3 business days). Posting an unapproved sendername gets
-- the message rejected, so the driver omits the field until this says '1'.
('sms_sender_approved', '0'),
-- Spend guard. Maximum SMS *sent* per calendar day, counted from
-- notification_log; further sends are logged 'skipped' rather than billed.
-- '0' disables the cap.
('sms_daily_cap', '100');
