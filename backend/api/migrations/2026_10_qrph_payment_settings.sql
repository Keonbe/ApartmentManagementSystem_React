-- QR Ph static payment option with 5 admin QR code slots and active selection.
-- Idempotent.

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('payment_ch_qrph_manual', '1'),
('qrph_active_slot', '1'),
('qrph_slots', '[{"slot":1,"label":"QR Ph Slot 1","image_path":"","account_name":"","account_number":""},{"slot":2,"label":"QR Ph Slot 2","image_path":"","account_name":"","account_number":""},{"slot":3,"label":"QR Ph Slot 3","image_path":"","account_name":"","account_number":""},{"slot":4,"label":"QR Ph Slot 4","image_path":"","account_name":"","account_number":""},{"slot":5,"label":"QR Ph Slot 5","image_path":"","account_name":"","account_number":""}]');

