-- Tenants can archive (hide) resolved notifications (archive_notification.php).
ALTER TABLE `notifications`
  ADD COLUMN IF NOT EXISTS `is_archived` tinyint(1) NOT NULL DEFAULT 0;
