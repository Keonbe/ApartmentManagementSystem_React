<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

// This endpoint hands back paths to a tenant's government ID and other
// application documents — always resolve "whose documents" from the caller's
// own verified session, never from a client-supplied email.
$user = require_user($conn);

$stmt = $conn->prepare("SELECT id, status, documents_verified_at FROM rent_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1");
$stmt->bind_param("i", $user['id']);
$stmt->execute();
$app = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$app) {
    echo json_encode(["success" => false, "message" => "No application documents found for this account"]);
    $conn->close();
    exit;
}

$app_id = (int)$app['id'];
$documents = application_documents_by_app($conn, [$app_id])[$app_id] ?? [];
foreach ($documents as &$doc) {
    $doc['file_name'] = basename($doc['file_path']);
}
unset($doc);

echo json_encode([
    "success" => true,
    "application_id" => $app_id,
    "documents" => $documents,
    "missing_documents" => application_missing_document_labels(application_requirements_list($conn), $documents),
    "documents_verified_at" => $app['documents_verified_at'],
]);
$conn->close();
?>
