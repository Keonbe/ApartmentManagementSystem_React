<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$id = (int)($input['id'] ?? 0);
if ($id <= 0) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Invalid parameters."]);
    exit;
}

$stmt = $conn->prepare("SELECT footage_path FROM cctv_requests WHERE id = ? AND (footage_path IS NOT NULL OR footage_url IS NOT NULL)");
$stmt->bind_param("i", $id);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

// Claim first: only the call whose UPDATE matches deletes the file. The expiry
// moves to now so My Requests reports it as no longer available.
$stmt = $conn->prepare("UPDATE cctv_requests SET footage_path = NULL, footage_url = NULL, footage_expires_at = NOW()
                        WHERE id = ? AND (footage_path IS NOT NULL OR footage_url IS NOT NULL)");
$stmt->bind_param("i", $id);
$stmt->execute();
$affected = $stmt->affected_rows;
$stmt->close();

if ($affected === 0) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "No footage is attached to this request."]);
    exit;
}

delete_cctv_footage_file($row['footage_path'] ?? null);
log_activity($conn, $admin_id, 'service', "Removed CCTV Footage", "CCTV Request ID: $id footage removed by an admin");

echo json_encode(["success" => true, "message" => "Footage removed."]);
$conn->close();
