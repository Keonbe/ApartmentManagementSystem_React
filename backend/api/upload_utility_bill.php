<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

function bill_fail($code, $msg) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $msg]);
    exit;
}

// Admin attaches (or replaces / removes) the provider's bill(s) on a reading.
// Supports 1, 2 or more files (e.g. water bill + electricity bill).
$admin_id = (int)require_admin($conn);
$remove = !empty($_POST['remove']);

$incoming_files = [];
if (!$remove) {
    // The named slots first (electricity, then water): the stored name keeps the
    // kind so the viewers can label each file. `bills[]` carries any others.
    foreach (['electric_bill' => 'electric', 'electricity_bill' => 'electric', 'water_bill' => 'water', 'bill' => null] as $k => $kind) {
        if (!empty($_FILES[$k]) && is_array($_FILES[$k]) && ($_FILES[$k]['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            $incoming_files[] = $_FILES[$k] + ['kind' => $kind];
        }
    }
    if (!empty($_FILES['bills']['name'])) {
        if (is_array($_FILES['bills']['name'])) {
            for ($i = 0; $i < count($_FILES['bills']['name']); $i++) {
                if (!empty($_FILES['bills']['name'][$i]) && ($_FILES['bills']['error'][$i] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
                    $incoming_files[] = [
                        'name' => $_FILES['bills']['name'][$i],
                        'type' => $_FILES['bills']['type'][$i] ?? '',
                        'tmp_name' => $_FILES['bills']['tmp_name'][$i],
                        'error' => $_FILES['bills']['error'][$i],
                        'size' => $_FILES['bills']['size'][$i],
                    ];
                }
            }
        } elseif ($_FILES['bills']['error'] !== UPLOAD_ERR_NO_FILE) {
            $incoming_files[] = $_FILES['bills'];
        }
    }
}

$bill_error = '';
if (!$remove) {
    if (empty($incoming_files)) {
        $bill_error = "Choose at least one bill file to attach.";
    } else {
        foreach ($incoming_files as $f) {
            $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
            if (in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || ($f['error'] === UPLOAD_ERR_OK && $f['size'] > 10 * 1024 * 1024)) {
                $bill_error = "Each bill file must not exceed the 10MB size limit.";
                break;
            } elseif ($f['error'] !== UPLOAD_ERR_OK) {
                $bill_error = "One of the file uploads failed. Please try again.";
                break;
            } elseif (!in_array($ext, ['jpg', 'jpeg', 'png', 'pdf'], true)) {
                $bill_error = "Invalid bill format. Allowed: JPG, PNG, PDF.";
                break;
            }
        }
    }
}

$errors = array_filter([
    'reading_id' => v_id($_POST['reading_id'] ?? null, 'Utility reading'),
    'bill' => $bill_error,
]);
if ($errors) validation_fail($errors);
$reading_id = (int)$_POST['reading_id'];

$stmt = $conn->prepare("SELECT id, room_name, user_id, billing_period, bill_file_path FROM utility_readings WHERE id = ?");
$stmt->bind_param("i", $reading_id);
$stmt->execute();
$reading = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$reading) bill_fail(404, "Utility reading not found.");

$new_paths = [];
$dir = '../uploads/utility_bills/';
if (!$remove) {
    if (!file_exists($dir)) mkdir($dir, 0755, true);
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    foreach ($incoming_files as $f) {
        $mime = finfo_file($finfo, $f['tmp_name']);
        if (!in_array($mime, ['image/jpeg', 'image/png', 'application/pdf'], true)) {
            finfo_close($finfo);
            // Delete any files already moved in this batch
            foreach ($new_paths as $np) { @unlink(__DIR__ . '/../' . $np); }
            validation_fail(['bill' => "File content does not match allowed formats."]);
        }
        $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
        $name = 'bill_' . (empty($f['kind']) ? '' : $f['kind'] . '_') . bin2hex(random_bytes(16)) . '.' . $ext;
        if (!move_uploaded_file($f['tmp_name'], $dir . $name)) {
            finfo_close($finfo);
            foreach ($new_paths as $np) { @unlink(__DIR__ . '/../' . $np); }
            bill_fail(500, "Failed to save the bill. Please try again.");
        }
        $new_paths[] = 'uploads/utility_bills/' . $name;
    }
    finfo_close($finfo);
}

$new_val = null;
if (count($new_paths) === 1) {
    $new_val = $new_paths[0];
} elseif (count($new_paths) > 1) {
    $new_val = json_encode($new_paths, JSON_UNESCAPED_SLASHES);
}

$upd = $conn->prepare("UPDATE utility_readings SET bill_file_path = ? WHERE id = ?");
$upd->bind_param("si", $new_val, $reading_id);
$saved = $upd->execute();
$upd->close();
if (!$saved) {
    // Keep the old file: the row still points at it.
    foreach ($new_paths as $np) { @unlink(__DIR__ . '/../' . $np); }
    bill_fail(500, "Failed to save the bill. Please try again.");
}

// Clean up previously stored files (support single path or JSON array of paths)
if (!empty($reading['bill_file_path'])) {
    $old_paths = [];
    if (str_starts_with($reading['bill_file_path'], '[') && ($arr = json_decode($reading['bill_file_path'], true)) && is_array($arr)) {
        $old_paths = $arr;
    } else {
        $old_paths = [$reading['bill_file_path']];
    }
    $base = realpath(__DIR__ . '/../uploads/utility_bills');
    foreach ($old_paths as $op) {
        $old = realpath(__DIR__ . '/../' . $op);
        if ($old && $base && strncmp($old, $base, strlen($base)) === 0) {
            @unlink($old);
        }
    }
}

$label = is_valid_utility_period($reading['billing_period']) ? utility_period_label($reading['billing_period']) : $reading['billing_period'];
log_activity($conn, $admin_id, 'utilities', $remove ? 'Removed Utility Bill File' : 'Attached Utility Bill File', "Unit {$reading['room_name']}, $label");
if (!$remove && $reading['user_id']) {
    create_notification($conn, (int)$reading['user_id'], 'billing', 'Utility Bill Attached',
        "The utility bill for Unit {$reading['room_name']} ($label) is ready to view on your Utilities page.");
}

echo json_encode([
    "success" => true,
    "message" => $remove ? "Bill file removed." : (count($new_paths) > 1 ? count($new_paths) . " bill files attached." : "Bill file attached."),
    "bill_file_path" => $new_paths[0] ?? null,
    "bill_file_paths" => $new_paths
]);
$conn->close();
