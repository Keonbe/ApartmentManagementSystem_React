-- ============================================================
-- Unit showcase images — admin-uploaded interior/exterior photos per room,
-- shown on the guest-facing Preview page's "View Layout" gallery. The
-- button hides entirely on rooms with no images (unless the admin has
-- selected the generic floor_plan fallback in system_settings).
--
-- Stores a JSON array of relative paths under backend/room_images/, a new
-- PUBLIC directory (not backend/uploads/, which is blanket-denied at the
-- webserver level and gated behind download_file.php's owner check —
-- showcase photos have no owner and must be visible to logged-out guests).
--
-- Run: mysql -u root ams_db < backend/api/migrations/2026_09_room_gallery.sql
-- ============================================================

ALTER TABLE `rooms` ADD COLUMN IF NOT EXISTS `gallery` JSON DEFAULT NULL AFTER `last_inspection_date`;
