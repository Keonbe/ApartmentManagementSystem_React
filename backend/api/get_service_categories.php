<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Public, like the catalog itself: the labels tenants see on the add-on pages.
$res = $conn->query("SELECT c.id, c.category_key AS `key`, c.label, c.label_fil AS labelFil, c.sort_order AS sortOrder,
                            (SELECT COUNT(*) FROM service_catalog s WHERE s.category = c.category_key) AS itemCount
                     FROM service_categories c ORDER BY c.sort_order ASC, c.id ASC");
if (!$res) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to load categories.", "categories" => []]);
    exit;
}

$categories = [];
while ($row = $res->fetch_assoc()) {
    $row['id'] = (int)$row['id'];
    $row['sortOrder'] = (int)$row['sortOrder'];
    $row['itemCount'] = (int)$row['itemCount'];
    $row['builtin'] = in_array($row['key'], SERVICE_BUILTIN_CATEGORIES, true);
    $categories[] = $row;
}

echo json_encode(["success" => true, "categories" => $categories]);
$conn->close();
