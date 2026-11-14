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

$input = read_json_input();
$action = $input['action'] ?? '';

function category_error($message, $field = null) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => $message] + ($field ? ["errors" => [$field => $message]] : []));
    exit;
}

// The key is what services and settings refer to, so it is made once from the name and never changes.
function category_key_from($label) {
    $key = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '_', $label), '_'));
    return substr($key !== '' ? $key : 'category', 0, 20);
}

$label = trim((string)($input['label'] ?? ''));
$label_fil = trim((string)($input['labelFil'] ?? ''));

if (in_array($action, ['create', 'update'], true)) {
    if ($label === '' || mb_strlen($label) > 60) category_error("Enter a name of up to 60 characters.", 'label');
    if (mb_strlen($label_fil) > 60) category_error("The Filipino name can be up to 60 characters.", 'labelFil');
}

switch ($action) {
    case 'create': {
        $base = category_key_from($label);
        $key = $base;
        $n = 2;
        while (true) {
            $stmt = $conn->prepare("SELECT id FROM service_categories WHERE category_key = ?");
            $stmt->bind_param("s", $key);
            $stmt->execute();
            $taken = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$taken) break;
            $suffix = '_' . $n++;
            $key = substr($base, 0, 20 - strlen($suffix)) . $suffix;
        }

        $dup = $conn->prepare("SELECT id FROM service_categories WHERE LOWER(label) = LOWER(?)");
        $dup->bind_param("s", $label);
        $dup->execute();
        if ($dup->get_result()->fetch_assoc()) category_error("A category named \"$label\" already exists.", 'label');
        $dup->close();

        $sort = (int)$conn->query("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM service_categories")->fetch_assoc()['n'];
        $fil = $label_fil === '' ? null : $label_fil;
        $stmt = $conn->prepare("INSERT INTO service_categories (category_key, label, label_fil, sort_order) VALUES (?, ?, ?, ?)");
        $stmt->bind_param("sssi", $key, $label, $fil, $sort);
        $stmt->execute();
        $new_id = $stmt->insert_id;
        $stmt->close();

        log_activity($conn, $admin_id, 'service', "Created Service Category", "Category $key (\"$label\")");
        echo json_encode(["success" => true, "message" => "Category added.", "id" => $new_id, "key" => $key]);
        break;
    }

    case 'update': {
        $id = (int)($input['id'] ?? 0);
        $stmt = $conn->prepare("SELECT id FROM service_categories WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $exists = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$exists) {
            http_response_code(404);
            echo json_encode(["success" => false, "message" => "That category no longer exists."]);
            exit;
        }

        $dup = $conn->prepare("SELECT id FROM service_categories WHERE LOWER(label) = LOWER(?) AND id <> ?");
        $dup->bind_param("si", $label, $id);
        $dup->execute();
        if ($dup->get_result()->fetch_assoc()) category_error("A category named \"$label\" already exists.", 'label');
        $dup->close();

        $fil = $label_fil === '' ? null : $label_fil;
        $stmt = $conn->prepare("UPDATE service_categories SET label = ?, label_fil = ? WHERE id = ?");
        $stmt->bind_param("ssi", $label, $fil, $id);
        $stmt->execute();
        $stmt->close();

        log_activity($conn, $admin_id, 'service', "Renamed Service Category", "Category ID $id is now \"$label\"");
        echo json_encode(["success" => true, "message" => "Category saved."]);
        break;
    }

    case 'delete': {
        $id = (int)($input['id'] ?? 0);
        $stmt = $conn->prepare("SELECT category_key FROM service_categories WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row) {
            http_response_code(404);
            echo json_encode(["success" => false, "message" => "That category no longer exists."]);
            exit;
        }
        if (in_array($row['category_key'], SERVICE_BUILTIN_CATEGORIES, true)) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "Cleaning, Laundry and Other services are built in and cannot be removed. You can rename them."]);
            exit;
        }

        $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM service_catalog WHERE category = ?");
        $stmt->bind_param("s", $row['category_key']);
        $stmt->execute();
        $used = (int)$stmt->get_result()->fetch_assoc()['c'];
        $stmt->close();
        if ($used > 0) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "This category still has $used service(s). Move or remove them first."]);
            exit;
        }

        $stmt = $conn->prepare("DELETE FROM service_categories WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $stmt->close();

        log_activity($conn, $admin_id, 'service', "Deleted Service Category", "Category {$row['category_key']} removed");
        echo json_encode(["success" => true, "message" => "Category removed."]);
        break;
    }

    default:
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Unknown action: $action"]);
}

$conn->close();
