<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Basic unit waitlist (inquiry_reservation_design.md §8). The admin adds an
// inquiry to the list for a unit that isn't vacant; when the unit frees up,
// notify_unit_waitlist() (config.php) marks the first entry Notified. There is
// no automatic hold — the admin still reserves the unit from the inquiry.
$admin_id = require_admin($conn);

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $res = $conn->query("
        SELECT w.*, r.status AS room_status, i.status AS inquiry_status
        FROM unit_waitlist w
        LEFT JOIN rooms r ON r.id = w.room_name
        LEFT JOIN inquiries i ON i.id = w.inquiry_id
        WHERE w.status IN ('Waiting', 'Notified')
        ORDER BY w.room_name, w.created_at, w.id
    ");
    $entries = [];
    $position = [];
    while ($row = $res->fetch_assoc()) {
        $room = $row['room_name'];
        if ($row['status'] === 'Waiting') $position[$room] = ($position[$room] ?? 0) + 1;
        $entries[] = [
            'id'            => (int)$row['id'],
            'inquiryId'     => $row['inquiry_id'] !== null ? (int)$row['inquiry_id'] : null,
            'userId'        => $row['user_id'] !== null ? (int)$row['user_id'] : null,
            'roomName'      => $room,
            'roomStatus'    => $row['room_status'],
            'fullName'      => $row['full_name'],
            'contactNo'     => $row['contact_no'],
            'email'         => $row['email'],
            'status'        => $row['status'],
            'position'      => $row['status'] === 'Waiting' ? $position[$room] : null,
            'notifiedAt'    => $row['notified_at'],
            'inquiryStatus' => $row['inquiry_status'],
            'createdAt'     => $row['created_at'],
        ];
    }
    echo json_encode(["success" => true, "entries" => $entries]);
    $conn->close();
    exit;
}

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$action = $input['action'] ?? '';

switch ($action) {
    case 'add': {
        $inquiry_id = (int)($input['inquiryId'] ?? 0);
        $stmt = $conn->prepare("SELECT id, user_id, full_name, email, contact_no, room_name, status FROM inquiries WHERE id = ?");
        $stmt->bind_param("i", $inquiry_id);
        $stmt->execute();
        $inq = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$inq) fail(404, "Inquiry not found.");
        if (in_array($inq['status'], ['Converted', 'Closed'], true)) fail(409, "This inquiry is {$inq['status']}; reopen it before adding it to a waitlist.");

        $room_name = trim((string)($input['roomName'] ?? '')) ?: (string)$inq['room_name'];
        if ($room_name === '') fail(422, "Choose the unit this inquiry is waiting for.");

        $stmt = $conn->prepare("SELECT status FROM rooms WHERE id = ?");
        $stmt->bind_param("s", $room_name);
        $stmt->execute();
        $room = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$room) fail(404, "Unit $room_name does not exist.");
        if (strtolower($room['status']) === 'vacant') fail(409, "Unit $room_name is vacant — place a hold instead of waitlisting.");

        $stmt = $conn->prepare("SELECT id FROM unit_waitlist WHERE inquiry_id = ? AND room_name = ? AND status IN ('Waiting', 'Notified')");
        $stmt->bind_param("is", $inquiry_id, $room_name);
        $stmt->execute();
        $exists = $stmt->get_result()->num_rows > 0;
        $stmt->close();
        if ($exists) fail(409, "This inquiry is already on the waitlist for Unit $room_name.");

        $user_id = $inq['user_id'] !== null ? (int)$inq['user_id'] : null;
        $stmt = $conn->prepare("INSERT INTO unit_waitlist (inquiry_id, user_id, room_name, full_name, contact_no, email, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param("iissssi", $inquiry_id, $user_id, $room_name, $inq['full_name'], $inq['contact_no'], $inq['email'], $admin_id);
        if (!$stmt->execute()) fail(500, "Could not add to the waitlist.");
        $id = $stmt->insert_id;
        $stmt->close();

        $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM unit_waitlist WHERE room_name = ? AND status = 'Waiting' AND id <= ?");
        $stmt->bind_param("si", $room_name, $id);
        $stmt->execute();
        $position = (int)$stmt->get_result()->fetch_assoc()['c'];
        $stmt->close();

        if ($user_id) {
            create_notification($conn, $user_id, 'waitlist_update', "You're on the waitlist for Unit $room_name",
                "You are number $position in line. We'll let you know when the unit becomes available.");
        }
        log_activity($conn, $admin_id, 'inquiry', 'Added to Waitlist', "Inquiry #$inquiry_id ({$inq['full_name']}) waitlisted for Unit $room_name at position $position");
        echo json_encode(["success" => true, "message" => "{$inq['full_name']} is number $position on the waitlist for Unit $room_name.", "id" => $id]);
        break;
    }

    case 'remove': {
        $id = (int)($input['id'] ?? 0);
        $stmt = $conn->prepare("UPDATE unit_waitlist SET status = 'Removed' WHERE id = ? AND status IN ('Waiting', 'Notified')");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $removed = $stmt->affected_rows > 0;
        $stmt->close();
        if (!$removed) fail(404, "Waitlist entry not found or already removed.");
        resolve_admin_queue($conn, 'unit_waitlist', $id);
        log_activity($conn, $admin_id, 'inquiry', 'Removed from Waitlist', "Waitlist entry #$id removed");
        echo json_encode(["success" => true, "message" => "Removed from the waitlist."]);
        break;
    }

    default:
        fail(422, "Unknown action.");
}

$conn->close();
?>
