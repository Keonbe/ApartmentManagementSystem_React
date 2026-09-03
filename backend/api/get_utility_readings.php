<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../config.php';

// Auto-create table if not exists
$conn->query("CREATE TABLE IF NOT EXISTS `utility_readings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `room_name` VARCHAR(50) NOT NULL,
  `user_id` INT NULL,
  `billing_period` VARCHAR(7) NOT NULL,
  `reading_date` DATE NOT NULL,
  `water_prev_reading` DECIMAL(10,2) DEFAULT 0.00,
  `water_curr_reading` DECIMAL(10,2) DEFAULT 0.00,
  `water_rate_per_unit` DECIMAL(10,2) DEFAULT 40.00,
  `water_consumption` DECIMAL(10,2) DEFAULT 0.00,
  `water_amount` DECIMAL(10,2) DEFAULT 0.00,
  `water_other_fees` DECIMAL(10,2) DEFAULT 0.00,
  `electric_prev_reading` DECIMAL(10,2) DEFAULT 0.00,
  `electric_curr_reading` DECIMAL(10,2) DEFAULT 0.00,
  `electric_rate_per_unit` DECIMAL(10,2) DEFAULT 12.00,
  `electric_consumption` DECIMAL(10,2) DEFAULT 0.00,
  `electric_amount` DECIMAL(10,2) DEFAULT 0.00,
  `electric_other_fees` DECIMAL(10,2) DEFAULT 0.00,
  `is_invoiced` TINYINT(1) DEFAULT 0,
  `notes` TEXT NULL,
  `recorded_by` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_room_period` (`room_name`, `billing_period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");


$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
$user_id = $_SERVER['HTTP_X_USER_ID'] ?? null;

if (!$admin_id && !$user_id) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Unauthorized"]);
    exit;
}

$is_admin = false;
if ($admin_id) {
    if (!verify_admin($conn, $admin_id)) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Forbidden"]);
        exit;
    }
    $is_admin = true;
}

$room_name = $_GET['room_name'] ?? null;
$billing_period = $_GET['billing_period'] ?? null;

// #12: Single self-join query for spike detection (replaces N+1 loop below)
// prev_water_cons / prev_elec_cons come from the most recent earlier reading per room
$spike_join = $is_admin ? "
    LEFT JOIN utility_readings prev_ur
        ON prev_ur.room_name = ur.room_name
        AND prev_ur.reading_date = (
            SELECT MAX(reading_date) FROM utility_readings
            WHERE room_name = ur.room_name AND reading_date < ur.reading_date
        )" : "";

$spike_cols = $is_admin ? ",
    prev_ur.water_consumption   AS prev_water_cons,
    prev_ur.electric_consumption AS prev_elec_cons" : "";

$query = "SELECT ur.*{$spike_cols},
                 u.first_name  AS tenant_first_name,
                 u.last_name   AS tenant_last_name,
                 u.email_address AS tenant_email
          FROM utility_readings ur
          LEFT JOIN users u ON ur.user_id = u.id
          {$spike_join}
          WHERE 1=1";
$types = "";
$params = [];

if (!$is_admin) {
    $query .= " AND ur.user_id = ?";
    $types .= "i";
    $params[] = $user_id;
} else {
    if ($room_name) {
        $query .= " AND ur.room_name = ?";
        $types .= "s";
        $params[] = $room_name;
    }
    if ($billing_period) {
        $query .= " AND ur.billing_period = ?";
        $types .= "s";
        $params[] = $billing_period;
    }
}

$query .= " ORDER BY ur.reading_date DESC";

$stmt = $conn->prepare($query);
if (!$stmt) {
    echo json_encode(["success" => false, "message" => "Query preparation failed: " . $conn->error]);
    exit;
}
if (count($params) > 0) {
    $stmt->bind_param($types, ...$params);
}

$stmt->execute();
$result = $stmt->get_result();

$readings = [];
while ($row = $result->fetch_assoc()) {
    // #9: Strip admin-only fields from tenant responses
    if (!$is_admin) {
        unset($row['recorded_by']);
    }

    // #12: Compute has_spike from the joined prev columns (admin only)
    if ($is_admin) {
        $prev_water = floatval($row['prev_water_cons'] ?? 0);
        $prev_elec  = floatval($row['prev_elec_cons']  ?? 0);
        $row['has_spike'] = (
            ($prev_water > 0 && floatval($row['water_consumption'])   > $prev_water * 1.3) ||
            ($prev_elec  > 0 && floatval($row['electric_consumption']) > $prev_elec  * 1.3)
        );
        unset($row['prev_water_cons'], $row['prev_elec_cons']); // clean up internal cols
    }

    $readings[] = $row;
}

echo json_encode(["success" => true, "data" => $readings]);
$conn->close();
?>
