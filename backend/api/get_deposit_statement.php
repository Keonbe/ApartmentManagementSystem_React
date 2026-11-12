<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// The signed-in tenant's own deposit statement (what happened to the deposit at
// move-out and whether a review can still be asked for). Identity from the
// session only; `data` is null until a deposit has been settled.
$auth = require_user($conn);
echo json_encode(["success" => true, "data" => deposit_statement_for_user($conn, (int)$auth['id'])]);
$conn->close();
