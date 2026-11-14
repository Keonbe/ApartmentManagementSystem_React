<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

function review_fail($code, $msg) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $msg]);
    exit;
}

// A tenant asks Management to look again at what was taken from (or withheld
// from) their security deposit. One review per settlement, inside the refund
// window; the answer comes from resolve_deposit_review.php.
$auth = require_user($conn);
$uid = (int)$auth['id'];
$input = read_json_input();
$message = is_string($input['message'] ?? null) ? trim($input['message']) : '';
if ($message === '') review_fail(422, "Tell Management what you would like reviewed.");
if (mb_strlen($message) > 1000) review_fail(422, "Keep the message under 1000 characters.");

$conn->begin_transaction();
try {
    // Serialises two tabs of the same tenant: the settlement row is locked first.
    $lock = $conn->prepare("SELECT lc.id FROM lease_contracts lc JOIN rent_applications ra ON ra.id = lc.rent_application_id WHERE ra.user_id = ? AND lc.refund_date IS NOT NULL FOR UPDATE");
    $lock->bind_param("i", $uid);
    $lock->execute();
    $lock->get_result();
    $lock->close();

    $st = deposit_statement_for_user($conn, $uid);
    if (!$st) { $conn->rollback(); review_fail(404, "There is no settled security deposit to review."); }
    if ($st['review']) { $conn->rollback(); review_fail(409, "A review was already asked for on this deposit."); }
    if (!$st['canRequestReview']) { $conn->rollback(); review_fail(409, "This deposit can no longer be reviewed (the review period is over, or nothing was deducted)."); }

    $ins = $conn->prepare("INSERT INTO deposit_reviews (rent_application_id, user_id, message) VALUES (?, ?, ?)");
    $ins->bind_param("iis", $st['applicationId'], $uid, $message);
    $ins->execute();
    $rid = (int)$conn->insert_id;
    $ins->close();
    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    review_fail(500, public_error_message($e));
}

notify_admins_queue($conn, 'deposit_review', $rid, 'Deposit Review Requested', "A tenant asked Management to review their security deposit settlement.");
log_activity($conn, $uid, 'billing', 'Deposit Review Requested', "Review #$rid for application {$st['applicationId']}");
echo json_encode(["success" => true, "message" => "Your request was sent. Management will reply here.", "id" => $rid]);
$conn->close();
