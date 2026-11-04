<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$action = $input['action'] ?? '';

// Categories are data (service_categories), managed from the admin Services page.
$ALLOWED_CATEGORIES = [];
$cat_res = $conn->query("SELECT category_key FROM service_categories ORDER BY sort_order, id");
while ($cat_res && ($cat_row = $cat_res->fetch_assoc())) $ALLOWED_CATEGORIES[] = $cat_row['category_key'];
$ALLOWED_UNITS = ['session', 'kg', 'hour', 'item'];

//SharedValidationForCreateAndUpdate
function validate_payload($input, $ALLOWED_CATEGORIES, $ALLOWED_UNITS) {
    $errors = [];

    $category = $input['category'] ?? '';
    $name = trim($input['name'] ?? '');
    $price = $input['price'] ?? null;
    $unit = $input['pricingUnit'] ?? 'session';
    $min = $input['minQuantity'] ?? 1;
    $max = $input['maxQuantity'] ?? null;
    $lead = $input['leadTimeDays'] ?? 1;
    $per_slot = $input['maxPerSlot'] ?? null;

    if (!in_array($category, $ALLOWED_CATEGORIES, true)) $errors[] = "Category must be one of: " . implode(', ', $ALLOWED_CATEGORIES) . ".";
    if ($name === '') $errors[] = "Service name is required.";
    if (!is_numeric($price) || (float)$price < 0) $errors[] = "Price must be zero or greater.";
    if (!in_array($unit, $ALLOWED_UNITS, true)) $errors[] = "Pricing unit must be one of: " . implode(', ', $ALLOWED_UNITS) . ".";
    if (!is_numeric($min) || (float)$min <= 0) $errors[] = "Minimum quantity must be greater than zero.";
    if ($max !== null && $max !== '' && (!is_numeric($max) || (float)$max < (float)$min)) $errors[] = "Maximum quantity cannot be less than the minimum.";
    if (!is_numeric($lead) || (int)$lead < 0) $errors[] = "Lead time must be zero or more days.";
    if ($per_slot !== null && $per_slot !== '' && (!ctype_digit((string)$per_slot) || (int)$per_slot < 1 || (int)$per_slot > 100)) $errors[] = "Bookings per time slot must be a whole number from 1 to 100, or left empty for no limit.";

    return $errors;
}

