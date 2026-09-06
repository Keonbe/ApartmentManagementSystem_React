<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true) ?? [];

$id            = (int)($input['rawId'] ?? $input['id'] ?? 0);
$status        = trim($input['status'] ?? '');
$admin_notes   = isset($input['admin_notes']) ? trim($input['admin_notes']) : null;
$viewing_date  = isset($input['viewing_date']) ? trim($input['viewing_date']) : null;
$closed_reason = isset($input['closed_reason']) ? trim($input['closed_reason']) : null;

$allowed = ['New', 'Contacted', 'Scheduled', 'Reserved', 'Converted', 'Closed'];

if ($id <= 0) {
    echo json_encode(["success" => false, "message" => "A valid inquiry ID is required."]);
    exit;
}
if (!in_array($status, $allowed, true)) {
    echo json_encode(["success" => false, "message" => "Invalid status. Allowed: " . implode(', ', $allowed)]);
    exit;
}
if ($status === 'Scheduled' && ($viewing_date === null || $viewing_date === '')) {
    echo json_encode(["success" => false, "message" => "A viewing date is required to schedule a viewing."]);
    exit;
}

$existing = $conn->prepare("SELECT user_id, full_name, room_name FROM inquiries WHERE id = ?");
$existing->bind_param("i", $id);
$existing->execute();
$inquiry = $existing->get_result()->fetch_assoc();
$existing->close();

if (!$inquiry) {
    echo json_encode(["success" => false, "message" => "Inquiry not found."]);
    exit;
}

$viewing_date  = ($viewing_date === '') ? null : $viewing_date;
$closed_reason = ($closed_reason === '') ? null : $closed_reason;
$admin_notes   = ($admin_notes === '') ? null : $admin_notes;
$admin_id_int  = (int)$admin_id;

$stmt = $conn->prepare("UPDATE inquiries SET status = ?, admin_notes = COALESCE(?, admin_notes), viewing_date = COALESCE(?, viewing_date), closed_reason = ?, handled_by = ? WHERE id = ?");
$stmt->bind_param("ssssii", $status, $admin_notes, $viewing_date, $closed_reason, $admin_id_int, $id);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to update inquiry."]);
    $stmt->close();
    exit;
}
$stmt->close();

log_activity($conn, $admin_id_int, 'inquiry', "Updated Inquiry Status", "Inquiry ID: $id, New Status: $status");

// Notify only when the inquiry is linked to a real account. Guest inquiries
// have no user_id to notify — the admin follows up by phone or email.
if (!empty($inquiry['user_id'])) {
    $tenant_id = (int)$inquiry['user_id'];
    $unit = $inquiry['room_name'] ? " for Unit " . $inquiry['room_name'] : "";

    $messages = [
        'Contacted' => "Our admin has reviewed your inquiry$unit and will be in touch shortly.",
        'Scheduled' => "A unit viewing$unit has been scheduled for " . ($viewing_date ? date('M j, Y g:i A', strtotime($viewing_date)) : 'a confirmed date') . ".",
        'Reserved'  => "Good news — a unit$unit has been reserved for you.",
        'Converted' => "Your inquiry$unit has moved forward to a rent application.",
        'Closed'    => "Your inquiry$unit has been closed." . ($closed_reason ? " Reason: $closed_reason" : ""),
    ];

    if (isset($messages[$status])) {
        $notif_title = "Inquiry Update";
        $notif_msg = $messages[$status];
        $notif = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read) VALUES (?, 'inquiry_update', ?, ?, 'Resolved', 0)");
        $notif->bind_param("iss", $tenant_id, $notif_title, $notif_msg);
        $notif->execute();
        $notif->close();
    }
}

echo json_encode(["success" => true, "message" => "Inquiry updated to $status."]);

$conn->close();
?>
