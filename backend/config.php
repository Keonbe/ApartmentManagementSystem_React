<?php
    $servername = "localhost";
    $username = "root";
    $password = "";
    $dbname = "ams_db";

    $conn = new mysqli($servername, $username, $password, $dbname);

    if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Priority 4: Observability
function log_activity($conn, $user_id, $category, $action, $details = "") {
    $stmt = $conn->prepare("INSERT INTO activity_logs (performed_by, category, action, details) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("isss", $user_id, $category, $action, $details);
    $stmt->execute();
    $stmt->close();
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