-- Support attaching images or documents when rejecting an application or revoking approval.
ALTER TABLE `rent_applications`
  ADD COLUMN IF NOT EXISTS `rejection_attachment_path` varchar(255) DEFAULT NULL AFTER `rejection_reason`;

ALTER TABLE `notifications`
  ADD COLUMN IF NOT EXISTS `attachment_path` varchar(255) DEFAULT NULL AFTER `metadata_value`;
