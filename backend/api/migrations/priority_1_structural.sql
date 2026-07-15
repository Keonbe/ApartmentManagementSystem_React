USE ams_db;

-- 1. Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id varchar(50) NOT NULL,
  type varchar(50) NOT NULL,
  floor varchar(50) NOT NULL,
  monthly_rent decimal(10,2) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'vacant',
  tenant_name varchar(100) DEFAULT NULL,
  lease_start date DEFAULT NULL,
  lease_end date DEFAULT NULL,
  last_tenant varchar(100) DEFAULT NULL,
  maintenance_flag tinyint(1) NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Insert initial hardcoded unit data
INSERT IGNORE INTO rooms (id, type, floor, monthly_rent, status, tenant_name, lease_start, lease_end, last_tenant, maintenance_flag) VALUES
('A', 'Studio', '1F', 6500, 'occupied', 'Maria Santos', '2024-06-01', '2025-06-01', NULL, 0),
('B', 'Studio', '1F', 6500, 'occupied', 'Jose Reyes', '2024-07-15', '2025-07-15', NULL, 0),
('C', '1BR', '1F', 7500, 'occupied', 'Ana Garcia', '2024-05-01', '2025-05-01', NULL, 0),
('D', 'Studio', '2F', 6500, 'vacant', NULL, NULL, NULL, 'Carlos Mendoza', 0),
('E', 'Studio', '2F', 6500, 'occupied', 'Pedro Cruz', '2024-03-01', '2025-03-01', NULL, 0),
('F', '1BR', '2F', 7500, 'occupied', 'Rosa Dela Cruz', '2024-08-01', '2025-08-01', NULL, 1),
('G', 'Studio', '3F', 6500, 'occupied', 'Ben Flores', '2024-04-15', '2025-04-15', NULL, 1),
('H', 'Studio', '3F', 6500, 'occupied', 'Lita Ramos', '2024-01-01', '2025-01-01', 'Roberto Tan', 0),
('I', '1BR', '3F', 7500, 'occupied', 'Dante Abad', '2024-05-01', '2025-05-01', NULL, 0),
('J', 'Studio', '4F', 6500, 'occupied', 'Gloria Tan', '2024-09-01', '2025-09-01', NULL, 0),
('K', 'Studio', '4F', 6500, 'occupied', 'Ramon Lim', '2024-02-01', '2025-02-01', NULL, 0),
('L', '1BR', '4F', 7500, 'occupied', 'Cora Santos', '2024-10-01', '2025-10-01', NULL, 0),
('M', 'Studio', '5F', 6500, 'vacant', NULL, NULL, NULL, NULL, 0),
('N', '1BR', '5F', 7500, 'occupied', 'Nilo Ocampo', '2024-11-01', '2025-11-01', NULL, 0);

-- 3. Add user_id FK columns
ALTER TABLE maintenance_requests 
ADD COLUMN user_id int(11) DEFAULT NULL AFTER id,
ADD CONSTRAINT fk_maintenance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE cctv_requests 
ADD COLUMN user_id int(11) DEFAULT NULL AFTER id,
ADD CONSTRAINT fk_cctv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE parking_reservations 
ADD COLUMN user_id int(11) DEFAULT NULL AFTER id,
ADD CONSTRAINT fk_parking_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 4. Add FK from rent_applications to rooms
ALTER TABLE rent_applications 
ADD CONSTRAINT fk_rent_room FOREIGN KEY (room_name) REFERENCES rooms(id) ON DELETE RESTRICT;
