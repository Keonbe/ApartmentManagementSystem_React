<?php
/** Ensure reset storage exists and repair legacy tables without opening a transaction. */
function ensure_password_resets_schema($conn) {
    $conn->query("CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(150) NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        used TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_password_resets_email (email),
        INDEX idx_password_resets_token_hash (token_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
    $column = $conn->query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='password_resets' AND column_name='used' LIMIT 1");
    if (!$column->fetch_row()) {
        $conn->query("ALTER TABLE password_resets ADD COLUMN used TINYINT(1) NOT NULL DEFAULT 0 AFTER expires_at");
    }
    $column->free();
}