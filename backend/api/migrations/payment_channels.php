<?php
require_once "../../config.php";
$c = $conn;
if ($c->connect_error) die('err');
$c->query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS checkout_session_id VARCHAR(100) DEFAULT NULL, ADD COLUMN IF NOT EXISTS payment_gateway VARCHAR(50) DEFAULT NULL;');
$c->query("INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES 
('payment_mode', 'sandbox'), 
('payment_sandbox_enabled', '1'), 
('paymongo_secret_key', ''), 
('paymongo_public_key', ''), 
('paymongo_webhook_secret', ''), 
('payment_ch_gcash_sandbox', '1'), 
('payment_ch_bank_sandbox', '1'), 
('payment_ch_qrph', '1'), 
('payment_ch_maya', '1'), 
('payment_ch_gcash_manual', '1'), 
('payment_ch_bank_manual', '1'), 
('payment_ch_in_person', '1')");
echo 'Done';
?>
