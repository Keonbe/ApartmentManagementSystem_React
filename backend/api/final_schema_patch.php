<?php
/**
 * Add the verified parking, services, and notification schema if missing.
 * Run from the command line: php backend/api/final_schema_patch.php
 */
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

    // Definitions follow backend/api/migrations/SetupDB.sql. CREATE TABLE IF
    // NOT EXISTS leaves existing table contents and definitions untouched.
    $pdo->exec("CREATE TABLE IF NOT EXISTS `parking_reservations` (
      `id` int(11) NOT NULL AUTO_INCREMENT,
      `user_id` int(11) DEFAULT NULL,
      `vehicle_type` varchar(50) NOT NULL,
      `vehicle_model` varchar(100) NOT NULL,
      `plate_number` varchar(20) NOT NULL,
      `status` varchar(50) DEFAULT 'Pending',
      `slot_number` int(11) DEFAULT NULL,
      `assigned_at` datetime DEFAULT NULL,
      `released_at` datetime DEFAULT NULL,
      `release_reason` varchar(255) DEFAULT NULL,
      `rejection_reason` varchar(255) DEFAULT NULL,
      `transmission` varchar(50) NOT NULL,
      `duration_months` int(11) NOT NULL,
      `total_cost` decimal(10,2) NOT NULL,
      `document_path` varchar(255) NOT NULL,
      `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
      `active_slot` int(11) AS (IF(`status` = 'Assigned', `slot_number`, NULL)) PERSISTENT,
      `open_user` int(11) AS (IF(`status` IN ('Pending', 'Assigned'), `user_id`, NULL)) PERSISTENT,
      PRIMARY KEY (`id`),
      UNIQUE KEY `uniq_active_slot` (`active_slot`),
      UNIQUE KEY `uniq_open_user` (`open_user`),
      KEY `fk_parking_user` (`user_id`),
      CONSTRAINT `fk_parking_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `service_catalog` (
      `id` int(11) NOT NULL AUTO_INCREMENT,
      `category` varchar(20) NOT NULL DEFAULT 'other',
      `name` varchar(150) NOT NULL,
      `description` text DEFAULT NULL,
      `price` decimal(10,2) NOT NULL DEFAULT 0.00,
      `pricing_unit` varchar(20) NOT NULL DEFAULT 'session',
      `min_quantity` decimal(10,2) NOT NULL DEFAULT 1.00,
      `max_quantity` decimal(10,2) DEFAULT NULL,
      `lead_time_days` int(11) NOT NULL DEFAULT 1,
      `icon` varchar(50) DEFAULT NULL,
      `is_active` tinyint(1) NOT NULL DEFAULT 1,
      `sort_order` int(11) NOT NULL DEFAULT 0,
      `created_by` int(11) DEFAULT NULL,
      `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
      `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
      PRIMARY KEY (`id`),
      UNIQUE KEY `uniq_service_cat_name` (`category`, `name`),
      KEY `idx_service_active` (`is_active`),
      KEY `idx_service_category` (`category`),
      KEY `fk_service_creator` (`created_by`),
      CONSTRAINT `fk_service_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `service_requests` (
      `id` int(11) NOT NULL AUTO_INCREMENT,
      `user_id` int(11) DEFAULT NULL,
      `service_id` int(11) DEFAULT NULL,
      `room_name` varchar(50) DEFAULT NULL,
      `service_name` varchar(150) NOT NULL,
      `category` varchar(20) NOT NULL DEFAULT 'other',
      `unit_price` decimal(10,2) NOT NULL DEFAULT 0.00,
      `pricing_unit` varchar(20) NOT NULL DEFAULT 'session',
      `quantity` decimal(10,2) NOT NULL DEFAULT 1.00,
      `total_cost` decimal(10,2) NOT NULL DEFAULT 0.00,
      `preferred_date` date NOT NULL,
      `preferred_time_slot` varchar(50) NOT NULL,
      `notes` text DEFAULT NULL,
      `attachment_path` varchar(255) DEFAULT NULL,
      `status` varchar(20) NOT NULL DEFAULT 'Pending',
      `admin_notes` text DEFAULT NULL,
      `assigned_to` varchar(100) DEFAULT NULL,
      `is_invoiced` tinyint(1) NOT NULL DEFAULT 0,
      `invoice_id` varchar(50) DEFAULT NULL,
      `billing_period` varchar(50) DEFAULT NULL,
      `completed_at` datetime DEFAULT NULL,
      `cancelled_reason` varchar(255) DEFAULT NULL,
      `handled_by` int(11) DEFAULT NULL,
      `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
      `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
      PRIMARY KEY (`id`),
      KEY `idx_svcreq_status` (`status`),
      KEY `idx_svcreq_date` (`preferred_date`),
      KEY `idx_svcreq_invoiced` (`is_invoiced`),
      KEY `idx_svcreq_invoice` (`invoice_id`),
      KEY `fk_svcreq_user` (`user_id`),
      KEY `fk_svcreq_service` (`service_id`),
      CONSTRAINT `fk_svcreq_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
      CONSTRAINT `fk_svcreq_service` FOREIGN KEY (`service_id`) REFERENCES `service_catalog` (`id`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");

    $columnExists = $pdo->prepare(
        'SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table_name AND COLUMN_NAME = :column_name'
    );
    $columnExists->execute([
        'schema' => DB_NAME,
        'table_name' => 'notifications',
        'column_name' => 'metadata_value',
    ]);

    if ($columnExists->fetchColumn() === false) {
        try {
            $pdo->exec(
                'ALTER TABLE `notifications` ADD COLUMN `metadata_value` varchar(255) DEFAULT NULL'
            );
        } catch (PDOException $e) {
            // A concurrent run may have added the column after the check.
            if ((int)($e->errorInfo[1] ?? 0) !== 1060) {
                throw $e;
            }
        }
    }

    echo "Successfully applied the final parking and chat schema fixes!" . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, 'Final schema patch failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}