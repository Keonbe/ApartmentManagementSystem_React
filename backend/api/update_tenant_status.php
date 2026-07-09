<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

$input = json_decode(file_get_contents("php://input"), true);
$id = $input['id'] ?? 0;
$status = $input['status'] ?? '';

if ($id > 0 && !empty($status)) {
    $stmt = $conn->prepare("UPDATE rent_applications SET status = ? WHERE id = ?");
    $stmt->bind_param("si", $status, $id);
    if ($stmt->execute()) {
        echo json_encode(["success" => true]);
    } else {
        echo json_encode(["success" => false, "message" => $stmt->error]);
    }
    $stmt->close();
}
$conn->close();
?>