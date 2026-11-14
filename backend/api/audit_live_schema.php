<?php
/**
 * Read-only schema audit for the configured AMS database.
 * Run from the command line: php backend/api/audit_live_schema.php
 * This script only queries INFORMATION_SCHEMA; it never changes the database.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}

require_once __DIR__ . '/../config.php';

$expectedTables = [
    'application_requirements',
    'application_documents',
    'deposit_deductions',
];

// Migration-derived candidates from the repository schema audit. These are
// checked for presence only; the audit does not infer or apply column types.
$expectedColumns = [
    'notifications' => [
        'status', 'audience', 'metadata_value', 'attachment_path', 'is_archived',
    ],
    'inquiries' => [
        'status', 'thread_type', 'guest_token', 'guest_name', 'guest_email',
        'guest_phone', 'unit_of_interest',
    ],
    'rooms' => [
        'room_name', 'available_date', 'rent_is_custom', 'archived_at', 'archived_by',
        'gallery',
    ],
    'maintenance_requests' => [
        'room_name', 'title', 'acknowledged_at', 'started_at', 'resolved_at',
        'actual_cost', 'rejection_reason', 'is_invoiced', 'invoice_id', 'billing_period',
    ],
    'invoices' => [
        'services', 'amount_paid', 'proof_amount', 'last_reminder_date',
        'reminder_count', 'late_fee', 'late_fee_waived', 'maintenance',
        'checkout_payment_intent_id', 'processing_since', 'rent_period_start',
        'rent_period_key', 'payment_group', 'advance_months', 'bank_name',
    ],
    'rent_applications' => [
        'previous_address', 'pre_archive_status', 'terms_agreed_at',
        'documents_verified_at',
    ],
    'password_resets' => ['used'],
    'guest_messages' => [
        'thread_id', 'file_path', 'file_name', 'file_type', 'attachment_path',
        'reply_to_id', 'is_read',
    ],
    'messages' => ['attachment_path', 'reply_to_id'],
    'lease_contracts' => [
        'template_version_id', 'tenant_signature_path', 'owner_signature_path',
    ],
    'utility_readings' => ['entry_mode', 'total_amount', 'bill_file_path'],
    'advance_credits' => ['refund_request_id'],
    'house_rules' => ['title_fil', 'description_fil', 'scope'],
    'household_members' => ['age', 'age_category'],
    'notification_log' => ['provider_message_id', 'provider_status'],
    'users' => ['sms_consent_at', 'terms_agreed_at', 'terms_version'],
];

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_COLUMN,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    $tableQuery = $pdo->prepare(
        'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table_name'
    );
    $columnQuery = $pdo->prepare(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table_name AND COLUMN_NAME = :column_name'
    );

    $missingTables = [];
    foreach ($expectedTables as $table) {
        $tableQuery->execute(['schema' => DB_NAME, 'table_name' => $table]);
        if ($tableQuery->fetchColumn() === false) {
            $missingTables[] = $table;
        }
    }

    $missingColumns = [];
    foreach ($expectedColumns as $table => $columns) {
        foreach ($columns as $column) {
            $columnQuery->execute([
                'schema' => DB_NAME,
                'table_name' => $table,
                'column_name' => $column,
            ]);
            if ($columnQuery->fetchColumn() === false) {
                $missingColumns[] = $table . '.' . $column;
            }
        }
    }

    echo "Read-only schema audit for database: " . DB_NAME . PHP_EOL;
    echo "Missing tables:" . PHP_EOL;
    if ($missingTables) {
        foreach ($missingTables as $table) {
            echo "  - " . $table . PHP_EOL;
        }
    } else {
        echo "  (none)" . PHP_EOL;
    }

    echo "Missing columns:" . PHP_EOL;
    if ($missingColumns) {
        foreach ($missingColumns as $column) {
            echo "  - " . $column . PHP_EOL;
        }
    } else {
        echo "  (none)" . PHP_EOL;
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'Schema audit failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}