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

//AdminsSeeInactiveRowsToo,TenantsOnlyEverSeeActiveOnes
$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
$is_admin = verify_admin($conn, $admin_id);
$active_only = isset($_GET['active']) && $_GET['active'] === '1';

$where = ($active_only || !$is_admin) ? "WHERE is_active = 1" : "";

$sql = "SELECT id, id AS rawId, category, name, description, price, pricing_unit AS pricingUnit,
               min_quantity AS minQuantity, max_quantity AS maxQuantity,
               lead_time_days AS leadTimeDays, icon, is_active AS isActive, sort_order AS sortOrder,
               max_per_slot AS maxPerSlot,
               (SELECT ROUND(AVG(sr.rating), 2) FROM service_requests sr WHERE sr.service_id = service_catalog.id AND sr.rating IS NOT NULL) AS avgRating,
               (SELECT COUNT(*) FROM service_requests sr WHERE sr.service_id = service_catalog.id AND sr.rating IS NOT NULL) AS ratingCount
        FROM service_catalog
        $where
        ORDER BY sort_order ASC, name ASC";

$res = $conn->query($sql);

if (!$res) {
    echo json_encode(["success" => false, "message" => "Failed to load service catalog.", "services" => []]);
    $conn->close();
    exit;
}

$services = [];
while ($row = $res->fetch_assoc()) {
    $row['price'] = (float)$row['price'];
    $row['minQuantity'] = (float)$row['minQuantity'];
    $row['maxQuantity'] = $row['maxQuantity'] === null ? null : (float)$row['maxQuantity'];
    $row['leadTimeDays'] = (int)$row['leadTimeDays'];
    $row['isActive'] = (int)$row['isActive'];
    $row['sortOrder'] = (int)$row['sortOrder'];
    $row['maxPerSlot'] = $row['maxPerSlot'] === null ? null : (int)$row['maxPerSlot'];
    // Ratings are for the admin: tenants see the catalog without them.
    $row['avgRating'] = $is_admin && $row['avgRating'] !== null ? (float)$row['avgRating'] : null;
    $row['ratingCount'] = $is_admin ? (int)$row['ratingCount'] : 0;
    $services[] = $row;
}

echo json_encode(["success" => true, "services" => $services]);
$conn->close();
?>
