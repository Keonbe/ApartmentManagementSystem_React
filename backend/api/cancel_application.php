<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id');
require_once '../config.php';
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
$auth = require_user($conn);
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$id = (int)($input['id'] ?? 0); $reason = trim($input['reason'] ?? '');
if (!$id || $reason === '') { http_response_code(422); echo json_encode(['success' => false, 'message' => 'A cancellation reason is required.']); exit; }
$conn->begin_transaction();
try {
    $q = $conn->prepare("SELECT room_name, status FROM rent_applications WHERE id = ? AND user_id = ? AND status IN ('Approved', 'Pending Review', 'Pending')"); $q->bind_param('ii', $id, $auth['id']); $q->execute(); $app = $q->get_result()->fetch_assoc(); $q->close();
    if (!$app) throw new Exception('Only a pending or approved application that has not moved in can be cancelled.');
    $upd = $conn->prepare("UPDATE rent_applications SET status = 'Cancelled', rejection_reason = ?, cancelled_at = NOW() WHERE id = ? AND user_id = ? AND status IN ('Approved', 'Pending Review', 'Pending')"); $upd->bind_param('sii', $reason, $id, $auth['id']); $upd->execute(); if (!$upd->affected_rows) throw new Exception('Application status changed. Refresh and try again.'); $upd->close();
    $room = $conn->prepare("UPDATE rooms SET status = 'vacant', tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0 WHERE id = ? AND status = 'reserved'"); $room->bind_param('s', $app['room_name']); $room->execute(); $room->close();
    $inv = $conn->prepare("UPDATE invoices SET status = 'cancelled', cancel_reason = 'Applicant cancelled before move-in' WHERE rent_application_id = ? AND status IN ('pending', 'pending-verification', 'scheduled')"); $inv->bind_param('i', $id); $inv->execute(); $inv->close();
    $contract = $conn->prepare("DELETE FROM lease_contracts WHERE rent_application_id = ? AND status = 'draft'"); $contract->bind_param('i', $id); $contract->execute(); $contract->close();
    resolve_admin_queue($conn, 'rent_application', $id);
    notify_admins_queue($conn, 'rent_application', $id, 'Application Cancelled', "Applicant cancelled Unit {$app['room_name']}. Reason: $reason");
    $conn->commit(); echo json_encode(['success' => true]);
} catch (Throwable $e) { $conn->rollback(); server_error_response($e, 'Could not cancel application.'); }
$conn->close();
?>
