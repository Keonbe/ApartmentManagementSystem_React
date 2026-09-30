<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id');
require_once '../config.php';
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
$admin_id = require_admin($conn);

$id = (int)($_POST['id'] ?? 0);
$move_in_date = trim($_POST['move_in_date'] ?? '');
$message = trim($_POST['message'] ?? '');
if (!$id || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $move_in_date)
    || !($parsed_move_in = DateTime::createFromFormat('!Y-m-d', $move_in_date))
    || $parsed_move_in->format('Y-m-d') !== $move_in_date) {
    http_response_code(422); echo json_encode(['success' => false, 'message' => 'A valid move-in date is required.']); exit;
}
$app = $conn->prepare("SELECT ra.user_id, ra.room_name, u.first_name FROM rent_applications ra JOIN users u ON u.id = ra.user_id WHERE ra.id = ? AND ra.status = 'Approved' AND EXISTS (SELECT 1 FROM invoices i WHERE i.rent_application_id = ra.id AND i.security_deposit > 0 AND i.status = 'paid')");
$app->bind_param('i', $id); $app->execute(); $row = $app->get_result()->fetch_assoc(); $app->close();
if (!$row) { http_response_code(409); echo json_encode(['success' => false, 'message' => 'This application must be approved with a confirmed initial payment first.']); exit; }

$attachment = null;
if (isset($_FILES['attachment']) && $_FILES['attachment']['error'] === UPLOAD_ERR_OK) {
    $file = $_FILES['attachment'];
    if ($file['size'] > 10 * 1024 * 1024) { http_response_code(422); echo json_encode(['success' => false, 'message' => 'Attachment must be 10MB or less.']); exit; }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $exts = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'application/pdf' => 'pdf'];
    if (!isset($exts[$mime])) { http_response_code(422); echo json_encode(['success' => false, 'message' => 'Attach a JPG, PNG, or PDF.']); exit; }
    $dir = __DIR__ . '/../uploads/notifications/'; if (!is_dir($dir)) mkdir($dir, 0755, true);
    $name = bin2hex(random_bytes(16)) . '.' . $exts[$mime];
    if (!move_uploaded_file($file['tmp_name'], $dir . $name)) throw new Exception('Could not save attachment.');
    $attachment = 'uploads/notifications/' . $name;
}

$conn->begin_transaction();
try {
    $upd = $conn->prepare("UPDATE rent_applications SET move_in_date = ?, move_in_notified_at = NOW() WHERE id = ? AND status = 'Approved'");
    $upd->bind_param('si', $move_in_date, $id); $upd->execute();
    $updated = $upd->affected_rows > 0;
    $upd->close();
    if (!$updated) throw new Exception('The application could not be updated. Refresh and try again.');
    $body = $message ?: "Your initial payment has been confirmed. Your move-in date for Unit {$row['room_name']} is " . date('F j, Y', strtotime($move_in_date)) . '.';
    $notification_id = create_notification($conn, (int)$row['user_id'], 'application_update', 'Your Move-In Date', $body);
    if ($notification_id && $attachment) { $n = $conn->prepare('UPDATE notifications SET attachment_path = ? WHERE id = ?'); $n->bind_param('si', $attachment, $notification_id); $n->execute(); $n->close(); }
    log_activity($conn, $admin_id, 'tenant', 'Scheduled Move-In', "Application ID: $id, Date: $move_in_date");
    // The next admin step is confirming occupancy on the day
    // (update_tenant_status.php → active resolves this).
    resolve_admin_queue($conn, 'rent_application', $id);
    notify_admins_queue($conn, 'rent_application', $id, 'Move-In Scheduled',
        "Unit {$row['room_name']} move-in is set for " . date('F j, Y', strtotime($move_in_date)) . ". Confirm the move-in once the tenant has moved in.");
    $conn->commit();
    try {
        require_once __DIR__ . '/services/send_notification.php';
        dispatch_admin_action_notification($conn, (int)$row['user_id'], 'application_update', 'Your Move-In Date Is Confirmed', null,
            email_move_in_scheduled_template($row['first_name'] ?: 'Tenant', $row['room_name'], $move_in_date, $message));
    } catch (Throwable $notification_error) {
        error_log('Could not dispatch move-in schedule email: ' . $notification_error->getMessage());
    }
    echo json_encode(['success' => true]);
} catch (Throwable $e) { $conn->rollback(); server_error_response($e, 'Could not schedule move-in.'); }
$conn->close();
?>
