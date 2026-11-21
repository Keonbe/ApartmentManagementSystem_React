<?php
// Reports (Admin → Reports, get_reports.php): every report covers a date range
// cut into periods (day, week, month or year) and answers in one shape:
//
//   summary  [{key, label, value, format, hint?, previous?}]   the headline figures
//   chart    {kind: bar|line, format, series: [{key, label, tone}]}  drawn from `periods`
//   periods  {columns, rows, totals}                           one row per period
//   tables   [{key, title, note?, columns, rows, totals?}]     detail and breakdowns
//
// format is money | int | number | percent | hours | text | date. A row may
// carry `_style` (section | subtotal | total) for statements. The page draws
// these generically and exports the same structure to Excel and PDF, so a
// figure on screen and in a file always come from one place.
//
// Money rules are the Dashboard's (dashboard_stats.php), so the two agree:
//  - Money received is dated by when it arrived. A bill paid in installments
//    counts each part on the day it was received (payment_transactions), with
//    each column taking its share of the part; any other paid bill counts whole
//    on paid_at. Advance-rent invoices are optional prepayments and left out.
//  - Security deposits are held for the tenant: never revenue, shown apart.
//  - Expenses are repairs the building paid for (actual cost, else estimate,
//    never tenant-responsible ones), dated by when they were finished, plus the
//    admin-entered expenses table, plus the optional report_overhead_pct.
//  - "Still owed" is the balance of open bills (invoice_balance_sql()).

const REPORT_TYPES = [
    'financial' => 'Income statement',
    'collections' => 'Payments received',
    'billing' => 'Billing and arrears',
    'occupancy' => 'Occupancy and tenants',
    'maintenance' => 'Maintenance',
    'utilities' => 'Utilities',
    'leasing' => 'Inquiries and applications',
    'services' => 'Services and parking',
];
const REPORT_GROUPS = ['day', 'week', 'month', 'year'];
// Most periods one report may have, per grouping.
const REPORT_MAX_PERIODS = ['day' => 366, 'week' => 260, 'month' => 120, 'year' => 25];
// Detail lists stop here; the table says so when it is cut.
const REPORT_MAX_DETAIL_ROWS = 2000;

const REPORT_EXPENSE_LABELS = [
    'utilities' => 'Building utilities',
    'supplies' => 'Supplies',
    'salaries' => 'Salaries & wages',
    'repairs_common' => 'Common-area upkeep',
    'taxes_fees' => 'Taxes & fees',
    'insurance' => 'Insurance',
    'other' => 'Other expenses',
];
// Rent applications that became a tenancy (moved in at some point).
const REPORT_TENANCY_STATUSES = ['active', 'pending-move-out', 'moved-out'];
const REPORT_APPROVED_STATUSES = ['Approved', 'active', 'pending-move-out', 'moved-out', 'archived'];

// One query, every row as an array. mysqli answers false instead of throwing,
// so a failed prepare is turned into an exception the endpoint reports as 500.
function report_rows($conn, $sql, $types = '', ...$params) {
    $stmt = $conn->prepare($sql);
    if (!$stmt) throw new RuntimeException('Report query failed: ' . $conn->error);
    if ($types !== '') $stmt->bind_param($types, ...$params);
    if (!$stmt->execute()) throw new RuntimeException('Report query failed: ' . $stmt->error);
    $res = $stmt->get_result();
    $rows = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
    $stmt->close();
    return $rows;
}

function report_money($v) { return round((float)$v, 2); }
function report_pct($part, $whole) { return $whole > 0 ? round($part / $whole * 100, 1) : null; }

// ── The range and its periods ──

// The SQL expression that names the period a date falls in; matches the keys
// of report_periods(). Weeks start on Monday.
function report_bucket_sql($expr, $group) {
    switch ($group) {
        case 'day': return "DATE_FORMAT($expr, '%Y-%m-%d')";
        case 'week': return "DATE_FORMAT(DATE_SUB(DATE($expr), INTERVAL WEEKDAY($expr) DAY), '%Y-%m-%d')";
        case 'month': return "DATE_FORMAT($expr, '%Y-%m')";
        default: return "DATE_FORMAT($expr, '%Y')";
    }
}

function report_bucket_key(DateTime $d, $group) {
    switch ($group) {
        case 'day': return $d->format('Y-m-d');
        case 'week':
            $monday = clone $d;
            $monday->modify('-' . ((int)$d->format('N') - 1) . ' days');
            return $monday->format('Y-m-d');
        case 'month': return $d->format('Y-m');
        default: return $d->format('Y');
    }
}

// "Nov 9 – 15, 2026", "Oct 27 – Nov 2, 2026", "Dec 29, 2025 – Jan 4, 2026".
function report_span_label(DateTime $a, DateTime $b) {
    if ($a == $b) return $a->format('M j, Y');
    if ($a->format('Y') !== $b->format('Y')) return $a->format('M j, Y') . ' – ' . $b->format('M j, Y');
    if ($a->format('m') !== $b->format('m')) return $a->format('M j') . ' – ' . $b->format('M j, Y');
    return $a->format('M j') . ' – ' . $b->format('j, Y');
}

// The periods from $from to $to, the first and last cut to the range.
function report_periods($from, $to, $group) {
    $out = [];
    $cur = new DateTime($from);
    $end = new DateTime($to);
    $multiYear = $cur->format('Y') !== $end->format('Y');
    while ($cur <= $end) {
        $natEnd = clone $cur;
        if ($group === 'week') $natEnd->modify('+' . (7 - (int)$cur->format('N')) . ' days');
        elseif ($group === 'month') $natEnd->modify('last day of this month');
        elseif ($group === 'year') $natEnd->setDate((int)$cur->format('Y'), 12, 31);
        $pEnd = $natEnd < $end ? $natEnd : clone $end;
        switch ($group) {
            case 'day': $label = $cur->format('D, M j, Y'); $short = $cur->format('M j'); break;
            case 'week': $label = report_span_label($cur, $pEnd); $short = $cur->format('M j'); break;
            case 'month':
                $label = $cur->format('F Y');
                $short = $cur->format($multiYear ? "M 'y" : 'M');
                // A month cut by the range says which days it covers.
                if ($cur->format('j') !== '1' || $pEnd->format('Y-m-d') !== $natEnd->format('Y-m-d')) $label = report_span_label($cur, $pEnd);
                break;
            default:
                $label = $cur->format('Y');
                $short = $label;
                if ($cur->format('m-d') !== '01-01' || $pEnd->format('m-d') !== '12-31') $label = report_span_label($cur, $pEnd);
        }
        $out[] = ['key' => report_bucket_key($cur, $group), 'from' => $cur->format('Y-m-d'), 'to' => $pEnd->format('Y-m-d'), 'label' => $label, 'short' => $short];
        $cur = clone $pEnd;
        $cur->modify('+1 day');
    }
    return $out;
}

// The range just before: the same number of whole months when the range is
// whole months (Nov → Oct, Q4 → Q3, a year → the year before), else the same
// number of days.
function report_previous_range($from, $to) {
    $a = new DateTime($from);
    $b = new DateTime($to);
    $lastOfB = (clone $b)->modify('last day of this month');
    if ($a->format('j') === '1' && $b->format('Y-m-d') === $lastOfB->format('Y-m-d')) {
        $months = ((int)$b->format('Y') - (int)$a->format('Y')) * 12 + (int)$b->format('n') - (int)$a->format('n') + 1;
        $pFrom = (clone $a)->modify("-$months months");
        $pTo = (clone $a)->modify('-1 day');
        return [$pFrom->format('Y-m-d'), $pTo->format('Y-m-d')];
    }
    $days = (int)$a->diff($b)->days + 1;
    $pTo = (clone $a)->modify('-1 day');
    $pFrom = (clone $pTo)->modify('-' . ($days - 1) . ' days');
    return [$pFrom->format('Y-m-d'), $pTo->format('Y-m-d')];
}

// What a report function receives. $light = only the summary (the previous
// range's figures), so no lists or per-period rows are read.
function report_ctx($from, $to, $group, $light = false) {
    return [
        'from' => $from,
        'to' => $to,
        'end' => (new DateTime($to))->modify('+1 day')->format('Y-m-d'), // exclusive upper bound
        'group' => $group,
        'light' => $light,
        'periods' => $light ? [] : report_periods($from, $to, $group),
    ];
}

// Per-period rows from a keyed map of values: every period appears, empty
// ones as zeros, in order.
function report_period_rows(array $ctx, array $byKey, array $columns) {
    $rows = [];
    foreach ($ctx['periods'] as $p) {
        $row = ['period' => $p['label'], '_key' => $p['key'], '_from' => $p['from'], '_to' => $p['to'], '_short' => $p['short']];
        foreach ($columns as $c) {
            if ($c['key'] === 'period') continue;
            $v = $byKey[$p['key']][$c['key']] ?? 0;
            $row[$c['key']] = $v === null ? null : (in_array($c['format'], ['int'], true) ? (int)$v : round((float)$v, 2));
        }
        $rows[] = $row;
    }
    return $rows;
}

// Column sums of per-period rows (percent and rate columns are left to the caller).
function report_totals(array $rows, array $columns, array $skip = []) {
    $totals = ['period' => 'Total'];
    foreach ($columns as $c) {
        if ($c['key'] === 'period' || in_array($c['key'], $skip, true)) continue;
        if (!in_array($c['format'], ['money', 'int', 'number'], true)) continue;
        $sum = 0;
        foreach ($rows as $r) $sum += (float)($r[$c['key']] ?? 0);
        $totals[$c['key']] = $c['format'] === 'int' ? (int)$sum : round($sum, 2);
    }
    return $totals;
}

