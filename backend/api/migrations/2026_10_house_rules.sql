CREATE TABLE IF NOT EXISTS house_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  is_highlight TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO house_rules (category, title, description, is_highlight, sort_order) VALUES
('Quiet Hours', 'Respect quiet hours', 'Please keep noise to a minimum between 10:00 PM and 7:00 AM so all residents can rest.', 1, 10),
('Care of Premises', 'Smoke-free indoor areas', 'Smoking is not permitted inside rooms or any enclosed indoor common areas. Please keep the premises clean and report damage promptly.', 1, 20),
('Visitors & Guests', 'Register your visitors', 'All visitors must be registered with apartment management and follow building access and safety procedures.', 0, 30),
('Payment Terms', 'Pay rent on time', 'Monthly rent is due on the agreed due date. Please contact management promptly if you have a question about your payment.', 1, 40);