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

// Identity from the session. The tenant ownership check used to compare the
// visitor row against the X-User-Id header, which the caller chooses.
$auth = require_user($conn);
$isAdmin = $auth['role'] === 'admin';

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!is_array($input)) fail(400, "Invalid JSON payload.");

$raw_id = $input['id'] ?? $input['rawId'] ?? null;
$action = trim((string)($input['action'] ?? $input['status'] ?? ''));
$checkout_notes = trim((string)($input['checkoutNotes'] ?? $input['checkout_notes'] ?? ''));
$admin_notes = trim((string)($input['adminNotes'] ?? $input['admin_notes'] ?? ''));

// Same UI caps as the forms (LIMITS.notes / LIMITS.reason in validation.js).
$errors = array_filter([
    'id' => v_id($raw_id, 'Visitor'),
    'action' => v_enum($action, 'Action', ['checked_in', 'approve', 'denied', 'reject', 'cancel', 'checked_out', 'checkout']),
    'checkoutNotes' => v_str($checkout_notes, 'Checkout note', 1, 1000, false),
    'adminNotes' => v_str($admin_notes, 'Note', 1, 1000, false),
]);
if ($errors) validation_fail($errors);
$id = (int)$raw_id;

$q = $conn->prepare("SELECT * FROM visitor_logs WHERE id = ?");
$q->bind_param("i", $id);
$q->execute();
$visitor = $q->get_result()->fetch_assoc();
$q->close();

if (!$visitor) fail(404, "Visitor record not found.");
if (!$isAdmin && (int)$visitor['user_id'] !== $auth['id']) fail(403, "Forbidden: You cannot modify this visitor record.");

$target_user_id = $visitor['user_id'];
$visitor_name = $visitor['visitor_name'];
$unit = $visitor['room_name'];

// Each move is only valid from one state; previously a denied or checked-out
// visitor could be "approved" again, re-stamping their check-in time.
$guarded_update = function ($sql, $types, $params, $from_status) use ($conn, $id) {
    $stmt = $conn->prepare($sql . " WHERE id = ? AND status = ?");
    $stmt->bind_param($types . "is", ...array_merge($params, [$id, $from_status]));
    $stmt->execute();
    $changed = $stmt->affected_rows;
    $stmt->close();
    return $changed > 0;
};

if ($action === 'checked_in' || $action === 'approve') {
    if (!$isAdmin) fail(403, "Forbidden: Only admins can approve visitors.");

    // A tenant's tenancy may have ended between pre-registration and review —
    // approving would otherwise check someone in against a unit that's no
    // longer theirs.
    if ($target_user_id && !get_active_tenancy($conn, (int)$target_user_id)) {
        fail(409, "This tenant no longer has an active rental — the registration can only be denied.");
    }
    // Approving stamps check_in_at = NOW(); a visit whose expected check-out
    // is already behind us would be checked in after it was meant to end.
    if (!empty($visitor['expected_check_out_at']) && strtotime($visitor['expected_check_out_at']) < time()) {
        fail(409, "This visit's expected check-out has already passed — deny it, or ask the tenant to register again.");
    }

    if (!$guarded_update("UPDATE visitor_logs SET status = 'checked_in', admin_notes = ?, check_in_at = NOW()", "s", [$admin_notes], 'pending_approval')) {
        fail(409, "Only a visitor awaiting approval can be approved.");
    }
    resolve_admin_queue($conn, 'visitor_registration', $id);

    if ($target_user_id) {
        $n_title = "Visitor Approved: $visitor_name";
        $n_msg = "Management has approved the entry of your visitor $visitor_name for Unit $unit.";
        create_notification($conn, $target_user_id, 'visitor_log', $n_title, $n_msg);
    }
    log_activity($conn, $auth['id'], 'service', "Approved Visitor Entry", "Visitor $visitor_name entry approved for Unit $unit");

} else if ($action === 'denied' || $action === 'reject') {
    if (!$isAdmin) fail(403, "Forbidden: Only admins can deny visitor entries.");
    if (!$guarded_update("UPDATE visitor_logs SET status = 'denied', admin_notes = ?", "s", [$admin_notes], 'pending_approval')) {
        fail(409, "Only a visitor awaiting approval can be denied.");
    }
    resolve_admin_queue($conn, 'visitor_registration', $id);

    if ($target_user_id) {
        $n_title = "Visitor Entry Declined";
        $n_msg = "Visitor registration for $visitor_name (Unit $unit) was declined by management. Note: " . ($admin_notes ?: 'No additional notes provided.');
        create_notification($conn, $target_user_id, 'visitor_log', $n_title, $n_msg);
    }
    log_activity($conn, $auth['id'], 'service', "Denied Visitor Entry", "Visitor $visitor_name entry denied for Unit $unit");

} else if ($action === 'cancel') {
    // A tenant withdrawing their own still-pending pre-registration. Admins
    // use 'denied' instead — cancel is for the person who filed it.
    if ($isAdmin) fail(403, "Forbidden: Admins should deny a pending registration instead of cancelling it.");
    if ((int)$visitor['user_id'] !== $auth['id']) fail(403, "Forbidden: You cannot cancel another tenant's registration.");
    if (!$guarded_update("UPDATE visitor_logs SET status = 'cancelled', admin_notes = ?", "s", [$admin_notes ?: 'Cancelled by tenant'], 'pending_approval')) {
        fail(409, "Only a registration awaiting approval can be cancelled.");
    }
    resolve_admin_queue($conn, 'visitor_registration', $id);
    log_activity($conn, $auth['id'], 'service', "Cancelled Visitor Pre-Registration", "Visitor $visitor_name registration cancelled for Unit $unit");

} else if ($action === 'checked_out' || $action === 'checkout') {
    if (!$guarded_update("UPDATE visitor_logs SET status = 'checked_out', check_out_at = NOW(), checkout_notes = ?", "s", [$checkout_notes], 'checked_in')) {
        fail(409, "Only a visitor who is checked in can be checked out.");
    }
    resolve_admin_queue($conn, 'visitor_overstay', $id);
    log_activity($conn, $auth['id'], 'service', "Visitor Checked Out", "Visitor $visitor_name checked out from Unit $unit" . ($isAdmin ? "" : " (reported by tenant)"));

} else {
    fail(422, "Unknown action.");
}

echo json_encode(["success" => true, "message" => "Visitor record updated successfully."]);
$conn->close();
?>
