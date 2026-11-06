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

$admin_id = require_admin($conn);

// Income chart period: ?from=YYYY-MM-DD&to=YYYY-MM-DD (both or neither; default
// the last six calendar months up to today). Up to 62 days is shown per day,
// longer per month; at most three years. ?section=income answers with the chart
// alone, so changing the period does not recount the whole dashboard.
$dash_date = function ($value) {
    $d = DateTime::createFromFormat('!Y-m-d', (string)$value);
    return ($d && $d->format('Y-m-d') === $value) ? $d : null;
};
$range_from = $_GET['from'] ?? null;
$range_to = $_GET['to'] ?? null;
if ($range_from === null && $range_to === null) {
    $from_dt = new DateTime('first day of -5 month');
    $from_dt->setTime(0, 0);
    $to_dt = new DateTime('today');
} else {
    $from_dt = $dash_date($range_from);
    $to_dt = $dash_date($range_to);
    $range_error = null;
    if (!$from_dt || !$to_dt) $range_error = 'Choose a start and an end date (YYYY-MM-DD).';
    elseif ($from_dt > $to_dt) $range_error = 'The start date must be on or before the end date.';
    elseif ($from_dt->diff($to_dt)->days > 1096) $range_error = 'Choose a period of three years or less.';
    if ($range_error !== null) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => $range_error, 'errors' => ['from' => $range_error]]);
        exit();
    }
}

// "Needs attention" period: ?attention_days=N (1-365) counts only what came in
// during the last N days; absent or 0 = everything open. ?section=attention
// answers with this block alone.
$attention_days = 0;
if (isset($_GET['attention_days']) && $_GET['attention_days'] !== '') {
    $raw = (string)$_GET['attention_days'];
    if (!ctype_digit($raw) || (int)$raw > 365) {
        http_response_code(422);
        $msg = 'Choose a period of 1 to 365 days.';
        echo json_encode(['success' => false, 'message' => $msg, 'errors' => ['attention_days' => $msg]]);
        exit();
    }
    $attention_days = (int)$raw;
}

