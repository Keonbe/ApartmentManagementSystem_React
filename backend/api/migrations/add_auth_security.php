<?php
/** Add auth security fields; safe to run repeatedly. */
require_once __DIR__ . '/../../config.php';
function auth_security_column_exists(mysqli $conn, string $column): bool {
    $stmt = $conn->prepare("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?");
    $stmt->bind_param('s', $column); $stmt->execute();
    $exists = (bool)$stmt->get_result()->fetch_row(); $stmt->close(); return $exists;
}
foreach ([
    'email_verified_at' => 'DATETIME NULL DEFAULT NULL',
    'verification_token' => 'VARCHAR(64) NULL DEFAULT NULL',
    'login_otp' => 'VARCHAR(6) NULL DEFAULT NULL',
    'login_otp_expires_at' => 'DATETIME NULL DEFAULT NULL',
    'login_otp_attempts' => 'TINYINT UNSIGNED NOT NULL DEFAULT 0',
] as $column => $definition) {
    if (!auth_security_column_exists($conn, $column)) $conn->query("ALTER TABLE users ADD COLUMN `$column` $definition");
}
$conn->query('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE email_verified_at IS NULL');
$conn->query("CREATE TABLE IF NOT EXISTS trusted_devices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT(11) NOT NULL,
    device_token CHAR(64) NOT NULL, user_agent VARCHAR(512) NOT NULL DEFAULT '', ip_address VARCHAR(45) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_trusted_device_token (device_token), KEY idx_trusted_devices_user (user_id),
    CONSTRAINT fk_trusted_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
echo "Auth security migration complete.\n";