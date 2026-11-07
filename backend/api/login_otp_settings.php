<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";
require_once __DIR__ . '/services/login_otp_policy.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// Admin → Other Settings → Sign-in Codes: the emailed 6-digit code a tenant
// gets when signing in on a new device (services/login_otp_policy.php).
//
// GET  ?q=&filter=all|active|past|non_tenant|custom&page=N
//      → { enabled, email_verification, counts{…}, users[], total, page, per_page }
//      Tenant accounts only (role user, not archived: archived ones cannot sign in).
//      active = a current tenancy (active / pending-move-out); past = a tenancy
//      that ended (moved-out, or archived after one) and none now; non_tenant =
//      everyone else (applicants, rejected, account only); custom = not following
//      the default. Counts follow the search, so each chip says what it would show.
// POST { action: 'set_global', enabled: bool }
//      { action: 'set_user', user_id, mode: 'default'|'on'|'off' }
//      { action: 'clear_overrides' }   every account back to the default
//      { action: 'set_email_verification', enabled: bool }   new accounts must
//        open the emailed link before signing in (email_verification_enabled)

$admin_id = require_admin($conn);

const OTP_PER_PAGE = 20;
const OTP_FILTERS = ['all', 'active', 'past', 'non_tenant', 'custom'];

function otp_fail($code, $msg, $field = null) {
    http_response_code($code);
    $body = ['success' => false, 'message' => $msg];
    if ($field) $body['errors'] = [$field => $msg];
    echo json_encode($body);
    exit;
}

