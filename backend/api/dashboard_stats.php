<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$response = [
    'success' => true,
    'stats' => [
        'total_revenue' => 0,
        'last_month_revenue' => 0,
        'revenue_trend' => null,
        'pending_dues' => 0,
        'overdue_dues' => 0,
        'overdue_count' => 0,
        'total_tenants' => 0,
        'pending_applications' => 0,
        'occupancy_rate' => 0,
        'occupied_rooms' => 0,
        'total_rooms' => 0,
        'vacant_rooms' => 0,
        'open_maintenance' => 0,
        'urgent_maintenance' => 0,
        'collection_rate' => 0,
        'total_6m_collected' => 0,
        'avg_monthly_income' => 0,
    ],
    'income_data' => [],
    'new_tenants' => [],
];

try {
    // 1. Total Revenue (Current Month & Previous Month for MoM Trend)
    $stmt = $conn->prepare("
        SELECT 
            SUM(CASE WHEN MONTH(COALESCE(paid_at, created_at)) = MONTH(CURRENT_DATE()) AND YEAR(COALESCE(paid_at, created_at)) = YEAR(CURRENT_DATE()) THEN COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking) ELSE 0 END) as current_revenue,
            SUM(CASE WHEN MONTH(COALESCE(paid_at, created_at)) = MONTH(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)) AND YEAR(COALESCE(paid_at, created_at)) = YEAR(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)) THEN COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking) ELSE 0 END) as last_revenue
        FROM invoices 
        WHERE LOWER(status) = 'paid'
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    if ($row = $res->fetch_assoc()) {
        $cur = (float)($row['current_revenue'] ?? 0);
        $last = (float)($row['last_revenue'] ?? 0);
        $response['stats']['total_revenue'] = $cur;
        $response['stats']['last_month_revenue'] = $last;
        if ($last > 0) {
            $diff = round((($cur - $last) / $last) * 100);
            $response['stats']['revenue_trend'] = ($diff >= 0 ? "+{$diff}%" : "{$diff}%");
        } elseif ($cur > 0) {
            $response['stats']['revenue_trend'] = "+100%";
        }
    }
    $stmt->close();

    // 2. Pending Dues & Overdue Receivables
    $stmt = $conn->prepare("
        SELECT 
            SUM(COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking)) as total_pending,
            SUM(CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE() THEN COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking) ELSE 0 END) as overdue_total,
            SUM(CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE() THEN 1 ELSE 0 END) as overdue_cnt
        FROM invoices 
        WHERE LOWER(status) IN ('pending', 'unpaid', 'overdue', 'pending-verification')
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    if ($row = $res->fetch_assoc()) {
        $response['stats']['pending_dues'] = (float)($row['total_pending'] ?? 0);
        $response['stats']['overdue_dues'] = (float)($row['overdue_total'] ?? 0);
        $response['stats']['overdue_count'] = (int)($row['overdue_cnt'] ?? 0);
    }
    $stmt->close();

    // 3. Total Active Tenants & Pending Applications
    $stmt = $conn->prepare("
        SELECT 
            SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) as active_tenants,
            SUM(CASE WHEN status IN ('Pending Review', 'Pending') THEN 1 ELSE 0 END) as pending_apps
        FROM rent_applications
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    if ($row = $res->fetch_assoc()) {
        $response['stats']['total_tenants'] = (int)($row['active_tenants'] ?? 0);
        $response['stats']['pending_applications'] = (int)($row['pending_apps'] ?? 0);
    }
    $stmt->close();

    // 4. Room Stats & Occupancy Rate
    $stmt = $conn->prepare("
        SELECT 
            COUNT(*) as total, 
            SUM(CASE WHEN LOWER(status) = 'occupied' THEN 1 ELSE 0 END) as occupied, 
            SUM(CASE WHEN LOWER(status) = 'vacant' THEN 1 ELSE 0 END) as vacant 
        FROM rooms
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    if ($row = $res->fetch_assoc()) {
        $totalRooms = (int)($row['total'] ?? 0);
        $occupied = (int)($row['occupied'] ?? 0);
        $vacant = (int)($row['vacant'] ?? 0);
        $response['stats']['total_rooms'] = $totalRooms;
        $response['stats']['occupied_rooms'] = $occupied;
        $response['stats']['vacant_rooms'] = $vacant;
        if ($totalRooms > 0) {
            $response['stats']['occupancy_rate'] = round(($occupied / $totalRooms) * 100);
        }
    }
    $stmt->close();

    // 5. Open & Urgent Maintenance Requests
    $stmt = $conn->prepare("
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN LOWER(urgency) IN ('emergency', 'urgent', 'high') THEN 1 ELSE 0 END) as urgent_total
        FROM maintenance_requests 
        WHERE status IN ('Pending', 'In Progress')
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    if ($row = $res->fetch_assoc()) {
        $response['stats']['open_maintenance'] = (int)($row['total'] ?? 0);
        $response['stats']['urgent_maintenance'] = (int)($row['urgent_total'] ?? 0);
    }
    $stmt->close();

    // 6. Collection Rate (Current Month)
    $stmt = $conn->prepare("
        SELECT 
            SUM(CASE WHEN LOWER(status) = 'paid' THEN COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking) ELSE 0 END) as collected,
            SUM(COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking)) as total
        FROM invoices 
        WHERE MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    if ($row = $res->fetch_assoc()) {
        $total = (float)($row['total'] ?? 0);
        $collected = (float)($row['collected'] ?? 0);
        if ($total > 0) {
            $response['stats']['collection_rate'] = round(($collected / $total) * 100);
        } else {
            $response['stats']['collection_rate'] = 100;
        }
    }
    $stmt->close();

    // 7. Rolling 6-Month Income Data
    $months = [];
    for ($i = 5; $i >= 0; $i--) {
        $time = strtotime("first day of -$i month");
        $key = date('Y-m', $time);
        $months[$key] = [
            'key' => $key,
            'month' => date('M', $time),
            'full_month' => date('M Y', $time),
            'collected' => 0.0,
            'pending' => 0.0,
            'billed' => 0.0,
            'count' => 0,
        ];
    }

    $stmt = $conn->prepare("
        SELECT 
            DATE_FORMAT(created_at, '%Y-%m') as m_key, 
            SUM(CASE WHEN LOWER(status) = 'paid' THEN COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking) ELSE 0 END) as collected_val,
            SUM(CASE WHEN LOWER(status) IN ('pending', 'unpaid', 'overdue', 'pending-verification') THEN COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking) ELSE 0 END) as pending_val,
            SUM(COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking)) as billed_val,
            COUNT(*) as total_cnt
        FROM invoices 
        WHERE created_at >= DATE_SUB(DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
        GROUP BY m_key
        ORDER BY m_key ASC
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    $total6mCollected = 0;
    while ($row = $res->fetch_assoc()) {
        $k = $row['m_key'];
        if (isset($months[$k])) {
            $months[$k]['collected'] = (float)$row['collected_val'];
            $months[$k]['pending'] = (float)$row['pending_val'];
            $months[$k]['billed'] = (float)$row['billed_val'];
            $months[$k]['count'] = (int)$row['total_cnt'];
            $total6mCollected += (float)$row['collected_val'];
        }
    }
    $stmt->close();

    $response['income_data'] = array_values($months);
    $response['stats']['total_6m_collected'] = $total6mCollected;
    $response['stats']['avg_monthly_income'] = round($total6mCollected / 6);

    // 8. Newest Approved Tenants
    $stmt = $conn->prepare("
        SELECT u.first_name, u.last_name, ra.room_name, ra.created_at 
        FROM rent_applications ra 
        JOIN users u ON ra.user_id = u.id 
        WHERE ra.status = 'Approved' 
        ORDER BY ra.created_at DESC 
        LIMIT 5
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $response['new_tenants'][] = [
            'name' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
            'unit' => $row['room_name'] ?? 'N/A',
            'date' => date('M d, Y', strtotime($row['created_at']))
        ];
    }
    $stmt->close();

    // 9. Operational Action Queues (Pending Approvals, Invoices, Maintenance)
    $response['pending_actions'] = [
        'applications' => [],
        'invoices' => [],
        'maintenance' => []
    ];

    // 9a. Pending Applications
    $stmt = $conn->prepare("
        SELECT id, first_name, last_name, room_name, monthly_rent, created_at 
        FROM rent_applications 
        WHERE status IN ('Pending Review', 'Pending') 
        ORDER BY created_at DESC 
        LIMIT 4
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $response['pending_actions']['applications'][] = [
            'id' => $row['id'],
            'name' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
            'unit' => $row['room_name'] ?? 'Unassigned',
            'rent' => (float)($row['monthly_rent'] ?? 0),
            'date' => date('M d, Y', strtotime($row['created_at']))
        ];
    }
    $stmt->close();

    // 9b. Pending / Unverified Invoices
    $stmt = $conn->prepare("
        SELECT i.id, u.first_name, u.last_name, ra.room_name, i.total_amount, i.status, i.due_date, i.billing_period 
        FROM invoices i
        LEFT JOIN users u ON i.user_id = u.id
        LEFT JOIN rent_applications ra ON u.id = ra.user_id AND ra.status = 'Approved'
        WHERE LOWER(i.status) IN ('pending', 'pending-verification', 'unpaid', 'overdue')
        ORDER BY CASE WHEN LOWER(i.status) = 'pending-verification' THEN 1 WHEN i.due_date < CURRENT_DATE() THEN 2 ELSE 3 END, i.created_at DESC
        LIMIT 4
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $response['pending_actions']['invoices'][] = [
            'id' => $row['id'],
            'tenant' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
            'unit' => $row['room_name'] ?? 'N/A',
            'amount' => (float)($row['total_amount'] ?? 0),
            'status' => $row['status'],
            'period' => $row['billing_period'] ?? '',
            'due_date' => $row['due_date'] ? date('M d', strtotime($row['due_date'])) : 'No due date',
            'is_overdue' => ($row['due_date'] && strtotime($row['due_date']) < strtotime(date('Y-m-d')))
        ];
    }
    $stmt->close();

    // 9c. Active Maintenance Tickets
    $stmt = $conn->prepare("
        SELECT m.id, u.first_name, u.last_name, ra.room_name, m.issue_category, m.urgency, m.status, m.created_at 
        FROM maintenance_requests m
        LEFT JOIN users u ON m.user_id = u.id
        LEFT JOIN rent_applications ra ON u.id = ra.user_id AND ra.status = 'Approved'
        WHERE m.status IN ('Pending', 'In Progress')
        ORDER BY CASE WHEN LOWER(m.urgency) IN ('emergency', 'urgent', 'high') THEN 1 ELSE 2 END, m.created_at DESC
        LIMIT 4
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $response['pending_actions']['maintenance'][] = [
            'id' => $row['id'],
            'tenant' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
            'unit' => $row['room_name'] ?? 'N/A',
            'category' => $row['issue_category'],
            'urgency' => $row['urgency'],
            'status' => $row['status'],
            'date' => date('M d', strtotime($row['created_at']))
        ];
    }
    $stmt->close();

    // 10. Rooms Summary Matrix (For interactive unit inventory map)
    $response['rooms_summary'] = [];
    $stmt = $conn->prepare("
        SELECT id, type, floor, status, monthly_rent, tenant_name, maintenance_flag 
        FROM rooms 
        ORDER BY floor ASC, id ASC
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $response['rooms_summary'][] = [
            'id' => $row['id'],
            'type' => $row['type'],
            'floor' => $row['floor'],
            'status' => strtolower($row['status']),
            'rent' => (float)($row['monthly_rent'] ?? 0),
            'tenant' => $row['tenant_name'],
            'maintenance_flag' => (bool)$row['maintenance_flag']
        ];
    }
    $stmt->close();

    // 11. Recent Activity Logs (Audit stream)
    $response['activity_logs'] = [];
    $stmt = $conn->prepare("
        SELECT 
            a.id,
            a.action,
            a.details,
            a.created_at,
            a.category AS entity_type,
            a.performed_by AS admin_id,
            a.id AS entity_id,
            u.first_name, 
            u.last_name 
        FROM activity_logs a 
        LEFT JOIN users u ON a.performed_by = u.id 
        ORDER BY a.created_at DESC 
        LIMIT 10
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $response['activity_logs'][] = $row;
    }
    $stmt->close();

    echo json_encode($response);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}
$conn->close();
?>