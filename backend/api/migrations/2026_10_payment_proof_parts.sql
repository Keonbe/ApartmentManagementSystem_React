-- Tenant split payments: the portions a tenant submitted with their proofs,
-- kept until the admin confirms (settle -> payment_transactions) or rejects.
-- payment_key is an invoice id or a payment group id (ADV-/BND-), so it has no
-- foreign key; the rows are removed when the proof is rejected or settled.

CREATE TABLE IF NOT EXISTS `payment_proof_parts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `payment_key` varchar(50) NOT NULL,
  `position` tinyint(4) NOT NULL DEFAULT 0,
  `method` varchar(20) NOT NULL,
  `bank_name` varchar(100) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `proof_path` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payment_proof_parts_key` (`payment_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
