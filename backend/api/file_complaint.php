<?php
// A tenant files a complaint (SPRINT 189, checklist 7.7).
//   POST { category, message }  -> { success, complaint: {id, category, status}, message: {...} }
// The complaint is a row in `complaints` plus its first chat message to the admin
// (messages.complaint_id), so it shows in the admin's Messages inbox like any
// other conversation and later messages in that thread follow it automatically.
// One unresolved complaint per tenant at a time: a second is refused (409) and
// the tenant continues in the same thread.
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

$auth = require_user($conn);
if ($auth['role'] !== 'user') {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Complaints are filed from a tenant account."]);
    exit;
}
$user_id = (int)$auth['id'];

$input = read_json_input();
$category = trim((string)($input['category'] ?? ''));
$message = trim((string)($input['message'] ?? ''));
$errors = array_filter([
    'category' => v_enum($category, 'Category', COMPLAINT_CATEGORIES),
    'message' => v_str($message, 'Message', 5, 2000),
]);
if ($errors) validation_fail($errors);

const COMPLAINT_MAX_PER_HOUR = 5;
if (rate_limit_exceeded($conn, 'complaint', (string)$user_id, COMPLAINT_MAX_PER_HOUR, 60)) {
    http_response_code(429);
    echo json_encode(["success" => false, "message" => "You have filed several complaints recently. Please wait before filing another."]);
    exit;
}

// A complaint goes to the office: the same admin the chat widget talks to.
$admin_row = $conn->query("SELECT id FROM users WHERE role = 'admin' AND is_archived = 0 ORDER BY id ASC LIMIT 1")->fetch_assoc();
if (!$admin_row) {
    http_response_code(503);
    echo json_encode(["success" => false, "message" => "The office cannot receive complaints right now. Please try again later."]);
    exit;
}
$admin_id = (int)$admin_row['id'];

$conn->begin_transaction();
try {
    // Two submits at once both passed any earlier check; the user row lock makes the second wait.
    $lock = $conn->prepare("SELECT first_name, last_name, suffix FROM users WHERE id = ? FOR UPDATE");
    $lock->bind_param("i", $user_id);
    $lock->execute();
    $tenant = $lock->get_result()->fetch_assoc();
    $lock->close();

    if (open_complaint_id($conn, $user_id) !== null) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "You already have a complaint that is still open. Please continue in that conversation."]);
        exit;
    }

    $ins = $conn->prepare("INSERT INTO complaints (user_id, category) VALUES (?, ?)");
    $ins->bind_param("is", $user_id, $category);
    $ins->execute();
    $complaint_id = (int)$conn->insert_id;
    $ins->close();

    $msg = $conn->prepare("INSERT INTO messages (sender_id, receiver_id, message, complaint_id) VALUES (?, ?, ?, ?)");
    $msg->bind_param("iisi", $user_id, $admin_id, $message, $complaint_id);
    $msg->execute();
    $message_id = (int)$conn->insert_id;
    $msg->close();

    notify_admins_queue($conn, 'complaint', $complaint_id, "New Complaint: $category",
        person_name($tenant ?: []) . " filed a complaint ($category). Open Messages to read and answer it.");
    log_activity($conn, $user_id, 'tenant', 'Filed Complaint', "Complaint #$complaint_id ($category)");

    $conn->commit();
} catch (Exception $e) {
    $conn->rollback();
    server_error_response($e, "Could not file your complaint. Please try again.");
}

rate_limit_record($conn, 'complaint', (string)$user_id);

echo json_encode([
    "success" => true,
    "complaint" => ["id" => $complaint_id, "category" => $category, "status" => "Open"],
    "message" => [
        "id" => $message_id, "sender_id" => $user_id, "receiver_id" => $admin_id, "message" => $message,
        "attachment_path" => null, "reply_to_id" => null, "complaint_id" => $complaint_id,
        "created_at" => date('Y-m-d H:i:s'), "is_read" => 0,
    ],
]);
$conn->close();
