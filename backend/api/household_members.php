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

// Household roster (decided 2026-09-16, docs/todo.md › Room & Occupancy).
// One shared lease: only the lease holder has a login. Co-occupants are listed
// here, and every add or removal is a request an admin approves through
// process_tenant_request.php (type 'household_request', metadata "add:<id>" /
// "remove:<id>"). An admin can read any tenant's roster with ?userId=.
$auth = require_user($conn);

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

const HOUSEHOLD_RELATIONSHIPS = ['Spouse/Partner', 'Child', 'Parent', 'Sibling', 'Relative', 'Friend', 'Roommate', 'Other'];

$target_user_id = $auth['id'];
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['userId']) && $auth['role'] === 'admin') {
    $target_user_id = (int)$_GET['userId'];
}

$stmt = $conn->prepare("SELECT id, room_name, occupants, first_name, last_name FROM rent_applications WHERE user_id = ? AND status IN ('Approved', 'active', 'pending-move-out') ORDER BY id DESC LIMIT 1");
$stmt->bind_param("i", $target_user_id);
$stmt->execute();
$app = $stmt->get_result()->fetch_assoc();
$stmt->close();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!$app) {
        echo json_encode(["success" => true, "hasLease" => false, "members" => []]);
        exit;
    }
    $app_id = (int)$app['id'];
    $stmt = $conn->prepare("SELECT id, full_name, relationship, contact_no, status, added_at, removed_at, removal_requested_at, created_at FROM household_members WHERE rent_application_id = ? AND status IN ('Active', 'Pending') ORDER BY status = 'Pending', full_name");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $members = [];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $members[] = [
            'id'               => (int)$row['id'],
            'fullName'         => $row['full_name'],
            'relationship'     => $row['relationship'],
            'contactNo'        => $row['contact_no'],
            'status'           => $row['status'],
            'removalRequested' => $row['removal_requested_at'] !== null,
            'addedAt'          => $row['added_at'],
            'requestedAt'      => $row['created_at'],
        ];
    }
    $stmt->close();

    echo json_encode([
        "success"       => true,
        "hasLease"      => true,
        "leaseHolder"   => trim($app['first_name'] . ' ' . $app['last_name']),
        "roomName"      => $app['room_name'],
        "occupants"     => (int)$app['occupants'],
        "maxOccupants"  => max_occupants_per_unit($conn),
        "relationships" => HOUSEHOLD_RELATIONSHIPS,
        "members"       => $members,
    ]);
    exit;
}

// Writes are the lease holder's own requests.
if ($auth['role'] === 'admin') fail(403, "Household changes are requested by the tenant and approved in Notifications.");
if (!$app) fail(403, "No active lease found for this account.");
$app_id = (int)$app['id'];
$holder = trim($app['first_name'] . ' ' . $app['last_name']);
$room = $app['room_name'];

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$action = $input['action'] ?? '';

switch ($action) {
    case 'add': {
        $name = trim((string)($input['fullName'] ?? ''));
        $relationship = (string)($input['relationship'] ?? '');
        $contact = trim((string)($input['contactNo'] ?? ''));

        if (mb_strlen($name) < 2 || mb_strlen($name) > 150) fail(422, "Full name must be 2 to 150 characters.");
        if (!in_array($relationship, HOUSEHOLD_RELATIONSHIPS, true)) fail(422, "Choose a relationship from the list.");
        if ($contact !== '') {
            $contact = normalize_ph_mobile($contact); // stored as +639XXXXXXXXX
            if ($contact === null) fail(422, "Contact number must be a Philippine mobile number (+63 9XX XXX XXXX).");
        }

        // Pending additions count toward the limit too, so a tenant can't queue past it.
        $stmt = $conn->prepare("SELECT SUM(status = 'Active') AS active, SUM(status = 'Pending') AS pending, SUM(LOWER(full_name) = LOWER(?)) AS same_name FROM household_members WHERE rent_application_id = ? AND status IN ('Active', 'Pending')");
        $stmt->bind_param("si", $name, $app_id);
        $stmt->execute();
        $counts = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ((int)$counts['same_name'] > 0) fail(409, "$name is already on your household list.");
        $max = max_occupants_per_unit($conn);
        if (1 + (int)$counts['active'] + (int)$counts['pending'] >= $max) fail(409, "Your unit is limited to $max occupants, including you.");

        $contact_val = $contact === '' ? null : $contact;
        $stmt = $conn->prepare("INSERT INTO household_members (rent_application_id, full_name, relationship, contact_no, status) VALUES (?, ?, ?, ?, 'Pending')");
        $stmt->bind_param("isss", $app_id, $name, $relationship, $contact_val);
        if (!$stmt->execute()) fail(500, "Could not submit the request.");
        $member_id = $stmt->insert_id;
        $stmt->close();

        create_notification($conn, $auth['id'], 'household_request', "Household Member Request",
            "$holder (Unit $room) asked to add $name ($relationship) to the household.", 'Pending', "add:$member_id");
        log_activity($conn, $auth['id'], 'tenant', 'Requested Household Member', "Unit $room: add $name ($relationship)");
        echo json_encode(["success" => true, "message" => "Request sent. $name will appear on your household once management approves."]);
        break;
    }

    case 'remove': {
        $member_id = (int)($input['memberId'] ?? 0);
        $stmt = $conn->prepare("SELECT id, full_name, status, removal_requested_at FROM household_members WHERE id = ? AND rent_application_id = ?");
        $stmt->bind_param("ii", $member_id, $app_id);
        $stmt->execute();
        $member = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$member) fail(404, "Household member not found.");
        $name = $member['full_name'];

        if ($member['status'] === 'Pending') {
            // Withdrawing a request that hasn't been decided needs no approval.
            $upd = $conn->prepare("UPDATE household_members SET status = 'Cancelled' WHERE id = ? AND status = 'Pending'");
            $upd->bind_param("i", $member_id);
            $upd->execute();
            $upd->close();
            $meta = "add:$member_id";
            $close = $conn->prepare("UPDATE notifications SET status = 'Rejected', is_read = 1 WHERE type = 'household_request' AND status = 'Pending' AND metadata_value = ?");
            $close->bind_param("s", $meta);
            $close->execute();
            $close->close();
            log_activity($conn, $auth['id'], 'tenant', 'Withdrew Household Request', "Unit $room: $name");
            echo json_encode(["success" => true, "message" => "Request withdrawn."]);
            break;
        }

        if ($member['status'] !== 'Active') fail(409, "$name is not on your household.");
        if ($member['removal_requested_at'] !== null) fail(409, "A removal request for $name is already waiting for approval.");

        $upd = $conn->prepare("UPDATE household_members SET removal_requested_at = NOW() WHERE id = ? AND status = 'Active' AND removal_requested_at IS NULL");
        $upd->bind_param("i", $member_id);
        $upd->execute();
        $claimed = $upd->affected_rows > 0;
        $upd->close();
        if (!$claimed) fail(409, "A removal request for $name is already waiting for approval.");

        create_notification($conn, $auth['id'], 'household_request', "Household Removal Request",
            "$holder (Unit $room) asked to remove $name from the household.", 'Pending', "remove:$member_id");
        log_activity($conn, $auth['id'], 'tenant', 'Requested Household Removal', "Unit $room: remove $name");
        echo json_encode(["success" => true, "message" => "Removal request sent for approval."]);
        break;
    }

    default:
        fail(422, "Unknown action.");
}

$conn->close();
?>