function report_col($key, $label, $format = 'text') { return ['key' => $key, 'label' => $label, 'format' => $format]; }
function report_metric($key, $label, $value, $format, $hint = null) {
    return array_filter(['key' => $key, 'label' => $label, 'value' => $value, 'format' => $format, 'hint' => $hint], fn($v) => $v !== null) + ['value' => $value];
}
// A detail table, cut at REPORT_MAX_DETAIL_ROWS with a note.
function report_table($key, $title, array $columns, array $rows, array $extra = []) {
    $cut = count($rows) > REPORT_MAX_DETAIL_ROWS;
    if ($cut) $rows = array_slice($rows, 0, REPORT_MAX_DETAIL_ROWS);
    $table = ['key' => $key, 'title' => $title, 'columns' => $columns, 'rows' => $rows] + $extra;
    if ($cut) $table['note'] = trim(($extra['note'] ?? '') . ' Showing the first ' . REPORT_MAX_DETAIL_ROWS . ' rows; narrow the range for the rest.');
    return $table;
}
// A name from users (u_) or the application (ra_) columns, whichever is set.
function report_person(array $row) {
    $name = person_name($row, 'u_');
    return $name !== '' ? $name : person_name($row, 'ra_');
}

// ── Money received ──

// Every receipt of money: one row per fully paid bill (dated paid_at) and one
// per installment of a bill paid in parts (dated when received). f is the
// share of the bill the row stands for (1 for a whole bill), so column * f is
// that column's part of the money.
function report_receipts_sql() {
    $open = billing_open_status_sql();
    return "(
        SELECT i.id AS invoice_id, COALESCE(i.paid_at, i.created_at) AS d, 1.0 AS f,
               i.total_amount AS amount, i.payment_method AS method, 0 AS is_part
        FROM invoices i
        WHERE LOWER(i.status) = 'paid' AND i.advance_months IS NULL
          AND (SELECT COUNT(*) FROM payment_transactions pt0 WHERE pt0.invoice_id = i.id) < 2
        UNION ALL
        SELECT i.id, pt.created_at, pt.amount / NULLIF(i.total_amount, 0),
               pt.amount, COALESCE(NULLIF(pt.payment_method, ''), i.payment_method), 1
        FROM payment_transactions pt
        JOIN invoices i ON i.id = pt.invoice_id
        WHERE i.advance_months IS NULL
          AND (i.status IN $open
               OR (LOWER(i.status) = 'paid' AND (SELECT COUNT(*) FROM payment_transactions p2 WHERE p2.invoice_id = i.id) >= 2))
    )";
}

