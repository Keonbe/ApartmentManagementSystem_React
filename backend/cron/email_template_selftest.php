<?php
// Database- and SMTP-independent email template checks.
// Run: php backend/cron/email_template_selftest.php

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "Forbidden";
    exit;
}

require_once __DIR__ . '/../api/services/email_templates.php';

$templates = [
    'application submitted' => email_application_submitted_template('Tenant', 'APP-7', 'A'),
    'application approved' => email_application_approved_template('Tenant', 'A', 4000, '2026-10-06'),
    'application approved with move-in date' => email_application_approved_template('Tenant', 'A', 4000, '2026-10-06', '2026-10-15'),
    'application rejected' => email_application_decision_template('Tenant', 'A', 'Rejected', '<script>alert(1)</script>'),
    'move-in scheduled' => email_move_in_scheduled_template('Tenant', 'A', '2026-10-15'),
    'invoice' => email_invoice_template('Tenant', ['id' => 'INV-1', 'billing_period' => 'October 2026', 'due_date' => '2026-10-06', 'base_rent' => 4000, 'water' => 20, 'electricity' => 30, 'total_amount' => 4050]),
    'payment receipt' => email_payment_confirmation_template('Tenant', [['id' => 'INV-1', 'billing_period' => 'October 2026', 'total_amount' => 4050]], 'Cash', 'REF-1'),
    'payment reminder' => email_payment_reminder_template('Tenant', ['id' => 'INV-1', 'billing_period' => 'October 2026', 'due_date' => '2026-10-06', 'total_amount' => 4050]),
    'void notice' => email_bill_voided_template('Tenant', 'INV-1', 'Duplicate bill'),
    'proof rejection' => email_payment_proof_template('Tenant', 'ADV-1', 'Rejected', 'Incorrect proof', [['id' => 'INV-1', 'billing_period' => 'October 2026', 'total_amount' => 4050]]),
    'maintenance received' => email_maintenance_received_template('Tenant', 1, 'Plumbing', '2026-10-02'),
    'utility bill' => email_utility_invoice_template('Tenant', ['billing_period' => 'October 2026', 'water' => 20, 'electricity' => 30, 'total_amount' => 50, 'due_date' => '2026-10-06'], ['water_consumption' => 2, 'water_amount' => 18, 'water_other_fees' => 2, 'electric_consumption' => 3, 'electric_amount' => 28, 'electric_other_fees' => 2]),
];

$failures = [];
foreach ($templates as $name => $html) {
    if (!str_contains($html, 'Apartment Management System') || !str_contains($html, '<html>')) {
        $failures[] = "$name: missing email document wrapper";
    }
}
if (strpos($templates['application rejected'], '<script>alert(1)</script>') !== false
    || strpos($templates['application rejected'], '&lt;script&gt;alert(1)&lt;/script&gt;') === false) {
    $failures[] = 'rejection reason was not HTML-escaped';
}
if (strpos($templates['application approved with move-in date'], 'October 15, 2026') === false) {
    $failures[] = 'approval template did not render the scheduled move-in date';
}
if (strpos($templates['utility bill'], '2.00 m³') === false || strpos($templates['utility bill'], '3.00 kWh') === false) {
    $failures[] = 'utility consumption breakdown is missing';
}

if ($failures) {
    fwrite(STDERR, implode("\n", $failures) . "\n");
    exit(1);
}

echo count($templates) . " templates rendered; wrapper, escaping, move-in date, and utility breakdown checks passed.\n";