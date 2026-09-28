-- Panel feedback (Module 12): every visit now records when the visitor is
-- expected to leave. Informational only — overstay still uses the global
-- visitor_overstay_hours setting. Nullable so rows logged before this change
-- stay valid; check_in_visitor.php requires it on every new row.
ALTER TABLE `visitor_logs` ADD COLUMN IF NOT EXISTS `expected_check_out_at` datetime DEFAULT NULL AFTER `expected_at`;
