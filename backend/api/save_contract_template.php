<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";
require_once __DIR__ . '/../contract_template.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed"]);
    exit;
}

$admin_id = require_admin($conn);

$input = read_json_input(['*']);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "No data received"]);
    exit;
}

$error = null;
$clean = contract_template_sanitize($input['template'] ?? null, $error);
if ($clean === null) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => $error]);
    exit;
}

$note = ct_clean_string($input['note'] ?? '', CONTRACT_LIMITS['note'], 'Change note', false, $error);
if ($error) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => $error]);
    exit;
}

// Optimistic lock: the editor sends the version it loaded. If another admin
// saved since, refuse rather than silently overwrite their clauses.
$current = contract_template_current($conn);
$base_version = filter_var($input['base_version'] ?? null, FILTER_VALIDATE_INT);
// Version 1 written by contract_template_pin_version_id() (no author) is the
// same built-in default the editor showed as version 0 — not a competing edit.
$auto_pinned_default = $base_version === 0 && (int)$current['version'] === 1 && $current['created_by'] === null;
if ($base_version === false || ($base_version !== (int)$current['version'] && !$auto_pinned_default)) {
    http_response_code(409);
    echo json_encode([
        "success" => false,
        "message" => "The contract was changed by someone else (now version {$current['version']}). Reload to see their changes before saving.",
        "version" => (int)$current['version'],
    ]);
    exit;
}

if (!$current['is_default'] && $current['content'] == $clean) {
    echo json_encode(["success" => true, "changed" => false, "message" => "No changes to save.", "version" => (int)$current['version']]);
    exit;
}

$next_version = (int)$current['version'] + 1;
$content = json_encode($clean, JSON_UNESCAPED_UNICODE);
$note_value = $note === '' ? null : $note;
$stmt = $conn->prepare("INSERT INTO contract_template_versions (version, content, note, created_by) VALUES (?, ?, ?, ?)");
$stmt->bind_param("issi", $next_version, $content, $note_value, $admin_id);
if (!$stmt->execute()) {
    // uniq_template_version: another save took this number between the check and the insert.
    $stmt->close();
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "The contract was saved by someone else at the same moment. Reload and try again."]);
    exit;
}
$new_id = $stmt->insert_id;
$stmt->close();

$sections = count($clean['terms']['sections']);
$clauses = array_sum(array_map(fn($s) => count($s['clauses']), $clean['terms']['sections']));
$details = "Saved version $next_version (" . contract_template_change_summary($current['content'], $clean) . "; $sections sections, $clauses clauses)"
    . ($note_value ? ". Note: $note_value" : '');
log_activity($conn, $admin_id, 'contract', 'Updated Contract Template', $details);

echo json_encode(["success" => true, "changed" => true, "message" => "Contract saved as version $next_version.", "version" => $next_version, "id" => $new_id]);
$conn->close();
?>
