-- Admin-editable lease contract (Admin → Edit Contract). Every save appends a
-- version; the highest version is the one in force. `content` is the JSON
-- document built by contract_template_sanitize() in backend/contract_template.php:
-- landlord details, payment accounts, custom variables and the bilingual
-- sections/clauses. Until the first save the built-in default is served, and
-- it is written here as version 1 the first time a contract pins it.
CREATE TABLE IF NOT EXISTS `contract_template_versions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `version` int(11) NOT NULL,
  `content` longtext NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_template_version` (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- The terms a contract was issued under. Landlord details and payment
-- accounts are always read from the latest version (a changed GCash number
-- must reach existing tenants); the sections and clauses come from this one.
-- NULL = issued before templates existed, shown with the latest terms.
ALTER TABLE `lease_contracts` ADD COLUMN IF NOT EXISTS `template_version_id` int(11) DEFAULT NULL AFTER `notarized_lease_path`;
