<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

// Auto-create tables if not exists (same pattern as get_utility_readings.php)
$conn->query("CREATE TABLE IF NOT EXISTS `inquiries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `full_name` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `contact_no` varchar(30) NOT NULL,
  `room_name` varchar(50) DEFAULT NULL,
  `occupants` int(11) DEFAULT NULL,
  `preferred_move_in` date DEFAULT NULL,
  `message` text DEFAULT NULL,
  `source` varchar(20) NOT NULL DEFAULT 'web',
  `status` varchar(20) NOT NULL DEFAULT 'New',
  `viewing_date` datetime DEFAULT NULL,
  `admin_notes` text DEFAULT NULL,
  `closed_reason` varchar(255) DEFAULT NULL,
  `handled_by` int(11) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_inquiry_status` (`status`),
  KEY `idx_inquiry_room` (`room_name`),
  KEY `fk_inquiry_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");

$conn->query("CREATE TABLE IF NOT EXISTS `unit_reservations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `inquiry_id` int(11) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `room_name` varchar(50) NOT NULL,
  `reserved_for_name` varchar(150) NOT NULL,
  `contact_no` varchar(30) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `hold_expires_at` date NOT NULL,
  `reservation_fee` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` varchar(20) NOT NULL DEFAULT 'Active',
  `notes` text DEFAULT NULL,
  `released_at` datetime DEFAULT NULL,
  `released_reason` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_res_status` (`status`),
  KEY `idx_res_room` (`room_name`),
  KEY `fk_res_inquiry` (`inquiry_id`),
  KEY `fk_res_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

// Release any holds that lapsed since the last look, so the board is accurate.
$expired_count = release_expired_reservations($conn);

$inquiries = [];
$query = "SELECT i.id,
                 i.id AS rawId,
                 i.user_id AS userId,
                 i.full_name AS fullName,
                 i.email,
                 i.contact_no AS contactNo,
                 i.room_name AS unit,
                 i.occupants,
                 i.preferred_move_in AS preferredMoveIn,
                 i.message,
                 i.source,
                 i.status,
                 i.viewing_date AS viewingDate,
                 i.admin_notes AS adminNotes,
                 i.closed_reason AS closedReason,
                 i.created_at AS createdAt,
                 r.type AS roomType,
                 r.monthly_rent AS monthlyRent,
                 r.status AS roomStatus,
                 ur.id AS activeReservationId,
                 ur.hold_expires_at AS holdExpiresAt
          FROM inquiries i
          LEFT JOIN rooms r ON r.id = i.room_name
          LEFT JOIN unit_reservations ur ON ur.inquiry_id = i.id AND ur.status = 'Active'
          ORDER BY i.id DESC";

$res = $conn->query($query);
while ($row = $res->fetch_assoc()) {
    $inquiries[] = $row;
}

$reservations = [];
$res_query = "SELECT ur.id,
                     ur.id AS rawId,
                     ur.inquiry_id AS inquiryId,
                     ur.user_id AS userId,
                     ur.room_name AS unit,
                     ur.reserved_for_name AS reservedFor,
                     ur.contact_no AS contactNo,
                     ur.email,
                     ur.hold_expires_at AS holdExpiresAt,
                     ur.reservation_fee AS reservationFee,
                     ur.status,
                     ur.notes,
                     ur.released_at AS releasedAt,
                     ur.released_reason AS releasedReason,
                     ur.created_at AS createdAt,
                     DATEDIFF(ur.hold_expires_at, CURDATE()) AS daysRemaining,
                     r.type AS roomType,
                     r.monthly_rent AS monthlyRent
              FROM unit_reservations ur
              LEFT JOIN rooms r ON r.id = ur.room_name
              ORDER BY ur.id DESC";

$res2 = $conn->query($res_query);
while ($row = $res2->fetch_assoc()) {
    $reservations[] = $row;
}

echo json_encode([
    "success" => true,
    "inquiries" => $inquiries,
    "reservations" => $reservations,
    "expiredReleased" => $expired_count
]);

$conn->close();
?>
