<?php
/**
 * Apply the confirmed additive-only schema patch to the configured AMS database.
 * Run from the command line: php backend/api/apply_live_schema_fix.php
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}

require_once __DIR__ . '/../config.php';

$columnsToAdd = [
    'notifications' => [
        'metadata_value' => 'varchar(255) DEFAULT NULL',
        'attachment_path' => 'varchar(255) DEFAULT NULL',
        'is_archived' => 'tinyint(1) NOT NULL DEFAULT 0',
    ],
    // Requested in the live-schema audit. Note: rooms.id is the canonical room
    // identifier in SetupDB.sql; this nullable column is added only if absent.
    'rooms' => [
        'room_name' => 'varchar(50) DEFAULT NULL',
    ],
    'maintenance_requests' => [
        'title' => 'varchar(150) DEFAULT NULL',
        'acknowledged_at' => 'datetime DEFAULT NULL',
        'started_at' => 'datetime DEFAULT NULL',
        'resolved_at' => 'datetime DEFAULT NULL',
        'actual_cost' => 'decimal(10,2) DEFAULT NULL',
        'rejection_reason' => 'varchar(255) DEFAULT NULL',
        'is_invoiced' => 'tinyint(1) NOT NULL DEFAULT 0',
        'invoice_id' => 'varchar(50) DEFAULT NULL',
        'billing_period' => 'varchar(50) DEFAULT NULL',
    ],
    'invoices' => [
        'last_reminder_date' => 'date DEFAULT NULL',
        'reminder_count' => 'int(11) NOT NULL DEFAULT 0',
        'late_fee' => 'decimal(10,2) NOT NULL DEFAULT 0.00',
        'late_fee_waived' => 'tinyint(1) NOT NULL DEFAULT 0',
        'maintenance' => 'decimal(10,2) NOT NULL DEFAULT 0.00',
    ],
];

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $tableQuery = $pdo->prepare(
        'SELECT 1 FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table_name'
    );
    $columnQuery = $pdo->prepare(
        'SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table_name AND COLUMN_NAME = :column_name'
    );

    foreach ($columnsToAdd as $table => $columns) {
        $tableQuery->execute(['schema' => DB_NAME, 'table_name' => $table]);
        if ($tableQuery->fetchColumn() === false) {
            throw new RuntimeException("Required table is missing: {$table}");
        }

        foreach ($columns as $column => $definition) {
            $columnQuery->execute([
                'schema' => DB_NAME,
                'table_name' => $table,
                'column_name' => $column,
            ]);
            if ($columnQuery->fetchColumn() !== false) {
                continue;
            }

            // Table/column names and definitions come only from the static
            // allowlist above; values used in schema checks are parameterized.
            $sql = sprintf(
                'ALTER TABLE `%s` ADD COLUMN `%s` %s',
                $table,
                $column,
                $definition
            );

            try {
                $pdo->exec($sql);
            } catch (PDOException $e) {
                // Tolerate a duplicate-column race, but never hide other DDL errors.
                if ((int)($e->errorInfo[1] ?? 0) !== 1060) {
                    throw $e;
                }
            }
        }
    }

    echo "Successfully applied the final schema fixes to the live database." . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, 'Live schema fix failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}