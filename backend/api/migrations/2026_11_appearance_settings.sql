-- ===== glass_theme_settings =====
-- Tenant-side Glass theme backdrop (Admin -> Other Settings -> Glass Mode).
-- glass_bg_image: '' = the built-in apartment photo, else a site_assets/glass_bg_*
-- upload (upload_glass_background.php). Overlay 0-95 %, blur 0-20 px, tint
-- #rrggbb; update_system_settings.php enforces the same ranges.
--
-- ===== home_page_content =====
-- Home page text (Admin -> Other Settings -> Home Page): badge, heading,
-- location and description, each with a show switch and English / Filipino
-- text ('' = the app's own wording). Shape checked by normalize_home_content().
--
-- Idempotent: an existing row (a value the admin already saved) is kept.

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('glass_bg_image', ''),
('glass_overlay_opacity', '78'),
('glass_blur', '0'),
('glass_tint', '#0f172a'),
('home_content', '{"badge":{"show":true,"en":"","fil":""},"heading":{"show":true,"en":"","fil":""},"location":{"show":true,"en":"","fil":""},"description":{"show":true,"en":"","fil":""}}');
