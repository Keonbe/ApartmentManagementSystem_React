<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// The documents an applicant uploads (Settings → Application Requirements).
// Any signed-in user reads the active list; an admin may add ?all=1 to see the
// inactive ones too.
$auth = require_user($conn);
$all = $auth['role'] === 'admin' && !empty($_GET['all']);

echo json_encode(["success" => true, "requirements" => application_requirements_list($conn, $all)]);
$conn->close();
