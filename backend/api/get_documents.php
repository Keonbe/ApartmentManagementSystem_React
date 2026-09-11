<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

// This endpoint hands back paths to a tenant's government ID and NBI
// clearance — always resolve "whose documents" from the caller's own
// verified session, never from a client-supplied email.
$user = require_user($conn);

$stmt = $conn->prepare("SELECT valid_id_front_path, valid_id_back_path, nbi_clearance_path FROM rent_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1");
$stmt->bind_param("i", $user['id']);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    echo json_encode(["success" => false, "message" => "No application documents found for this account"]);
    $stmt->close();
    $conn->close();
    exit;
}

$row = $result->fetch_assoc();

$response = [
    "success" => true,
    "documents" => [
        [
            "key" => "valid_id_front",
            "name" => "Valid Government Issued ID (Front Side)",
            "fileName" => basename($row["valid_id_front_path"]),
            "url" => $row["valid_id_front_path"]
        ],
        [
            "key" => "valid_id_back",
            "name" => "Valid Government Issued ID (Back Side)",
            "fileName" => basename($row["valid_id_back_path"]),
            "url" => $row["valid_id_back_path"]
        ],
        [
            "key" => "nbi",
            "name" => "National Bureau of Investigation (NBI) Clearance",
            "fileName" => basename($row["nbi_clearance_path"]),
            "url" => $row["nbi_clearance_path"]
        ]
    ]
];

echo json_encode($response);
$stmt->close();
$conn->close();
?>