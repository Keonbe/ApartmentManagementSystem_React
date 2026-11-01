-- ===== preview_page_hero =====
-- Preview page hero (Admin -> Other Settings -> Preview Page): photo ('' =
-- built-in, else a site_assets/preview_hero_* upload from
-- upload_preview_image.php), badge / title / location each with a show switch
-- and English / Filipino text ('' = the app's own wording), and the feature
-- chips. Shape checked by normalize_preview_hero() in config.php.
--
-- ===== contract_end =====
-- Admin -> Other Settings -> Contract End. extension_deadline_days: tenants may
-- request an extension until this many days before the rent ends (0 = no
-- deadline). The rent-end reminder can be switched off, and its email / SMS
-- separately ('1' / '0'). upcoming_rooms_enabled: Preview lists units that
-- will free up. lease_end_reminder_days already exists (default 30).
--
-- Idempotent: an existing row (a value the admin already saved) is kept.

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('preview_hero', '{"image":"","badge":{"show":true,"en":"","fil":""},"title":{"show":true,"en":"","fil":""},"location":{"show":true,"en":"","fil":""},"features":[{"en":"Motorcycle Parking","fil":"Paradahan ng Motor"},{"en":"Bathroom per Room","fil":"Banyo sa Bawat Kwarto"}]}'),
('extension_deadline_days', '0'),
('lease_end_reminders_enabled', '1'),
('lease_end_reminder_email', '1'),
('lease_end_reminder_sms', '1'),
('upcoming_rooms_enabled', '1');
