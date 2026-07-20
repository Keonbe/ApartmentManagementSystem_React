<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

include 'db_connection.php'; //AdjustThisToMatchYourActualDBConnectionFileName

try {
    //CountAllSlotsThatAreCurrentlyTakenOrReserved
    $sql = "SELECT COUNT(*) as occupied_count FROM parking_reservations WHERE status IN ('Pending', 'Assigned', 'Approved', 'Active')";
    $stmt = $conn->prepare($sql); //Use$pdo->prepare($sql)ifYouUsePDO
    $stmt->execute();
    
    //FetchResultDependingOnMySQLiOrPDO
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $occupiedCount = $row['occupied_count'] ?? 0;

    echo json_encode([
        "success" => true,
        "occupied_count" => (int)$occupiedCount
    ]);

} catch (Exception $e) {
    echo json_encode([
        "success" => false,
        "message" => "Server error: " . $e->getMessage()
    ]);
}
?>