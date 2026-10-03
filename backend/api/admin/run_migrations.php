<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../../config.php';

$auth = require_user($conn);
if ($auth['role'] !== 'admin') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Forbidden: Admin access required']);
    exit;
}

require_once __DIR__ . '/../../cron/migrate.php';

ob_start();
$result = run_migrations($conn);
$capturedOutput = ob_get_clean();
$conn->close();

if (!$result['success']) {
    http_response_code(500);
}

echo json_encode([
    'success' => $result['success'],
    'applied' => $result['applied'],
    'output' => $capturedOutput,
]);