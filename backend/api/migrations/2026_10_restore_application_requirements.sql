-- Restore default application requirements
INSERT INTO `application_requirements` (`id`, `label`, `label_fil`, `is_required`, `is_active`, `sort_order`) VALUES
(1, 'Valid ID (front)', 'Valid ID (harap)', 1, 1, 1),
(2, 'Valid ID (back)', 'Valid ID (likod)', 1, 1, 2),
(3, 'NBI Clearance', 'NBI Clearance', 0, 1, 3)
ON DUPLICATE KEY UPDATE label=VALUES(label), is_active=1;

-- Link any existing orphaned application documents back to their requirement definition
UPDATE application_documents SET requirement_id = 1 WHERE label_snapshot = 'Valid ID (front)' AND requirement_id IS NULL;
UPDATE application_documents SET requirement_id = 2 WHERE label_snapshot = 'Valid ID (back)' AND requirement_id IS NULL;
UPDATE application_documents SET requirement_id = 3 WHERE label_snapshot = 'NBI Clearance' AND requirement_id IS NULL;

