<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $result = $conn->query("DESCRIBE rent_applications");
    $columns = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $columns[] = $row;
        }
        echo json_encode(["success" => true, "columns" => $columns]);
    } else {
        echo json_encode(["success" => false, "error" => $conn->error]);
    }
    exit;
}
?>
