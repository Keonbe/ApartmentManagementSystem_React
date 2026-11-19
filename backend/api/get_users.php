<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

try {
    // Tenant accounts for the Assign Tenant picker (Units). `room` / `roomStatus`
    // name the unit the user already rents or has an open application for
    // (ROOM_CLAIMING_APPLICATION_STATUSES), so the picker can mark them;
    // update_room.php refuses those anyway. Archived accounts are left out.
    // One query, however many users.
    $claiming = "'" . implode("','", ROOM_CLAIMING_APPLICATION_STATUSES) . "'";
    $result = $conn->query("
        SELECT u.id, u.first_name, u.last_name, u.suffix, u.email_address, u.contact_no, u.avatar_url,
               claim.room_name AS claim_room, claim.status AS claim_status
        FROM users u
        LEFT JOIN (
            SELECT ra.user_id, ra.room_name, ra.status
            FROM rent_applications ra
            JOIN (SELECT user_id, MAX(id) AS id FROM rent_applications WHERE status IN ($claiming) GROUP BY user_id) latest
              ON latest.id = ra.id
        ) claim ON claim.user_id = u.id
        WHERE u.role = 'user' AND COALESCE(u.is_archived, 0) = 0
        ORDER BY u.first_name, u.last_name");
    if (!$result) throw new RuntimeException('The user list could not be read.');
    $users = [];
    while ($row = $result->fetch_assoc()) {
        $users[] = [
            'id' => (int) $row['id'],
            'name' => person_name($row),
            'email' => $row['email_address'],
            'phone' => $row['contact_no'] ?: null,
            'avatar' => $row['avatar_url'] ?: null,
            'room' => $row['claim_room'] ?: null,
            'roomStatus' => $row['claim_status'] ?: null,
        ];
    }
    echo json_encode(["success" => true, "data" => $users]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => public_error_message($e)]);
}

$conn->close();
?>