// What an admin has to act on, one count per line, each matching the filtered
// list the Dashboard links to. One query per table (a fixed number, never per
// row); advance-rent invoices are a prepayment, not a debt.
//
// $sinceDays > 0 keeps what came in during that many days, by the date each
// line has: the bill's due date (overdue), the request's or record's creation,
// a visitor's check-in. Lines with no such date (a proof or cash visit on an
// older bill, a move-in or move-out waiting, an eviction, a rent term ending)
// are listed in `undated_keys` and keep their full count; the page hides them
// under a period and says how many, so nothing reads as done when it is not.
function dashboard_attention($conn, $advanceMonthsFilter, $sinceDays) {
    $attention = [];
    // 36500 days = no limit, so every query binds the same way.
    $days = $sinceDays > 0 ? $sinceDays : 36500;
    // A failing count (a table this deployment lacks, say) must not take the whole
    // dashboard down. That group is left out and `incomplete` tells the page, so a
    // missing count is never read as "nothing waiting".
    $attn = function ($sql, $types = '', ...$params) use ($conn, &$attention) {
        try {
            $stmt = $conn->prepare($sql);
            if ($types !== '') $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            return $row ?: [];
        } catch (Throwable $e) {
            error_log('dashboard_stats attention: ' . $e->getMessage());
            $attention['incomplete'] = true;
            return null;
        }
    };
    $fill = function ($row, array $keys) use (&$attention) {
        if ($row === null) return;
        foreach ($keys as $k) $attention[$k] = (int)($row[$k] ?? 0);
    };

    // Same reads and fallbacks as the sweeps in config.php (0 is a valid reminder lead).
    $overstayHours = 24;
    $endingDays = 30;
    try {
        $overstayHours = (int)get_setting($conn, 'visitor_overstay_hours', 24);
        if ($overstayHours <= 0) $overstayHours = 24;
        $endingDays = max(0, (int)get_setting($conn, 'lease_end_reminder_days', 30));
    } catch (Throwable $e) {
        error_log('dashboard_stats attention settings: ' . $e->getMessage());
    }

    $fill($attn("
        SELECT
            -- Per tenant, like the Payments list these lines open (one desk action each).
            COUNT(DISTINCT CASE WHEN status = 'pending-verification' THEN user_id END) AS proofs_to_verify,
            COUNT(DISTINCT CASE WHEN status = 'scheduled' THEN user_id END) AS cash_visits,
            COUNT(DISTINCT CASE WHEN status = 'payment-failed' THEN user_id END) AS failed_payments,
            SUM(due_date IS NOT NULL AND due_date < CURDATE() AND due_date >= CURDATE() - INTERVAL ? DAY) AS overdue_invoices,
            COUNT(DISTINCT CASE WHEN due_date IS NOT NULL AND due_date < CURDATE() AND due_date >= CURDATE() - INTERVAL ? DAY THEN user_id END) AS overdue_tenants
        FROM invoices
        WHERE LOWER(status) IN " . billing_open_status_sql() . " $advanceMonthsFilter
    ", 'ii', $days, $days), ['proofs_to_verify', 'cash_visits', 'failed_payments', 'overdue_invoices', 'overdue_tenants']);

    $fill($attn("
        SELECT
            SUM(LOWER(status) IN ('pending review', 'pending deposit') AND created_at >= NOW() - INTERVAL ? DAY) AS applications_to_review,
            SUM(status = 'Approved') AS move_in_due,
            SUM(status = 'pending-move-out') AS move_out_requests
        FROM rent_applications
    ", 'i', $days), ['applications_to_review', 'move_in_due', 'move_out_requests']);

    $fill($attn("
        SELECT
            SUM(status IN ('Pending', 'In Progress') AND urgency = 'Urgent') AS maintenance_urgent,
            SUM(status = 'Pending' AND urgency = 'Needs Triage') AS maintenance_triage
        FROM maintenance_requests
        WHERE created_at >= NOW() - INTERVAL ? DAY
    ", 'i', $days), ['maintenance_urgent', 'maintenance_triage']);

    $fill($attn("
        SELECT
            SUM(status = 'pending_approval' AND created_at >= NOW() - INTERVAL ? DAY) AS visitors_pending,
            SUM(status = 'checked_in' AND TIMESTAMPDIFF(HOUR, check_in_at, NOW()) >= ? AND check_in_at >= NOW() - INTERVAL ? DAY) AS visitors_overstayed
        FROM visitor_logs
    ", 'iii', $days, $overstayHours, $days), ['visitors_pending', 'visitors_overstayed']);

    // Small request queues, one round trip.
    $fill($attn("
        SELECT
            (SELECT COUNT(*) FROM parking_reservations WHERE status = 'Pending' AND created_at >= NOW() - INTERVAL ? DAY) AS parking_requests,
            (SELECT COUNT(*) FROM cctv_requests WHERE status = 'Pending' AND created_at >= NOW() - INTERVAL ? DAY) AS cctv_requests,
            (SELECT COUNT(*) FROM service_requests WHERE status = 'Pending' AND created_at >= NOW() - INTERVAL ? DAY) AS service_requests,
            (SELECT COUNT(*) FROM refund_requests WHERE status = 'Pending Review' AND created_at >= NOW() - INTERVAL ? DAY) AS refunds_to_review,
            (SELECT COUNT(*) FROM inquiries WHERE status = 'New' AND created_at >= NOW() - INTERVAL ? DAY) AS new_inquiries,
            (SELECT COUNT(*) FROM utility_readings WHERE is_invoiced = 0 AND created_at >= NOW() - INTERVAL ? DAY) AS readings_to_invoice
    ", 'iiiiii', $days, $days, $days, $days, $days, $days), ['parking_requests', 'cctv_requests', 'service_requests', 'refunds_to_review', 'new_inquiries', 'readings_to_invoice']);

    // Contracts still in force; "missing documents" is the same rule as the Contracts page filter.
    $fill($attn("
        SELECT
            SUM(status = 'eviction-pending' OR eviction_status = 'flagged') AS eviction_pending,
            SUM(status IN ('draft', 'active', 'eviction-pending')
                AND (signed_lease_path IS NULL OR signed_lease_path = '' OR notarized_lease_path IS NULL OR notarized_lease_path = '')
                AND generated_at >= NOW() - INTERVAL ? DAY) AS contracts_missing_docs,
            SUM(status = 'draft' AND generated_at >= NOW() - INTERVAL ? DAY) AS contracts_draft,
            SUM(status = 'active' AND lease_end BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)) AS contracts_ending
        FROM lease_contracts
    ", 'iii', $days, $days, $endingDays), ['eviction_pending', 'contracts_missing_docs', 'contracts_draft', 'contracts_ending']);
    $attention['contracts_ending_days'] = $endingDays;

    // Requests only decided from the admin queue (Notifications page).
    $fill($attn("SELECT COUNT(*) AS requests_to_decide FROM notifications WHERE status = 'Pending' AND type IN ('occupancy_request', 'household_request', 'lease_extension_request') AND created_at >= NOW() - INTERVAL ? DAY", 'i', $days), ['requests_to_decide']);

    $attention['since_days'] = $sinceDays;
    $attention['undated_keys'] = ['proofs_to_verify', 'cash_visits', 'failed_payments', 'move_in_due', 'move_out_requests', 'eviction_pending', 'contracts_ending'];
    return $attention;
}

// Invoices issued in the period, per day or month: collected (paid in full, or
// the part paid so far), still owed (open bills' balance) and billed.
function dashboard_income($conn, DateTime $from, DateTime $to, $advanceMonthsFilter) {
    $byDay = $from->diff($to)->days < 62;
    $multiYear = $from->format('Y') !== $to->format('Y');
    $buckets = [];
    $cursor = clone $from;
    if (!$byDay) $cursor->modify('first day of this month');
    while ($cursor <= $to) {
        $key = $cursor->format($byDay ? 'Y-m-d' : 'Y-m');
        $buckets[$key] = [
            'key' => $key,
            'label' => $byDay ? $cursor->format('j') : $cursor->format($multiYear ? "M 'y" : 'M'),
            'full_label' => $cursor->format($byDay ? 'M j, Y' : 'F Y'),
            'collected' => 0.0,
            'pending' => 0.0,
            'billed' => 0.0,
            'count' => 0,
        ];
        $cursor->modify($byDay ? '+1 day' : '+1 month');
    }

    $fmt = $byDay ? '%Y-%m-%d' : '%Y-%m';
    $fromStr = $from->format('Y-m-d');
    $toStr = $to->format('Y-m-d');
    $stmt = $conn->prepare("
        SELECT
            DATE_FORMAT(created_at, '$fmt') AS b_key,
            SUM(CASE WHEN LOWER(status) = 'paid' THEN COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking) ELSE amount_paid END) AS collected_val,
            SUM(CASE WHEN LOWER(status) IN " . billing_open_status_sql() . " THEN COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking) - amount_paid ELSE 0 END) AS pending_val,
            SUM(COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking)) AS billed_val,
            COUNT(*) AS total_cnt
        FROM invoices
        WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
          AND LOWER(status) <> 'cancelled' $advanceMonthsFilter
        GROUP BY b_key
    ");
    $stmt->bind_param('ss', $fromStr, $toStr);
    $stmt->execute();
    $res = $stmt->get_result();
    $totals = ['collected' => 0.0, 'pending' => 0.0, 'billed' => 0.0, 'count' => 0];
    while ($row = $res->fetch_assoc()) {
        $k = $row['b_key'];
        if (!isset($buckets[$k])) continue;
        $buckets[$k]['collected'] = round((float)$row['collected_val'], 2);
        $buckets[$k]['pending'] = round((float)$row['pending_val'], 2);
        $buckets[$k]['billed'] = round((float)$row['billed_val'], 2);
        $buckets[$k]['count'] = (int)$row['total_cnt'];
        foreach (['collected', 'pending', 'billed'] as $f) $totals[$f] += $buckets[$k][$f];
        $totals['count'] += $buckets[$k]['count'];
    }
    $stmt->close();

    // Calendar months the period touches (a 10-day period is one month).
    $months = ((int)$to->format('Y') - (int)$from->format('Y')) * 12 + (int)$to->format('n') - (int)$from->format('n') + 1;
    return [
        'income_data' => array_values($buckets),
        'range' => [
            'from' => $fromStr,
            'to' => $toStr,
            'granularity' => $byDay ? 'day' : 'month',
            'collected' => round($totals['collected'], 2),
            'pending' => round($totals['pending'], 2),
            'billed' => round($totals['billed'], 2),
            'count' => $totals['count'],
            'months' => $months,
            'avg_per_month' => round($totals['collected'] / max(1, $months), 2),
            // null: nothing billed in the period (not "0% collected").
            'collection_rate' => $totals['billed'] > 0 ? (int)round($totals['collected'] / $totals['billed'] * 100) : null,
        ],
    ];
}

// Older installations may not yet have the advance-payment migration. Apply
// the exclusion only when the column exists; otherwise treat all invoices as
// standard invoices so dashboard statistics remain available.
$advanceMonthsFilter = '';
$advanceMonthsColumn = $conn->query("SHOW COLUMNS FROM invoices LIKE 'advance_months'");
$income_only = ($_GET['section'] ?? '') === 'income';
$attention_only = ($_GET['section'] ?? '') === 'attention';
if ($advanceMonthsColumn && $advanceMonthsColumn->num_rows > 0) {
    $advanceMonthsFilter = ' AND advance_months IS NULL';
    if (!$income_only) promote_overdue_invoices($conn);
}

if ($attention_only) {
    echo json_encode(['success' => true, 'attention' => dashboard_attention($conn, $advanceMonthsFilter, $attention_days)]);
    $conn->close();
    exit();
}

if ($income_only) {
    try {
        echo json_encode(['success' => true] + dashboard_income($conn, $from_dt, $to_dt, $advanceMonthsFilter));
    } catch (Throwable $e) {
        error_log('[dashboard_stats income] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => public_error_message($e)]);
    }
    $conn->close();
    exit();
}
$roomsArchiveColumn = $conn->query("SHOW COLUMNS FROM rooms LIKE 'archived_at'");
$activeRoomsFilter = ($roomsArchiveColumn && $roomsArchiveColumn->num_rows > 0) ? ' WHERE archived_at IS NULL' : '';

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
    // 1. Total Revenue (Current Month & Previous Month for MoM Trend). Security
    // deposits are held for the tenant, not revenue (payments audit 2026-09-30).
    // A bill paid in installments counts each part in the month it was received
    // (payment_transactions), less the deposit's share of the part; every other
    // paid bill counts whole in the month it was paid (gateway and single desk
    // payments write no part rows). Both sums come from the same two queries
    // whatever the number of bills.
    $stmt = $conn->prepare("
        SELECT
            SUM(CASE WHEN MONTH(COALESCE(paid_at, created_at)) = MONTH(CURRENT_DATE()) AND YEAR(COALESCE(paid_at, created_at)) = YEAR(CURRENT_DATE()) THEN COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking) - COALESCE(security_deposit, 0) ELSE 0 END) as current_revenue,
            SUM(CASE WHEN MONTH(COALESCE(paid_at, created_at)) = MONTH(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)) AND YEAR(COALESCE(paid_at, created_at)) = YEAR(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)) THEN COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking) - COALESCE(security_deposit, 0) ELSE 0 END) as last_revenue
        FROM invoices
        WHERE LOWER(status) = 'paid' $advanceMonthsFilter
          AND (SELECT COUNT(*) FROM payment_transactions pt WHERE pt.invoice_id = invoices.id) < 2
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    $parts_stmt = $conn->prepare("
        SELECT
            SUM(CASE WHEN MONTH(pt.created_at) = MONTH(CURRENT_DATE()) AND YEAR(pt.created_at) = YEAR(CURRENT_DATE()) THEN pt.amount * (1 - COALESCE(i.security_deposit, 0) / NULLIF(i.total_amount, 0)) ELSE 0 END) as current_parts,
            SUM(CASE WHEN MONTH(pt.created_at) = MONTH(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)) AND YEAR(pt.created_at) = YEAR(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)) THEN pt.amount * (1 - COALESCE(i.security_deposit, 0) / NULLIF(i.total_amount, 0)) ELSE 0 END) as last_parts
        FROM payment_transactions pt
        JOIN invoices i ON i.id = pt.invoice_id
        WHERE (i.status IN " . billing_open_status_sql() . "
               OR (LOWER(i.status) = 'paid' AND (SELECT COUNT(*) FROM payment_transactions p2 WHERE p2.invoice_id = i.id) >= 2))
          " . str_replace('advance_months', 'i.advance_months', $advanceMonthsFilter) . "
    ");
    $parts_stmt->execute();
    $parts = $parts_stmt->get_result()->fetch_assoc() ?: [];
    $parts_stmt->close();
    if ($row = $res->fetch_assoc()) {
        $cur = round((float)($row['current_revenue'] ?? 0) + (float)($parts['current_parts'] ?? 0), 2);
        $last = round((float)($row['last_revenue'] ?? 0) + (float)($parts['last_parts'] ?? 0), 2);
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
            SUM(COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking) - amount_paid) as total_pending,
            SUM(CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE() THEN COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking) - amount_paid ELSE 0 END) as overdue_total,
            SUM(CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE() THEN 1 ELSE 0 END) as overdue_cnt
        FROM invoices 
        WHERE LOWER(status) IN " . billing_open_status_sql() . " $advanceMonthsFilter
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
            SUM(CASE WHEN status IN ('Approved', 'active', 'pending-move-out') THEN 1 ELSE 0 END) as active_tenants,
            SUM(CASE WHEN LOWER(status) IN ('pending review', 'pending', 'pending deposit', 'action required') THEN 1 ELSE 0 END) as pending_apps
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
        FROM rooms $activeRoomsFilter
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
            SUM(CASE WHEN LOWER(status) = 'paid' THEN COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking) ELSE amount_paid END) as collected,
            SUM(COALESCE(total_amount, base_rent + security_deposit + water + electricity + parking)) as total
        FROM invoices 
        WHERE MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())
          AND LOWER(status) <> 'cancelled' $advanceMonthsFilter
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

    // 7. Income per day or month for the chosen period (dashboard_income() above).
    $income = dashboard_income($conn, $from_dt, $to_dt, $advanceMonthsFilter);
    $response['income_data'] = $income['income_data'];
    $response['range'] = $income['range'];
    $response['stats']['total_6m_collected'] = $income['range']['collected'];
    $response['stats']['avg_monthly_income'] = round($income['range']['avg_per_month']);

    // 8. Newest Approved Tenants
    $stmt = $conn->prepare("
        SELECT u.first_name, u.last_name, ra.room_name, ra.created_at 
        FROM rent_applications ra 
        JOIN users u ON ra.user_id = u.id
        WHERE ra.status IN ('Approved', 'active', 'pending-move-out')
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
        WHERE LOWER(status) IN ('pending review', 'pending', 'pending deposit', 'action required') 
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
        SELECT i.id, u.first_name, u.last_name, COALESCE(ra.room_name, 'N/A') as room_name, i.total_amount, i.status, i.due_date, i.billing_period 
        FROM invoices i
        LEFT JOIN users u ON i.user_id = u.id
        LEFT JOIN rent_applications ra ON (i.rent_application_id = ra.id OR (i.rent_application_id IS NULL AND u.id = ra.user_id AND ra.status IN ('Approved', 'active', 'pending-move-out')))
        WHERE LOWER(i.status) IN " . billing_open_status_sql() . "
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
        LEFT JOIN rent_applications ra ON u.id = ra.user_id AND ra.status IN ('Approved', 'active', 'pending-move-out')
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
        FROM rooms $activeRoomsFilter
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

    // 10b. Needs attention (dashboard_attention() above).
    $response['attention'] = dashboard_attention($conn, $advanceMonthsFilter, $attention_days);

    // 11. Recent Activity Logs (Audit stream)
    $response['activity_logs'] = [];
    $stmt = $conn->prepare("
        SELECT 
            a.id,
            a.action,
            a.details,
            a.created_at,
            a.category,
            a.performed_by,
            u.first_name,
            u.last_name,
            u.role AS performer_role
        FROM activity_logs a
        LEFT JOIN users u ON a.performed_by = u.id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 10
    ");
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $response['activity_logs'][] = $row;
    }
    $stmt->close();

    echo json_encode($response);
} catch (Throwable $e) {
    error_log("[dashboard_stats] " . $e->getMessage() . " at " . $e->getFile() . ":" . $e->getLine());
    http_response_code(500);
    echo json_encode(["success" => false, "message" => public_error_message($e)]);
}
$conn->close();
?>