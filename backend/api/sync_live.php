<?php
// One-time live schema sync. Run from CLI; do not expose as an HTTP endpoint.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}

require_once __DIR__ . '/../config.php';

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $pdo->exec("CREATE TABLE IF NOT EXISTS `application_requirements` (
      `id` int(11) NOT NULL AUTO_INCREMENT,
      `label` varchar(60) NOT NULL,
      `label_fil` varchar(60) DEFAULT NULL,
      `is_required` tinyint(1) NOT NULL DEFAULT 1,
      `is_active` tinyint(1) NOT NULL DEFAULT 1,
      `sort_order` int(11) NOT NULL DEFAULT 0,
      `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
      `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
      PRIMARY KEY (`id`),
      KEY `idx_app_requirements_active` (`is_active`, `sort_order`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `application_documents` (
      `id` int(11) NOT NULL AUTO_INCREMENT,
      `rent_application_id` int(11) NOT NULL,
      `requirement_id` int(11) DEFAULT NULL,
      `label_snapshot` varchar(60) NOT NULL,
      `file_path` varchar(255) NOT NULL,
      `uploaded_at` timestamp NOT NULL DEFAULT current_timestamp(),
      PRIMARY KEY (`id`),
      UNIQUE KEY `uq_app_document_requirement` (`rent_application_id`, `requirement_id`),
      KEY `idx_app_documents_requirement` (`requirement_id`),
      KEY `idx_app_documents_path` (`file_path`),
      CONSTRAINT `fk_app_documents_application` FOREIGN KEY (`rent_application_id`) REFERENCES `rent_applications` (`id`) ON DELETE CASCADE,
      CONSTRAINT `fk_app_documents_requirement` FOREIGN KEY (`requirement_id`) REFERENCES `application_requirements` (`id`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");

    $alterStatements = [
        'ALTER TABLE invoices ADD COLUMN amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00',
        'ALTER TABLE rooms ADD COLUMN available_date DATE DEFAULT NULL',
        'ALTER TABLE guest_messages ADD COLUMN thread_id INT(11) DEFAULT NULL, ADD COLUMN file_path VARCHAR(255) DEFAULT NULL, ADD COLUMN file_name VARCHAR(255) DEFAULT NULL, ADD COLUMN file_type VARCHAR(100) DEFAULT NULL',
    ];

    foreach ($alterStatements as $sql) {
        try {
            $pdo->exec($sql);
        } catch (PDOException $e) {
            // Duplicate-column errors are expected when this script is rerun.
            if ($e->getCode() !== '42S21' && (int)($e->errorInfo[1] ?? 0) !== 1060) {
                throw $e;
            }
        }
    }

    echo "Live database successfully synced!" . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, 'Live database sync failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}