-- Tenant-side Glass theme backdrop (Admin -> Other Settings -> Glass Mode).
-- glass_bg_image: '' = the built-in apartment photo, else a site_assets/glass_bg_*
-- upload (upload_glass_background.php). Overlay 0-95 %, blur 0-20 px, tint
-- #rrggbb; update_system_settings.php enforces the same ranges. Idempotent.

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('glass_bg_image', ''),
('glass_overlay_opacity', '78'),
('glass_blur', '0'),
('glass_tint', '#0f172a');
