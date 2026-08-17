<?php
require_once "../../config.php";

echo "Running migrations...\n";

$queries = [
    "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_condition VARCHAR(100) DEFAULT 'Good'",
    "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS furnishing_status VARCHAR(50) DEFAULT 'Unfurnished'",
    "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_inspection_date DATE DEFAULT NULL"
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
