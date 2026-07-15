<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$input = json_decode(file_get_contents("php://input"), true);
$id = $input['id'] ?? 0;
$archiveReason = $input['archiveReason'] ?? 'End of Lease';
$archiveNotes = $input['archiveNotes'] ?? '';
$archiveDate = date('Y-m-d');

if ($id > 0) {
    // We assume the migrations/add_archive_columns.sql has been run
    // which adds archive_date, archive_reason, archive_notes to rent_applications table
    $stmt = $conn->prepare("UPDATE rent_applications SET status = 'archived', archive_date = ?, archive_reason = ?, archive_notes = ? WHERE id = ?");
    $stmt->bind_param("sssi", $archiveDate, $archiveReason, $archiveNotes, $id);
    if ($stmt->execute()) {
        echo json_encode(["success" => true]);
    } else {
        echo json_encode(["success" => false, "message" => $stmt->error]);
    }
    $stmt->close();
} else {
    echo json_encode(["success" => false, "message" => "Invalid ID"]);
}
$conn->close();
?>
