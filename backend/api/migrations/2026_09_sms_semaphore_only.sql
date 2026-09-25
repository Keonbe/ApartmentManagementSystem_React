-- ─────────────────────────────────────────────────────────────────────────────
--  Semaphore is the only SMS provider
--  The Twilio / Vonage / Movider / iTexMo drivers were never built (stubs that
--  always failed); they are removed, with their credential settings.
--  Idempotent: safe to re-run. Mirrored into SetupDB.sql (keys no longer seeded).
-- ─────────────────────────────────────────────────────────────────────────────

-- A building left on a removed provider falls back to the dry run.
UPDATE `system_settings` SET `setting_value` = 'log'
WHERE `setting_key` = 'sms_provider' AND `setting_value` NOT IN ('log', 'semaphore');

DELETE FROM `system_settings`
WHERE `setting_key` IN (
    'sms_twilio_sid', 'sms_twilio_auth_token', 'sms_twilio_from_number',
    'sms_vonage_api_key', 'sms_vonage_api_secret',
    'sms_movider_api_key', 'sms_movider_api_secret',
    'sms_itexmo_api_code', 'sms_itexmo_password'
);
