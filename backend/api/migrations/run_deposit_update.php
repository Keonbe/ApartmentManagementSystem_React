<?php
require_once "../../config.php";

echo "Running migrations...\n";

$queries = [
    "ALTER TABLE lease_contracts ADD COLUMN IF NOT EXISTS deposit_status VARCHAR(50) DEFAULT 'Held'",
    "ALTER TABLE lease_contracts ADD COLUMN IF NOT EXISTS damage_deduction DECIMAL(10,2) DEFAULT 0.00",
    "ALTER TABLE lease_contracts ADD COLUMN IF NOT EXISTS utility_deduction DECIMAL(10,2) DEFAULT 0.00",
    "ALTER TABLE lease_contracts ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2) DEFAULT 0.00",
    "ALTER TABLE lease_contracts ADD COLUMN IF NOT EXISTS refund_date DATE DEFAULT NULL"
];

foreach ($queries as $query) {
    if ($conn->query($query)) {
        echo "SUCCESS: $query\n";
    } else {
        echo "ERROR running '$query': " . $conn->error . "\n";
    }
}

echo "Migration finished.\n";
$conn->close();
?>
