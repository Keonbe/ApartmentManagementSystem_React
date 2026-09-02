<?php
require_once __DIR__ . "/../../config.php";

$sql = "CREATE TABLE IF NOT EXISTS password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (email)
)";

if ($conn->query($sql) === TRUE) {
    echo "Table password_resets created successfully.\n";
} else {
    echo "Error creating table: " . $conn->error . "\n";
}

$conn->close();
?>
