USE ams_db;

-- 1. Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id varchar(50) NOT NULL,
  user_id int(11) DEFAULT NULL,
  rent_application_id int(11) DEFAULT NULL,
  base_rent decimal(10,2) NOT NULL DEFAULT 0.00,
  water decimal(10,2) NOT NULL DEFAULT 0.00,
  electricity decimal(10,2) NOT NULL DEFAULT 0.00,
  parking decimal(10,2) NOT NULL DEFAULT 0.00,
  total_amount decimal(10,2) NOT NULL DEFAULT 0.00,
  payment_method varchar(50) DEFAULT NULL,
  billing_period varchar(50) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  paid_at timestamp NULL DEFAULT NULL,
  due_date date DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_invoice_user (user_id),
  KEY fk_invoice_rent_app (rent_application_id),
  CONSTRAINT fk_invoice_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_invoice_rent_app FOREIGN KEY (rent_application_id) REFERENCES rent_applications (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Create lease_contracts table
CREATE TABLE IF NOT EXISTS lease_contracts (
  id varchar(50) NOT NULL,
  rent_application_id int(11) DEFAULT NULL,
  deposit_amount decimal(10,2) NOT NULL DEFAULT 0.00,
  lease_start date DEFAULT NULL,
  lease_end date DEFAULT NULL,
  status varchar(50) NOT NULL DEFAULT 'active',
  signed_lease_path varchar(255) DEFAULT NULL,
  notarized_lease_path varchar(255) DEFAULT NULL,
  eviction_status varchar(50) DEFAULT NULL,
  generated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_contract_rent_app (rent_application_id),
  CONSTRAINT fk_contract_rent_app FOREIGN KEY (rent_application_id) REFERENCES rent_applications (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
