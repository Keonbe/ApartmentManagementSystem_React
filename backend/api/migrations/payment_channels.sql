ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS scheduled_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scheduled_time_slot VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS checkout_session_id VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_gateway VARCHAR(50) DEFAULT NULL;

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('payment_mode', 'both'),
('payment_sandbox_enabled', '0'),
('payment_ch_gcash_sandbox', '1'),
('payment_ch_bank_sandbox', '1'),
('payment_ch_qrph', '1'),
('payment_ch_maya', '1'),
('payment_ch_gcash_manual', '1'),
('payment_ch_bank_manual', '1'),
('payment_ch_in_person', '1');
