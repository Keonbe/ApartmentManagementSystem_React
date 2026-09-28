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

// The tenant scope is the session user. It used to fall back to ?userId= with no
// authentication, which returned any tenant's visitor log (names, contact numbers,
// ID numbers) to anyone.
$auth = require_user($conn);
$isAdmin = $auth['role'] === 'admin';
$user_id = $auth['id'];

// Alert admins/host on any visit that has just crossed the overstay
// threshold — cheap and indexed, and this page is the one place both
// audiences actually look at visitor status.
try {
    alert_overstayed_visitors($conn);
} catch (Throwable $e) {
    error_log('[AMS] alert_overstayed_visitors: ' . $e->getMessage());
}

try {
    // 1. Fetch configurable overstay threshold from system_settings
    $overstay_hours = 24;
    $set_res = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'visitor_overstay_hours' LIMIT 1");
    if ($set_res && $set_row = $set_res->fetch_assoc()) {
        $val = (int)$set_row['setting_value'];
        if ($val > 0) $overstay_hours = $val;
    }

    // 2. Build filters
    $where_clauses = [];
    $params = [];
    $types = "";

    // Scoping
    if (!$isAdmin) {
        // Tenant view: strictly the visitors THIS tenant registered or was
        // hosting (walk-ins are stamped with the current occupant's user_id
        // at check-in). Matching by current room used to also surface a
        // PREVIOUS occupant's visitors for the same unit — names, phone
        // numbers and ID numbers included.
        $where_clauses[] = "v.user_id = ?";
        $params[] = (int)$user_id;
        $types .= "i";
    } else {
        if (!empty($_GET['unit']) && $_GET['unit'] !== 'all') {
            $where_clauses[] = "v.room_name = ?";
            $params[] = $_GET['unit'];
            $types .= "s";
        }
    }

    // Search filter
    if (!empty($_GET['search'])) {
        $search = "%" . trim($_GET['search']) . "%";
        $where_clauses[] = "(v.visitor_name LIKE ? OR v.contact_number LIKE ? OR v.vehicle_plate LIKE ? OR v.room_name LIKE ? OR v.purpose LIKE ?)";
        $params[] = $search;
        $params[] = $search;
        $params[] = $search;
        $params[] = $search;
        $params[] = $search;
        $types .= "sssss";
    }

    // Status filter
    if (!empty($_GET['status']) && $_GET['status'] !== 'all') {
        $status_filter = $_GET['status'];
        if ($status_filter === 'overstayed') {
            $where_clauses[] = "(v.status = 'checked_in' AND TIMESTAMPDIFF(HOUR, v.check_in_at, NOW()) >= ?)";
            $params[] = $overstay_hours;
            $types .= "i";
        } else {
            $where_clauses[] = "v.status = ?";
            $params[] = $status_filter;
            $types .= "s";
        }
    }

    // Date range filter
    if (!empty($_GET['startDate'])) {
        $where_clauses[] = "DATE(v.check_in_at) >= ?";
        $params[] = $_GET['startDate'];
        $types .= "s";
    }
    if (!empty($_GET['endDate'])) {
        $where_clauses[] = "DATE(v.check_in_at) <= ?";
        $params[] = $_GET['endDate'];
        $types .= "s";
    }

    $where_sql = count($where_clauses) > 0 ? "WHERE " . implode(" AND ", $where_clauses) : "";

    $sql = "SELECT 
                v.*,
                CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS host_name,
                u.email_address AS host_email,
                TIMESTAMPDIFF(HOUR, v.check_in_at, COALESCE(v.check_out_at, NOW())) AS elapsed_hours,
                TIMESTAMPDIFF(MINUTE, v.check_in_at, COALESCE(v.check_out_at, NOW())) AS elapsed_minutes
            FROM visitor_logs v
            LEFT JOIN users u ON v.user_id = u.id
            $where_sql
            ORDER BY v.id DESC";

    if (!empty($params)) {
        $stmt = $conn->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $res = $stmt->get_result();
    } else {
        $res = $conn->query($sql);
    }

    $visitors = [];
    while ($row = $res->fetch_assoc()) {
        $is_overstayed = ($row['status'] === 'checked_in' && (int)$row['elapsed_hours'] >= $overstay_hours);
        $display_status = $is_overstayed ? 'overstayed' : $row['status'];

        $duration_formatted = "";
        $mins = (int)$row['elapsed_minutes'];
        if ($mins < 60) {
            $duration_formatted = $mins . "m";
        } else {
            $hrs = floor($mins / 60);
            $rem_mins = $mins % 60;
            $duration_formatted = $hrs . "h " . ($rem_mins > 0 ? $rem_mins . "m" : "");
        }

        $visitors[] = [
            'id' => (int)$row['id'],
            'userId' => $row['user_id'] ? (int)$row['user_id'] : null,
            'hostName' => trim($row['host_name']) !== '' ? trim($row['host_name']) : 'Resident',
            'hostEmail' => $row['host_email'] ?? '',
            'unit' => $row['room_name'],
            'visitorName' => $row['visitor_name'],
            'contactNumber' => $row['contact_number'],
            'idType' => $row['id_type'] ?? 'ID',
            'idNumber' => $row['id_number'] ?? '',
            'idPhotoPath' => $row['id_photo_path'] ?? '',
            'purpose' => $row['purpose'],
            'vehiclePlate' => $row['vehicle_plate'] ?? '',
            'rawStatus' => $row['status'],
            'status' => $display_status,
            'isOverstayed' => $is_overstayed,
            'expectedAt' => $row['expected_at'],
            'expectedCheckOutAt' => $row['expected_check_out_at'] ?? null,
            'checkInAt' => $row['check_in_at'],
            'checkOutAt' => $row['check_out_at'],
            'checkoutNotes' => $row['checkout_notes'] ?? '',
            'adminNotes' => $row['admin_notes'] ?? '',
            'duration' => $duration_formatted,
            'elapsedHours' => (int)$row['elapsed_hours'],
            'createdAt' => $row['created_at']
        ];
    }

    // 3. Compute stats summary
    $stats_scope = "";
    $stats_params = [];
    $stats_types = "";
    if (!$isAdmin) {
        $stats_scope = "WHERE user_id = ?";
        $stats_params = [(int)$user_id];
        $stats_types = "i";
    }

    // Queries for stats
    $stats_sql = "SELECT 
                    COUNT(*) as total_count,
                    SUM(CASE WHEN status = 'pending_approval' THEN 1 ELSE 0 END) as pending_count,
                    SUM(CASE WHEN status = 'checked_in' AND TIMESTAMPDIFF(HOUR, check_in_at, NOW()) < ? THEN 1 ELSE 0 END) as active_count,
                    SUM(CASE WHEN status = 'checked_in' AND TIMESTAMPDIFF(HOUR, check_in_at, NOW()) >= ? THEN 1 ELSE 0 END) as overstay_count,
                    SUM(CASE WHEN DATE(check_in_at) = CURDATE() THEN 1 ELSE 0 END) as today_count
                  FROM visitor_logs $stats_scope";

    $stmt_stats = $conn->prepare($stats_sql);
    if (!$isAdmin) {
        $stmt_stats->bind_param("ii" . $stats_types, $overstay_hours, $overstay_hours, ...$stats_params);
    } else {
        $stmt_stats->bind_param("ii", $overstay_hours, $overstay_hours);
    }
    $stmt_stats->execute();
    $stats_row = $stmt_stats->get_result()->fetch_assoc();

    $stats = [
        'total_count' => (int)($stats_row['total_count'] ?? 0),
        'pending_count' => (int)($stats_row['pending_count'] ?? 0),
        'active_count' => (int)($stats_row['active_count'] ?? 0),
        'overstay_count' => (int)($stats_row['overstay_count'] ?? 0),
        'today_count' => (int)($stats_row['today_count'] ?? 0),
        'overstay_threshold_hours' => $overstay_hours
    ];

    echo json_encode([
        "success" => true,
        "visitors" => $visitors,
        "stats" => $stats
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$conn->close();
?>