// Tenant accounts with their tenancy group. One aggregate over rent_applications
// per request, never a query per row.
const OTP_BASE_SQL = "
    FROM users u
    LEFT JOIN (
        SELECT user_id,
               MAX(status IN ('active', 'pending-move-out')) AS is_active,
               MAX(status = 'moved-out' OR (status = 'archived' AND pre_archive_status IN ('moved-out', 'active', 'pending-move-out'))) AS was_tenant,
               MAX(CASE WHEN status IN ('active', 'pending-move-out') THEN room_name END) AS unit,
               MAX(CASE WHEN status = 'moved-out' OR status = 'archived' THEN room_name END) AS past_unit
        FROM rent_applications
        WHERE user_id IS NOT NULL
        GROUP BY user_id
    ) t ON t.user_id = u.id
    WHERE u.role = 'user' AND u.is_archived = 0";

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $q = trim((string)($_GET['q'] ?? ''));
    if (mb_strlen($q) > 100) otp_fail(422, 'Search is 100 characters at most.', 'q');
    $filter = (string)($_GET['filter'] ?? 'all');
    if (!in_array($filter, OTP_FILTERS, true)) otp_fail(422, 'Unknown filter.', 'filter');
    $pageRaw = (string)($_GET['page'] ?? '1');
    if (!ctype_digit($pageRaw) || (int)$pageRaw < 1) otp_fail(422, 'Page must be 1 or more.', 'page');
    $page = (int)$pageRaw;

    $searchSql = '';
    $types = '';
    $params = [];
    if ($q !== '') {
        $like = '%' . addcslashes($q, '%_\\') . '%';
        $searchSql = " AND (CONCAT_WS(' ', u.first_name, u.middle_name, u.last_name) LIKE ? OR u.email_address LIKE ? OR t.unit LIKE ? OR t.past_unit LIKE ?)";
        $types = 'ssss';
        $params = [$like, $like, $like, $like];
    }

    $countStmt = $conn->prepare("
        SELECT COUNT(*) AS all_count,
               SUM(COALESCE(t.is_active, 0) = 1) AS active_count,
               SUM(COALESCE(t.is_active, 0) = 0 AND COALESCE(t.was_tenant, 0) = 1) AS past_count,
               SUM(COALESCE(t.is_active, 0) = 0 AND COALESCE(t.was_tenant, 0) = 0) AS non_tenant_count,
               SUM(u.login_otp_mode <> 'default') AS custom_count
        " . OTP_BASE_SQL . $searchSql);
    if ($types !== '') $countStmt->bind_param($types, ...$params);
    $countStmt->execute();
    $c = $countStmt->get_result()->fetch_assoc() ?: [];
    $countStmt->close();
    $counts = [
        'all' => (int)($c['all_count'] ?? 0),
        'active' => (int)($c['active_count'] ?? 0),
        'past' => (int)($c['past_count'] ?? 0),
        'non_tenant' => (int)($c['non_tenant_count'] ?? 0),
        'custom' => (int)($c['custom_count'] ?? 0),
    ];

    $filterSql = [
        'all' => '',
        'active' => ' AND COALESCE(t.is_active, 0) = 1',
        'past' => ' AND COALESCE(t.is_active, 0) = 0 AND COALESCE(t.was_tenant, 0) = 1',
        'non_tenant' => ' AND COALESCE(t.is_active, 0) = 0 AND COALESCE(t.was_tenant, 0) = 0',
        'custom' => " AND u.login_otp_mode <> 'default'",
    ][$filter];
    $limit = OTP_PER_PAGE;
    $offset = ($page - 1) * OTP_PER_PAGE;
    $listStmt = $conn->prepare("
        SELECT u.id, u.first_name, u.last_name, u.suffix, u.email_address, u.login_otp_mode,
               COALESCE(t.is_active, 0) AS is_active, COALESCE(t.was_tenant, 0) AS was_tenant,
               t.unit, t.past_unit,
               (SELECT COUNT(*) FROM trusted_devices d WHERE d.user_id = u.id) AS devices
        " . OTP_BASE_SQL . $searchSql . $filterSql . "
        ORDER BY u.last_name, u.first_name, u.id
        LIMIT ? OFFSET ?");
    $listTypes = $types . 'ii';
    $listParams = array_merge($params, [$limit, $offset]);
    $listStmt->bind_param($listTypes, ...$listParams);
    $listStmt->execute();
    $res = $listStmt->get_result();
    $users = [];
    while ($row = $res->fetch_assoc()) {
        $group = $row['is_active'] ? 'active' : ($row['was_tenant'] ? 'past' : 'non_tenant');
        $users[] = [
            'id' => (int)$row['id'],
            'name' => person_name($row),
            'email' => $row['email_address'],
            'group' => $group,
            'unit' => $group === 'active' ? $row['unit'] : ($group === 'past' ? $row['past_unit'] : null),
            'mode' => $row['login_otp_mode'],
            'trusted_devices' => (int)$row['devices'],
        ];
    }
    $listStmt->close();

    echo json_encode([
        'success' => true,
        'enabled' => login_otp_globally_enabled($conn),
        'email_verification' => email_verification_enabled($conn),
        'counts' => $counts,
        'users' => $users,
        'total' => $counts[$filter],
        'page' => $page,
        'per_page' => OTP_PER_PAGE,
    ]);
    $conn->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') otp_fail(405, 'Method not allowed.');

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) otp_fail(400, 'Send JSON.');
$action = (string)($in['action'] ?? '');

if ($action === 'set_global') {
    if (!array_key_exists('enabled', $in) || !is_bool($in['enabled'])) otp_fail(422, 'Enabled must be true or false.', 'enabled');
    $value = $in['enabled'] ? '1' : '0';
    $stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES ('login_otp_enabled', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
    $stmt->bind_param('s', $value);
    if (!$stmt->execute()) otp_fail(500, 'Could not save the setting.');
    $stmt->close();
    log_activity($conn, $admin_id, 'auth', 'Updated Sign-in Code Setting',
        'Sign-in codes on new devices ' . ($in['enabled'] ? 'turned on' : 'turned off') . ' for every account that follows the default');
    echo json_encode(['success' => true, 'enabled' => $in['enabled']]);
    $conn->close();
    exit;
}

if ($action === 'set_email_verification') {
    if (!array_key_exists('enabled', $in) || !is_bool($in['enabled'])) otp_fail(422, 'Enabled must be true or false.', 'enabled');
    $value = $in['enabled'] ? '1' : '0';
    $stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES ('email_verification_enabled', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
    $stmt->bind_param('s', $value);
    if (!$stmt->execute()) otp_fail(500, 'Could not save the setting.');
    $stmt->close();
    log_activity($conn, $admin_id, 'auth', 'Updated Email Verification Setting',
        'Email verification for new accounts ' . ($in['enabled'] ? 'turned on' : 'turned off'));
    echo json_encode(['success' => true, 'email_verification' => $in['enabled']]);
    $conn->close();
    exit;
}

if ($action === 'set_user') {
    $userId = $in['user_id'] ?? null;
    if (!is_int($userId) || $userId < 1) otp_fail(422, 'Choose an account.', 'user_id');
    $mode = $in['mode'] ?? null;
    if (!is_string($mode) || !in_array($mode, LOGIN_OTP_MODES, true)) otp_fail(422, 'Mode must be default, on or off.', 'mode');

    $find = $conn->prepare("SELECT email_address, login_otp_mode FROM users WHERE id = ? AND role = 'user' AND is_archived = 0");
    $find->bind_param('i', $userId);
    $find->execute();
    $user = $find->get_result()->fetch_assoc();
    $find->close();
    if (!$user) otp_fail(404, 'That tenant account was not found.', 'user_id');

    if ($user['login_otp_mode'] !== $mode) {
        $upd = $conn->prepare('UPDATE users SET login_otp_mode = ? WHERE id = ?');
        $upd->bind_param('si', $mode, $userId);
        if (!$upd->execute()) otp_fail(500, 'Could not save the setting.');
        $upd->close();
        $label = ['default' => 'follows the default', 'on' => 'always asked for a code', 'off' => 'never asked for a code'][$mode];
        log_activity($conn, $admin_id, 'auth', 'Updated Account Sign-in Code', "{$user['email_address']} (ID $userId): $label");
    }
    echo json_encode(['success' => true, 'user_id' => $userId, 'mode' => $mode]);
    $conn->close();
    exit;
}

if ($action === 'clear_overrides') {
    $stmt = $conn->prepare("UPDATE users SET login_otp_mode = 'default' WHERE role = 'user' AND login_otp_mode <> 'default'");
    if (!$stmt->execute()) otp_fail(500, 'Could not reset the accounts.');
    $cleared = $stmt->affected_rows;
    $stmt->close();
    if ($cleared > 0) {
        log_activity($conn, $admin_id, 'auth', 'Reset Account Sign-in Codes', "$cleared account(s) set back to the default");
    }
    echo json_encode(['success' => true, 'cleared' => $cleared]);
    $conn->close();
    exit;
}

otp_fail(422, 'Unknown action.', 'action');