// Money received in the range, per period: revenue (deposits out), each
// stream, deposits, and the number of receipts.
function report_receipt_sums($conn, array $ctx) {
    $b = report_bucket_sql('r.d', $ctx['group']);
    $rows = report_rows($conn, "
        SELECT $b AS b,
               SUM((i.total_amount - COALESCE(i.security_deposit, 0)) * r.f) AS revenue,
               SUM(i.total_amount * r.f) AS received,
               SUM(i.base_rent * r.f) AS rent,
               SUM(i.water * r.f) AS water,
               SUM(i.electricity * r.f) AS electricity,
               SUM(i.parking * r.f) AS parking,
               SUM(COALESCE(i.services, 0) * r.f) AS services,
               SUM(COALESCE(i.maintenance, 0) * r.f) AS maintenance,
               SUM(COALESCE(i.late_fee, 0) * r.f) AS late_fee,
               SUM(COALESCE(i.security_deposit, 0) * r.f) AS deposit,
               COUNT(*) AS n
        FROM " . report_receipts_sql() . " r
        JOIN invoices i ON i.id = r.invoice_id
        WHERE r.d >= ? AND r.d < ?
        GROUP BY b", 'ss', $ctx['from'], $ctx['end']);
    $byKey = [];
    $total = array_fill_keys(['revenue', 'received', 'rent', 'water', 'electricity', 'parking', 'services', 'maintenance', 'late_fee', 'deposit', 'n'], 0.0);
    foreach ($rows as $row) {
        $byKey[$row['b']] = $row;
        foreach ($total as $k => $_) $total[$k] += (float)$row[$k];
    }
    return [$byKey, $total];
}

// Building expenses per period: repairs (by when finished) and the expenses
// table (by expense date), with the category totals.
function report_expense_sums($conn, array $ctx) {
    $bm = report_bucket_sql('COALESCE(resolved_at, created_at)', $ctx['group']);
    $repairs = report_rows($conn, "
        SELECT $bm AS b, SUM(COALESCE(actual_cost, estimated_cost, 0)) AS cost
        FROM maintenance_requests
        WHERE status IN ('Completed', 'Resolved') AND tenant_responsible = 0
          AND COALESCE(resolved_at, created_at) >= ? AND COALESCE(resolved_at, created_at) < ?
        GROUP BY b", 'ss', $ctx['from'], $ctx['end']);
    $be = report_bucket_sql('expense_date', $ctx['group']);
    $entered = report_rows($conn, "
        SELECT $be AS b, category, SUM(amount) AS cost
        FROM expenses
        WHERE expense_date >= ? AND expense_date < ?
        GROUP BY b, category", 'ss', $ctx['from'], $ctx['end']);
    $byKey = [];
    $categories = ['repairs' => 0.0];
    foreach ($repairs as $r) {
        $byKey[$r['b']]['repairs'] = (float)$r['cost'];
        $categories['repairs'] += (float)$r['cost'];
    }
    foreach ($entered as $r) {
        $byKey[$r['b']]['entered'] = ($byKey[$r['b']]['entered'] ?? 0) + (float)$r['cost'];
        $categories[$r['category']] = ($categories[$r['category']] ?? 0) + (float)$r['cost'];
    }
    return [$byKey, $categories];
}

function report_overhead_pct($conn) {
    $v = get_setting($conn, 'report_overhead_pct', '0');
    return is_numeric($v) ? min(100, max(0, (float)$v)) : 0.0;
}

// ── 1. Income statement ──
function report_financial($conn, array $ctx) {
    [$inBy, $in] = report_receipt_sums($conn, $ctx);
    [$outBy, $cats] = report_expense_sums($conn, $ctx);
    $overheadPct = report_overhead_pct($conn);
    $revenue = $in['revenue'];
    $overhead = round($revenue * $overheadPct / 100, 2);
    $expenses = array_sum($cats) + $overhead;
    $net = $revenue - $expenses;

    $out = ['summary' => [
        report_metric('revenue', 'Revenue', report_money($revenue), 'money', 'Money received, security deposits left out'),
        report_metric('expenses', 'Expenses', report_money($expenses), 'money', 'Repairs the building paid for and recorded expenses'),
        report_metric('net', 'Net income', report_money($net), 'money'),
        report_metric('margin', 'Net margin', report_pct($net, $revenue), 'percent'),
        report_metric('deposits', 'Deposits received', report_money($in['deposit']), 'money', 'Held for tenants, not income'),
    ]];
    if ($ctx['light']) return $out;

    $columns = [report_col('period', 'Period'), report_col('revenue', 'Revenue', 'money'), report_col('expenses', 'Expenses', 'money'), report_col('net', 'Net income', 'money'), report_col('deposits', 'Deposits received', 'money')];
    $byKey = [];
    foreach ($ctx['periods'] as $p) {
        $k = $p['key'];
        $rev = (float)($inBy[$k]['revenue'] ?? 0);
        $exp = (float)($outBy[$k]['repairs'] ?? 0) + (float)($outBy[$k]['entered'] ?? 0) + round($rev * $overheadPct / 100, 2);
        $byKey[$k] = ['revenue' => $rev, 'expenses' => $exp, 'net' => $rev - $exp, 'deposits' => (float)($inBy[$k]['deposit'] ?? 0)];
    }
    $rows = report_period_rows($ctx, $byKey, $columns);
    $out['chart'] = ['kind' => 'bar', 'format' => 'money', 'series' => [['key' => 'revenue', 'label' => 'Revenue', 'tone' => 'emerald'], ['key' => 'expenses', 'label' => 'Expenses', 'tone' => 'amber'], ['key' => 'net', 'label' => 'Net income', 'tone' => 'indigo']]];
    $out['periods'] = ['columns' => $columns, 'rows' => $rows, 'totals' => report_totals($rows, $columns)];

    // The statement itself.
    // Every line has every column (share is null with no revenue); _style only when set.
    $line = fn($label, $amount, $style = null, $base = null) => [
        'line' => $label, 'amount' => report_money($amount),
        'share' => $base !== null ? report_pct($amount, $base) : null,
    ] + ($style ? ['_style' => $style] : []);
    $streams = [
        'Base rent' => $in['rent'], 'Water' => $in['water'], 'Electricity' => $in['electricity'], 'Parking' => $in['parking'],
        'Add-on services' => $in['services'], 'Repairs billed to tenants' => $in['maintenance'], 'Late fees' => $in['late_fee'],
    ];
    $stmt = [['line' => 'Revenue', '_style' => 'section']];
    foreach ($streams as $label => $amount) if (abs($amount) >= 0.005) $stmt[] = $line($label, $amount, null, $revenue);
    $stmt[] = $line('Total revenue', $revenue, 'subtotal', $revenue);
    $stmt[] = ['line' => 'Expenses', '_style' => 'section'];
    foreach ($cats as $cat => $amount) {
        if (abs($amount) < 0.005) continue;
        $stmt[] = $line($cat === 'repairs' ? 'Maintenance repairs' : (REPORT_EXPENSE_LABELS[$cat] ?? ucfirst($cat)), $amount, null, $revenue);
    }
    if ($overhead > 0) $stmt[] = $line("Overhead ($overheadPct%)", $overhead, null, $revenue);
    $stmt[] = $line('Total expenses', $expenses, 'subtotal', $revenue);
    $stmt[] = $line('Net income', $net, 'total', $revenue);
    $out['tables'][] = ['key' => 'statement', 'title' => 'Income statement', 'note' => 'Share is of total revenue.', 'columns' => [report_col('line', 'Line'), report_col('amount', 'Amount', 'money'), report_col('share', 'Share', 'percent')], 'rows' => $stmt];

    // Deposits settled at move-out in the range. They stay out of revenue: an applied
    // deposit only offsets what the tenant owed, a returned one goes back, a forfeited one
    // (the 'forfeiture' lines) is kept by the owner and is not a deduction category.
    $dep = fn($sql) => (float)(report_rows($conn, $sql, 'ss', $ctx['from'], $ctx['end'])[0]['total'] ?? 0);
    $applied = $dep("SELECT COALESCE(SUM(deposit_amount), 0) AS total FROM lease_contracts WHERE deposit_status LIKE 'Applied%' AND refund_date IS NOT NULL AND refund_date >= ? AND refund_date < ?");
    $returned = $dep("SELECT COALESCE(SUM(refund_amount), 0) AS total FROM lease_contracts WHERE deposit_status IN ('Refund Pending', 'Refunded') AND refund_date IS NOT NULL AND refund_date >= ? AND refund_date < ?");
    $forfeited = $dep("SELECT COALESCE(SUM(amount), 0) AS total FROM deposit_deductions WHERE category = 'forfeiture' AND created_at >= ? AND created_at < ?");
    $deductions = report_rows($conn, "SELECT category, SUM(amount) AS total FROM deposit_deductions WHERE category <> 'forfeiture' AND created_at >= ? AND created_at < ? GROUP BY category ORDER BY total DESC", 'ss', $ctx['from'], $ctx['end']);
    $depRows = [
        ['line' => 'Applied to what the tenant owed', 'amount' => report_money($applied)],
        ['line' => 'Returned to tenants', 'amount' => report_money($returned)],
        ['line' => 'Forfeited (kept by the owner)', 'amount' => report_money($forfeited)],
    ];
    foreach ($deductions as $d) $depRows[] = ['line' => 'Deducted: ' . deposit_deduction_label($d['category']), 'amount' => report_money($d['total'])];
    $out['tables'][] = ['key' => 'depositSettlements', 'title' => 'Deposits settled at move-out', 'note' => 'Held for tenants, never income. Settled in the range.',
        'columns' => [report_col('line', 'Line'), report_col('amount', 'Amount', 'money')], 'rows' => $depRows];

    // Every expense in the range.
    $list = report_rows($conn, "
        SELECT DATE(COALESCE(m.resolved_at, m.created_at)) AS d, 'Maintenance repairs' AS category,
               CONCAT(COALESCE(NULLIF(m.title, ''), m.issue_category), IF(m.room_name IS NULL OR m.room_name = '', '', CONCAT(' (unit ', m.room_name, ')'))) AS description,
               COALESCE(m.actual_cost, m.estimated_cost, 0) AS amount
        FROM maintenance_requests m
        WHERE m.status IN ('Completed', 'Resolved') AND m.tenant_responsible = 0
          AND COALESCE(m.actual_cost, m.estimated_cost, 0) > 0
          AND COALESCE(m.resolved_at, m.created_at) >= ? AND COALESCE(m.resolved_at, m.created_at) < ?
        UNION ALL
        SELECT e.expense_date, e.category, e.description, e.amount
        FROM expenses e
        WHERE e.expense_date >= ? AND e.expense_date < ?
        ORDER BY d DESC", 'ssss', $ctx['from'], $ctx['end'], $ctx['from'], $ctx['end']);
    $rows = array_map(fn($r) => [
        'date' => $r['d'],
        'category' => REPORT_EXPENSE_LABELS[$r['category']] ?? $r['category'],
        'description' => (string)$r['description'],
        'amount' => report_money($r['amount']),
    ], $list);
    $out['tables'][] = report_table('expenses', 'Expenses', [report_col('date', 'Date', 'date'), report_col('category', 'Category'), report_col('description', 'Description'), report_col('amount', 'Amount', 'money')], $rows, ['totals' => ['date' => 'Total', 'amount' => report_money(array_sum(array_column($rows, 'amount')))]]);
    return $out;
}

// ── 2. Payments received ──

// The channel a payment came in through, and whether it came online (PayMongo) or
// at the front desk. Raw methods are written by different code (desk: 'cash', 'gcash',
// 'bank_transfer' or a bank name; checkout and webhook: 'GCash (Sandbox)', 'Card
// (Sandbox)', 'Online Banking (Sandbox)'), so GCash at the desk and GCash online
// would otherwise be two lines. Returns [channel, 'Online'|'Front desk'|'—'].
function report_channel_of($method) {
    $raw = trim((string)$method);
    if ($raw === '' || $raw === 'Not recorded') return ['Not recorded', '—'];
    $online = (bool)preg_match('/\((sandbox|live)\)|paymongo/i', $raw);
    $clean = trim(preg_replace('/\s*\((sandbox|live)\)\s*/i', ' ', $raw));
    $key = strtolower(str_replace('_', ' ', $clean));
    if ($key === 'advance credit' || $key === 'security deposit') return [$clean, '—'];
    if ($key === 'split') return ['Split payment', 'Front desk'];
    if (str_contains($key, 'gcash')) return ['GCash', $online ? 'Online' : 'Front desk'];
    if (str_contains($key, 'maya')) return ['Maya', $online ? 'Online' : 'Front desk'];
    if (str_contains($key, 'online banking')) return ['Online banking', 'Online'];
    if (str_contains($key, 'card')) return ['Card', $online ? 'Online' : 'Front desk'];
    if ($key === 'cash') return ['Cash', 'Front desk'];
    if ($key === 'bank transfer') return ['Bank transfer', 'Front desk'];
    if ($key === 'paymongo' || $key === 'online') return ['Online (channel not named)', 'Online'];
    return [$clean, $online ? 'Online' : 'Front desk']; // a bank name (BDO, BPI, ...)
}

function report_collections($conn, array $ctx) {
    [$inBy, $in] = report_receipt_sums($conn, $ctx);
    $count = (int)$in['n'];
    $out = ['summary' => [
        report_metric('received', 'Payments received', report_money($in['received']), 'money', 'Everything paid in, deposits included'),
        report_metric('revenue', 'Revenue', report_money($in['revenue']), 'money', 'Received less security deposits'),
        report_metric('deposits', 'Deposits received', report_money($in['deposit']), 'money'),
        report_metric('count', 'Payments', $count, 'int', 'Paid bills plus installments'),
        report_metric('average', 'Average payment', $count > 0 ? report_money($in['received'] / $count) : null, 'money'),
    ]];
    if ($ctx['light']) return $out;

    $columns = [report_col('period', 'Period'), report_col('received', 'Received', 'money'), report_col('revenue', 'Revenue', 'money'), report_col('deposits', 'Deposits', 'money'), report_col('count', 'Payments', 'int')];
    $byKey = [];
    foreach ($inBy as $k => $r) $byKey[$k] = ['received' => $r['received'], 'revenue' => $r['revenue'], 'deposits' => $r['deposit'], 'count' => $r['n']];
    $rows = report_period_rows($ctx, $byKey, $columns);
    $out['chart'] = ['kind' => 'bar', 'format' => 'money', 'series' => [['key' => 'received', 'label' => 'Received', 'tone' => 'emerald']]];
    $out['periods'] = ['columns' => $columns, 'rows' => $rows, 'totals' => report_totals($rows, $columns)];

    $methods = report_rows($conn, "
        SELECT COALESCE(NULLIF(r.method, ''), 'Not recorded') AS pay_method, COUNT(*) AS n, SUM(r.amount) AS amount
        FROM " . report_receipts_sql() . " r
        WHERE r.d >= ? AND r.d < ?
        GROUP BY pay_method ORDER BY amount DESC", 'ss', $ctx['from'], $ctx['end']);
    $total = array_sum(array_map(fn($m) => (float)$m['amount'], $methods));
    $out['tables'][] = ['key' => 'methods', 'title' => 'By payment method', 'columns' => [report_col('method', 'Method'), report_col('count', 'Payments', 'int'), report_col('amount', 'Amount', 'money'), report_col('share', 'Share', 'percent')],
        'rows' => array_map(fn($m) => ['method' => $m['pay_method'], 'count' => (int)$m['n'], 'amount' => report_money($m['amount']), 'share' => report_pct((float)$m['amount'], $total)], $methods),
        'totals' => ['method' => 'Total', 'count' => array_sum(array_column($methods, 'n')), 'amount' => report_money($total)]];

    // The same receipts by channel (pesos, not bills), online and front desk side by side.
    $channels = [];
    foreach ($methods as $m) {
        [$channel, $via] = report_channel_of($m['pay_method']);
        $key = $channel . '|' . $via;
        $channels[$key] ??= ['channel' => $channel, 'via' => $via, 'n' => 0, 'amount' => 0.0];
        $channels[$key]['n'] += (int)$m['n'];
        $channels[$key]['amount'] += (float)$m['amount'];
    }
    usort($channels, fn($a, $b) => $b['amount'] <=> $a['amount']);
    $out['tables'][] = ['key' => 'channels', 'title' => 'By channel (pesos)', 'columns' => [report_col('channel', 'Channel'), report_col('via', 'Received'), report_col('count', 'Payments', 'int'), report_col('amount', 'Amount', 'money'), report_col('share', 'Share', 'percent')],
        'rows' => array_map(fn($c) => ['channel' => $c['channel'], 'via' => $c['via'], 'count' => $c['n'], 'amount' => report_money($c['amount']), 'share' => report_pct($c['amount'], $total)], $channels),
        'totals' => ['channel' => 'Total', 'via' => '', 'count' => array_sum(array_column($channels, 'n')), 'amount' => report_money($total)]];

    $list = report_rows($conn, "
        SELECT DATE(r.d) AS d, r.invoice_id, r.amount, COALESCE(NULLIF(r.method, ''), 'Not recorded') AS method, r.is_part,
               i.billing_period, COALESCE(ra.room_name, '') AS unit,
               u.first_name AS u_first_name, u.last_name AS u_last_name, u.suffix AS u_suffix,
               ra.first_name AS ra_first_name, ra.last_name AS ra_last_name, ra.suffix AS ra_suffix
        FROM " . report_receipts_sql() . " r
        JOIN invoices i ON i.id = r.invoice_id
        LEFT JOIN rent_applications ra ON ra.id = i.rent_application_id
        LEFT JOIN users u ON u.id = i.user_id
        WHERE r.d >= ? AND r.d < ?
        ORDER BY r.d DESC
        LIMIT " . (REPORT_MAX_DETAIL_ROWS + 1), 'ss', $ctx['from'], $ctx['end']);
    $rows = array_map(fn($r) => [
        'date' => $r['d'], 'invoice' => $r['invoice_id'], 'tenant' => report_person($r), 'unit' => $r['unit'],
        'period' => (string)$r['billing_period'], 'method' => $r['method'], 'kind' => (int)$r['is_part'] ? 'Installment' : 'Full payment',
        'amount' => report_money($r['amount']),
    ], $list);
    $out['tables'][] = report_table('payments', 'Payments', [report_col('date', 'Date', 'date'), report_col('invoice', 'Invoice'), report_col('tenant', 'Tenant'), report_col('unit', 'Unit'), report_col('period', 'Billing period'), report_col('method', 'Method'), report_col('kind', 'Type'), report_col('amount', 'Amount', 'money')], $rows);
    return $out;
}

// ── 3. Billing and arrears ──
function report_billing($conn, array $ctx) {
    $open = billing_open_status_sql();
    $b = report_bucket_sql('i.created_at', $ctx['group']);
    $sums = report_rows($conn, "
        SELECT $b AS b, COUNT(*) AS n,
               SUM(i.total_amount) AS billed,
               SUM(CASE WHEN LOWER(i.status) = 'paid' THEN i.total_amount ELSE i.amount_paid END) AS collected,
               SUM(CASE WHEN i.status IN $open THEN " . invoice_balance_sql('i') . " ELSE 0 END) AS owed,
               SUM(CASE WHEN i.status IN $open AND i.due_date < CURDATE() THEN 1 ELSE 0 END) AS overdue
        FROM invoices i
        WHERE i.created_at >= ? AND i.created_at < ? AND LOWER(i.status) <> 'cancelled' AND i.advance_months IS NULL
        GROUP BY b", 'ss', $ctx['from'], $ctx['end']);
    $byKey = [];
    $t = ['n' => 0, 'billed' => 0.0, 'collected' => 0.0, 'owed' => 0.0, 'overdue' => 0];
    foreach ($sums as $r) {
        $byKey[$r['b']] = ['count' => $r['n'], 'billed' => $r['billed'], 'collected' => $r['collected'], 'owed' => $r['owed'], 'overdue' => $r['overdue']];
        foreach ($t as $k => $_) $t[$k] += (float)$r[$k];
    }
    $owedNow = report_rows($conn, "SELECT COALESCE(SUM(" . invoice_balance_sql('i') . "), 0) AS owed, COUNT(*) AS n FROM invoices i WHERE " . invoice_owed_where_sql('i', true))[0];
    $out = ['summary' => [
        report_metric('billed', 'Billed', report_money($t['billed']), 'money', 'Bills issued in the range'),
        report_metric('collected', 'Collected on them', report_money($t['collected']), 'money'),
        report_metric('owed', 'Still owed on them', report_money($t['owed']), 'money'),
        report_metric('rate', 'Collection rate', report_pct($t['collected'], $t['billed']), 'percent'),
        report_metric('count', 'Bills issued', (int)$t['n'], 'int'),
        report_metric('overdueNow', 'Overdue today', report_money($owedNow['owed']), 'money', (int)$owedNow['n'] . ' bill' . ((int)$owedNow['n'] === 1 ? '' : 's') . ' past due, any range'),
    ]];
    if ($ctx['light']) return $out;

    $columns = [report_col('period', 'Period'), report_col('count', 'Bills', 'int'), report_col('billed', 'Billed', 'money'), report_col('collected', 'Collected', 'money'), report_col('owed', 'Still owed', 'money'), report_col('rate', 'Collection rate', 'percent')];
    $rows = report_period_rows($ctx, $byKey, $columns);
    foreach ($rows as &$row) $row['rate'] = report_pct($row['collected'], $row['billed']);
    unset($row);
    $totals = report_totals($rows, $columns, ['rate']);
    $totals['rate'] = report_pct($t['collected'], $t['billed']);
    $out['chart'] = ['kind' => 'bar', 'format' => 'money', 'series' => [['key' => 'billed', 'label' => 'Billed', 'tone' => 'indigo'], ['key' => 'collected', 'label' => 'Collected', 'tone' => 'emerald'], ['key' => 'owed', 'label' => 'Still owed', 'tone' => 'amber']]];
    $out['periods'] = ['columns' => $columns, 'rows' => $rows, 'totals' => $totals];

    // Arrears by age, today.
    $aging = report_rows($conn, "
        SELECT CASE WHEN i.due_date IS NULL OR i.due_date >= CURDATE() THEN 0
                    WHEN DATEDIFF(CURDATE(), i.due_date) <= 30 THEN 1
                    WHEN DATEDIFF(CURDATE(), i.due_date) <= 60 THEN 2
                    WHEN DATEDIFF(CURDATE(), i.due_date) <= 90 THEN 3 ELSE 4 END AS age,
               COUNT(*) AS n, SUM(" . invoice_balance_sql('i') . ") AS owed
        FROM invoices i WHERE " . invoice_owed_where_sql('i') . "
        GROUP BY age ORDER BY age");
    $ageLabels = ['Not yet due', '1–30 days overdue', '31–60 days overdue', '61–90 days overdue', 'Over 90 days overdue'];
    $ageRows = [];
    foreach ($ageLabels as $i => $label) $ageRows[$i] = ['age' => $label, 'count' => 0, 'owed' => 0.0];
    foreach ($aging as $a) $ageRows[(int)$a['age']] = ['age' => $ageLabels[(int)$a['age']], 'count' => (int)$a['n'], 'owed' => report_money($a['owed'])];
    $out['tables'][] = ['key' => 'aging', 'title' => 'Still owed by age (today)', 'note' => 'Every open bill, whatever the range.', 'columns' => [report_col('age', 'Age'), report_col('count', 'Bills', 'int'), report_col('owed', 'Still owed', 'money')],
        'rows' => array_values($ageRows), 'totals' => ['age' => 'Total', 'count' => array_sum(array_column($ageRows, 'count')), 'owed' => report_money(array_sum(array_column($ageRows, 'owed')))]];

    $people = "u.first_name AS u_first_name, u.last_name AS u_last_name, u.suffix AS u_suffix, ra.first_name AS ra_first_name, ra.last_name AS ra_last_name, ra.suffix AS ra_suffix";
    $openList = report_rows($conn, "
        SELECT i.id, i.billing_period, i.due_date, i.status, " . invoice_balance_sql('i') . " AS owed, COALESCE(ra.room_name, '') AS unit,
               DATEDIFF(CURDATE(), i.due_date) AS days, $people
        FROM invoices i
        LEFT JOIN rent_applications ra ON ra.id = i.rent_application_id
        LEFT JOIN users u ON u.id = i.user_id
        WHERE " . invoice_owed_where_sql('i') . "
        ORDER BY i.due_date ASC
        LIMIT " . (REPORT_MAX_DETAIL_ROWS + 1));
    $rows = array_map(fn($r) => [
        'invoice' => $r['id'], 'tenant' => report_person($r), 'unit' => $r['unit'], 'period' => (string)$r['billing_period'],
        'due' => $r['due_date'], 'days' => max(0, (int)$r['days']), 'status' => $r['status'], 'owed' => report_money($r['owed']),
    ], $openList);
    $out['tables'][] = report_table('open', 'Open bills (today)', [report_col('invoice', 'Invoice'), report_col('tenant', 'Tenant'), report_col('unit', 'Unit'), report_col('period', 'Billing period'), report_col('due', 'Due', 'date'), report_col('days', 'Days overdue', 'int'), report_col('status', 'Status'), report_col('owed', 'Still owed', 'money')], $rows,
        ['totals' => ['invoice' => 'Total', 'owed' => report_money(array_sum(array_column($rows, 'owed')))]]);

    $issued = report_rows($conn, "
        SELECT i.id, DATE(i.created_at) AS d, i.billing_period, i.due_date, i.status, i.total_amount,
               CASE WHEN LOWER(i.status) = 'paid' THEN i.total_amount ELSE i.amount_paid END AS paid,
               CASE WHEN i.status IN $open THEN " . invoice_balance_sql('i') . " ELSE 0 END AS owed,
               COALESCE(ra.room_name, '') AS unit, $people
        FROM invoices i
        LEFT JOIN rent_applications ra ON ra.id = i.rent_application_id
        LEFT JOIN users u ON u.id = i.user_id
        WHERE i.created_at >= ? AND i.created_at < ? AND LOWER(i.status) <> 'cancelled' AND i.advance_months IS NULL
        ORDER BY i.created_at DESC
        LIMIT " . (REPORT_MAX_DETAIL_ROWS + 1), 'ss', $ctx['from'], $ctx['end']);
    $rows = array_map(fn($r) => [
        'invoice' => $r['id'], 'issued' => $r['d'], 'tenant' => report_person($r), 'unit' => $r['unit'], 'period' => (string)$r['billing_period'],
        'due' => $r['due_date'], 'status' => $r['status'], 'total' => report_money($r['total_amount']), 'paid' => report_money($r['paid']), 'owed' => report_money($r['owed']),
    ], $issued);
    $out['tables'][] = report_table('issued', 'Bills issued', [report_col('invoice', 'Invoice'), report_col('issued', 'Issued', 'date'), report_col('tenant', 'Tenant'), report_col('unit', 'Unit'), report_col('period', 'Billing period'), report_col('due', 'Due', 'date'), report_col('status', 'Status'), report_col('total', 'Total', 'money'), report_col('paid', 'Paid', 'money'), report_col('owed', 'Still owed', 'money')], $rows);
    return $out;
}

// ── 4. Occupancy and tenants ──

// Every tenancy (an application that moved in): its unit and its dates. An
// ended one ends on the move-out date (else the contract's end).
function report_tenancies($conn) {
    $statuses = "'" . implode("','", REPORT_TENANCY_STATUSES) . "'";
    return report_rows($conn, "
        SELECT ra.id, ra.room_name, ra.status, ra.user_id, ra.monthly_rent, ra.requested_move_out_date,
               COALESCE(lc.ls, ra.move_in_date, DATE(ra.created_at)) AS start_date,
               CASE WHEN ra.status IN ('moved-out', 'archived')
                    THEN COALESCE(ra.requested_move_out_date, DATE(lc.ta), ra.archive_date, lc.le) END AS end_date,
               COALESCE(lc.le, r.lease_end) AS lease_end,
               COALESCE(NULLIF(u.email_address, ''), ra.email, '') AS email,
               COALESCE(NULLIF(u.contact_no, ''), ra.contact_no, '') AS phone,
               COALESCE(ra.monthly_rent, r.monthly_rent, 0) AS rent,
               u.first_name AS u_first_name, u.last_name AS u_last_name, u.suffix AS u_suffix,
               ra.first_name AS ra_first_name, ra.last_name AS ra_last_name, ra.suffix AS ra_suffix
        FROM rent_applications ra
        LEFT JOIN (SELECT rent_application_id, MIN(lease_start) AS ls, MAX(lease_end) AS le, MAX(terminated_at) AS ta
                   FROM lease_contracts GROUP BY rent_application_id) lc ON lc.rent_application_id = ra.id
        LEFT JOIN users u ON u.id = ra.user_id
        LEFT JOIN rooms r ON r.id = ra.room_name
        WHERE ra.status IN ($statuses, 'Approved')
           OR (ra.status = 'archived' AND (ra.pre_archive_status IN ($statuses) OR ra.requested_move_out_date IS NOT NULL))
        ORDER BY ra.room_name");
}

function report_occupancy($conn, array $ctx) {
    $tenancies = report_tenancies($conn);
    $moved = array_values(array_filter($tenancies, fn($t) => $t['status'] !== 'Approved'));
    $today = date('Y-m-d');
    // Units occupied on a day: a tenancy that started by then and had not ended.
    $occupiedOn = function ($day) use ($moved) {
        $units = [];
        foreach ($moved as $t) {
            if ($t['start_date'] !== null && $t['start_date'] <= $day && ($t['end_date'] === null || $t['end_date'] > $day)) $units[$t['room_name']] = true;
        }
        return count($units);
    };
    $rooms = report_rows($conn, "SELECT id, monthly_rent, status, archived_at FROM rooms");
    $unitsOn = fn($day) => count(array_filter($rooms, fn($r) => $r['archived_at'] === null || substr($r['archived_at'], 0, 10) > $day));
    $roomsNow = array_values(array_filter($rooms, fn($r) => $r['archived_at'] === null));
    $occupiedNow = count(array_filter($roomsNow, fn($r) => strtolower((string)$r['status']) === 'occupied'));
    $vacantRent = array_sum(array_map(fn($r) => strtolower((string)$r['status']) === 'vacant' ? (float)$r['monthly_rent'] : 0, $roomsNow));
    $inRange = fn($d) => $d !== null && $d >= $ctx['from'] && $d <= $ctx['to'];
    $moveIns = array_values(array_filter($moved, fn($t) => $inRange($t['start_date'])));
    $moveOuts = array_values(array_filter($moved, fn($t) => $t['end_date'] !== null && $inRange($t['end_date'])));

    // Average over the range: occupancy at the end of each day up to today.
    $sum = 0; $days = 0;
    $cursor = new DateTime($ctx['from']);
    $last = min($ctx['to'], $today);
    while ($cursor->format('Y-m-d') <= $last && $days < 3700) {
        $d = $cursor->format('Y-m-d');
        $u = $unitsOn($d);
        if ($u > 0) { $sum += $occupiedOn($d) / $u; $days++; }
        $cursor->modify('+1 day');
    }
    $out = ['summary' => [
        report_metric('rate', 'Occupancy today', report_pct($occupiedNow, count($roomsNow)), 'percent', "$occupiedNow of " . count($roomsNow) . ' units occupied'),
        report_metric('average', 'Average occupancy', $days > 0 ? round($sum / $days * 100, 1) : null, 'percent', 'Across the days of the range'),
        report_metric('moveIns', 'Move-ins', count($moveIns), 'int'),
        report_metric('moveOuts', 'Move-outs', count($moveOuts), 'int'),
        report_metric('vacantRent', 'Rent lost to vacancy', report_money($vacantRent), 'money', 'Monthly rent of the units vacant today'),
    ]];
    if ($ctx['light']) return $out;

    $columns = [report_col('period', 'Period'), report_col('occupied', 'Occupied units', 'int'), report_col('units', 'Units', 'int'), report_col('rate', 'Occupancy', 'percent'), report_col('moveIns', 'Move-ins', 'int'), report_col('moveOuts', 'Move-outs', 'int')];
    $rows = [];
    foreach ($ctx['periods'] as $p) {
        // Measured at the end of the period (today for the current one); a period
        // still to come has no figure.
        $at = min($p['to'], $today);
        $future = $p['from'] > $today;
        $occ = $future ? null : $occupiedOn($at);
        $units = $future ? null : $unitsOn($at);
        $ins = count(array_filter($moveIns, fn($t) => $t['start_date'] >= $p['from'] && $t['start_date'] <= $p['to']));
        $outs = count(array_filter($moveOuts, fn($t) => $t['end_date'] >= $p['from'] && $t['end_date'] <= $p['to']));
        $rows[] = ['period' => $p['label'], '_key' => $p['key'], '_from' => $p['from'], '_to' => $p['to'], '_short' => $p['short'],
            'occupied' => $occ, 'units' => $units, 'rate' => $future ? null : report_pct($occ, $units), 'moveIns' => $ins, 'moveOuts' => $outs];
    }
    $out['chart'] = ['kind' => 'line', 'format' => 'percent', 'series' => [['key' => 'rate', 'label' => 'Occupancy', 'tone' => 'indigo']]];
    $out['periods'] = ['columns' => $columns, 'rows' => $rows, 'totals' => ['period' => 'Total', 'moveIns' => count($moveIns), 'moveOuts' => count($moveOuts)]];

    $statusLabel = ['Approved' => 'Approved, moving in', 'active' => 'Active', 'pending-move-out' => 'Moving out'];
    $current = array_values(array_filter($tenancies, fn($t) => isset($statusLabel[$t['status']])));
    $rows = array_map(fn($t) => [
        'unit' => (string)$t['room_name'], 'tenant' => report_person($t), 'email' => $t['email'], 'phone' => $t['phone'],
        'rent' => report_money($t['rent']), 'moveIn' => $t['start_date'], 'rentEnd' => $t['lease_end'] ? substr($t['lease_end'], 0, 10) : null,
        'status' => $statusLabel[$t['status']],
        // For the invoice tools (not printed).
        '_userId' => $t['user_id'] !== null ? (int)$t['user_id'] : null, '_appId' => (int)$t['id'], '_status' => $t['status'],
    ], $current);
    $out['tables'][] = ['key' => 'roster', 'title' => 'Current tenants', 'note' => 'Today, whatever the range.',
        'columns' => [report_col('unit', 'Unit'), report_col('tenant', 'Tenant'), report_col('email', 'Email'), report_col('phone', 'Phone'), report_col('rent', 'Monthly rent', 'money'), report_col('moveIn', 'Moved in', 'date'), report_col('rentEnd', 'Rent ends', 'date'), report_col('status', 'Status')],
        'rows' => $rows, 'totals' => ['unit' => 'Total', 'rent' => report_money(array_sum(array_column($rows, 'rent')))]];
    $mv = fn($list, $dateKey) => array_map(fn($t) => ['date' => $t[$dateKey], 'unit' => (string)$t['room_name'], 'tenant' => report_person($t), 'rent' => report_money($t['rent'])], $list);
    $mvCols = [report_col('date', 'Date', 'date'), report_col('unit', 'Unit'), report_col('tenant', 'Tenant'), report_col('rent', 'Monthly rent', 'money')];
    usort($moveIns, fn($a, $b) => strcmp($a['start_date'], $b['start_date']));
    usort($moveOuts, fn($a, $b) => strcmp($a['end_date'], $b['end_date']));
    $out['tables'][] = report_table('moveIns', 'Move-ins', $mvCols, $mv($moveIns, 'start_date'));
    $out['tables'][] = report_table('moveOuts', 'Move-outs', $mvCols, $mv($moveOuts, 'end_date'));
    return $out;
}

// ── 5. Maintenance ──
function report_maintenance($conn, array $ctx) {
    $done = "status IN ('Completed', 'Resolved')";
    $bo = report_bucket_sql('created_at', $ctx['group']);
    $opened = report_rows($conn, "SELECT $bo AS b, COUNT(*) AS n FROM maintenance_requests WHERE created_at >= ? AND created_at < ? GROUP BY b", 'ss', $ctx['from'], $ctx['end']);
    $br = report_bucket_sql('resolved_at', $ctx['group']);
    $resolved = report_rows($conn, "
        SELECT $br AS b, COUNT(*) AS n, SUM(TIMESTAMPDIFF(MINUTE, created_at, resolved_at)) AS minutes,
               SUM(CASE WHEN tenant_responsible = 0 THEN COALESCE(actual_cost, estimated_cost, 0) ELSE 0 END) AS cost,
               SUM(CASE WHEN tenant_responsible = 1 THEN COALESCE(actual_cost, estimated_cost, 0) ELSE 0 END) AS tenant_cost
        FROM maintenance_requests
        WHERE $done AND resolved_at IS NOT NULL AND resolved_at >= ? AND resolved_at < ?
        GROUP BY b", 'ss', $ctx['from'], $ctx['end']);
    $byKey = [];
    $t = ['opened' => 0, 'resolved' => 0, 'minutes' => 0.0, 'cost' => 0.0, 'tenant_cost' => 0.0];
    foreach ($opened as $r) { $byKey[$r['b']]['opened'] = (int)$r['n']; $t['opened'] += (int)$r['n']; }
    foreach ($resolved as $r) {
        $byKey[$r['b']]['resolved'] = (int)$r['n'];
        $byKey[$r['b']]['cost'] = (float)$r['cost'];
        $t['resolved'] += (int)$r['n'];
        $t['minutes'] += (float)$r['minutes'];
        $t['cost'] += (float)$r['cost'];
        $t['tenant_cost'] += (float)$r['tenant_cost'];
    }
    $openNow = (int)report_rows($conn, "SELECT COUNT(*) AS n FROM maintenance_requests WHERE status IN ('Pending', 'In Progress')")[0]['n'];
    $out = ['summary' => [
        report_metric('opened', 'Requests received', $t['opened'], 'int'),
        report_metric('resolved', 'Requests finished', $t['resolved'], 'int'),
        report_metric('avgHours', 'Average time to finish', $t['resolved'] > 0 ? round($t['minutes'] / $t['resolved'] / 60, 1) : null, 'hours'),
        report_metric('cost', 'Repair cost', report_money($t['cost']), 'money', 'Paid by the building'),
        report_metric('tenantCost', 'Billed to tenants', report_money($t['tenant_cost']), 'money', 'Repairs the tenant was responsible for'),
        report_metric('openNow', 'Open today', $openNow, 'int', 'Pending or in progress, any range'),
    ]];
    if ($ctx['light']) return $out;

    $columns = [report_col('period', 'Period'), report_col('opened', 'Received', 'int'), report_col('resolved', 'Finished', 'int'), report_col('cost', 'Repair cost', 'money')];
    $rows = report_period_rows($ctx, $byKey, $columns);
    $out['chart'] = ['kind' => 'bar', 'format' => 'int', 'series' => [['key' => 'opened', 'label' => 'Received', 'tone' => 'amber'], ['key' => 'resolved', 'label' => 'Finished', 'tone' => 'emerald']]];
    $out['periods'] = ['columns' => $columns, 'rows' => $rows, 'totals' => report_totals($rows, $columns)];

    $byCat = report_rows($conn, "
        SELECT COALESCE(NULLIF(issue_category, ''), 'Other') AS category, COUNT(*) AS n,
               SUM(CASE WHEN $done THEN 1 ELSE 0 END) AS finished,
               SUM(CASE WHEN $done AND tenant_responsible = 0 THEN COALESCE(actual_cost, estimated_cost, 0) ELSE 0 END) AS cost
        FROM maintenance_requests WHERE created_at >= ? AND created_at < ?
        GROUP BY category ORDER BY n DESC", 'ss', $ctx['from'], $ctx['end']);
    $out['tables'][] = ['key' => 'categories', 'title' => 'By category', 'note' => 'Requests received in the range.', 'columns' => [report_col('category', 'Category'), report_col('count', 'Received', 'int'), report_col('finished', 'Finished', 'int'), report_col('cost', 'Repair cost', 'money')],
        'rows' => array_map(fn($r) => ['category' => $r['category'], 'count' => (int)$r['n'], 'finished' => (int)$r['finished'], 'cost' => report_money($r['cost'])], $byCat),
        'totals' => ['category' => 'Total', 'count' => array_sum(array_column($byCat, 'n')), 'finished' => array_sum(array_column($byCat, 'finished')), 'cost' => report_money(array_sum(array_column($byCat, 'cost')))]];
    $byUrg = report_rows($conn, "
        SELECT COALESCE(NULLIF(urgency, ''), 'Needs triage') AS urg, status, COUNT(*) AS n
        FROM maintenance_requests WHERE created_at >= ? AND created_at < ?
        GROUP BY urg, status", 'ss', $ctx['from'], $ctx['end']);
    $statuses = array_values(array_unique(array_column($byUrg, 'status')));
    sort($statuses);
    $urgRows = [];
    foreach ($byUrg as $r) {
        $urgRows[$r['urg']] ??= ['urgency' => $r['urg'], 'total' => 0];
        $urgRows[$r['urg']]['s_' . $r['status']] = ($urgRows[$r['urg']]['s_' . $r['status']] ?? 0) + (int)$r['n'];
        $urgRows[$r['urg']]['total'] += (int)$r['n'];
    }
    $out['tables'][] = ['key' => 'urgency', 'title' => 'By urgency and status', 'columns' => array_merge([report_col('urgency', 'Urgency')], array_map(fn($s) => report_col('s_' . $s, $s, 'int'), $statuses), [report_col('total', 'Total', 'int')]),
        'rows' => array_values(array_map(fn($r) => $r + array_fill_keys(array_map(fn($s) => 's_' . $s, $statuses), 0), $urgRows))];

    $list = report_rows($conn, "
        SELECT m.id, DATE(m.created_at) AS d, m.room_name, m.issue_category, m.urgency, m.status, DATE(m.resolved_at) AS resolved,
               m.tenant_responsible, COALESCE(m.actual_cost, m.estimated_cost) AS cost, COALESCE(NULLIF(m.title, ''), '') AS title,
               u.first_name AS u_first_name, u.last_name AS u_last_name, u.suffix AS u_suffix
        FROM maintenance_requests m LEFT JOIN users u ON u.id = m.user_id
        WHERE m.created_at >= ? AND m.created_at < ?
        ORDER BY m.created_at DESC LIMIT " . (REPORT_MAX_DETAIL_ROWS + 1), 'ss', $ctx['from'], $ctx['end']);
    $rows = array_map(fn($r) => [
        'id' => 'MR-' . str_pad($r['id'], 4, '0', STR_PAD_LEFT), 'date' => $r['d'], 'unit' => (string)$r['room_name'], 'tenant' => report_person($r),
        'category' => (string)$r['issue_category'], 'title' => $r['title'], 'urgency' => (string)($r['urgency'] ?: 'Needs triage'), 'status' => (string)$r['status'],
        'resolved' => $r['resolved'], 'paidBy' => (int)$r['tenant_responsible'] ? 'Tenant' : 'Building', 'cost' => $r['cost'] !== null ? report_money($r['cost']) : null,
    ], $list);
    $out['tables'][] = report_table('requests', 'Requests', [report_col('id', 'Request'), report_col('date', 'Received', 'date'), report_col('unit', 'Unit'), report_col('tenant', 'Tenant'), report_col('category', 'Category'), report_col('title', 'Title'), report_col('urgency', 'Urgency'), report_col('status', 'Status'), report_col('resolved', 'Finished', 'date'), report_col('paidBy', 'Paid by'), report_col('cost', 'Cost', 'money')], $rows);
    return $out;
}

// ── 6. Utilities (readings are monthly: grouped by month or year) ──
function report_utilities($conn, array $ctx) {
    $fromMonth = substr($ctx['from'], 0, 7);
    $toMonth = substr($ctx['to'], 0, 7);
    $b = $ctx['group'] === 'year' ? 'LEFT(ur.billing_period, 4)' : 'ur.billing_period';
    $sums = report_rows($conn, "
        SELECT $b AS b, COUNT(*) AS n, COUNT(DISTINCT ur.room_name) AS units,
               SUM(ur.water_consumption) AS water, SUM(ur.electric_consumption) AS kwh,
               SUM(ur.water_amount + ur.water_other_fees) AS water_cost,
               SUM(ur.electric_amount + ur.electric_other_fees) AS electric_cost,
               SUM(COALESCE(it.cost, 0) + CASE WHEN ur.entry_mode = 'total' THEN COALESCE(ur.total_amount, 0) ELSE 0 END) AS other_cost
        FROM utility_readings ur
        LEFT JOIN (SELECT reading_id, SUM(amount + COALESCE(other_fees, 0)) AS cost FROM utility_reading_items GROUP BY reading_id) it ON it.reading_id = ur.id
        WHERE ur.billing_period BETWEEN ? AND ?
        GROUP BY b", 'ss', $fromMonth, $toMonth);
    $byKey = [];
    $t = ['n' => 0, 'water' => 0.0, 'kwh' => 0.0, 'water_cost' => 0.0, 'electric_cost' => 0.0, 'other_cost' => 0.0];
    foreach ($sums as $r) {
        $byKey[$r['b']] = ['water' => $r['water'], 'kwh' => $r['kwh'], 'waterCost' => $r['water_cost'], 'electricCost' => $r['electric_cost'], 'otherCost' => $r['other_cost'],
            'total' => (float)$r['water_cost'] + (float)$r['electric_cost'] + (float)$r['other_cost'], 'readings' => $r['n']];
        foreach ($t as $k => $_) $t[$k] += (float)$r[$k];
    }
    [, $in] = report_receipt_sums($conn, $ctx);
    $units = (int)report_rows($conn, "SELECT COUNT(DISTINCT room_name) AS n FROM utility_readings WHERE billing_period BETWEEN ? AND ?", 'ss', $fromMonth, $toMonth)[0]['n'];
    $billed = $t['water_cost'] + $t['electric_cost'] + $t['other_cost'];
    $out = ['summary' => [
        report_metric('water', 'Water used', round($t['water'], 2), 'number', 'Cubic metres'),
        report_metric('kwh', 'Electricity used', round($t['kwh'], 2), 'number', 'Kilowatt-hours'),
        report_metric('billed', 'Charged to tenants', report_money($billed), 'money', 'From the meter readings'),
        report_metric('collected', 'Water and electricity paid', report_money($in['water'] + $in['electricity']), 'money', 'Received in the range'),
        report_metric('readings', 'Readings', (int)$t['n'], 'int', "$units unit" . ($units === 1 ? '' : 's')),
    ]];
    if ($ctx['light']) return $out;

    $columns = [report_col('period', 'Period'), report_col('water', 'Water (m³)', 'number'), report_col('kwh', 'Electricity (kWh)', 'number'), report_col('waterCost', 'Water charges', 'money'), report_col('electricCost', 'Electricity charges', 'money'), report_col('otherCost', 'Other utilities', 'money'), report_col('total', 'Total charges', 'money'), report_col('readings', 'Readings', 'int')];
    $rows = report_period_rows($ctx, $byKey, $columns);
    $out['chart'] = ['kind' => 'bar', 'format' => 'money', 'series' => [['key' => 'waterCost', 'label' => 'Water', 'tone' => 'sky'], ['key' => 'electricCost', 'label' => 'Electricity', 'tone' => 'amber'], ['key' => 'otherCost', 'label' => 'Other', 'tone' => 'violet']]];
    $out['periods'] = ['columns' => $columns, 'rows' => $rows, 'totals' => report_totals($rows, $columns)];

    $perUnit = report_rows($conn, "
        SELECT ur.room_name AS unit, COUNT(*) AS n, SUM(ur.water_consumption) AS water, SUM(ur.electric_consumption) AS kwh,
               SUM(ur.water_amount + ur.water_other_fees + ur.electric_amount + ur.electric_other_fees + COALESCE(it.cost, 0)
                   + CASE WHEN ur.entry_mode = 'total' THEN COALESCE(ur.total_amount, 0) ELSE 0 END) AS cost
        FROM utility_readings ur
        LEFT JOIN (SELECT reading_id, SUM(amount + COALESCE(other_fees, 0)) AS cost FROM utility_reading_items GROUP BY reading_id) it ON it.reading_id = ur.id
        WHERE ur.billing_period BETWEEN ? AND ?
        GROUP BY ur.room_name ORDER BY cost DESC", 'ss', $fromMonth, $toMonth);
    $out['tables'][] = ['key' => 'units', 'title' => 'By unit', 'columns' => [report_col('unit', 'Unit'), report_col('water', 'Water (m³)', 'number'), report_col('kwh', 'Electricity (kWh)', 'number'), report_col('cost', 'Charges', 'money'), report_col('readings', 'Readings', 'int')],
        'rows' => array_map(fn($r) => ['unit' => $r['unit'], 'water' => round((float)$r['water'], 2), 'kwh' => round((float)$r['kwh'], 2), 'cost' => report_money($r['cost']), 'readings' => (int)$r['n']], $perUnit),
        'totals' => ['unit' => 'Total', 'water' => round($t['water'], 2), 'kwh' => round($t['kwh'], 2), 'cost' => report_money($billed), 'readings' => (int)$t['n']]];
    return $out;
}

// ── 7. Inquiries and applications ──
function report_leasing($conn, array $ctx) {
    $bi = report_bucket_sql('created_at', $ctx['group']);
    $inq = report_rows($conn, "SELECT $bi AS b, status, COUNT(*) AS n FROM inquiries WHERE created_at >= ? AND created_at < ? GROUP BY b, status", 'ss', $ctx['from'], $ctx['end']);
    $apps = report_rows($conn, "SELECT $bi AS b, status, COUNT(*) AS n FROM rent_applications WHERE created_at >= ? AND created_at < ? GROUP BY b, status", 'ss', $ctx['from'], $ctx['end']);
    $byKey = [];
    $inqStatus = [];
    $appStatus = [];
    foreach ($inq as $r) {
        $byKey[$r['b']]['inquiries'] = ($byKey[$r['b']]['inquiries'] ?? 0) + (int)$r['n'];
        $inqStatus[$r['status']] = ($inqStatus[$r['status']] ?? 0) + (int)$r['n'];
    }
    foreach ($apps as $r) {
        $byKey[$r['b']]['applications'] = ($byKey[$r['b']]['applications'] ?? 0) + (int)$r['n'];
        if (in_array($r['status'], REPORT_APPROVED_STATUSES, true)) $byKey[$r['b']]['approved'] = ($byKey[$r['b']]['approved'] ?? 0) + (int)$r['n'];
        $appStatus[$r['status']] = ($appStatus[$r['status']] ?? 0) + (int)$r['n'];
    }
    $inquiries = array_sum($inqStatus);
    $applications = array_sum($appStatus);
    $approved = array_sum(array_intersect_key($appStatus, array_flip(REPORT_APPROVED_STATUSES)));
    $rejected = ($appStatus['Rejected'] ?? 0) + ($appStatus['Declined'] ?? 0);
    $converted = $inqStatus['Converted'] ?? 0;
    $out = ['summary' => [
        report_metric('inquiries', 'Inquiries', $inquiries, 'int'),
        report_metric('conversion', 'Inquiries converted', report_pct($converted, $inquiries), 'percent', "$converted became tenants"),
        report_metric('applications', 'Applications', $applications, 'int'),
        report_metric('approved', 'Approved', $approved, 'int', 'Including those since moved in or out'),
        report_metric('rejected', 'Rejected or declined', $rejected, 'int'),
        report_metric('approvalRate', 'Approval rate', report_pct($approved, $applications), 'percent'),
    ]];
    if ($ctx['light']) return $out;

    $columns = [report_col('period', 'Period'), report_col('inquiries', 'Inquiries', 'int'), report_col('applications', 'Applications', 'int'), report_col('approved', 'Approved', 'int')];
    $rows = report_period_rows($ctx, $byKey, $columns);
    $out['chart'] = ['kind' => 'bar', 'format' => 'int', 'series' => [['key' => 'inquiries', 'label' => 'Inquiries', 'tone' => 'sky'], ['key' => 'applications', 'label' => 'Applications', 'tone' => 'indigo'], ['key' => 'approved', 'label' => 'Approved', 'tone' => 'emerald']]];
    $out['periods'] = ['columns' => $columns, 'rows' => $rows, 'totals' => report_totals($rows, $columns)];
    $status = fn($counts, $label) => array_map(fn($s, $n) => ['status' => $s, 'count' => $n, 'share' => report_pct($n, array_sum($counts))], array_keys($counts), array_values($counts));
    arsort($inqStatus);
    arsort($appStatus);
    $statusCols = [report_col('status', 'Status'), report_col('count', 'Count', 'int'), report_col('share', 'Share', 'percent')];
    $out['tables'][] = ['key' => 'inquiryStatus', 'title' => 'Inquiries by status', 'columns' => $statusCols, 'rows' => $status($inqStatus, 'Inquiries'), 'totals' => ['status' => 'Total', 'count' => $inquiries]];
    $out['tables'][] = ['key' => 'applicationStatus', 'title' => 'Applications by status', 'columns' => $statusCols, 'rows' => $status($appStatus, 'Applications'), 'totals' => ['status' => 'Total', 'count' => $applications]];

    $list = report_rows($conn, "
        SELECT id, DATE(created_at) AS d, first_name AS ra_first_name, last_name AS ra_last_name, suffix AS ra_suffix,
               room_name, monthly_rent, months_of_rent, occupants, status
        FROM rent_applications WHERE created_at >= ? AND created_at < ?
        ORDER BY created_at DESC LIMIT " . (REPORT_MAX_DETAIL_ROWS + 1), 'ss', $ctx['from'], $ctx['end']);
    $rows = array_map(fn($r) => ['id' => 'APP-' . str_pad($r['id'], 4, '0', STR_PAD_LEFT), 'date' => $r['d'], 'applicant' => report_person($r), 'unit' => (string)$r['room_name'],
        'rent' => report_money($r['monthly_rent']), 'months' => (int)$r['months_of_rent'], 'occupants' => (int)$r['occupants'], 'status' => (string)$r['status']], $list);
    $out['tables'][] = report_table('applications', 'Applications', [report_col('id', 'Application'), report_col('date', 'Submitted', 'date'), report_col('applicant', 'Applicant'), report_col('unit', 'Unit'), report_col('rent', 'Monthly rent', 'money'), report_col('months', 'Months', 'int'), report_col('occupants', 'Occupants', 'int'), report_col('status', 'Status')], $rows);

    $list = report_rows($conn, "
        SELECT id, DATE(created_at) AS d, COALESCE(NULLIF(full_name, ''), guest_name, '') AS name, COALESCE(NULLIF(room_name, ''), unit_of_interest, '') AS unit,
               COALESCE(source, '') AS source, status
        FROM inquiries WHERE created_at >= ? AND created_at < ?
        ORDER BY created_at DESC LIMIT " . (REPORT_MAX_DETAIL_ROWS + 1), 'ss', $ctx['from'], $ctx['end']);
    $rows = array_map(fn($r) => ['date' => $r['d'], 'name' => (string)$r['name'], 'unit' => (string)$r['unit'], 'source' => ucfirst((string)$r['source']), 'status' => (string)$r['status']], $list);
    $out['tables'][] = report_table('inquiries', 'Inquiries', [report_col('date', 'Received', 'date'), report_col('name', 'Name'), report_col('unit', 'Unit of interest'), report_col('source', 'Source'), report_col('status', 'Status')], $rows);
    return $out;
}

// ── 8. Services and parking ──
function report_services($conn, array $ctx) {
    $b = report_bucket_sql('created_at', $ctx['group']);
    $svc = report_rows($conn, "
        SELECT $b AS b, COUNT(*) AS n, SUM(CASE WHEN LOWER(status) = 'completed' THEN COALESCE(total_cost, 0) ELSE 0 END) AS value
        FROM service_requests WHERE created_at >= ? AND created_at < ? GROUP BY b", 'ss', $ctx['from'], $ctx['end']);
    $park = report_rows($conn, "SELECT $b AS b, COUNT(*) AS n FROM parking_reservations WHERE created_at >= ? AND created_at < ? GROUP BY b", 'ss', $ctx['from'], $ctx['end']);
    $byKey = [];
    $t = ['services' => 0, 'value' => 0.0, 'parking' => 0];
    foreach ($svc as $r) { $byKey[$r['b']]['services'] = (int)$r['n']; $byKey[$r['b']]['value'] = (float)$r['value']; $t['services'] += (int)$r['n']; $t['value'] += (float)$r['value']; }
    foreach ($park as $r) { $byKey[$r['b']]['parking'] = (int)$r['n']; $t['parking'] += (int)$r['n']; }
    [, $in] = report_receipt_sums($conn, $ctx);
    $slots = report_rows($conn, "
        SELECT (SELECT COUNT(*) FROM parking_slots WHERE archived_at IS NULL AND status = 'active') AS slots,
               (SELECT COUNT(*) FROM parking_reservations WHERE active_slot IS NOT NULL) AS taken");
    $slotCount = (int)($slots[0]['slots'] ?? 0);
    $taken = (int)($slots[0]['taken'] ?? 0);
    $out = ['summary' => [
        report_metric('services', 'Service requests', $t['services'], 'int'),
        report_metric('value', 'Completed services', report_money($t['value']), 'money', 'Value of the requests completed'),
        report_metric('servicesPaid', 'Services paid', report_money($in['services']), 'money', 'Received in the range'),
        report_metric('parking', 'Parking requests', $t['parking'], 'int'),
        report_metric('parkingPaid', 'Parking paid', report_money($in['parking']), 'money', 'Received in the range'),
        report_metric('slots', 'Parking in use today', report_pct($taken, $slotCount), 'percent', "$taken of $slotCount slots"),
    ]];
    if ($ctx['light']) return $out;

    $columns = [report_col('period', 'Period'), report_col('services', 'Service requests', 'int'), report_col('value', 'Completed value', 'money'), report_col('parking', 'Parking requests', 'int')];
    $rows = report_period_rows($ctx, $byKey, $columns);
    $out['chart'] = ['kind' => 'bar', 'format' => 'int', 'series' => [['key' => 'services', 'label' => 'Service requests', 'tone' => 'indigo'], ['key' => 'parking', 'label' => 'Parking requests', 'tone' => 'violet']]];
    $out['periods'] = ['columns' => $columns, 'rows' => $rows, 'totals' => report_totals($rows, $columns)];

    $bySvc = report_rows($conn, "
        SELECT COALESCE(NULLIF(service_name, ''), 'Other') AS name, COUNT(*) AS n,
               SUM(CASE WHEN LOWER(status) = 'completed' THEN 1 ELSE 0 END) AS done,
               SUM(CASE WHEN LOWER(status) = 'completed' THEN COALESCE(total_cost, 0) ELSE 0 END) AS value
        FROM service_requests WHERE created_at >= ? AND created_at < ?
        GROUP BY name ORDER BY n DESC", 'ss', $ctx['from'], $ctx['end']);
    $out['tables'][] = ['key' => 'byService', 'title' => 'By service', 'columns' => [report_col('service', 'Service'), report_col('count', 'Requests', 'int'), report_col('done', 'Completed', 'int'), report_col('value', 'Completed value', 'money')],
        'rows' => array_map(fn($r) => ['service' => $r['name'], 'count' => (int)$r['n'], 'done' => (int)$r['done'], 'value' => report_money($r['value'])], $bySvc),
        'totals' => ['service' => 'Total', 'count' => array_sum(array_column($bySvc, 'n')), 'done' => array_sum(array_column($bySvc, 'done')), 'value' => report_money(array_sum(array_column($bySvc, 'value')))]];
    $byVeh = report_rows($conn, "
        SELECT COALESCE(NULLIF(vehicle_type, ''), 'Other') AS type, status, COUNT(*) AS n
        FROM parking_reservations WHERE created_at >= ? AND created_at < ?
        GROUP BY type, status", 'ss', $ctx['from'], $ctx['end']);
    $vehRows = [];
    foreach ($byVeh as $r) {
        $vehRows[$r['type']] ??= ['type' => $r['type'], 'count' => 0, 'approved' => 0];
        $vehRows[$r['type']]['count'] += (int)$r['n'];
        if (in_array($r['status'], ['Approved', 'Assigned', 'Active', 'Released'], true)) $vehRows[$r['type']]['approved'] += (int)$r['n'];
    }
    $out['tables'][] = ['key' => 'byVehicle', 'title' => 'Parking by vehicle', 'columns' => [report_col('type', 'Vehicle'), report_col('count', 'Requests', 'int'), report_col('approved', 'Given a slot', 'int')], 'rows' => array_values($vehRows)];

    $people = "u.first_name AS u_first_name, u.last_name AS u_last_name, u.suffix AS u_suffix";
    $list = report_rows($conn, "
        SELECT s.id, DATE(s.created_at) AS d, s.service_name, s.room_name, s.status, s.total_cost, DATE(s.completed_at) AS done, $people
        FROM service_requests s LEFT JOIN users u ON u.id = s.user_id
        WHERE s.created_at >= ? AND s.created_at < ?
        ORDER BY s.created_at DESC LIMIT " . (REPORT_MAX_DETAIL_ROWS + 1), 'ss', $ctx['from'], $ctx['end']);
    $rows = array_map(fn($r) => ['id' => 'SR-' . str_pad($r['id'], 4, '0', STR_PAD_LEFT), 'date' => $r['d'], 'service' => (string)$r['service_name'], 'unit' => (string)$r['room_name'],
        'tenant' => report_person($r), 'status' => (string)$r['status'], 'completed' => $r['done'], 'cost' => $r['total_cost'] !== null ? report_money($r['total_cost']) : null], $list);
    $out['tables'][] = report_table('serviceRequests', 'Service requests', [report_col('id', 'Request'), report_col('date', 'Received', 'date'), report_col('service', 'Service'), report_col('unit', 'Unit'), report_col('tenant', 'Tenant'), report_col('status', 'Status'), report_col('completed', 'Completed', 'date'), report_col('cost', 'Cost', 'money')], $rows);

    $list = report_rows($conn, "
        SELECT p.id, DATE(p.created_at) AS d, p.vehicle_type, p.vehicle_model, p.plate_number, p.status, p.monthly_fee, p.duration_months, $people
        FROM parking_reservations p LEFT JOIN users u ON u.id = p.user_id
        WHERE p.created_at >= ? AND p.created_at < ?
        ORDER BY p.created_at DESC LIMIT " . (REPORT_MAX_DETAIL_ROWS + 1), 'ss', $ctx['from'], $ctx['end']);
    $rows = array_map(fn($r) => ['id' => 'PKG-' . str_pad($r['id'], 4, '0', STR_PAD_LEFT), 'date' => $r['d'], 'tenant' => report_person($r), 'vehicle' => trim($r['vehicle_type'] . ' ' . ($r['vehicle_model'] ?? '')),
        'plate' => (string)$r['plate_number'], 'months' => $r['duration_months'] !== null ? (int)$r['duration_months'] : null, 'fee' => $r['monthly_fee'] !== null ? report_money($r['monthly_fee']) : null, 'status' => (string)$r['status']], $list);
    $out['tables'][] = report_table('parkingRequests', 'Parking requests', [report_col('id', 'Request'), report_col('date', 'Received', 'date'), report_col('tenant', 'Tenant'), report_col('vehicle', 'Vehicle'), report_col('plate', 'Plate'), report_col('months', 'Months', 'int'), report_col('fee', 'Monthly fee', 'money'), report_col('status', 'Status')], $rows);
    return $out;
}

// The whole response for one report. The previous range's summary is attached
// to each metric as `previous` so the page can show the change.
function build_report($conn, $type, $from, $to, $group) {
    $fn = 'report_' . $type;
    $out = $fn($conn, report_ctx($from, $to, $group));
    [$pFrom, $pTo] = report_previous_range($from, $to);
    $prev = $fn($conn, report_ctx($pFrom, $pTo, $group, true));
    $prevByKey = array_column($prev['summary'], 'value', 'key');
    // Figures "today" (occupancy now, open now) do not depend on the range.
    $today = ['occupancy' => ['rate', 'vacantRent'], 'billing' => ['overdueNow'], 'maintenance' => ['openNow'], 'services' => ['slots']][$type] ?? [];
    foreach ($out['summary'] as &$m) {
        if (in_array($m['key'], $today, true)) continue;
        if (array_key_exists($m['key'], $prevByKey)) $m['previous'] = $prevByKey[$m['key']];
    }
    unset($m);
    return [
        'report' => $type,
        'title' => REPORT_TYPES[$type],
        'from' => $from,
        'to' => $to,
        'group' => $group,
        'previous' => ['from' => $pFrom, 'to' => $pTo],
        'generatedAt' => date('Y-m-d H:i:s'),
    ] + $out + ['chart' => null, 'periods' => null, 'tables' => []];
}