try {
    switch ($action) {

        case 'create': {
            $errors = validate_payload($input, $ALLOWED_CATEGORIES, $ALLOWED_UNITS);
            if ($errors) {
                echo json_encode(["success" => false, "message" => implode(' ', $errors)]);
                exit;
            }

            $category = $input['category'];
            $name = trim($input['name']);
            $description = trim($input['description'] ?? '');
            $price = (float)$input['price'];
            $unit = $input['pricingUnit'] ?? 'session';
            $min = (float)($input['minQuantity'] ?? 1);
            $max_raw = $input['maxQuantity'] ?? null;
            $max = ($max_raw === null || $max_raw === '') ? null : (float)$max_raw;
            $lead = (int)($input['leadTimeDays'] ?? 1);
            $icon = $input['icon'] ?? null;
            $is_active = !empty($input['isActive']) ? 1 : 0;
            $sort_order = (int)($input['sortOrder'] ?? 0);
            $per_slot = ($input['maxPerSlot'] ?? null) === null || $input['maxPerSlot'] === '' ? null : (int)$input['maxPerSlot'];

            $stmt = $conn->prepare("INSERT INTO service_catalog (category, name, description, price, pricing_unit, min_quantity, max_quantity, lead_time_days, icon, is_active, sort_order, max_per_slot, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("sssdsddisiiii", $category, $name, $description, $price, $unit, $min, $max, $lead, $icon, $is_active, $sort_order, $per_slot, $admin_id);

            if (!$stmt->execute()) {
                //TheUniqueKeyOnCategory+NameIsTheLikelyCulprit
                $msg = $conn->errno === 1062
                    ? "A $category service named \"$name\" already exists."
                    : "Failed to create service.";
                $stmt->close();
                echo json_encode(["success" => false, "message" => $msg]);
                exit;
            }
            $new_id = $stmt->insert_id;
            $stmt->close();

            log_activity($conn, $admin_id, 'service', "Created Catalog Service", "Service ID: $new_id ($category) \"$name\" at " . number_format($price, 2) . " per $unit");
            echo json_encode(["success" => true, "message" => "Service created successfully.", "id" => $new_id]);
            break;
        }

        case 'update': {
            $id = (int)($input['id'] ?? $input['rawId'] ?? 0);
            if (!$id) {
                echo json_encode(["success" => false, "message" => "Service ID is required."]);
                exit;
            }

            $errors = validate_payload($input, $ALLOWED_CATEGORIES, $ALLOWED_UNITS);
            if ($errors) {
                echo json_encode(["success" => false, "message" => implode(' ', $errors)]);
                exit;
            }

            $category = $input['category'];
            $name = trim($input['name']);
            $description = trim($input['description'] ?? '');
            $price = (float)$input['price'];
            $unit = $input['pricingUnit'] ?? 'session';
            $min = (float)($input['minQuantity'] ?? 1);
            $max_raw = $input['maxQuantity'] ?? null;
            $max = ($max_raw === null || $max_raw === '') ? null : (float)$max_raw;
            $lead = (int)($input['leadTimeDays'] ?? 1);
            $icon = $input['icon'] ?? null;
            $is_active = !empty($input['isActive']) ? 1 : 0;
            $sort_order = (int)($input['sortOrder'] ?? 0);
            $per_slot = ($input['maxPerSlot'] ?? null) === null || $input['maxPerSlot'] === '' ? null : (int)$input['maxPerSlot'];

            $stmt = $conn->prepare("UPDATE service_catalog SET category = ?, name = ?, description = ?, price = ?, pricing_unit = ?, min_quantity = ?, max_quantity = ?, lead_time_days = ?, icon = ?, is_active = ?, sort_order = ?, max_per_slot = ? WHERE id = ?");
            $stmt->bind_param("sssdsddisiiii", $category, $name, $description, $price, $unit, $min, $max, $lead, $icon, $is_active, $sort_order, $per_slot, $id);

            if (!$stmt->execute()) {
                $msg = $conn->errno === 1062
                    ? "A $category service named \"$name\" already exists."
                    : "Failed to update service.";
                $stmt->close();
                echo json_encode(["success" => false, "message" => $msg]);
                exit;
            }
            $stmt->close();

            log_activity($conn, $admin_id, 'service', "Updated Catalog Service", "Service ID: $id ($category) \"$name\" at " . number_format($price, 2) . " per $unit");
            echo json_encode(["success" => true, "message" => "Service updated successfully."]);
            break;
        }

        case 'toggle': {
            $id = (int)($input['id'] ?? $input['rawId'] ?? 0);
            if (!$id) {
                echo json_encode(["success" => false, "message" => "Service ID is required."]);
                exit;
            }
            $is_active = !empty($input['isActive']) ? 1 : 0;

            $stmt = $conn->prepare("SELECT id FROM service_catalog WHERE id = ?");
            $stmt->bind_param("i", $id);
            $stmt->execute();
            $exists = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$exists) {
                http_response_code(404);
                echo json_encode(["success" => false, "message" => "That service no longer exists."]);
                exit;
            }

            $stmt = $conn->prepare("UPDATE service_catalog SET is_active = ? WHERE id = ?");
            $stmt->bind_param("ii", $is_active, $id);
            $stmt->execute();
            $stmt->close();

            $state = $is_active ? 'activated' : 'deactivated';
            log_activity($conn, $admin_id, 'service', "Toggled Catalog Service", "Service ID: $id $state");
            echo json_encode(["success" => true, "message" => "Service $state."]);
            break;
        }

        case 'delete': {
            $id = (int)($input['id'] ?? $input['rawId'] ?? 0);
            if (!$id) {
                echo json_encode(["success" => false, "message" => "Service ID is required."]);
                exit;
            }

            $stmt = $conn->prepare("SELECT id FROM service_catalog WHERE id = ?");
            $stmt->bind_param("i", $id);
            $stmt->execute();
            $exists = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$exists) {
                http_response_code(404);
                echo json_encode(["success" => false, "message" => "That service no longer exists."]);
                exit;
            }

            //BookingsSnapshotTheirServiceDetails,ButKeepingTheRowPreservesTheLink
            $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM service_requests WHERE service_id = ?");
            $stmt->bind_param("i", $id);
            $stmt->execute();
            $used = (int)$stmt->get_result()->fetch_assoc()['c'];
            $stmt->close();

            if ($used > 0) {
                $stmt = $conn->prepare("UPDATE service_catalog SET is_active = 0 WHERE id = ?");
                $stmt->bind_param("i", $id);
                $stmt->execute();
                $stmt->close();

                log_activity($conn, $admin_id, 'service', "Archived Catalog Service", "Service ID: $id deactivated instead of deleted ($used booking(s) reference it)");
                echo json_encode(["success" => true, "message" => "This service has $used booking(s) on record, so it was deactivated rather than deleted."]);
                exit;
            }

            $stmt = $conn->prepare("DELETE FROM service_catalog WHERE id = ?");
            $stmt->bind_param("i", $id);
            $stmt->execute();
            $stmt->close();

            log_activity($conn, $admin_id, 'service', "Deleted Catalog Service", "Service ID: $id permanently deleted");
            echo json_encode(["success" => true, "message" => "Service deleted successfully."]);
            break;
        }

        default:
            echo json_encode(["success" => false, "message" => "Unknown action: $action"]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => public_error_message($e)]);
}

$conn->close();
?>
