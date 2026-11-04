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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
}

$service_id = (int)($_POST['serviceId'] ?? 0);
$preferred_date = $_POST['preferredDate'] ?? '';
$preferred_time_slot = strtolower(trim($_POST['preferredTimeSlot'] ?? ''));
$notes = trim($_POST['notes'] ?? '');
$quantity_input = $_POST['quantity'] ?? 1;
$auth = require_user($conn);
$user_id = $auth['id'];

if (!$service_id || empty($preferred_date) || empty($preferred_time_slot)) {
    echo json_encode(["success" => false, "message" => "Please fill in all required fields."]);
    exit;
}

if (!isset(SERVICE_SLOT_START_HOUR[$preferred_time_slot])) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Preferred time must be morning or afternoon.", "errors" => ["preferredTimeSlot" => "Choose morning or afternoon."]]);
    exit;
}

//1.PricingIsAlwaysReDerivedFromTheDatabase-NeverFromTheClientPayload
$stmt = $conn->prepare("SELECT category, name, price, pricing_unit, min_quantity, max_quantity, lead_time_days, max_per_slot, is_active FROM service_catalog WHERE id = ?");
$stmt->bind_param("i", $service_id);
$stmt->execute();
$service = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$service) {
    echo json_encode(["success" => false, "message" => "That service is no longer available."]);
    exit;
}

if (!(int)$service['is_active']) {
    echo json_encode(["success" => false, "message" => "\"" . $service['name'] . "\" is not currently accepting bookings."]);
    exit;
}

//2.TheWholeCategoryCanAlsoBeSwitchedOffFromAdminServicePage
$category = $service['category'];
$setting_key = "service_{$category}_active";
$stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?");
$stmt->bind_param("s", $setting_key);
$stmt->execute();
$setting = $stmt->get_result()->fetch_assoc();
$stmt->close();

if ($setting && $setting['setting_value'] !== 'true') {
    echo json_encode(["success" => false, "message" => ucfirst($category) . " services are currently unavailable."]);
    exit;
}

//3.ClampQuantityToTheCatalogRange;SessionPricedServicesAreAlwaysOne
$unit_price = (float)$service['price'];
$pricing_unit = $service['pricing_unit'];
$min_qty = (float)$service['min_quantity'];
$max_qty = $service['max_quantity'] === null ? null : (float)$service['max_quantity'];

$quantity = is_numeric($quantity_input) ? (float)$quantity_input : $min_qty;
if ($pricing_unit === 'item' && $quantity != floor($quantity)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Items are booked in whole numbers.", "errors" => ["quantity" => "Enter a whole number."]]);
    exit;
}
if ($pricing_unit === 'session') {
    $quantity = 1;
} else {
    if ($quantity < $min_qty) $quantity = $min_qty;
    if ($max_qty !== null && $quantity > $max_qty) $quantity = $max_qty;
}

$total_cost = round($unit_price * $quantity, 2);

//4.RejectInvalidDatesAndDatesInsideTheServicesLeadTime
$parsed_date = DateTime::createFromFormat('Y-m-d', $preferred_date);
if (!$parsed_date || $parsed_date->format('Y-m-d') !== $preferred_date) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Invalid preferred date."]);
    exit;
}
$lead_days = (int)$service['lead_time_days'];
$earliest = (new DateTime('now', new DateTimeZone('Asia/Manila')))->modify("+$lead_days days")->format('Y-m-d');
$latest = (new DateTime('now', new DateTimeZone('Asia/Manila')))->modify('+' . max(SERVICE_MAX_ADVANCE_DAYS, $lead_days) . ' days')->format('Y-m-d');
if ($preferred_date > $latest) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Bookings can be made up to " . max(SERVICE_MAX_ADVANCE_DAYS, $lead_days) . " days ahead (until $latest).", "errors" => ["preferredDate" => "Pick a date on or before $latest."]]);
    exit;
}
if ($preferred_date < $earliest) {
    echo json_encode(["success" => false, "message" => "\"" . $service['name'] . "\" needs at least $lead_days day(s) notice. Earliest available date is $earliest."]);
    exit;
}

//5.OnlyActiveTenantsCanBook-ACompletedBookingIsBilledToTheirInvoice
$lease = get_active_tenancy($conn, $user_id);
if (!$lease) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Only tenants with an active rental can book services."]);
    exit;
}
$room_name = $lease['room_name'];

