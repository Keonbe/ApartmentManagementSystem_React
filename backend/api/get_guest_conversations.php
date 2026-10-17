<?php
require_once __DIR__ . '/../cors.php';
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
require_once __DIR__ . '/../config.php';
$admin = require_admin($conn);
if (!$admin) exit;
try {
    $result = $conn->query("SELECT i.id AS thread_id, i.id AS guest_thread_id, NULL AS user_id, i.guest_name AS other_user_name, i.guest_email AS other_user_email, i.guest_phone AS other_user_phone, i.unit_of_interest, 'guest' AS thread_type, COALESCE(m.message, i.message) AS last_message, m.attachment_path AS last_message_attachment_path, COALESCE(m.created_at, i.created_at) AS last_message_time FROM inquiries i LEFT JOIN guest_messages m ON m.id = (SELECT MAX(gm.id) FROM guest_messages gm WHERE gm.inquiry_id = i.id) WHERE i.thread_type = 'guest' AND NOT EXISTS (SELECT 1 FROM inquiries prior WHERE prior.thread_type = 'guest' AND prior.id < i.id AND ((i.guest_email IS NOT NULL AND i.guest_email <> '' AND LOWER(prior.guest_email) = LOWER(i.guest_email)) OR (i.guest_phone IS NOT NULL AND i.guest_phone <> '' AND prior.guest_phone = i.guest_phone))) ORDER BY COALESCE(m.created_at, i.created_at) DESC");
    echo json_encode(['success'=>true,'conversations'=>$result->fetch_all(MYSQLI_ASSOC)]);
} catch (Throwable $e) { http_response_code(500); echo json_encode(['success'=>false,'message'=>public_error_message($e)]); }