<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";
require_once __DIR__ . '/../contract_template.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Signed-in users only: the document carries the landlord's payment account
// numbers, which get_system_settings.php (public) must not serve.
$auth = require_user($conn);
$is_admin = $auth['role'] === 'admin';

// ?history=1 — admin version list for the editor.
if (isset($_GET['history'])) {
    if (!$is_admin) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
        exit;
    }
    $versions = [];
    $res = $conn->query("SELECT v.id, v.version, v.note, v.created_at,
                                TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS created_by_name
                         FROM contract_template_versions v LEFT JOIN users u ON u.id = v.created_by
                         ORDER BY v.version DESC LIMIT 50");
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $row['id'] = (int)$row['id'];
            $row['version'] = (int)$row['version'];
            $versions[] = $row;
        }
    }
    echo json_encode(["success" => true, "versions" => $versions]);
    exit;
}

// ?default=1 — the built-in contract, for the editor's "Reset to default".
if (isset($_GET['default'])) {
    if (!$is_admin) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
        exit;
    }
    echo json_encode(["success" => true, "template" => contract_template_default($conn)], JSON_UNESCAPED_UNICODE);
    exit;
}

$current = contract_template_current($conn);
$template = $current['content'];
$terms_version = null;

// ?version_id= — the terms a contract was issued under. Landlord details,
// payment accounts and custom values stay current (a changed GCash number must
// reach existing tenants); only the sections and clauses are taken from the
// pinned version. ?full=1 (admin) returns that version untouched, for restoring
// it in the editor.
if (isset($_GET['version_id']) && $_GET['version_id'] !== '') {
    $version_id = filter_var($_GET['version_id'], FILTER_VALIDATE_INT);
    if (!$version_id || $version_id < 1) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Invalid template version."]);
        exit;
    }
    if (!$is_admin) {
        // A tenant may read only a version one of their own contracts was issued under.
        $own = $conn->prepare("SELECT 1 FROM lease_contracts lc JOIN rent_applications ra ON ra.id = lc.rent_application_id
                               WHERE lc.template_version_id = ? AND ra.user_id = ? LIMIT 1");
        $own->bind_param("ii", $version_id, $auth['id']);
        $own->execute();
        $allowed = (bool)$own->get_result()->fetch_row();
        $own->close();
        if (!$allowed) {
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "Forbidden: not your contract."]);
            exit;
        }
    }
    $pinned = contract_template_row($conn, $version_id);
    if (!$pinned) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Template version not found."]);
        exit;
    }
    if ($is_admin && !empty($_GET['full'])) {
        $template = $pinned['content'];
    } else {
        $template['terms'] = $pinned['content']['terms'] ?? $template['terms'];
    }
    $terms_version = (int)$pinned['version'];
}

echo json_encode([
    "success" => true,
    "template" => $template,
    "version" => (int)$current['version'],
    "terms_version" => $terms_version ?? (int)$current['version'],
    "is_default" => $current['is_default'],
    "updated_at" => $current['created_at'],
    "updated_by" => $current['created_by_name'] ?: null,
    "note" => $current['note'],
], JSON_UNESCAPED_UNICODE);
$conn->close();
?>