// The same open booking twice (a double tap, or a second tab) is almost never intended.
$stmt = $conn->prepare("SELECT id FROM service_requests WHERE user_id = ? AND service_id = ? AND preferred_date = ? AND preferred_time_slot = ? AND status IN ('Pending', 'Approved', 'In Progress') LIMIT 1");
$stmt->bind_param("iiss", $user_id, $service_id, $preferred_date, $preferred_time_slot);
$stmt->execute();
$duplicate = $stmt->get_result()->fetch_assoc();
$stmt->close();
if ($duplicate) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "You already have this service booked for that date and time."]);
    exit;
}

//6.OptionalAttachment(ReferencePhotoOfTheGarmentOrArea)
$attachment_path = null;

if (isset($_FILES['uploadedFile']) && $_FILES['uploadedFile']['error'] !== UPLOAD_ERR_NO_FILE) {

    if ($_FILES['uploadedFile']['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(["success" => false, "message" => "File upload error. The file may be too large."]);
        exit;
    }

    $file_name = basename($_FILES['uploadedFile']['name']);
    $file_tmp = $_FILES['uploadedFile']['tmp_name'];
    $file_ext = strtolower(pathinfo($file_name, PATHINFO_EXTENSION));

    $allowed_extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];

    if (!in_array($file_ext, $allowed_extensions)) {
        echo json_encode(["success" => false, "message" => "Invalid file format. Allowed formats: JPG, PNG, GIF, WEBP or PDF."]);
        exit;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file_tmp);
    finfo_close($finfo);

    $allowed_mimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!in_array($mime, $allowed_mimes)) {
        echo json_encode(["success" => false, "message" => "File content does not match an allowed image or PDF format."]);
        exit;
    }

    $upload_dir = "../uploads/services/";

    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0755, true);
    }

    $attachment_extension = pathinfo($file_name, PATHINFO_EXTENSION);
    $unique_file_name = bin2hex(random_bytes(16)) . "." . $attachment_extension;

    if (move_uploaded_file($file_tmp, $upload_dir . $unique_file_name)) {
        // Store the WEB-relative path so the frontend can link it directly
        $attachment_path = "uploads/services/" . $unique_file_name;
    } else {
        echo json_encode(["success" => false, "message" => "Failed to save the attached file."]);
        exit;
    }
}

//7.SnapshotTheCatalogDetailsSoLaterRepricingCannotRewriteHistory
$service_name = $service['name'];

// A service can cap how many bookings share one time slot. The catalog row is locked so
// two tenants taking the last place at once cannot both get it.
$slot_limit = $service['max_per_slot'] === null ? null : (int)$service['max_per_slot'];
$conn->begin_transaction();
if ($slot_limit !== null) {
    $stmt = $conn->prepare("SELECT id FROM service_catalog WHERE id = ? FOR UPDATE");
    $stmt->bind_param("i", $service_id);
    $stmt->execute();
    $stmt->close();
    if (service_slot_taken($conn, $service_id, $preferred_date, $preferred_time_slot) >= $slot_limit) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "That time is fully booked. Please pick another time or day.", "errors" => ["preferredTimeSlot" => "This time is full."]]);
        exit;
    }
}
$stmt = $conn->prepare("INSERT INTO service_requests (user_id, service_id, room_name, service_name, category, unit_price, pricing_unit, quantity, total_cost, preferred_date, preferred_time_slot, notes, attachment_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
$stmt->bind_param(
    "iisssdsddssss",
    $user_id, $service_id, $room_name, $service_name, $category,
    $unit_price, $pricing_unit, $quantity, $total_cost,
    $preferred_date, $preferred_time_slot, $notes, $attachment_path
);

if (!$stmt->execute()) {
    $conn->rollback();
    echo json_encode(["success" => false, "message" => "Failed to submit booking"]);
    $stmt->close();
    $conn->close();
    exit;
}

$request_id = $stmt->insert_id;
$stmt->close();
$conn->commit();

// 8. Admin queue row; its metadata (service_request:<id>) lets
// update_service_status.php resolve this exact row later.
notify_admins_queue($conn, 'service_request', $request_id, "New Service Booking",
    "A new $category booking (\"$service_name\") has been submitted for " . date('M j, Y', strtotime($preferred_date)) . " ($preferred_time_slot).");

create_notification($conn, $user_id, 'service_status', "Service Booking Received",
    "We received your \"$service_name\" booking for " . date('M j, Y', strtotime($preferred_date)) . " ($preferred_time_slot). Management will confirm the time.");

log_activity($conn, $user_id, 'service', "Submitted Service Booking", "Service Request ID: $request_id \"$service_name\" x$quantity = " . number_format($total_cost, 2));

echo json_encode([
    "success" => true,
    "message" => "Service booking submitted successfully",
    "id" => $request_id,
    "totalCost" => $total_cost
]);

$conn->close();
?>
