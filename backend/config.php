<?php
// Load environment configuration if available
if (file_exists(__DIR__ . '/config.env.php')) {
    require_once __DIR__ . '/config.env.php';
}

// Fallback defaults if constants are not defined
if (!defined('DB_HOST')) define('DB_HOST', 'localhost');
if (!defined('DB_USER')) define('DB_USER', 'root');
if (!defined('DB_PASS')) define('DB_PASS', '');
if (!defined('DB_NAME')) define('DB_NAME', 'ams_db');
if (!defined('APP_ENV')) define('APP_ENV', 'development');

// Error reporting & resource limits (D-1, D-6)
if (APP_ENV === 'production') {
    @ini_set('display_errors', '0');
    @ini_set('log_errors', '1');
}

@ini_set('upload_max_filesize', '10M');
@ini_set('post_max_size', '12M');
@ini_set('memory_limit', '128M');

$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

if ($conn->connect_error) {
    if (APP_ENV === 'production') {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Database connection failed"]);
        exit;
    } else {
        die("Connection failed: " . $conn->connect_error);
    }
}

// Priority 4: Observability
function log_activity($conn, $user_id, $category, $action, $details = "") {
    $stmt = $conn->prepare("INSERT INTO activity_logs (performed_by, category, action, details) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("isss", $user_id, $category, $action, $details);
    $stmt->execute();
    $stmt->close();
}

// Releases unit reservations whose hold period has lapsed.
// Marks them Expired and returns the room to 'vacant'. The room update is
// guarded on status = 'reserved' so it can never overwrite an occupied unit.
// UPDATE-only (no DDL) and called explicitly — never on every request.
function release_expired_reservations($conn) {
    $released = 0;

    $stmt = $conn->prepare("SELECT id, room_name FROM unit_reservations WHERE status = 'Active' AND hold_expires_at < CURDATE()");
    if (!$stmt) return 0; // table not migrated yet
    $stmt->execute();
    $res = $stmt->get_result();
    $expired = [];
    while ($row = $res->fetch_assoc()) {
        $expired[] = $row;
    }
    $stmt->close();

    if (empty($expired)) return 0;

    $res_stmt = $conn->prepare("UPDATE unit_reservations SET status = 'Expired', released_at = NOW(), released_reason = 'Hold period lapsed' WHERE id = ? AND status = 'Active'");
    $room_stmt = $conn->prepare("UPDATE rooms SET status = 'vacant' WHERE id = ? AND status = 'reserved'");

    foreach ($expired as $row) {
        $res_stmt->bind_param("i", $row['id']);
        $res_stmt->execute();
        $room_stmt->bind_param("s", $row['room_name']);
        $room_stmt->execute();
        $released++;
    }

    $res_stmt->close();
    $room_stmt->close();

    return $released;
}

// Priority 5: Security
function verify_admin($conn, $admin_id) {
    if (!$admin_id) return false;
    $stmt = $conn->prepare("SELECT role FROM users WHERE id = ?");
    $stmt->bind_param("i", $admin_id);
    $stmt->execute();
    $res = $stmt->get_result();
    if ($res->num_rows > 0) {
        $user = $res->fetch_assoc();
        return $user['role'] === 'admin';
    }
    return false;
}
?>