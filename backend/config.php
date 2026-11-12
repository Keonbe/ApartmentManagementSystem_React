<?php
// The API test suite (tests/api) runs `php -S` with AMS_TEST_MODE=1 and DB_* in
// the environment. It skips config.env.php, whose constants would otherwise pin
// DB_NAME to the dev database, and refuses any database not named *_test.
$ams_test_mode = getenv('AMS_TEST_MODE') === '1';
if ($ams_test_mode && !preg_match('/_test$/', (string) getenv('DB_NAME'))) {
    http_response_code(500);
    exit('AMS_TEST_MODE requires a DB_NAME ending in _test');
}

// Load environment configuration if available
if (!$ams_test_mode && file_exists(__DIR__ . '/config.env.php')) {
    require_once __DIR__ . '/config.env.php';
}

// Settings come from, in order: config.env.php constants (XAMPP), environment
// variables (Docker / the web server), then local defaults. $_ENV/$_SERVER are checked
// too because some SAPI configurations leave getenv() empty.
function ams_env($key, $default = null) {
    foreach ([getenv($key), $_ENV[$key] ?? false, $_SERVER[$key] ?? false] as $value) {
        if ($value !== false && $value !== '') return $value;
    }
    return $default;
}

if (!defined('DB_HOST')) define('DB_HOST', ams_env('DB_HOST', 'localhost'));
if (!defined('DB_PORT')) define('DB_PORT', (int) ams_env('DB_PORT', 3306));
if (!defined('DB_USER')) define('DB_USER', ams_env('DB_USER', 'root'));
if (!defined('DB_PASS')) define('DB_PASS', ams_env('DB_PASS', ''));
if (!defined('DB_NAME')) define('DB_NAME', ams_env('DB_NAME', 'ams_db'));
// Fails closed (audit C4): a deployment that forgets APP_ENV runs as production,
// so error details and forgot_password.php's dev_token are never exposed.
// Local XAMPP sets 'development' in config.env.php.
if (!defined('APP_ENV')) define('APP_ENV', ams_env('APP_ENV', 'production'));
// Public origin of the frontend (for building links in emails etc.). Empty
// until a frontend is deployed. CORS origins are handled in cors.php.
if (!defined('APP_URL')) define('APP_URL', rtrim(ams_env('APP_URL', ''), '/'));
// Which deployment this is ('local' | 'saas' | 'selfhosted') and a unique name
// for it. Neither changes behaviour; cron/check_environment.php uses them to
// catch a deployment wired to another deployment's database or uploads.
if (!defined('DEPLOYMENT_TARGET')) define('DEPLOYMENT_TARGET', ams_env('DEPLOYMENT_TARGET', 'local'));
if (!defined('DEPLOYMENT_ID')) define('DEPLOYMENT_ID', ams_env('DEPLOYMENT_ID', ''));
define('UPLOADS_DIR', __DIR__ . '/uploads');
// The building's clock. XAMPP ships PHP on Europe/Berlin and a hosted MySQL is
// often UTC, so both are pinned here: PHP below, the DB session once connected.
// Quiet hours, due/overdue and the SMS timestamps all assume one clock.
if (!defined('APP_TIMEZONE')) define('APP_TIMEZONE', ams_env('APP_TIMEZONE', 'Asia/Manila'));
if (!@date_default_timezone_set(APP_TIMEZONE)) date_default_timezone_set('Asia/Manila');

// A payment setting from the deployment's environment, when the host keeps it
// there instead of in system_settings: paymongo_secret_key <- PAYMONGO_SECRET_KEY.
// Returns null when unset so callers fall back to the database value.
function ams_env_setting($setting_key) {
    $key = strtoupper($setting_key);
    if (defined($key)) return (string) constant($key);
    return ams_env($key);
}

// Test-only: accounts on a fake domain listed in DEVICE_OTP_BYPASS_DOMAINS
// (e.g. demo.example, the seed data's domain) skip the emailed device code.
// Never true in production, whatever the variable says.
function ams_skips_device_otp($email) {
    if (APP_ENV === 'production') return false;
    $domains = array_filter(array_map('trim', explode(',', strtolower((string) ams_env_setting('DEVICE_OTP_BYPASS_DOMAINS')))));
    $at = strrpos((string) $email, '@');
    return $at !== false && in_array(strtolower(substr($email, $at + 1)), $domains, true);
}

require_once __DIR__ . '/cors.php';

// Error reporting & resource limits (D-1, D-6)
if (APP_ENV === 'production') {
    @ini_set('display_errors', '0');
    @ini_set('log_errors', '1');
}

// upload_max_filesize and post_max_size cannot be set here (PHP_INI_PERDIR):
// they come from php.ini, and cron/check_environment.php reports them when
// they are too small for the largest upload (a 25 MB chat video).
@ini_set('memory_limit', '128M');

// An uncaught exception used to print PHP's own error page — or, in the many
// endpoints that catch and echo $e->getMessage(), the raw SQL error — to the
// client, while nothing was recorded on the server. Uncaught ones now go to the
// PHP error log and the client gets a generic message.
if (PHP_SAPI !== 'cli') {
    set_exception_handler(function ($e) {
        error_log('[AMS] ' . ($_SERVER['SCRIPT_NAME'] ?? 'cli') . ': ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        // A TypeError here is almost always request data of the wrong shape (a JSON array or
        // object where a string was expected, caught by trim() and friends): the caller's
        // mistake, so 400 rather than a server error. It is logged above either way.
        $bad_input = $e instanceof TypeError;
        if (!headers_sent()) {
            http_response_code($bad_input ? 400 : 500);
            header('Content-Type: application/json');
        }
        echo json_encode(["success" => false, "message" => $bad_input ? "Invalid request data." : "Server error. Please try again."]);
    });
}

// For endpoints that catch an exception themselves: log the detail, return a
// safe message.
// The message to send for a caught exception (audit L1). Endpoints throw plain
// Exceptions with user-facing text on purpose, and those pass through; a
// database exception (strict mysqli mode) is logged and replaced, so SQL and
// schema details never reach the client.
function public_error_message($e, $fallback = "Server error. Please try again.") {
    if ($e instanceof mysqli_sql_exception) {
        error_log('[AMS] ' . ($_SERVER['SCRIPT_NAME'] ?? 'cli') . ': ' . $e->getMessage());
        return $fallback;
    }
    return $e->getMessage();
}

function server_error_response($e, $public_message = "Server error. Please try again.") {
    error_log('[AMS] ' . ($_SERVER['SCRIPT_NAME'] ?? 'cli') . ': ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $public_message]);
}

// Make a failed statement throw instead of silently returning false (PHP 8.0
// doesn't do this by default). Endpoints that wrap writes in begin_transaction
// / try / catch now roll back on a real failure instead of committing partial
// writes; uncaught mysqli_sql_exceptions fall through to the exception handler
// above, which already returns safe JSON.
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

// PHP 8.0 (XAMPP) reports a failed connect through connect_error; PHP 8.1+
// (the Docker image) throws instead. Handle both the same way, and log the
// cause so a production failure isn't just a blank 500.
$db_error = null;
try {
    // DB_PERSISTENT=1 reuses the connection across requests ("p:" prefix). For a
    // database on another host this skips the TCP + login handshake (several
    // round-trips) that every request otherwise pays. Off by default.
    $db_host = ams_env('DB_PERSISTENT', '') === '1' && !$ams_test_mode ? 'p:' . DB_HOST : DB_HOST;
    $conn = new mysqli($db_host, DB_USER, DB_PASS, DB_NAME, DB_PORT);
    if ($conn->connect_error) $db_error = $conn->connect_error;
} catch (mysqli_sql_exception $e) {
    $db_error = $e->getMessage();
}

if ($db_error !== null) {
    error_log('[AMS] Database connection failed (' . DB_HOST . ':' . DB_PORT . '/' . DB_NAME . '): ' . $db_error);
    if (APP_ENV === 'production') {
        if (!headers_sent()) header('Content-Type: application/json');
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Database connection failed"]);
        exit;
    } else {
        die("Connection failed: " . $db_error);
    }
}

// Same clock for NOW()/CURDATE(). A numeric offset needs no MySQL timezone
// tables; Asia/Manila has no DST, so the offset never changes.
$conn->set_charset('utf8mb4');
$conn->query("SET time_zone = '" . date('P') . "'");

// Priority 4: Observability
//
// Audit trail (checklist 8.6). The performer is the verified session user
// whenever there is one, so a call site that still passes a client-supplied id
// can no longer attribute an action to someone else. The passed id is used only
// for requests that have no session at all (password reset by emailed token,
// payment gateway webhooks). Categories are normalised to LOG_CATEGORIES so the
// log can actually be filtered — call sites historically wrote a dozen spellings.
//
// $performer_override is for the few requests whose actor is not the session
// holder: a sign-in or registration that still carries an older token, or the
// daily sweep run from the command line. Pass 0 to record "System".
function log_activity($conn, $user_id, $category, $action, $details = "", $performer_override = null) {
    if ($performer_override !== null) {
        $performer = (int)$performer_override > 0 ? (int)$performer_override : null;
    } else {
        $session = get_authenticated_user($conn);
        $performer = $session ? $session['id'] : ((int)$user_id > 0 ? (int)$user_id : null);
    }
    $category = normalize_log_category($category);
    $stmt = $conn->prepare("INSERT INTO activity_logs (performed_by, category, action, details) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("isss", $performer, $category, $action, $details);
    $stmt->execute();
    $stmt->close();
}

// Releases unit reservations whose hold period has lapsed.
// Marks them Expired and returns the room to 'vacant'. The room update is
// guarded on status = 'reserved' so it can never overwrite an occupied unit.
// UPDATE-only (no DDL) and called explicitly — never on every request.
function release_expired_reservations($conn) {
    $released = 0;

    $stmt = $conn->prepare("SELECT id, room_name FROM unit_reservations WHERE status = 'Active' AND hold_expires_at < CURDATE()");
    if (!$stmt) return 0; // table not migrated yet
    $stmt->execute();
    $res = $stmt->get_result();
    $expired = [];
    while ($row = $res->fetch_assoc()) {
        $expired[] = $row;
    }
    $stmt->close();

    if (!empty($expired)) {
        $res_stmt = $conn->prepare("UPDATE unit_reservations SET status = 'Expired', released_at = NOW(), released_reason = 'Hold period lapsed' WHERE id = ? AND status = 'Active'");
        $room_stmt = $conn->prepare("UPDATE rooms SET status = 'vacant' WHERE id = ? AND status = 'reserved'");

        foreach ($expired as $row) {
            $res_stmt->bind_param("i", $row['id']);
            $res_stmt->execute();
            $room_stmt->bind_param("s", $row['room_name']);
            $room_stmt->execute();
            if ($room_stmt->affected_rows > 0) notify_unit_waitlist($conn, $row['room_name']);
            $released++;
        }

        $res_stmt->close();
        $room_stmt->close();
    }

    // A Converted hold keeps the unit 'reserved' while its application is
    // reviewed. Once the hold date has passed, release any such unit that no
    // open application or active hold still claims (audit M5) — otherwise a
    // rejected or never-filed application left it unrentable forever.
    $conv = $conn->prepare("SELECT DISTINCT ur.room_name FROM unit_reservations ur
                            JOIN rooms r ON r.id = ur.room_name AND r.status = 'reserved'
                            WHERE ur.status = 'Converted' AND ur.hold_expires_at < CURDATE()");
    if ($conv) {
        $conv->execute();
        $rooms = $conv->get_result()->fetch_all(MYSQLI_ASSOC);
        $conv->close();
        foreach ($rooms as $row) {
            if (release_room_if_unclaimed($conn, $row['room_name'])) $released++;
        }
    }

    return $released;
}

// Application statuses that still hold a claim on their room.
const ROOM_CLAIMING_APPLICATION_STATUSES = ['Pending Review', 'Pending', 'Approved', 'Action Required', 'active', 'pending-move-out'];

// Returns a 'reserved' unit to 'vacant' when nothing claims it any more: no
// open application for the room and no Active hold. Used when an application
// that came from a Converted hold is rejected or cancelled, and by the sweep
// above. Guarded on 'reserved', so an occupied unit is never touched.
function release_room_if_unclaimed($conn, $room_name) {
    $placeholders = implode(',', array_fill(0, count(ROOM_CLAIMING_APPLICATION_STATUSES), '?'));
    $stmt = $conn->prepare("UPDATE rooms SET status = 'vacant', tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0
                            WHERE id = ? AND status = 'reserved'
                              AND NOT EXISTS (SELECT 1 FROM rent_applications WHERE room_name = ? AND status IN ($placeholders))
                              AND NOT EXISTS (SELECT 1 FROM unit_reservations WHERE room_name = ? AND status = 'Active')");
    if (!$stmt) return false;
    $params = array_merge([$room_name, $room_name], ROOM_CLAIMING_APPLICATION_STATUSES, [$room_name]);
    $stmt->bind_param(str_repeat('s', count($params)), ...$params);
    $stmt->execute();
    $freed = $stmt->affected_rows > 0;
    $stmt->close();
    if ($freed) notify_unit_waitlist($conn, $room_name);
    return $freed;
}

// Expires lease contracts whose lease_end has passed, notifying each tenant.
// Only 'active' contracts are affected — a 'draft' contract was never
// activated so it has nothing to expire, and 'terminated'/'eviction-pending'
// are already terminal states. Safe to call opportunistically
// (get_contracts.php, my_room.php) as well as from the daily sweep, same
// pattern as release_expired_reservations() above — each row is guarded on
// its own previous status, so a concurrent call can't double-notify.
function expire_lapsed_contracts($conn) {
    $stmt = $conn->prepare("SELECT lc.id, ra.user_id FROM lease_contracts lc
                            JOIN rent_applications ra ON ra.id = lc.rent_application_id
                            WHERE lc.status = 'active' AND lc.lease_end IS NOT NULL AND lc.lease_end < CURDATE()");
    if (!$stmt) return 0; // column/table not migrated yet
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    if (empty($rows)) return 0;

    $upd = $conn->prepare("UPDATE lease_contracts SET status = 'expired' WHERE id = ? AND status = 'active'");
    $count = 0;
    foreach ($rows as $row) {
        $upd->bind_param("s", $row['id']);
        $upd->execute();
        if ($upd->affected_rows === 0) continue; // already expired by a concurrent call
        $count++;
        if (!empty($row['user_id'])) {
            create_notification($conn, (int)$row['user_id'], 'contract_update', 'Rent Contract Expired',
                "Your rent contract ({$row['id']}) has expired. Contact management about renewal or move-out.");
        }
    }
    $upd->close();
    return $count;
}

// Sweep step: notifies a tenant once, `lease_end_reminder_days` before their
// active contract's lease_end, so "Lease approaching end?" (panel flow) is
// something a tenant is actually told about rather than only visible if they
// happen to open View Contract. Claimed via renewal_reminder_sent_at, so a
// forced re-run the same day never sends a duplicate.
//
// Other Settings → Contract End can switch it off (nothing is claimed then, so
// switching it back on still reminds tenants inside the window) and choose its
// outside channels; the in-app notice always goes when it is on. When there is
// an extension deadline, the reminder names it.
function send_lease_end_reminders($conn) {
    if (!setting_is_on($conn, 'lease_end_reminders_enabled')) return 0;
    $use_email = setting_is_on($conn, 'lease_end_reminder_email');
    $use_sms = setting_is_on($conn, 'lease_end_reminder_sms');
    $deadline_days = extension_deadline_days($conn);
    $days = max(0, (int)get_setting($conn, 'lease_end_reminder_days', 30));
    $stmt = $conn->prepare("SELECT lc.id, ra.user_id, ra.room_name, lc.lease_end,
                                   DATEDIFF(lc.lease_end, CURDATE()) AS days_left FROM lease_contracts lc
                            JOIN rent_applications ra ON ra.id = lc.rent_application_id
                            WHERE lc.status = 'active' AND lc.renewal_reminder_sent_at IS NULL
                              AND lc.lease_end IS NOT NULL
                              AND lc.lease_end >= CURDATE() AND DATEDIFF(lc.lease_end, CURDATE()) <= ?");
    if (!$stmt) return 0; // column not migrated yet
    $stmt->bind_param("i", $days);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    $sent = 0;
    $claim = $conn->prepare("UPDATE lease_contracts SET renewal_reminder_sent_at = NOW() WHERE id = ? AND renewal_reminder_sent_at IS NULL");
    foreach ($rows as $row) {
        $claim->bind_param("s", $row['id']);
        $claim->execute();
        if ($claim->affected_rows === 0) continue; // claimed by a concurrent run
        $sent++;
        if (!empty($row['user_id'])) {
            $unit = !empty($row['room_name']) ? "Unit {$row['room_name']}" : 'your unit';
            $end = date('M j, Y', strtotime($row['lease_end']));
            // The last day to ask, if it is still ahead (no point naming a past one).
            $deadline = $deadline_days > 0 ? date('Y-m-d', strtotime("{$row['lease_end']} -$deadline_days days")) : null;
            if ($deadline !== null && $deadline < date('Y-m-d')) $deadline = null;
            $ask = $deadline !== null
                ? "Request an extension in My Room by " . date('M j, Y', strtotime($deadline)) . " if you'd like to stay."
                : "Visit My Room to request an extension if you'd like to stay.";
            create_notification($conn, (int)$row['user_id'], 'contract_update', 'Rent Approaching End',
                "Your rent for $unit ends on $end. $ask");

            // SMS and email too, as switched on. After the claim, so a re-run
            // never texts twice, and never allowed to stop the rest of the sweep.
            if (!$use_email && !$use_sms) continue;
            try {
                require_once __DIR__ . '/api/services/send_notification.php';
                dispatch_system_notification($conn, (int)$row['user_id'], 'contract_update', 'Rent Approaching End',
                    $use_sms ? sms_lease_reminder_template($row['room_name'], $row['lease_end'], $row['days_left'], $deadline) : null,
                    $use_email ? email_lease_reminder_template(notify_recipient_name($conn, $row['user_id']),
                        $row['room_name'] ?: '-', $end, (int)$row['days_left'],
                        $deadline !== null ? date('M j, Y', strtotime($deadline)) : null) : null);
            } catch (Throwable $e) {
                error_log('Rent-end reminder dispatch failed: ' . $e->getMessage());
            }
        }
    }
    $claim->close();
    return $sent;
}

// ── Lease contracts (checklist Module 9) ──
// Keyed by current status; each entry lists the update_contract_status.php
// actions allowed from it. 'clear' resolves to 'active' or 'expired'
// depending on whether lease_end has passed — this map names the action,
// not a fixed target status. Sweep-driven expiry (active -> expired once
// lease_end passes) happens outside this map, in expire_lapsed_contracts().
const CONTRACT_TRANSITIONS = [
    'draft'            => ['activate'],
    'active'           => ['flag', 'terminate', 'edit', 'extend'],
    'eviction-pending' => ['clear', 'terminate', 'edit'],
    'expired'          => ['terminate', 'edit', 'extend'],
    'terminated'       => [],
];

function contract_action_allowed($current_status, $action) {
    $allowed = CONTRACT_TRANSITIONS[$current_status] ?? [];
    return in_array($action, $allowed, true);
}

// How far ahead a rent end may reach after an extension (audit L6): at most
// max_rent_ahead_months (Settings -> Rental) from today, never more than 12.
// 'extend' in CONTRACT_TRANSITIONS limits extensions to active/expired contracts.
const MAX_RENT_AHEAD_MONTHS_CEILING = 12;

// QR Ph slots in Settings -> Payment Options (was 5). Stored slots above this
// are dropped on the next save; an active slot above it reads as slot 1.
const QRPH_SLOT_COUNT = 3;

function max_rent_ahead_months($conn) {
    $months = (int)get_setting($conn, 'max_rent_ahead_months', MAX_RENT_AHEAD_MONTHS_CEILING);
    return min(MAX_RENT_AHEAD_MONTHS_CEILING, max(1, $months));
}

// Returns an error message when $new_end (Y-m-d) is further ahead than allowed, else null.
function rent_end_ahead_error($conn, $new_end) {
    $months = max_rent_ahead_months($conn);
    $limit = date('Y-m-d', strtotime("+$months months"));
    if ($new_end > $limit) {
        return "Rent can only be extended up to $months month(s) ahead (until " . date('M j, Y', strtotime($limit)) . "). The new end would be " . date('M j, Y', strtotime($new_end)) . ".";
    }
    return null;
}

// The months a rent ending on $lease_end may be extended by: 'max' is the most
// that still fits under max_rent_ahead_months (0 when nothing fits), 'min' is
// min_lease_duration — shrunk to 'max' when fewer months fit, so a tenant with
// a long term left can still extend up to the limit (audit N-1/N-2).
function extension_month_range($conn, $lease_end, $settings = null) {
    // $settings (from extension_range_settings()) lets a caller listing many
    // rooms read the two settings once instead of once per room.
    $settings = $settings ?? extension_range_settings($conn);
    $max = MAX_RENT_AHEAD_MONTHS_CEILING;
    if ($lease_end) {
        // The same limit rent_end_ahead_error() applies.
        $limit = date('Y-m-d', strtotime('+' . $settings['ahead'] . ' months'));
        while ($max > 0 && date('Y-m-d', strtotime("$lease_end +$max months")) > $limit) $max--;
    }
    return ['min' => min($settings['min'], max(1, $max)), 'max' => $max];
}

function extension_range_settings($conn) {
    return [
        'ahead' => max_rent_ahead_months($conn),
        'min' => min(MAX_RENT_AHEAD_MONTHS_CEILING, max(1, (int)get_setting($conn, 'min_lease_duration', 3))),
    ];
}

// ── Rent extensions (panel review 2026-10-09) ──
// One rule list and one implementation for every way rent is extended: the
// tenant's request (extend_lease.php), its approval (process_tenant_request.php)
// and the admin's Units -> Extend Rent (admin_extend_rent.php).

// $conflicts: set when the refusal is because other applicants want the unit
// (extension_competing_applications()), so admin_extend_rent.php can show them.
class ExtensionRefused extends Exception {
    public $conflicts = [];
}

// Applications from other people for the unit a tenant wants to extend: still
// in the pipeline (not yet moved in, not rejected or cancelled) and wanting to
// move in before the extended rent would end (or "as soon as it is free").
// Reservations cannot exist on an occupied unit and the waitlist is not a claim.
function extension_competing_applications($conn, $room_name, $tenant_user_id, $proposed_end) {
    $stmt = $conn->prepare("SELECT id, user_id, first_name, last_name, suffix, status, preferred_move_in_date
                            FROM rent_applications
                            WHERE room_name = ? AND user_id <> ?
                              AND status IN ('Pending Review', 'Action Required', 'Approved')
                              AND (preferred_move_in_date IS NULL OR preferred_move_in_date < ?)
                            ORDER BY id");
    $stmt->bind_param("sis", $room_name, $tenant_user_id, $proposed_end);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $rows;
}

// The tenant's past-due bills. Payments already submitted or in progress
// (pending-verification, processing) don't count, and neither does an unpaid
// advance-rent invoice, which is an optional prepayment rather than a debt.
// Uses due_date rather than status = 'overdue' so it doesn't wait for the
// (throttled) overdue promotion.
function tenant_overdue_summary($conn, $user_id) {
    $statuses = array_values(array_diff(BILLING_OPEN_STATUSES, ['pending-verification', 'processing']));
    $in = "('" . implode("','", $statuses) . "')";
    $stmt = $conn->prepare("SELECT COUNT(*) AS c, COALESCE(SUM(total_amount - amount_paid), 0) AS total, MIN(due_date) AS oldest
                            FROM invoices
                            WHERE user_id = ? AND due_date IS NOT NULL AND due_date < CURDATE()
                              AND status IN $in AND advance_months IS NULL");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return ['count' => (int)$row['c'], 'total' => (float)$row['total'], 'oldest_due' => $row['oldest']];
}

// Why this tenancy can't be extended by $add_months right now, or null if it
// can. $app needs status, user_id, requested_move_out_date; $contract needs
// status, lease_end (or is null). Pass $add_months = 0 to check everything but
// the months-ahead limit (my_room.php, before the tenant picks a number).
function extension_block_reason($conn, $app, $contract, $add_months, $override_conflicts = false, &$conflicts = null) {
    $conflicts = [];
    if (($app['status'] ?? '') === 'pending-move-out') {
        $when = !empty($app['requested_move_out_date']) ? ' on ' . date('M j, Y', strtotime($app['requested_move_out_date'])) : '';
        return "A move-out is scheduled$when. It must be cancelled by management before the rent can be extended.";
    }
    if (!$contract || $contract['lease_end'] === null || !contract_action_allowed($contract['status'], 'extend')) {
        $state = $contract ? ($contract['status'] === 'eviction-pending' ? 'flagged for eviction' : $contract['status']) : 'missing';
        return "The rent contract is $state, so the rent can't be extended. Only an active or expired contract can be.";
    }
    $overdue = tenant_overdue_summary($conn, (int)$app['user_id']);
    if ($overdue['count'] > 0) {
        return "There is ₱" . number_format($overdue['total'], 2) . " overdue ({$overdue['count']} bill(s), oldest due "
            . date('M j, Y', strtotime($overdue['oldest_due'])) . "). It must be settled on Pay Bills before the rent can be extended.";
    }
    if ($add_months > 0) {
        $range = extension_month_range($conn, $contract['lease_end']);
        if ($range['max'] >= 1 && $add_months < $range['min']) {
            return "The rent must be extended by at least {$range['min']} month(s).";
        }
        $proposed_end = date('Y-m-d', strtotime($contract['lease_end'] . " +$add_months months"));
        if ($ahead_error = rent_end_ahead_error($conn, $proposed_end)) return $ahead_error;
        if (!empty($app['room_name'])) {
            $conflicts = extension_competing_applications($conn, $app['room_name'], (int)$app['user_id'], $proposed_end);
            if ($conflicts && !$override_conflicts) {
                $wanted = array_filter(array_column($conflicts, 'preferred_move_in_date'));
                $when = $wanted ? 'from ' . date('M j, Y', strtotime(min($wanted))) : 'as soon as it is free';
                return "Another applicant has asked for Unit {$app['room_name']} $when, before the new rent end of "
                    . date('M j, Y', strtotime($proposed_end)) . ". The office has to settle that application first, so please contact the office.";
            }
        }
    }
    return null;
}

// Extends a tenancy by $add_months inside the caller's transaction. Re-checks
// extension_block_reason() (throws ExtensionRefused), moves the rent end on the
// application, room and contract, reactivates an expired contract, re-arms the
// rent-end reminder, records lease_renewals, and — when the contract had
// expired — bills the holdover months the tenant has already lived since it
// expired (the generator never back-bills them), due RENT_INVOICE_LEAD_DAYS
// from today so they aren't overdue the moment they're issued. $new_rent
// (optional) applies to months billed from now on.
function extend_tenancy($conn, $app_id, $add_months, $admin_id, $new_rent = null, $override_conflicts = false) {
    $add_months = (int)$add_months;
    if ($add_months < 1 || $add_months > MAX_RENT_AHEAD_MONTHS_CEILING) {
        throw new ExtensionRefused("Extensions are 1 to " . MAX_RENT_AHEAD_MONTHS_CEILING . " months.");
    }

    $stmt = $conn->prepare("SELECT id, user_id, room_name, status, requested_move_out_date FROM rent_applications WHERE id = ? FOR UPDATE");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $app = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$app || !in_array($app['status'], ['active', 'pending-move-out'], true)) {
        throw new ExtensionRefused("Only a tenant who has moved in can have their rent extended.");
    }

    $stmt = $conn->prepare("SELECT id, status, lease_start, lease_end FROM lease_contracts WHERE rent_application_id = ? FOR UPDATE");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $contract = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $conflicts = [];
    if ($reason = extension_block_reason($conn, $app, $contract, $add_months, $override_conflicts, $conflicts)) {
        $refusal = new ExtensionRefused($reason);
        $refusal->conflicts = $conflicts;
        throw $refusal;
    }

    $user_id = (int)$app['user_id'];
    $current_rent = tenancy_monthly_rent($conn, $app_id);
    $previous_end = $contract['lease_end'];
    $was_expired = $contract['status'] === 'expired';

    // Holdover months, billed at the rent in force while they were lived.
    $holdover = [];
    $holdover_total = 0.0;
    if ($was_expired && $current_rent > 0) {
        $today = date('Y-m-d');
        $grace_due = date('Y-m-d', strtotime('+' . RENT_INVOICE_LEAD_DAYS . ' days'));
        for ($k = 1; $k < 600; $k++) {
            $start = rent_period_start($contract['lease_start'], $k);
            if ($start >= $today) break;
            if ($start < $previous_end) continue;
            $invoice_id = issue_rent_invoice($conn, $user_id, $app_id, $start, $current_rent, null, $grace_due);
            if ($invoice_id) {
                $holdover[] = ['invoice_id' => $invoice_id, 'period' => billing_period_label(new DateTime($start))];
                $holdover_total += $current_rent;
            }
        }
    }

    $rent_at_renewal = $new_rent !== null ? round((float)$new_rent, 2) : $current_rent;

    if ($new_rent !== null) {
        $stmt = $conn->prepare("UPDATE rent_applications SET months_of_rent = months_of_rent + ?, monthly_rent = ? WHERE id = ?");
        $stmt->bind_param("idi", $add_months, $rent_at_renewal, $app_id);
    } else {
        $stmt = $conn->prepare("UPDATE rent_applications SET months_of_rent = months_of_rent + ? WHERE id = ?");
        $stmt->bind_param("ii", $add_months, $app_id);
    }
    $stmt->execute();
    $stmt->close();

    $stmt = $conn->prepare("UPDATE lease_contracts SET lease_end = DATE_ADD(lease_end, INTERVAL ? MONTH),
                                   status = IF(status = 'expired', 'active', status), renewal_reminder_sent_at = NULL
                            WHERE id = ?");
    $stmt->bind_param("is", $add_months, $contract['id']);
    $stmt->execute();
    $stmt->close();

    $stmt = $conn->prepare("SELECT lease_end FROM lease_contracts WHERE id = ?");
    $stmt->bind_param("s", $contract['id']);
    $stmt->execute();
    $new_end = $stmt->get_result()->fetch_assoc()['lease_end'];
    $stmt->close();

    // The room mirrors the contract (get_rooms.php and the occupancy views read it).
    if ($new_rent !== null) {
        $stmt = $conn->prepare("UPDATE rooms SET lease_end = ?, monthly_rent = ? WHERE id = ?");
        $stmt->bind_param("sds", $new_end, $rent_at_renewal, $app['room_name']);
    } else {
        $stmt = $conn->prepare("UPDATE rooms SET lease_end = ? WHERE id = ?");
        $stmt->bind_param("ss", $new_end, $app['room_name']);
    }
    $stmt->execute();
    $stmt->close();

    $admin_id_param = $admin_id ? (int)$admin_id : null;
    $stmt = $conn->prepare("INSERT INTO lease_renewals (contract_id, added_months, previous_lease_end, new_lease_end, rent_at_renewal, approved_by) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("sissdi", $contract['id'], $add_months, $previous_end, $new_end, $rent_at_renewal, $admin_id_param);
    $stmt->execute();
    $stmt->close();

    return [
        'user_id' => $user_id,
        'room' => $app['room_name'],
        'contract_id' => $contract['id'],
        'previous_end' => $previous_end,
        'new_end' => $new_end,
        'reactivated' => $was_expired,
        'holdover_invoices' => $holdover,
        'holdover_total' => $holdover_total,
        'conflicts' => $conflicts,
    ];
}

// ── Rent applications / tenant lifecycle (H5) ──
// Keyed by current rent_applications.status; each entry lists the statuses
// update_tenant_status.php may set it to. Payment confirmation deliberately
// leaves an application Approved: payment and physical occupancy are distinct
// events. An administrator confirms `active` only after communicating the
// scheduled move-in date.
// with the same rules. Resubmission out of Rejected/Declined is handled
// separately by rent_application.php (H4); restore_tenant.php has its own
// dedicated path back out of moved-out. Anything not listed here — including
// every status not itself a key — has no allowed transitions.
const APPLICATION_TRANSITIONS = [
    'Pending Review'   => ['Approved', 'Rejected', 'Declined', 'Action Required', 'Cancelled'],
    'Action Required'  => ['Pending Review'],
    // 'moved-out' from Approved/active covers for-cause contract termination
    // (update_contract_status.php's 'terminate' action), which ends a tenancy
    // immediately rather than through the ordinary move-out notice period.
    'Approved'         => ['active', 'pending-move-out', 'Cancelled', 'Rejected', 'Declined'],
    'active'           => ['pending-move-out', 'moved-out'],
    'pending-move-out' => ['moved-out', 'active'],
];

function application_transition_allowed($current_status, $new_status) {
    $allowed = APPLICATION_TRANSITIONS[$current_status] ?? [];
    return in_array($new_status, $allowed, true);
}

// ===== Rent-application lifecycle ===========================================
// Every status write goes through here: the row is locked, the move is checked
// against APPLICATION_TRANSITIONS, the UPDATE is guarded on the status that was
// read (affected_rows = 0 means someone else moved it first), and each target
// resets the columns that belong to it. The caller owns the transaction and
// everything that follows from the move (billing, deposit, notifications...).

// Value for a column that should be set to NOW() (see write_application_status()).
const APP_NOW = '@NOW';

// The application row locked FOR UPDATE, or null.
function lock_application($conn, $app_id) {
    $stmt = $conn->prepare("SELECT status, user_id, room_name FROM rent_applications WHERE id = ? FOR UPDATE");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

// UPDATE rent_applications SET status = $to, <$cols> WHERE id AND status = $from.
// $cols maps column => value (null = NULL, APP_NOW = NOW()); column names come
// from code, never from a request. True when this call made the move.
function write_application_status($conn, $app_id, $from, $to, array $cols = []) {
    $sets = ['status = ?'];
    $params = [$to];
    foreach ($cols as $col => $value) {
        if ($value === APP_NOW) {
            $sets[] = "`$col` = NOW()";
        } elseif ($value === null) {
            $sets[] = "`$col` = NULL";
        } else {
            $sets[] = "`$col` = ?";
            $params[] = (string)$value;
        }
    }
    $params[] = $app_id;
    $params[] = $from;
    $stmt = $conn->prepare("UPDATE rent_applications SET " . implode(', ', $sets) . " WHERE id = ? AND status = ?");
    $stmt->bind_param(str_repeat('s', count($params) - 2) . 'is', ...$params);
    $stmt->execute();
    $moved = $stmt->affected_rows > 0;
    $stmt->close();
    return $moved;
}

// Moves an application to $to. Options:
//   user_id     the applicant must be this user (a tenant acting on their own)
//   only_from   statuses the caller allows on top of the table
//   reason, attachment   rejection_reason / rejection_attachment_path
//   move_out_date        requested_move_out_date for 'pending-move-out'
//   cols        extra columns for the same UPDATE (see write_application_status())
// Returns ['ok' => bool, 'code' => 'not_found'|'not_allowed'|'changed'|null,
//          'from' => status, 'user_id' => ?int, 'room_name' => ?string].
function transition_application($conn, $app_id, $to, array $opts = []) {
    $row = lock_application($conn, $app_id);
    $none = ['ok' => false, 'from' => null, 'user_id' => null, 'room_name' => null];
    if (!$row || (isset($opts['user_id']) && (int)$row['user_id'] !== (int)$opts['user_id'])) {
        return $none + ['code' => 'not_found'];
    }
    $from = $row['status'];
    $result = ['from' => $from, 'user_id' => $row['user_id'] !== null ? (int)$row['user_id'] : null, 'room_name' => $row['room_name']];
    if (!application_transition_allowed($from, $to) || (isset($opts['only_from']) && !in_array($from, $opts['only_from'], true))) {
        return ['ok' => false, 'code' => 'not_allowed'] + $result;
    }

    $cols = [];
    if (in_array($to, ['Rejected', 'Declined', 'Cancelled', 'Action Required'], true)) {
        $cols['rejection_reason'] = $opts['reason'] ?? null;
        $cols['rejection_attachment_path'] = $opts['attachment'] ?? null;
        if ($to === 'Cancelled') $cols['cancelled_at'] = APP_NOW;
    } elseif ($to === 'pending-move-out') {
        $cols['requested_move_out_date'] = $opts['move_out_date'] ?? null;
        $cols['rejection_reason'] = null;
        $cols['rejection_attachment_path'] = null;
    } else {
        $cols['rejection_reason'] = null;
        $cols['rejection_attachment_path'] = null;
        // Cancelling a move-out notice: the requested date no longer applies.
        if ($from === 'pending-move-out' && $to === 'active') $cols['requested_move_out_date'] = null;
    }
    $cols = array_merge($cols, $opts['cols'] ?? []);

    if (!write_application_status($conn, $app_id, $from, $to, $cols)) {
        return ['ok' => false, 'code' => 'changed'] + $result;
    }
    return ['ok' => true, 'code' => null] + $result;
}

// Archives an application from any status but 'archived', remembering where it
// was in pre_archive_status so restore_application() can put it back. Archiving
// twice would overwrite that memory with 'archived', so it is refused.
function archive_application($conn, $app_id, $reason, $notes) {
    $row = lock_application($conn, $app_id);
    if (!$row) return ['ok' => false, 'code' => 'not_found', 'from' => null];
    if ($row['status'] === 'archived') return ['ok' => false, 'code' => 'not_allowed', 'from' => 'archived'];
    $moved = write_application_status($conn, $app_id, $row['status'], 'archived', [
        'pre_archive_status' => $row['status'], 'archive_date' => date('Y-m-d'),
        'archive_reason' => $reason, 'archive_notes' => $notes,
    ]);
    return ['ok' => $moved, 'code' => $moved ? null : 'changed', 'from' => $row['status']];
}

// Puts an archived application back to the status it had (older rows without
// pre_archive_status come back 'active'). 'restored_status' on success.
function restore_application($conn, $app_id) {
    $stmt = $conn->prepare("SELECT status, pre_archive_status FROM rent_applications WHERE id = ? FOR UPDATE");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) return ['ok' => false, 'code' => 'not_found'];
    if ($row['status'] !== 'archived') return ['ok' => false, 'code' => 'not_allowed'];
    $to = $row['pre_archive_status'] ?: 'active';
    $moved = write_application_status($conn, $app_id, 'archived', $to, [
        'pre_archive_status' => null, 'archive_date' => null, 'archive_reason' => null, 'archive_notes' => null,
    ]);
    return ['ok' => $moved, 'code' => $moved ? null : 'changed', 'restored_status' => $to];
}

// What a rejected / declined / cancelled / lapsed application gives back:
// its open invoices (cancelled with $cancel_reason), the draft contract, the
// reserved advance credits, the applicant's billing reminders and the room.
// Options:
//   room_name            the unit the application was for
//   include_user_deposit also match the user's deposit invoices / credits that
//                        carry no application link (an applicant cancelling)
//   vacate_held_room     the application was Approved and held the room, so it
//                        is vacated outright; otherwise it is only released when
//                        no other application or hold still claims it
// The caller has already moved the application out of its claiming status.
function release_application_holds($conn, $app_id, $user_id, $cancel_reason, array $opts = []) {
    $open = billing_open_status_sql();
    $with_user = !empty($opts['include_user_deposit']) && $user_id;
    $uid = (int)$user_id;

    if ($with_user) {
        $stmt = $conn->prepare("UPDATE invoices SET status = 'cancelled', cancel_reason = ? WHERE (rent_application_id = ? OR (user_id = ? AND security_deposit > 0)) AND status IN $open");
        $stmt->bind_param("sii", $cancel_reason, $app_id, $uid);
    } else {
        $stmt = $conn->prepare("UPDATE invoices SET status = 'cancelled', cancel_reason = ? WHERE rent_application_id = ? AND status IN $open");
        $stmt->bind_param("si", $cancel_reason, $app_id);
    }
    $stmt->execute();
    $stmt->close();

    $stmt = $conn->prepare("DELETE FROM lease_contracts WHERE rent_application_id = ? AND status = 'draft'");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $stmt->close();

    $credit_scope = $with_user ? "(rent_application_id = " . (int)$app_id . " OR user_id = $uid)" : "rent_application_id = " . (int)$app_id;
    $conn->query("UPDATE advance_credits SET status = 'cancelled' WHERE $credit_scope AND status IN ('reserved', 'available')");

    if ($uid) {
        $conn->query("UPDATE notifications SET status = 'Resolved', is_read = 1 WHERE user_id = $uid AND type IN ('billing', 'rent_due', 'overdue') AND status = 'Pending'");
    }

    $room = (string)($opts['room_name'] ?? '');
    if ($room === '') return;
    if (!empty($opts['vacate_held_room'])) {
        $room_clean = trim(str_replace('Room', '', $room));
        $stmt = $conn->prepare("UPDATE rooms SET status = 'vacant', tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0 WHERE id IN (?, ?)");
        $stmt->bind_param("ss", $room_clean, $room);
        $stmt->execute();
        $stmt->close();
    } else {
        release_room_if_unclaimed($conn, $room);
    }
}

// Ends a tenant's occupancy of their room: vacates the unit, cancels any
// still-open invoices for the application (tagged with $reason so
// restore_tenant.php can tell which ones it is responsible for reinstating —
// H6), releases parking (release_user_parking()) and cancels pending visitor
// pre-registrations (cancel_user_visitor_registrations()) — both of which
// notify the tenant on their own. Does NOT touch rent_applications.status or
// lease_contracts; callers own those. The single path every tenancy-ending
// endpoint shares — ordinary move-out clearance (update_tenant_status.php),
// contract termination (update_contract_status.php's 'terminate' action) and
// tenant archiving (archive_tenant.php) — so all three cancel the same set of
// invoices, release the same things, and can be reversed by restore_tenant.php
// the same way (M3).
//
// $reason is stored on every invoice this cancels (invoices.cancel_reason)
// and in the room's last_tenant / activity log — pass something distinct per
// caller ('Moved Out', 'Contract Terminated', 'Archived', ...).
//
// Returns null if the application doesn't exist, or if the room is occupied
// by someone other than this application's tenant (H5's last line of
// defense — APPLICATION_TRANSITIONS already stops most such calls before
// they reach here). Otherwise returns ['room_name' => ?string,
// 'user_id' => ?int, 'invoices_cancelled' => int, 'advance_refund_due' => float,
// 'parking_released' => int,
// 'visitors_cancelled' => int].
function end_tenancy($conn, $app_id, $reason, $room_condition = 'Good') {
    $stmt = $conn->prepare("SELECT first_name, last_name, suffix, room_name, user_id FROM rent_applications WHERE id = ?");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $app = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$app) return null;

    $full_name = person_name($app);
    $room_name = $app['room_name'];
    $user_id = $app['user_id'] ? (int)$app['user_id'] : null;

    if (!empty($room_name)) {
        $room_stmt = $conn->prepare("UPDATE rooms SET status = 'vacant', last_tenant = ?, tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0, last_inspection_date = CURDATE(), room_condition = ? WHERE id = ? AND tenant_name = ?");
        $room_stmt->bind_param("ssss", $full_name, $room_condition, $room_name, $full_name);
        $room_stmt->execute();
        $room_vacated = $room_stmt->affected_rows > 0;
        $room_stmt->close();
        if (!$room_vacated) return null;
    }

    // The household leaves with the lease holder.
    end_household($conn, $app_id);

    // Invoices that never got as far as an actual payment attempt — 'overdue'
    // and further-along statuses ('processing', 'payment-failed', 'paid') are
    // left for the caller to reconcile against the deposit itself (M4), since
    // blindly cancelling them here would just erase a debt instead of
    // settling it. Tagging cancel_reason means restore_tenant.php can
    // reinstate exactly the invoices THIS call cancelled, not ones cancelled
    // for an unrelated reason (H6).
    $cancel_inv = $conn->prepare("UPDATE invoices SET status = 'cancelled', cancel_reason = ? WHERE rent_application_id = ? AND status IN ('pending', 'pending-verification', 'scheduled')");
    $cancel_inv->bind_param("si", $reason, $app_id);
    $cancel_inv->execute();
    $invoices_cancelled = $cancel_inv->affected_rows;
    $cancel_inv->close();

    // Advance credits: months of an advance that was never paid go with it;
    // months paid for but not reached are owed back to the tenant.
    $conn->query("UPDATE advance_credits SET status = 'cancelled' WHERE rent_application_id = " . (int)$app_id . " AND status = 'reserved'");
    $refund_q = $conn->prepare("SELECT COUNT(*) AS months, COALESCE(SUM(amount), 0) AS total FROM advance_credits WHERE rent_application_id = ? AND status = 'available'");
    $refund_q->bind_param("i", $app_id);
    $refund_q->execute();
    $refund = $refund_q->get_result()->fetch_assoc();
    $refund_q->close();
    $advance_refund_due = round((float)$refund['total'], 2);
    if ($advance_refund_due > 0) {
        $conn->query("UPDATE advance_credits SET status = 'refund-due' WHERE rent_application_id = " . (int)$app_id . " AND status = 'available'");
        $months = (int)$refund['months'];
        $admin = $conn->query("SELECT id FROM users WHERE role = 'admin' AND is_archived = 0 ORDER BY id LIMIT 1");
        $admin_row = $admin ? $admin->fetch_assoc() : null;
        if ($admin_row) {
            create_notification($conn, (int)$admin_row['id'], 'billing', 'Advance Rent Refund Due',
                "$full_name moved out ($reason) with $months prepaid month(s) not yet reached. ₱" . number_format($advance_refund_due, 2) . " of advance rent is due back to the tenant.");
        }
        log_activity($conn, null, 'billing', 'Advance Refund Due', "Application $app_id: $months month(s), ₱" . number_format($advance_refund_due, 2), 0);
    }

    $parking_released = 0;
    $visitors_cancelled = 0;
    if ($user_id) {
        $parking_released = release_user_parking($conn, $user_id, $reason);
        $visitors_cancelled = cancel_user_visitor_registrations($conn, $user_id, $reason);
    }

    if (!empty($room_name)) notify_unit_waitlist($conn, $room_name);

    // Whatever the exit path (archive, completed move-out, contract
    // termination), the move-out notice this tenancy may have filed is
    // decided now — clear it from the admin queue (audit M12).
    resolve_admin_queue($conn, 'move_out_request', $app_id);

    return [
        'room_name' => $room_name,
        'user_id' => $user_id,
        'invoices_cancelled' => $invoices_cancelled,
        'advance_refund_due' => $advance_refund_due,
        'parking_released' => $parking_released,
        'visitors_cancelled' => $visitors_cancelled,
    ];
}

// ===== Charges onto invoices ================================================
// Service, maintenance (tenant-caused repair) and parking charges all land on
// the tenant's still-adjustable invoice for the month, in their own column, and
// are claimed FIRST so a repeated call can never bill twice. One module owns
// that: post_invoice_charge() / reverse_invoice_charge().
//
// Per kind: the invoice column, the source table (parking has none: its claim is
// the parking_charges ledger row), the cost expression, and the wording.
const INVOICE_CHARGE_KINDS = [
    'service' => [
        'column' => 'services', 'label' => 'Service', 'table' => 'service_requests', 'noun' => 'service request',
        'cost_sql' => 'total_cost', 'free' => 'No charge for this service.',
        'no_tenancy' => 'No active approved rental — cannot post service charge.',
    ],
    'maintenance' => [
        'column' => 'maintenance', 'label' => 'Maintenance', 'table' => 'maintenance_requests', 'noun' => 'maintenance request',
        'cost_sql' => 'COALESCE(actual_cost, estimated_cost, 0)', 'free' => 'No charge for this ticket.',
        'no_tenancy' => 'No active approved rental — cannot post maintenance charge.',
    ],
    'parking' => [
        'column' => 'parking', 'label' => 'Parking', 'table' => null, 'noun' => 'parking slot',
        'cost_sql' => null, 'free' => 'No charge for parking.',
        'no_tenancy' => 'The tenant has no active rental, so parking cannot be billed.',
    ],
];

// Finds (and locks) the tenant's adjustable invoice for $anchor's month, or
// creates a charges-only one (base_rent 0, rent is never billed from here), then
// adds $amount to $column and to total_amount. Runs inside the caller's
// transaction. Returns ['invoice_id' => string] or ['error' => string]; throws
// on a database failure.
function attach_charge_to_invoice($conn, $user_id, DateTime $anchor, $column, $amount, $no_tenancy_message) {
    $label = billing_period_label($anchor);
    $legacy_period = $anchor->format('Y-m');
    $adjustable = "('" . implode("','", SERVICE_ADJUSTABLE_INVOICE_STATUSES) . "')";

    // FOR UPDATE: the invoice must not move to processing / paid between this
    // read and the update below.
    $stmt = $conn->prepare("SELECT id FROM invoices WHERE user_id = ? AND billing_period IN (?, ?) AND status IN $adjustable AND payment_group IS NULL ORDER BY created_at ASC LIMIT 1 FOR UPDATE");
    $stmt->bind_param("iss", $user_id, $label, $legacy_period);
    $stmt->execute();
    $invoice = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $invoice_id = $invoice ? $invoice['id'] : null;

    if (!$invoice_id) {
        $lease = get_active_tenancy($conn, $user_id);
        if (!$lease) return ['error' => $no_tenancy_message];

        $invoice_id = 'INV-' . $anchor->format('Ym') . '-' . strtoupper(bin2hex(random_bytes(4)));
        $due_date = (clone $anchor)->modify('first day of next month')->modify('+4 days')->format('Y-m-d');
        $stmt = $conn->prepare("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date)
                                VALUES (?, ?, ?, 0, 0, ?, 'pending', ?)");
        $stmt->bind_param("siiss", $invoice_id, $user_id, $lease['id'], $label, $due_date);
        if (!$stmt->execute()) {
            $stmt->close();
            error_log("[AMS] Failed to create charges invoice: " . $conn->error);
            throw new Exception("Failed to create the invoice for this charge.");
        }
        $stmt->close();
    }

    // $column comes from INVOICE_CHARGE_KINDS, never request input. The status
    // guard is belt and braces on top of the row lock.
    $stmt = $conn->prepare("UPDATE invoices SET $column = $column + ?, total_amount = total_amount + ? WHERE id = ? AND status IN $adjustable");
    $stmt->bind_param("dds", $amount, $amount, $invoice_id);
    $ok = $stmt->execute() && $stmt->affected_rows === 1;
    $stmt->close();
    if (!$ok) {
        error_log("[AMS] Failed to post $column charge onto $invoice_id: " . $conn->error);
        throw new Exception("Failed to post the charge onto the invoice.");
    }
    return ['invoice_id' => $invoice_id];
}

// Posts one charge. $kind is 'service' or 'maintenance' ($source_id = the
// request id; billed in the month of delivery) or 'parking' ($source_id = the
// reservation id, $month = the permit month to bill).
//
// The source row is claimed first inside the transaction (is_invoiced = 1, or
// the unique parking_charges row), so a double click or replayed request cannot
// bill twice; a rollback un-claims it, leaving the charge postable again via
// the sync_*_to_invoice.php retry endpoints. Free requests stay claimed but
// never reach an invoice.
//
// Returns ['ok' => bool, 'invoice_id' => string|null, 'message' => string,
//          'already' => bool].
function post_invoice_charge($conn, $kind, $source_id, ?DateTime $month = null) {
    $k = INVOICE_CHARGE_KINDS[$kind] ?? null;
    $fail = fn($message, $already = false) => ['ok' => false, 'invoice_id' => null, 'message' => $message, 'already' => $already];
    if (!$k) return $fail('Unknown charge kind.');
    $is_parking = $kind === 'parking';
    if ($is_parking && !$month) return $fail('A parking charge needs the month to bill.');

    $anchor = $is_parking ? $month : new DateTime('now', new DateTimeZone('Asia/Manila'));
    $label = billing_period_label($anchor);

    $conn->begin_transaction();
    try {
        $charge_id = 0;
        if ($is_parking) {
            $stmt = $conn->prepare("SELECT user_id, status, assigned_at, duration_months, monthly_fee FROM parking_reservations WHERE id = ? FOR UPDATE");
            $stmt->bind_param("i", $source_id);
            $stmt->execute();
            $res = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$res) { $conn->rollback(); return $fail('Parking reservation not found.'); }
            if ($res['status'] !== 'Assigned') { $conn->rollback(); return $fail('Only an assigned parking slot can be billed.'); }

            // Billable months run from the month of assignment for duration_months.
            $first = new DateTime(substr($res['assigned_at'], 0, 7) . '-01');
            $end = (clone $first)->modify('+' . (int)$res['duration_months'] . ' months');
            $this_month = new DateTime($anchor->format('Y-m') . '-01');
            if ($this_month < $first || $this_month >= $end) {
                $conn->rollback();
                return $fail("$label is outside this permit's term.");
            }

            $user_id = (int)$res['user_id'];
            $amount = parking_reservation_fee($conn, $res);
            if ($amount <= 0) {
                $conn->rollback();
                return $fail('This parking permit is free, so there is nothing to bill.');
            }
            $period = $anchor->format('Y-m');

            $claim = $conn->prepare("INSERT IGNORE INTO parking_charges (reservation_id, billing_period, amount) VALUES (?, ?, ?)");
            $claim->bind_param("isd", $source_id, $period, $amount);
            $claim->execute();
            $charge_id = $claim->affected_rows > 0 ? $claim->insert_id : 0;
            $claim->close();
            if (!$charge_id) {
                $conn->rollback();
                return $fail("Parking for $label has already been billed.", true);
            }
        } else {
            $table = $k['table'];
            $claim = $conn->prepare("UPDATE $table SET is_invoiced = 1 WHERE id = ? AND is_invoiced = 0");
            $claim->bind_param("i", $source_id);
            $claim->execute();
            $claimed = $claim->affected_rows;
            $claim->close();
            if ($claimed === 0) {
                $conn->rollback();
                return $fail('This ' . $k['noun'] . ' has already been billed.');
            }

            $stmt = $conn->prepare("SELECT user_id, {$k['cost_sql']} AS cost FROM $table WHERE id = ? FOR UPDATE");
            $stmt->bind_param("i", $source_id);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$row) { $conn->rollback(); return $fail(ucfirst($k['noun']) . ' not found.'); }

            $user_id = (int)$row['user_id'];
            $amount = (float)$row['cost'];
            if ($amount <= 0) {
                // Free: stays claimed, never reaches an invoice.
                $conn->commit();
                return ['ok' => true, 'invoice_id' => null, 'message' => $k['free'], 'already' => false];
            }
        }

        $att = attach_charge_to_invoice($conn, $user_id, $anchor, $k['column'], $amount, $k['no_tenancy']);
        if (isset($att['error'])) {
            // Rollback un-claims the source row.
            $conn->rollback();
            return $fail($att['error']);
        }
        $invoice_id = $att['invoice_id'];

        if ($is_parking) {
            $stmt = $conn->prepare("UPDATE parking_charges SET invoice_id = ? WHERE id = ?");
            $stmt->bind_param("si", $invoice_id, $charge_id);
        } else {
            // invoiced_amount: what was posted, so a reversal backs out exactly that
            // even if the request's cost is edited afterwards.
            $stmt = $conn->prepare("UPDATE {$k['table']} SET invoice_id = ?, billing_period = ?, invoiced_amount = ? WHERE id = ?");
            $stmt->bind_param("ssdi", $invoice_id, $label, $amount, $source_id);
        }
        $stmt->execute();
        $stmt->close();

        $conn->commit();

        if ($is_parking) {
            create_notification($conn, $user_id, 'billing', "Parking Fee Added: $label",
                "Your parking fee of ₱" . number_format($amount, 2) . " for $label has been added to invoice $invoice_id.");
            return ['ok' => true, 'invoice_id' => $invoice_id, 'message' => "Parking for $label posted to invoice $invoice_id.", 'already' => false];
        }
        return ['ok' => true, 'invoice_id' => $invoice_id, 'message' => "Charge posted to invoice $invoice_id ($label).", 'already' => false];

    } catch (Exception $e) {
        $conn->rollback();
        error_log("[AMS] post_invoice_charge($kind): " . $e->getMessage());
        return $fail($is_parking ? 'Could not post the parking charge.' : $e->getMessage());
    }
}

// Backs a charge out of its invoice. Only possible while that invoice is still
// adjustable and the reduced total stays at or above what was already paid;
// otherwise the money has changed hands and the admin must issue a manual
// credit. With 'refund_ctx' (service, maintenance) a charge on an invoice that
// is already paid is detached and a refund request is raised instead.
//
// $source_id is the request id (service, maintenance) or the reservation id
// (parking, with 'period' = 'Y-m'). Options:
//   own_transaction (default true): false when the caller holds a transaction
//     and will commit or roll back itself (update_service_status.php claims the
//     status in the same one, update_maintenance_status.php likewise).
//   refund_ctx: ['reason' => string, 'actor_id' => int]
//
// Returns ['ok' => bool, 'message' => string] (+ 'refund_id' when one was raised).
function reverse_invoice_charge($conn, $kind, $source_id, array $opts = []) {
    $k = INVOICE_CHARGE_KINDS[$kind] ?? null;
    if (!$k) return ['ok' => false, 'message' => 'Unknown charge kind.'];
    $own = $opts['own_transaction'] ?? true;
    $refund_ctx = $opts['refund_ctx'] ?? null;
    $is_parking = $kind === 'parking';

    if ($own) $conn->begin_transaction();
    $end = function ($commit) use ($conn, $own) {
        if ($own) $commit ? $conn->commit() : $conn->rollback();
    };

    try {
        if ($is_parking) {
            $stmt = $conn->prepare("SELECT id, invoice_id, amount FROM parking_charges WHERE reservation_id = ? AND billing_period = ? FOR UPDATE");
            $period = (string)($opts['period'] ?? '');
            $stmt->bind_param("is", $source_id, $period);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$row) { $end(false); return ['ok' => false, 'message' => 'That month has not been billed.']; }
            $invoice_id = $row['invoice_id'];
            $amount = (float)$row['amount'];
            $user_id = null;
        } else {
            $table = $k['table'];
            $stmt = $conn->prepare("SELECT {$k['cost_sql']} AS cost, invoiced_amount, invoice_id, is_invoiced, user_id FROM $table WHERE id = ? FOR UPDATE");
            $stmt->bind_param("i", $source_id);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$row || !(int)$row['is_invoiced'] || !$row['invoice_id']) {
                $end(false);
                return ['ok' => true, 'message' => 'Nothing to reverse.'];
            }
            $invoice_id = $row['invoice_id'];
            // What was posted; rows billed before invoiced_amount existed fall back to the current cost.
            $amount = (float)($row['invoiced_amount'] ?? $row['cost']);
            $user_id = $row['user_id'];
        }

        // Safe by construction: a paid or in-flight invoice matches no row, and so
        // does one whose payments already exceed the reduced total.
        $adjustable = "('" . implode("','", SERVICE_ADJUSTABLE_INVOICE_STATUSES) . "')";
        $col = $k['column'];
        $stmt = $conn->prepare("UPDATE invoices SET $col = GREATEST($col - ?, 0), total_amount = total_amount - CAST(? AS DECIMAL(10,2))
                                WHERE id = ? AND status IN $adjustable AND total_amount - CAST(? AS DECIMAL(10,2)) >= amount_paid");
        $stmt->bind_param("ddsd", $amount, $amount, $invoice_id, $amount);
        $stmt->execute();
        $reversed = $stmt->affected_rows;
        $stmt->close();

        $unlink = function () use ($conn, $is_parking, $k, $source_id, $row) {
            if ($is_parking) {
                $stmt = $conn->prepare("DELETE FROM parking_charges WHERE id = ?");
                $stmt->bind_param("i", $row['id']);
            } else {
                $stmt = $conn->prepare("UPDATE {$k['table']} SET is_invoiced = 0, invoice_id = NULL, billing_period = NULL, invoiced_amount = NULL WHERE id = ?");
                $stmt->bind_param("i", $source_id);
            }
            $stmt->execute();
            $stmt->close();
        };

        if ($reversed === 0 && $refund_ctx && $user_id !== null && invoice_is_paid($conn, $invoice_id)) {
            // Already paid: detach the charge and ask for the money back.
            $rid = refund_paid_charge($conn, $user_id, $invoice_id, $amount, $k['label'], $refund_ctx['reason'], $refund_ctx['actor_id']);
            $unlink();
            $end(true);
            return ['ok' => true, 'message' => 'Charge was already paid; refund request #' . $rid . ' opened.', 'refund_id' => $rid];
        }
        if ($reversed === 0) {
            $end(false);
            $inv = $conn->prepare("SELECT status, amount_paid FROM invoices WHERE id = ?");
            $inv->bind_param("s", $invoice_id);
            $inv->execute();
            $inv_row = $inv->get_result()->fetch_assoc();
            $inv->close();
            $inv_status = $inv_row['status'] ?? null;
            $reason = match (true) {
                $inv_status === 'processing' => 'has an online payment in progress',
                $inv_status === 'pending-verification' => 'has a payment under verification',
                $inv_status === 'paid' => 'is already paid; issue a manual credit instead',
                in_array($inv_status, SERVICE_ADJUSTABLE_INVOICE_STATUSES, true) => 'already has ₱' . number_format((float)$inv_row['amount_paid'], 2) . ' paid, more than the total would be without this charge; adjust the invoice instead',
                default => 'can no longer be adjusted',
            };
            return ['ok' => false, 'message' => 'Invoice ' . $invoice_id . ' ' . $reason . '.'];
        }

        $unlink();
        $end(true);
        return ['ok' => true, 'message' => $k['label'] . ' charge reversed from invoice ' . $invoice_id . '.'];

    } catch (Exception $e) {
        $end(false);
        error_log("[AMS] reverse_invoice_charge($kind): " . $e->getMessage());
        return ['ok' => false, 'message' => $is_parking ? 'Could not reverse the parking charge.' : $e->getMessage()];
    }
}

function invoice_is_paid($conn, $invoice_id) {
    $st = null;
    $q = $conn->prepare("SELECT status FROM invoices WHERE id = ?");
    $q->bind_param("s", $invoice_id);
    $q->execute();
    $q->bind_result($st);
    $q->fetch();
    $q->close();
    return $st === 'paid';
}

// A charge on an invoice the tenant already paid cannot be taken off the bill:
// raise a refund request for the charge instead (the admin decides at
// /admin-refunds). Throws if the request cannot be saved; the caller owns the
// transaction. Returns the new request id, or 0 if a request already holds it.
function refund_paid_charge($conn, $user_id, $invoice_id, $amount, $label, $reason, $actor_id) {
    $amount = round((float)$amount, 2);
    if ($amount <= 0 || !$user_id) return 0;
    $app_id = null;
    $q = $conn->prepare("SELECT rent_application_id FROM invoices WHERE id = ?");
    $q->bind_param("s", $invoice_id);
    $q->execute();
    $q->bind_result($app_id);
    $q->fetch();
    $q->close();
    $why = "$label rejected after payment: $reason";
    $rid = insert_refund_request($conn, (int)$user_id, $app_id ? (int)$app_id : null, 'rejected_charge', $invoice_id, $amount, $why, (int)$actor_id, 'admin');
    notify_refund_raised($conn, $rid, $amount, strtolower($label) . ' charge');
    return $rid;
}

// Priority 5: Security
//
// Session-token authentication. X-User-Id / X-Admin-Id headers are plain
// values read from sessionStorage with nothing to stop a caller from simply
// sending a different id — they identify a claimed role for convenience
// (e.g. picking which branch of a dual-role endpoint to take) but must never
// be trusted as proof of identity. get_authenticated_user() is the only
// function that actually proves who is calling, via the random token
// login.php issues into the `sessions` table.

// Creates a session row for a freshly-authenticated user and returns the
// opaque token to hand back to the client. Tokens last 7 days.
function create_session($conn, $user_id, $role) {
    $token = bin2hex(random_bytes(32));
    $stmt = $conn->prepare("INSERT INTO sessions (token, user_id, role, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))");
    $stmt->bind_param("sis", $token, $user_id, $role);
    $stmt->execute();
    $stmt->close();
    return $token;
}

// Reads the bearer session token out of the current request, or null if
// none was sent. Apache does not reliably populate
// $_SERVER['HTTP_AUTHORIZATION'] for mod_php/CGI setups (this project's
// XAMPP default included) — the Authorization header only shows up via
// getallheaders(). Check that first, case-insensitively, before falling
// back to $_SERVER. Every function that needs the caller's token (not just
// get_authenticated_user()) must go through this one, so this quirk is
// handled in exactly one place.
function get_bearer_token() {
    $header = null;
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0 || strcasecmp($name, 'X-Session-Token') === 0) {
                $header = $value;
                break;
            }
        }
    }
    if (!$header) {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? $_SERVER['HTTP_X_SESSION_TOKEN'] ?? null;
    }
    if (!$header) return null;

    $token = $header;
    if (stripos($header, 'Bearer ') === 0) {
        $token = substr($header, 7);
    }
    $token = trim($token);
    return $token === '' ? null : $token;
}

// Resolves the caller's real identity from a bearer session token. Returns
// ['id' => int, 'role' => string] or null if there is no valid, unexpired
// session. This is the only source of truth for "who is making this
// request" — nothing else in this codebase should be treated as identity.
function get_authenticated_user($conn) {
    static $cache = [];

    $token = get_bearer_token();
    if (!$token) return null;
    if (array_key_exists($token, $cache)) return $cache[$token];

    // Role and archive state come from users, live — not from the session row.
    // sessions.role is a snapshot taken at login, so trusting it meant a demoted
    // admin kept admin access, and an archived tenant kept logging in, for up to
    // the 7-day life of any token they already held.
    $stmt = $conn->prepare("SELECT s.user_id, u.role, u.is_archived
                            FROM sessions s JOIN users u ON u.id = s.user_id
                            WHERE s.token = ? AND s.expires_at > NOW()");
    $stmt->bind_param("s", $token);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        return $cache[$token] = null;
    }

    if ((int)$row['is_archived'] === 1) {
        $del = $conn->prepare("DELETE FROM sessions WHERE token = ?");
        $del->bind_param("s", $token);
        $del->execute();
        $del->close();
        return $cache[$token] = null;
    }

    // At most once a minute per session: this runs on every request.
    $touch = $conn->prepare("UPDATE sessions SET last_seen_at = NOW() WHERE token = ? AND last_seen_at < NOW() - INTERVAL 60 SECOND");
    $touch->bind_param("s", $token);
    $touch->execute();
    $touch->close();

    return $cache[$token] = ['id' => (int)$row['user_id'], 'role' => $row['role']];
}

// Hard gate for admin-only endpoints: ends the request with 401/403 if the
// caller isn't a genuinely authenticated admin. Returns the admin's real id
// on success. Use this (not verify_admin()) in any new admin-only endpoint.
function require_admin($conn) {
    $user = get_authenticated_user($conn);
    if (!$user) {
        http_response_code(401);
        echo json_encode(["success" => false, "message" => "Authentication required"]);
        exit;
    }
    if ($user['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
        exit;
    }
    return $user['id'];
}

// Hard gate for any authenticated user (tenant or admin). Ends the request
// with 401 if there is no valid session. Returns ['id'=>, 'role'=>].
function require_user($conn) {
    $user = get_authenticated_user($conn);
    if (!$user) {
        http_response_code(401);
        echo json_encode(["success" => false, "message" => "Authentication required"]);
        exit;
    }
    return $user;
}

// Hard gate for "the resource owner, or any admin". Ends the request with
// 403 if the caller is neither. Use this in place of trusting a client-
// supplied user id/email whenever an endpoint reads or writes one person's
// own data (profile, documents, occupancy requests, move-out, etc).
function require_owner_or_admin($conn, $owner_id) {
    $user = require_user($conn);
    if ($user['role'] !== 'admin' && $user['id'] !== (int)$owner_id) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Forbidden: You do not own this resource"]);
        exit;
    }
    return $user;
}

// Legacy shape kept for the ~50 existing call sites that do
// `$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null; if (!verify_admin($conn, $admin_id)) {...}`
// or the dual-role branch `$is_admin = verify_admin($conn, $admin_id); if ($is_admin) {...} else {...}`.
// The $admin_id parameter is now IGNORED — admin-ness is decided purely by
// the caller's real session token, never by a client-supplied id. This
// function still never exits on its own (some callers use it to choose a
// branch for a legitimate non-admin caller, not to reject the request), so
// it stays a plain boolean check rather than calling require_admin().
function verify_admin($conn, $admin_id = null) {
    $user = get_authenticated_user($conn);
    return $user !== null && $user['role'] === 'admin';
}

// Every invoice status that still represents money owed. This list is the
// single source of truth for "is this invoice still open?" across billing,
// receivables, overdue promotion and reminders.
//
// 'processing' (an online checkout was started), 'payment-failed' (the
// gateway declined) and 'scheduled' (tenant booked an in-person payment)
// used to be omitted from those queries, so an abandoned or failed checkout
// silently dropped the invoice out of the tenant's bill view, out of
// receivables, and out of overdue/reminder detection — the debt simply
// vanished. 'unpaid' is a legacy spelling kept so older rows still match.
const BILLING_OPEN_STATUSES = [
    'pending', 'unpaid', 'overdue', 'pending-verification',
    'scheduled', 'processing', 'payment-failed'
];

// Open bills the front desk may record: the tenant has acted in Pay Bills (a
// proof is under review, a visit is scheduled, or an online attempt failed).
// A bill the tenant has not touched is not cleared for them.
// Mirrored by TENANT_ACTED_STATUSES in AdminPayments.jsx.
const ADMIN_RECORDABLE_STATUSES = ['pending-verification', 'scheduled', 'payment-failed'];

// Ready-to-interpolate SQL tuple, e.g. "('pending','unpaid',...)". The values
// are hardcoded constants above (never request input), so inlining them is
// safe and keeps the many call sites from each needing dynamic placeholders.
function billing_open_status_sql() {
    return "('" . implode("','", BILLING_OPEN_STATUSES) . "')";
}

// What is still owed on an invoice row, as a SQL expression: the balance, not
// the total. PHP side of the same rule: invoice_balance_cents().
function invoice_balance_sql($alias = 'i') {
    return "($alias.total_amount - $alias.amount_paid)";
}

// The invoices a tenant still owes: open statuses only, and never an unpaid
// advance-rent invoice (an optional prepayment, not a debt). $past_due keeps
// only those whose due date has passed. Sum invoice_balance_sql() over these.
function invoice_owed_where_sql($alias = 'i', $past_due = false) {
    $sql = "$alias.status IN " . billing_open_status_sql() . " AND $alias.advance_months IS NULL";
    return $past_due ? "$sql AND $alias.due_date < CURDATE()" : $sql;
}

// Settles an invoice in full, whichever channel the money actually arrived
// through — the front desk (record_payment_admin.php) or a verified PayMongo
// webhook event (paymongo_webhook.php). Before this existed each path ran its
// own copy of the move-in cascade, so an online move-in payment never
// activated the room/application/contract the way a desk payment did (audit
// M12) — an online-paid move-in invoice left the application 'Approved' and
// the contract a draft forever.
//
// $amount_paid is the desk-only short-payment guard: it must cover the
// remaining balance (parts below it go through record_partial_payment()). The
// webhook validates the paid amount against the balance itself before calling
// this (audit H9b), so it always passes null here.
//
// A first-payment settlement records payment only. The admin separately sends
// the move-in date and confirms actual occupancy, preventing an applicant who
// paid early from being treated as already moved in.
//
// $notify_tenant = false skips the tenant's "Payment Received" notice, for
// settle_payment_key(), which sends one notice for a whole advance payment.
//
// Returns ['ok' => bool, 'message' => string, 'invoice_id', 'user_id', 'activated' => bool].
function settle_invoice($conn, $invoice_id, $payment_method, $payment_reference = null, $amount_paid = null, $notify_tenant = true, $payment_splits = null, $recorded_by = null) {
    $conn->begin_transaction();

    try {
        // Locked: a part-payment (record_partial_payment()) on the same invoice
        // waits, so the balance read here is the one this settlement closes.
        $inv_q = $conn->prepare("SELECT user_id, rent_application_id, security_deposit, advance_months, id, billing_period, total_amount, amount_paid, payment_reference FROM invoices WHERE id = ? FOR UPDATE");
        $inv_q->bind_param("s", $invoice_id);
        $inv_q->execute();
        $inv_res = $inv_q->get_result()->fetch_assoc();
        $inv_q->close();
        if (!$inv_res) throw new Exception("Invoice not found.");

        // Parts already received (installments) stay on the ledger; this
        // settlement covers what is left.
        $paid_before_cents = (int)round((float)($inv_res['amount_paid'] ?? 0) * 100);
        $balance_cents = (int)round((float)$inv_res['total_amount'] * 100) - $paid_before_cents;
        if ($amount_paid !== null && (int)round((float)$amount_paid * 100) < $balance_cents) {
            throw new Exception("Amount tendered (₱" . number_format($amount_paid, 2) . ") is less than the " . ($paid_before_cents > 0 ? "remaining balance" : "invoice total") . " (₱" . number_format($balance_cents / 100, 2) . "). Record it as a part-payment instead.");
        }
        if (is_array($payment_splits) && $paid_before_cents > 0) {
            $split_cents = 0;
            foreach ($payment_splits as $split) $split_cents += (int)round((float)($split['amount'] ?? 0) * 100);
            if ($split_cents !== $balance_cents) throw new Exception("The payment must equal the remaining balance (₱" . number_format($balance_cents / 100, 2) . ").");
        }

        $bank_name = null;
        if (is_array($payment_splits) && count($payment_splits) === 1) $bank_name = $payment_splits[0]['bank_name'] ?? null;
        $stmt = $conn->prepare("UPDATE invoices SET status = 'paid', amount_paid = total_amount, proof_amount = NULL, payment_method = ?, payment_reference = COALESCE(?, payment_reference), bank_name = COALESCE(?, bank_name), paid_at = COALESCE(paid_at, NOW()) WHERE id = ? AND status IN " . billing_open_status_sql());
        $stmt->bind_param("ssss", $payment_method, $payment_reference, $bank_name, $invoice_id);
        $stmt->execute();
        if ($stmt->affected_rows === 0) {
            throw new Exception("Invoice not found or already settled.");
        }
        $stmt->close();

        // Each paid invoice has its own transaction rows, kept in the same DB
        // transaction as the status update. Existing gateway/advance callers
        // are recorded as a single legacy-compatible transaction.
        $transactions = is_array($payment_splits) ? $payment_splits : [[
            'method' => strtolower((string)$payment_method),
            'amount' => $balance_cents / 100,
            'bank_name' => $bank_name,
            'reference_number' => $payment_reference,
        ]];
        if (is_array($payment_splits)) {
            $resolved_method = count($transactions) > 1 ? 'split' : (($transactions[0]['method'] ?? '') === 'bank_transfer' && !empty($transactions[0]['bank_name']) ? $transactions[0]['bank_name'] : $payment_method);
            $resolved_bank = count($transactions) === 1 ? ($transactions[0]['bank_name'] ?? null) : null;
            $method_update = $conn->prepare("UPDATE invoices SET payment_method = ?, bank_name = COALESCE(?, bank_name) WHERE id = ? AND status = 'paid'");
            $method_update->bind_param("sss", $resolved_method, $resolved_bank, $invoice_id);
            $method_update->execute();
            $method_update->close();
        }

        // Admin desk settlements replace any rows left by a previous failed
        // or re-tested attempt. Keep this inside the settlement transaction so
        // a failed settlement restores the prior ledger rows on rollback.
        // Never when parts were already received: those rows are the
        // installment ledger, and the final part is appended to them.
        if (is_array($payment_splits) && $paid_before_cents === 0) {
            $delete_tx = $conn->prepare("DELETE FROM payment_transactions WHERE invoice_id = ?");
            $delete_tx->bind_param("s", $invoice_id);
            if (!$delete_tx->execute()) {
                throw new Exception("Failed to replace payment transaction details.");
            }
            $delete_tx->close();
        }

        // Without splits, a settlement that closes an installment balance still
        // records its final part, so the ledger adds up to the invoice total.
        foreach ((is_array($payment_splits) || $paid_before_cents > 0) ? $transactions : [] as $transaction) {
            $tx_method = (string)($transaction['method'] ?? strtolower((string)$payment_method));
            $tx_amount = round((float)($transaction['amount'] ?? 0), 2);
            $tx_bank = $transaction['bank_name'] ?? null;
            $tx_reference = $transaction['reference_number'] ?? $payment_reference;
            $insert_tx = $conn->prepare("INSERT INTO payment_transactions (invoice_id, amount, payment_method, bank_name, reference_number, recorded_by) VALUES (?, ?, ?, ?, ?, ?)");
            $insert_tx->bind_param("sdsssi", $invoice_id, $tx_amount, $tx_method, $tx_bank, $tx_reference, $recorded_by);
            $insert_tx->execute();
            $insert_tx->close();
        }

        $activated = false;

        // An advance-rent invoice: its months become credits the sweep bills
        // and settles one by one on their usual dates.
        $advance_months = (int)($inv_res['advance_months'] ?? 0);
        if ($advance_months > 0) {
            $credit_upd = $conn->prepare("UPDATE advance_credits SET status = 'available' WHERE advance_invoice_id = ? AND status = 'reserved'");
            $credit_upd->bind_param("s", $invoice_id);
            $credit_upd->execute();
            $credit_upd->close();
        }

        // A paid move-in invoice is the moment the deposit is actually held.
        if (!empty($inv_res['rent_application_id']) && (float)($inv_res['security_deposit'] ?? 0) > 0) {
            $dep_app_id = (int)$inv_res['rent_application_id'];
            $dep_upd = $conn->prepare("UPDATE lease_contracts SET deposit_status = 'Held' WHERE rent_application_id = ? AND deposit_status = 'Pending'");
            $dep_upd->bind_param("i", $dep_app_id);
            $dep_upd->execute();
            $dep_upd->close();
        }

        $conn->commit();

        // The tenant is told the payment landed, and a proof/cash declaration
        // awaiting verification leaves the admin queue — regardless of which
        // channel settled it.
        resolve_admin_queue($conn, 'payment_verification', $invoice_id);
        resolve_admin_queue($conn, 'cash_payment_declared', $invoice_id);

        // A paid move-in invoice is the admin's cue to schedule the move-in
        // (schedule_move_in.php), whichever channel settled it.
        if ($inv_res && !empty($inv_res['rent_application_id']) && (float)($inv_res['security_deposit'] ?? 0) > 0) {
            $app_id = (int)$inv_res['rent_application_id'];
            $app_q = $conn->prepare("SELECT first_name, last_name, suffix, room_name FROM rent_applications WHERE id = ? AND status = 'Approved'");
            $app_q->bind_param("i", $app_id);
            $app_q->execute();
            $app_row = $app_q->get_result()->fetch_assoc();
            $app_q->close();
            if ($app_row) {
                resolve_admin_queue($conn, 'rent_application', $app_id);
                notify_admins_queue($conn, 'rent_application', $app_id, 'Move-In Payment Received',
                    person_name($app_row) . " paid the move-in invoice $invoice_id for Unit {$app_row['room_name']} ($payment_method). Schedule their move-in date.");
            }
        }

        if ($notify_tenant && $inv_res && !empty($inv_res['user_id'])) {
            create_notification($conn, (int)$inv_res['user_id'], 'payment', 'Payment Received',
                $advance_months > 0
                    ? "Your advance payment $invoice_id for $advance_months month(s) has been confirmed and recorded ($payment_method). Each month's rent invoice will still be issued on its usual date and paid from this advance, with its own receipt. Thank you!"
                    : "Your payment for invoice $invoice_id has been confirmed and recorded ($payment_method). Your receipt is ready in Payment History. Thank you!",
                'Resolved', "invoice:$invoice_id");
            try {
                require_once __DIR__ . '/api/services/send_notification.php';
                dispatch_admin_action_notification($conn, (int)$inv_res['user_id'], 'payment', 'Payment Confirmed — Official Receipt', null,
                    email_payment_confirmation_template(notify_recipient_name($conn, (int)$inv_res['user_id']), [$inv_res], $payment_method, $inv_res['payment_reference'] ?? ''));
            } catch (Throwable $notification_error) {
                error_log('Could not dispatch payment confirmation email: ' . $notification_error->getMessage());
            }
        }
        // A credited month already inside the billing window (held back while
        // this advance awaited confirmation) is billed and settled now.
        if ($advance_months > 0 && !empty($inv_res['user_id'])) {
            generate_due_rent_invoices($conn, (int)$inv_res['user_id']);
        }

        return [
            'ok' => true,
            'message' => 'Payment successfully finalized and saved.',
            'invoice_id' => $invoice_id,
            'user_id' => $inv_res['user_id'] ?? null,
            'activated' => $activated,
        ];
    } catch (Exception $e) {
        $conn->rollback();
        return ['ok' => false, 'message' => $e->getMessage(), 'invoice_id' => $invoice_id, 'user_id' => null, 'activated' => false];
    }
}

// ── Installments (manager interview Q9 / Q12) ──
// Any single invoice can be paid in parts over time. Each part is appended to
// payment_transactions and added to invoices.amount_paid; the invoice stays
// open while a balance remains (balance = total_amount - amount_paid). The
// part that brings the balance to zero goes through settle_invoice(), so the
// deposit hold, move-in cue, advance credits, queue resolution and receipt
// happen exactly once. A grouped payment (advance 'ADV-' / combined 'BND-')
// is settled in full only.

// Remaining balance of an invoice row (total_amount, amount_paid), in cents.
function invoice_balance_cents(array $row) {
    return (int)round((float)$row['total_amount'] * 100) - (int)round((float)($row['amount_paid'] ?? 0) * 100);
}

// Records one part-payment of $invoice_id: $parts are normalized portions
// (normalize_payment_portions()). A part equal to the balance settles the
// invoice. Returns ['ok', 'message', 'settled' => bool, 'amount_paid', 'balance'].
function record_partial_payment($conn, $invoice_id, $parts, $admin_id) {
    $fail = fn($message, $code = 409) => ['ok' => false, 'message' => $message, 'code' => $code, 'settled' => false];
    if (!is_array($parts) || !$parts) return $fail("Enter the amount received.", 422);
    $part_cents = 0;
    foreach ($parts as $p) $part_cents += (int)round((float)$p['amount'] * 100);
    if ($part_cents <= 0) return $fail("A part-payment must be more than ₱0.", 422);

    $conn->begin_transaction();
    try {
        $q = $conn->prepare("SELECT id, user_id, status, total_amount, amount_paid, payment_group, advance_months, due_date FROM invoices WHERE id = ? FOR UPDATE");
        $q->bind_param("s", $invoice_id);
        $q->execute();
        $inv = $q->get_result()->fetch_assoc();
        $q->close();
        if (!$inv) { $conn->rollback(); return $fail("Invoice not found.", 404); }
        if (!in_array($inv['status'], BILLING_OPEN_STATUSES, true)) { $conn->rollback(); return $fail("Invoice $invoice_id is not open for payment — it may already be settled or cancelled."); }
        if ($inv['status'] === 'processing') { $conn->rollback(); return $fail("An online checkout is in progress for this bill."); }
        if (!empty($inv['payment_group']) || (int)($inv['advance_months'] ?? 0) > 0) {
            $conn->rollback();
            return $fail("A grouped or advance payment is paid in full; part-payments are recorded on a single invoice.", 422);
        }
        $balance_cents = invoice_balance_cents($inv);
        if ($part_cents > $balance_cents) {
            $conn->rollback();
            return $fail("The part (₱" . number_format($part_cents / 100, 2) . ") is more than the balance (₱" . number_format($balance_cents / 100, 2) . ").", 422);
        }
        if ($part_cents === $balance_cents) {
            // The last part: settle through the one settlement path (it re-locks
            // the row and re-checks the balance).
            $conn->rollback();
            $method = count($parts) > 1 ? 'split' : $parts[0]['method'];
            $ref = $parts[0]['reference_number'] ?? null;
            $res = settle_invoice($conn, $invoice_id, $method, $ref, $part_cents / 100, true, $parts, (int)$admin_id);
            if (!$res['ok']) return $fail($res['message']);
            return ['ok' => true, 'settled' => true, 'message' => "Final part received. Invoice $invoice_id is paid in full.",
                    'amount_paid' => round((float)$inv['total_amount'], 2), 'balance' => 0.0, 'user_id' => (int)$inv['user_id']];
        }

        $ins = $conn->prepare("INSERT INTO payment_transactions (invoice_id, amount, payment_method, bank_name, reference_number, recorded_by) VALUES (?, ?, ?, ?, ?, ?)");
        $recorder = (int)$admin_id;
        foreach ($parts as $p) {
            $amt = round((float)$p['amount'], 2);
            $ins->bind_param("sdsssi", $invoice_id, $amt, $p['method'], $p['bank_name'], $p['reference_number'], $recorder);
            if (!$ins->execute()) throw new Exception("Could not record the part-payment.");
        }
        $ins->close();

        // A verified part closes the proof or visit it came with; the bill goes
        // back to waiting for the rest (overdue when its due date has passed).
        $part = $part_cents / 100;
        $upd = $conn->prepare("UPDATE invoices SET amount_paid = amount_paid + ?, proof_amount = NULL,
                status = CASE WHEN status IN ('pending-verification', 'scheduled', 'payment-failed')
                              THEN (CASE WHEN due_date IS NOT NULL AND due_date < CURDATE() THEN 'overdue' ELSE 'pending' END)
                              ELSE status END
            WHERE id = ? AND status IN " . billing_open_status_sql() . " AND amount_paid + ? < total_amount");
        $upd->bind_param("dsd", $part, $invoice_id, $part);
        $upd->execute();
        $changed = $upd->affected_rows;
        $upd->close();
        if ($changed !== 1) throw new Exception("The invoice changed while the part was being recorded. Refresh and try again.");
        clear_payment_proof_parts($conn, $invoice_id);
        $conn->commit();
    } catch (Exception $e) {
        $conn->rollback();
        return $fail(public_error_message($e, "Could not record the part-payment."));
    }

    $paid_now = round(((int)round((float)$inv['amount_paid'] * 100) + $part_cents) / 100, 2);
    $balance = round(($balance_cents - $part_cents) / 100, 2);
    resolve_admin_queue($conn, 'payment_verification', $invoice_id);
    resolve_admin_queue($conn, 'cash_payment_declared', $invoice_id);
    log_activity($conn, $admin_id, 'billing', 'Recorded Part Payment', "Invoice $invoice_id: ₱" . number_format($part, 2) . " received ("
        . implode(', ', array_map(fn($p) => $p['method'] . ' ₱' . number_format($p['amount'], 2), $parts)) . "); paid ₱" . number_format($paid_now, 2) . ", balance ₱" . number_format($balance, 2));
    if (!empty($inv['user_id'])) {
        create_notification($conn, (int)$inv['user_id'], 'payment', 'Part Payment Received',
            "₱" . number_format($part, 2) . " received for invoice $invoice_id, balance ₱" . number_format($balance, 2) . ". Pay the rest from Pay Bills.",
            'Resolved', "invoice:$invoice_id");
    }
    return ['ok' => true, 'settled' => false, 'message' => "Part-payment of ₱" . number_format($part, 2) . " recorded. Balance ₱" . number_format($balance, 2) . ".",
            'amount_paid' => $paid_now, 'balance' => $balance, 'user_id' => (int)$inv['user_id']];
}

// Maintenance vocabulary (checklist 4.2 / 4.3), enforced server-side.
const MAINTENANCE_CATEGORIES = ['Plumbing', 'Electrical', 'Structural/Physical', 'Water Supply', 'General Maintenance', 'Others'];
const MAINTENANCE_URGENCIES = ['Low', 'Medium', 'High', 'Urgent'];

// Priority is an admin judgment call, not a tenant self-declaration — a
// tenant should not be able to jump the queue by claiming "Urgent". Every
// tenant-submitted ticket starts here regardless of anything sent in the
// request; only an admin can move it to one of the four real MAINTENANCE_URGENCIES
// values via update_maintenance_status.php. Deliberately excluded from
// MAINTENANCE_URGENCIES/normalize_maintenance_urgency() so it can never be
// selected as a "real" priority again once triaged.
const MAINTENANCE_DEFAULT_URGENCY = 'Needs Triage';

// Rejected and Cancelled are terminal; Completed may be reopened if the fix did not hold.
// How long after completion a tenant can report a repair as not fixed.
const MAINTENANCE_REOPEN_DAYS = 7;

const MAINTENANCE_TRANSITIONS = [
    'Pending'     => ['In Progress', 'Rejected'],
    'In Progress' => ['Completed', 'Pending', 'Cancelled'],
    'Completed'   => ['In Progress'],
    'Rejected'    => [],
    'Cancelled'   => [],
];

// Add-on bookings: the two visit windows (start hour in Manila time), how far ahead a
// tenant may book, and how long before a confirmed visit a tenant can still cancel
// on their own. Later than that, cancelling is a request the admin decides.
const SERVICE_SLOT_START_HOUR = ['morning' => 8, 'afternoon' => 13];
const SERVICE_MAX_ADVANCE_DAYS = 60;
const SERVICE_FREE_CANCEL_HOURS = 24;
// How long after completion a tenant can rate a service, and the categories that cannot be removed.
const SERVICE_RATING_DAYS = 14;
const SERVICE_BUILTIN_CATEGORIES = ['cleaning', 'laundry', 'other'];

// Open bookings of one service in one time slot: the confirmed slot when the admin set
// one, else what the tenant asked for.
function service_slot_taken($conn, $service_id, $date, $window) {
    $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM service_requests
                            WHERE service_id = ? AND status IN ('Pending', 'Approved', 'In Progress')
                              AND COALESCE(scheduled_date, preferred_date) = ?
                              AND COALESCE(scheduled_window, preferred_time_slot) = ?");
    $stmt->bind_param("iss", $service_id, $date, $window);
    $stmt->execute();
    $count = (int)$stmt->get_result()->fetch_assoc()['c'];
    $stmt->close();
    return $count;
}

// When the visit starts, or null when the slot is not a known window.
function service_visit_start($date, $window) {
    if (!$date || !isset(SERVICE_SLOT_START_HOUR[$window])) return null;
    $start = DateTime::createFromFormat('Y-m-d H:i', $date . ' ' . sprintf('%02d:00', SERVICE_SLOT_START_HOUR[$window]), new DateTimeZone('Asia/Manila'));
    return $start ?: null;
}

// Free cancellation: the booking is Pending, or Approved with a confirmed visit that is
// still more than SERVICE_FREE_CANCEL_HOURS away.
function service_cancel_is_free($status, $date, $window) {
    if ($status === 'Pending') return true;
    if ($status !== 'Approved') return false;
    $start = service_visit_start($date, $window);
    if (!$start) return false;
    $cutoff = (clone $start)->modify('-' . SERVICE_FREE_CANCEL_HOURS . ' hours');
    return new DateTime('now', new DateTimeZone('Asia/Manila')) < $cutoff;
}

// A cancelled or rejected booking can never reach Completed, so it can never be billed.
const SERVICE_TRANSITIONS = [
    'Pending'     => ['Approved', 'Rejected', 'Cancelled'],
    'Approved'    => ['In Progress', 'Completed', 'Rejected', 'Cancelled'],
    'In Progress' => ['Completed', 'Cancelled'],
    'Completed'   => ['Cancelled'],
    'Rejected'    => [],
    'Cancelled'   => [],
];

// Invoices a service charge may be added to or reversed from. Excludes 'processing'
// (amount already at the gateway) and 'pending-verification' (tenant already paid it).
const SERVICE_ADJUSTABLE_INVOICE_STATUSES = ['pending', 'unpaid', 'overdue', 'scheduled', 'payment-failed'];

// Invoices an admin may hand-adjust the manual lines of (audit H8). Same set
// as SERVICE_ADJUSTABLE_INVOICE_STATUSES today, but named separately so the
// two can diverge — an admin adjustment and a system-posted accumulation
// aren't guaranteed to stay under the same rules forever.
const INVOICE_ADJUSTABLE_STATUSES = ['pending', 'unpaid', 'overdue', 'scheduled', 'payment-failed'];

function normalize_maintenance_category($value) {
    $map = [
        'plumbing' => 'Plumbing',
        'electrical' => 'Electrical',
        'structural' => 'Structural/Physical',
        'structural/physical' => 'Structural/Physical',
        'carpentry' => 'Structural/Physical',
        'water' => 'Water Supply',
        'water supply' => 'Water Supply',
        'general' => 'General Maintenance',
        'general maintenance' => 'General Maintenance',
        'appliance' => 'General Maintenance',
        'pest control' => 'General Maintenance',
        'other' => 'Others',
        'others' => 'Others',
    ];
    return $map[strtolower(trim((string)$value))] ?? null;
}

function normalize_maintenance_urgency($value) {
    $v = strtolower(trim((string)$value));
    if ($v === 'emergency') $v = 'urgent';
    $v = ucfirst($v);
    return in_array($v, MAINTENANCE_URGENCIES, true) ? $v : null;
}

// Every invoice writer stores the period as a label like "September 2026".
function billing_period_label(DateTime $when) {
    return $when->format('F Y');
}

// Latest Approved/active/pending-move-out application for a user, or null.
function get_active_tenancy($conn, $user_id) {
    $stmt = $conn->prepare("SELECT id, room_name, monthly_rent FROM rent_applications
                            WHERE user_id = ? AND status IN ('Approved', 'active', 'pending-move-out')
                            ORDER BY id DESC LIMIT 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

// ── Move-in billing (payments audit 2026-09-30) ──
// Every tenancy starts with one move-in invoice — 1 month advance rent
// (tenancy month 0) + a 1-month security deposit — and a draft contract
// whose deposit is 'Pending'. Only a paid move-in invoice lets the move-in be
// scheduled, the contract be activated, or the move-in be confirmed.

// Issues the move-in invoice and draft contract for an application that has
// neither yet (each is skipped if it already exists). Throws on a failed
// insert, so callers run it inside their transaction.
function issue_move_in_billing($conn, $app_id, $user_id, $monthly_rent, $lease_start, $lease_end) {
    $app_id = (int)$app_id;
    $monthly_rent = round((float)$monthly_rent, 2);

    $check_inv = $conn->prepare("SELECT id FROM invoices WHERE rent_application_id = ?");
    $check_inv->bind_param("i", $app_id);
    $check_inv->execute();
    $has_invoice = (bool)$check_inv->get_result()->fetch_assoc();
    $check_inv->close();
    if (!$has_invoice) {
        $invoice_id = 'INV-' . uniqid();
        // The same "Month YYYY" label every other writer uses. The advance
        // rent is tenancy month 0; confirming the move-in relabels it to the
        // month the tenancy actually starts.
        $billing_period = billing_period_label(new DateTime($lease_start));
        // The move-in invoice is due within the payment window (Settings); the
        // sweep cancels the application if it is still unpaid after that.
        $due_date = date('Y-m-d', strtotime('+' . payment_window_days($conn) . ' days'));
        $total_amount = $monthly_rent * 2; // 1st month + 1 month deposit
        $inv_stmt = $conn->prepare("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, security_deposit, total_amount, billing_period, status, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)");
        $inv_stmt->bind_param("siidddss", $invoice_id, $user_id, $app_id, $monthly_rent, $monthly_rent, $total_amount, $billing_period, $due_date);
        if (!$inv_stmt->execute()) {
            error_log("[AMS] Failed to create move-in invoice: " . $inv_stmt->error);
            throw new Exception("Failed to create move-in invoice.");
        }
        $inv_stmt->close();
    }

    $check_ctr = $conn->prepare("SELECT id FROM lease_contracts WHERE rent_application_id = ?");
    $check_ctr->bind_param("i", $app_id);
    $check_ctr->execute();
    $has_contract = (bool)$check_ctr->get_result()->fetch_assoc();
    $check_ctr->close();
    if (!$has_contract) {
        $contract_id = uniqid('CTR-');
        $dep_refundable = deposit_refundable_default($conn);
        $template_version_id = null;
        if (file_exists(__DIR__ . '/contract_template.php')) {
            require_once __DIR__ . '/contract_template.php';
            if (function_exists('contract_template_pin_version_id')) {
                $template_version_id = contract_template_pin_version_id($conn);
            }
        }
        if ($template_version_id) {
            $ctr_stmt = $conn->prepare("INSERT INTO lease_contracts (id, rent_application_id, deposit_amount, deposit_refundable, lease_start, lease_end, status, deposit_status, template_version_id) VALUES (?, ?, ?, ?, ?, ?, 'draft', 'Pending', ?)");
            $ctr_stmt->bind_param("sidissi", $contract_id, $app_id, $monthly_rent, $dep_refundable, $lease_start, $lease_end, $template_version_id);
        } else {
            $ctr_stmt = $conn->prepare("INSERT INTO lease_contracts (id, rent_application_id, deposit_amount, deposit_refundable, lease_start, lease_end, status, deposit_status) VALUES (?, ?, ?, ?, ?, ?, 'draft', 'Pending')");
            $ctr_stmt->bind_param("sidiss", $contract_id, $app_id, $monthly_rent, $dep_refundable, $lease_start, $lease_end);
        }
        if (!$ctr_stmt->execute()) {
            error_log("[AMS] Failed to create rent contract: " . $ctr_stmt->error);
            throw new Exception("Failed to create rent contract.");
        }
        $ctr_stmt->close();
    }
}

// Whether the application's move-in invoice (advance rent + deposit) is paid.
function move_in_paid($conn, $app_id) {
    $app_id = (int)$app_id;
    $stmt = $conn->prepare("SELECT 1 FROM invoices WHERE rent_application_id = ? AND security_deposit > 0 AND status = 'paid' LIMIT 1");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $paid = (bool)$stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $paid;
}

// ── Rent periods (panel feedback 2026-09-26) ──
// Rent is billed per tenancy month, anchored on the contract's lease_start:
// month k starts on rent_period_start(lease_start, k) and is due that day.
// Month 0's rent is the advance month inside the move-in invoice. A period is
// never generated once its start date has passed, so no invoice is ever
// issued with a due date in the past (no back-billing).
//
// invoices.rent_period_start marks a rent invoice's month. The unique key on
// (user_id, rent_period_key) — rent_period_key is rent_period_start except on
// a cancelled invoice — makes creating a month claim-first: the generator, an
// advance payment and a lease extension can never bill the same month twice.

// Days before a tenancy month starts that its rent invoice is issued.
const RENT_INVOICE_LEAD_DAYS = 7;

// Start of tenancy month $k: the lease-start day in the k-th month after it,
// clamped to that month's last day (a lease from Jan 31 bills Feb 28, Mar 31).
function rent_period_start($lease_start, $k) {
    $start = new DateTime($lease_start);
    $day = (int)$start->format('j');
    $month = (new DateTime($start->format('Y-m-01')))->modify('+' . (int)$k . ' month');
    $month->setDate((int)$month->format('Y'), (int)$month->format('n'), min($day, (int)$month->format('t')));
    return $month->format('Y-m-d');
}

// [first day, last day] of the $months tenancy months starting $period_start:
// the last day is the one before the lease-start day comes round again
// (a lease from Sep 15 covers Sep 15 – Oct 14).
function rent_period_bounds($lease_start, $period_start, $months = 1) {
    $day = (int)(new DateTime($lease_start))->format('j');
    $next = new DateTime((new DateTime($period_start))->format('Y-m-01'));
    $next->modify('+' . max(1, (int)$months) . ' month');
    $next->setDate((int)$next->format('Y'), (int)$next->format('n'), min($day, (int)$next->format('t')));
    $next->modify('-1 day');
    return [$period_start, $next->format('Y-m-d')];
}

// The dates a bill covers, counted from the tenant's move-in day (panel
// feedback 2026-09-28: a past-due bill shows its period, not its due date).
// A rent invoice uses its rent_period_start; an advance-rent invoice the first
// month it credits ($inv['advance_first']); any other bill the move-in day
// inside its "Month YYYY" label. Returns [start, end], or null when the
// tenancy has no start yet or the label is not a month.
function invoice_covered_period(array $inv, $lease_start) {
    if (empty($lease_start)) return null;
    $months = max(1, (int)($inv['advance_months'] ?? 1));
    if (!empty($inv['advance_months'])) {
        $start = $inv['advance_first'] ?? null;
    } elseif (!empty($inv['rent_period_start'])) {
        $start = $inv['rent_period_start'];
    } else {
        $month = DateTime::createFromFormat('!F Y', trim((string)($inv['billing_period'] ?? '')));
        if (!$month) return null;
        $day = (int)(new DateTime($lease_start))->format('j');
        $month->setDate((int)$month->format('Y'), (int)$month->format('n'), min($day, (int)$month->format('t')));
        $start = $month->format('Y-m-d');
    }
    return $start ? rent_period_bounds($lease_start, $start, $months) : null;
}

// Extra invoice columns invoice_covered_period() reads, for a query on
// `invoices i`: the rent month, advance months and first credited month, and
// the tenancy's move-in day.
const INVOICE_PERIOD_COLUMNS = "i.rent_period_start, i.advance_months,
    (SELECT MIN(ac.period_start) FROM advance_credits ac WHERE ac.advance_invoice_id = i.id) AS advance_first,
    (SELECT lcp.lease_start FROM lease_contracts lcp WHERE lcp.rent_application_id = i.rent_application_id ORDER BY lcp.id DESC LIMIT 1) AS lease_start";

// "Sep 15 – Oct 14, 2026" for a covered period (the year once when both match).
function covered_period_text(array $bounds) {
    $a = new DateTime($bounds[0]);
    $b = new DateTime($bounds[1]);
    return $a->format('Y') === $b->format('Y')
        ? $a->format('M j') . ' – ' . $b->format('M j, Y')
        : $a->format('M j, Y') . ' – ' . $b->format('M j, Y');
}

// The tenancy's current monthly rent. rent_applications.monthly_rent is kept
// live (occupant changes rewrite it — apply_occupant_count()); the room rate
// is only a fallback for a row that never had one.
function tenancy_monthly_rent($conn, $app_id) {
    $stmt = $conn->prepare("SELECT ra.monthly_rent, r.monthly_rent AS room_rent FROM rent_applications ra LEFT JOIN rooms r ON r.id = ra.room_name WHERE ra.id = ?");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) return 0.0;
    return (float)$row['monthly_rent'] > 0 ? (float)$row['monthly_rent'] : (float)($row['room_rent'] ?? 0);
}

// Whether the tenancy month starting $period_start is already billed: by its
// own rent_period_start, or — for invoices written before rent periods
// existed — by a non-cancelled rent invoice carrying the same "Month YYYY" label.
function rent_period_billed($conn, $user_id, $period_start) {
    $label = billing_period_label(new DateTime($period_start));
    $stmt = $conn->prepare("SELECT 1 FROM invoices WHERE user_id = ? AND status <> 'cancelled'
                            AND (rent_period_start = ? OR (rent_period_start IS NULL AND base_rent > 0 AND billing_period = ?)) LIMIT 1");
    $stmt->bind_param("iss", $user_id, $period_start, $label);
    $stmt->execute();
    $billed = (bool)$stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $billed;
}

// Issues the rent invoice for one tenancy month, due on the month's start
// unless $due_date is given (holdover months billed late get a grace period).
// Returns the new invoice id, or null when that month is already billed
// (including by a concurrent writer — the unique key refuses the second row).
function create_rent_invoice($conn, $user_id, $app_id, $period_start, $rent, $payment_group = null, $due_date = null) {
    if (rent_period_billed($conn, $user_id, $period_start)) return null;

    $period = new DateTime($period_start);
    $label = billing_period_label($period);
    $invoice_id = 'INV-' . $period->format('Ym') . '-' . strtoupper(bin2hex(random_bytes(4)));
    $rent = round((float)$rent, 2);
    $due_date = $due_date ?: $period_start;

    $stmt = $conn->prepare("INSERT IGNORE INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date, rent_period_start, payment_group)
                            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)");
    $stmt->bind_param("siiddssss", $invoice_id, $user_id, $app_id, $rent, $rent, $label, $due_date, $period_start, $payment_group);
    $stmt->execute();
    $created = $stmt->affected_rows > 0;
    $stmt->close();
    return $created ? $invoice_id : null;
}

// Issues one tenancy month's rent invoice and tells the tenant. With an
// 'available' advance credit (advance_credits row) the month is billed at the
// credited amount and settled from it at once, so it still gets its own
// invoice and receipt. Returns the invoice id, or null when already billed.
function issue_rent_invoice($conn, $user_id, $app_id, $start, $rent, $credit = null, $due_date = null) {
    $amount = $credit ? (float)$credit['amount'] : (float)$rent;
    $invoice_id = create_rent_invoice($conn, $user_id, $app_id, $start, $amount, null, $due_date);
    if (!$invoice_id) return null;

    $label = billing_period_label(new DateTime($start));
    $money = '₱' . number_format($amount, 2);
    if ($credit) {
        $settled = settle_invoice($conn, $invoice_id, 'Advance credit', $credit['advance_invoice_id'], null, false);
        if ($settled['ok']) {
            $stmt = $conn->prepare("UPDATE advance_credits SET status = 'applied', applied_invoice_id = ?, applied_at = NOW() WHERE id = ? AND status = 'available'");
            $credit_id = (int)$credit['id'];
            $stmt->bind_param("si", $invoice_id, $credit_id);
            $stmt->execute();
            $stmt->close();
            create_notification($conn, $user_id, 'payment', "Rent Paid from Advance: $label",
                "Your rent for $label ($money, invoice $invoice_id) was paid from your advance payment {$credit['advance_invoice_id']}. The receipt is in Payment History.",
                'Resolved', "invoice:$invoice_id");
            return $invoice_id;
        }
        // Could not settle: the month stays an ordinary bill and the credit
        // stays available (move-out turns it into a refund).
    }
    $due = (new DateTime($due_date ?: $start))->format('M j, Y');
    create_notification($conn, $user_id, 'billing', "Rent Invoice: $label",
        "Your rent for $label ($money) is due on $due. You can pay it on the Pay Bills page.",
        'Resolved', "invoice:$invoice_id");
    try {
        require_once __DIR__ . '/api/services/send_notification.php';
        $invoice_q = $conn->prepare("SELECT i.id, i.base_rent, i.water, i.electricity, i.parking, i.services, i.maintenance, i.late_fee, i.total_amount, i.billing_period, i.due_date FROM invoices i WHERE i.id = ?");
        $invoice_q->bind_param('s', $invoice_id);
        $invoice_q->execute();
        $invoice_row = $invoice_q->get_result()->fetch_assoc();
        $invoice_q->close();
        if ($invoice_row) {
            dispatch_system_notification($conn, $user_id, 'billing', "New Monthly Bill — $label", null,
                email_invoice_template(notify_recipient_name($conn, $user_id), $invoice_row));
        }
    } catch (Throwable $notification_error) {
        error_log('Could not dispatch generated rent invoice email: ' . $notification_error->getMessage());
    }
    return $invoice_id;
}

// Daily-sweep step: for every running tenancy, issue the rent invoice of each
// tenancy month that starts within RENT_INVOICE_LEAD_DAYS (and before the
// lease ends). Months whose start has already passed are skipped, not
// back-billed — except a month covered by an advance credit that became
// available late (its advance was still awaiting confirmation). A month whose
// advance is still awaiting confirmation is held back until it settles.
// $only_user_id limits the run to one tenant. Returns the number created.
function generate_due_rent_invoices($conn, $only_user_id = null) {
    expire_unpaid_advances($conn, $only_user_id);

    $sql = "SELECT ra.id AS app_id, ra.user_id, lc.lease_start, lc.lease_end
            FROM lease_contracts lc
            JOIN rent_applications ra ON ra.id = lc.rent_application_id
            WHERE lc.status IN ('active', 'eviction-pending')
              AND ra.status IN ('Approved', 'active', 'pending-move-out')
              AND ra.user_id IS NOT NULL AND lc.lease_start IS NOT NULL AND lc.lease_end IS NOT NULL";
    if ($only_user_id !== null) $sql .= " AND ra.user_id = " . (int)$only_user_id;
    $rows = $conn->query($sql);
    if (!$rows) return 0;

    $today = date('Y-m-d');
    $horizon = date('Y-m-d', strtotime('+' . RENT_INVOICE_LEAD_DAYS . ' days'));
    $created = 0;

    while ($t = $rows->fetch_assoc()) {
        $user_id = (int)$t['user_id'];
        $app_id = (int)$t['app_id'];
        $rent = null;
        $credits = advance_credits_by_month($conn, $user_id);

        for ($k = 1; $k < 600; $k++) {
            $start = rent_period_start($t['lease_start'], $k);
            if ($start > $horizon || $start >= $t['lease_end']) break;
            $credit = $credits[$start] ?? null;
            if ($credit && $credit['status'] === 'reserved') continue;
            if ($start < $today && !$credit) continue;
            if (!$credit) {
                $rent = $rent ?? tenancy_monthly_rent($conn, $app_id);
                if ($rent <= 0) continue;
            }
            if (issue_rent_invoice($conn, $user_id, $app_id, $start, $rent, $credit)) $created++;
        }
    }
    return $created;
}

// ── Advance payments as monthly credits (panel feedback 2026-09-28) ──
// An advance payment is one advance-rent invoice (invoices.advance_months = N)
// the tenant pays through any channel. Each month it covers is an
// advance_credits row: 'reserved' until the invoice is paid, then
// 'available'; the sweep bills the month on its usual date and settles it
// from the credit ('applied'). Rent is counted in the month it covers, so
// reports leave advance-rent invoices out of revenue.

// The tenant's reserved and available credits, keyed by period_start.
function advance_credits_by_month($conn, $user_id) {
    $stmt = $conn->prepare("SELECT id, advance_invoice_id, period_start, amount, status FROM advance_credits
                            WHERE user_id = ? AND status IN ('reserved', 'available')");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $out = [];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) $out[$row['period_start']] = $row;
    $stmt->close();
    return $out;
}

// Advance statuses that mean nothing has been paid or submitted yet.
const ADVANCE_UNPAID_STATUSES = ['pending', 'unpaid', 'overdue', 'payment-failed'];

// Cancels each advance-rent invoice still unpaid once its first month is due
// to be billed, and its credits, so the months are billed normally. A month
// that already started while the advance awaited confirmation (and was then
// rejected) is billed here, since the generator does not back-bill.
// Returns the number of advances cancelled.
function expire_unpaid_advances($conn, $only_user_id = null) {
    $horizon = date('Y-m-d', strtotime('+' . RENT_INVOICE_LEAD_DAYS . ' days'));
    $today = date('Y-m-d');
    $unpaid = "('" . implode("','", ADVANCE_UNPAID_STATUSES) . "')";
    $sql = "SELECT i.id, i.user_id, MIN(c.period_start) AS first_start
            FROM invoices i JOIN advance_credits c ON c.advance_invoice_id = i.id AND c.status = 'reserved'
            WHERE i.advance_months IS NOT NULL AND i.status IN $unpaid";
    if ($only_user_id !== null) $sql .= " AND i.user_id = " . (int)$only_user_id;
    $sql .= " GROUP BY i.id, i.user_id HAVING first_start <= '$horizon'";
    $res = $conn->query($sql);
    if (!$res) return 0;

    $expired = 0;
    foreach ($res->fetch_all(MYSQLI_ASSOC) as $adv) {
        $stmt = $conn->prepare("UPDATE invoices SET status = 'cancelled', cancel_reason = 'Advance payment expired' WHERE id = ? AND status IN $unpaid");
        $stmt->bind_param("s", $adv['id']);
        $stmt->execute();
        $done = $stmt->affected_rows > 0;
        $stmt->close();
        if (!$done) continue;

        $months = $conn->prepare("SELECT user_id, rent_application_id, period_start FROM advance_credits WHERE advance_invoice_id = ? AND status = 'reserved'");
        $months->bind_param("s", $adv['id']);
        $months->execute();
        $late = $months->get_result()->fetch_all(MYSQLI_ASSOC);
        $months->close();

        $cancel = $conn->prepare("UPDATE advance_credits SET status = 'cancelled' WHERE advance_invoice_id = ? AND status = 'reserved'");
        $cancel->bind_param("s", $adv['id']);
        $cancel->execute();
        $cancel->close();
        $expired++;

        create_notification($conn, (int)$adv['user_id'], 'billing', 'Advance Payment Expired',
            "Your advance payment {$adv['id']} was not paid before its first month, so it was cancelled. Those months are billed as usual on Pay Bills.",
            'Resolved', "invoice:{$adv['id']}");
        log_activity($conn, null, 'billing', 'Expired Advance Payment', "Advance {$adv['id']} unpaid when its first month came due; cancelled", 0);

        foreach ($late as $m) {
            if ($m['period_start'] >= $today || empty($m['rent_application_id'])) continue;
            $rent = tenancy_monthly_rent($conn, (int)$m['rent_application_id']);
            if ($rent > 0) issue_rent_invoice($conn, (int)$m['user_id'], (int)$m['rent_application_id'], $m['period_start'], $rent);
        }
    }
    return $expired;
}

// ── Desk payment methods (payments audit follow-up 2026-10-01) ──
// What the admin desk records: cash, GCash, or a bank transfer to BDO or BPI
// (each bank its own method). Tenant channels are stored under their own
// labels ('GCash (Manual)', 'BDO (Manual)', 'Cash on Hand', …);
// desk_methods_for_label() gives the desk methods a label can be recorded
// as — one, or both banks for an older generic 'Bank Transfer (Manual)'
// proof — and [] when it implies none (e.g. an online Maya/card checkout).
const DESK_PAYMENT_METHODS = ['cash', 'gcash', 'bank_transfer'];
const PHILIPPINE_BANKS = ['BDO', 'BPI', 'Metrobank', 'Landbank', 'RCBC', 'UnionBank', 'Security Bank', 'Maya Bank', 'Other'];

function desk_methods_for_label($label) {
    $l = strtolower(trim((string)$label));
    if ($l === '') return [];
    if (strpos($l, 'gcash') !== false) return ['gcash'];
    if (strpos($l, 'cash') !== false || strpos($l, 'in-person') !== false || strpos($l, 'in person') !== false) return ['cash'];
    if (strpos($l, 'bank') !== false || strpos($l, 'bdo') !== false || strpos($l, 'bpi') !== false) return ['bank_transfer'];
    if (strpos($l, 'qr') !== false) return ['bank_transfer', 'gcash'];
    return [];
}

// Label a tenant's split payment carries in invoices.payment_method.
const SPLIT_PAYMENT_LABEL = 'Split payment';

// Checks payment portions (the admin desk's `payments` and a tenant's split):
// method, amount, bank and reference rules. Returns ['ok' => true, 'parts' =>
// normalized portions, 'total_cents' => sum] or ['ok' => false, 'message' => ...].
function normalize_payment_portions($payments, $max = 10) {
    $fail = fn($message) => ['ok' => false, 'message' => $message];
    if (!is_array($payments) || !$payments || count($payments) > $max) {
        return $fail("Provide between 1 and $max payment portions.");
    }
    $normalized = [];
    $total_cents = 0;
    foreach ($payments as $part) {
        if (!is_array($part)) return $fail("Invalid payment portion.");
        $method = strtolower(trim((string)($part['method'] ?? '')));
        $amount_raw = $part['amount'] ?? null;
        $bank_name = trim((string)($part['bank_name'] ?? ''));
        $reference = trim((string)($part['reference_number'] ?? ''));
        if (!in_array($method, ['cash', 'gcash', 'bank_transfer'], true) || !is_numeric($amount_raw) || (float)$amount_raw <= 0 || round((float)$amount_raw, 2) !== (float)$amount_raw) {
            return $fail("Each portion needs a supported method and a positive amount with at most two decimals.");
        }
        // A listed bank, or the name typed after choosing "Other" — the page
        // sends that name, never the word "Other" itself.
        $listed_bank = $bank_name !== 'Other' && in_array($bank_name, PHILIPPINE_BANKS, true);
        $custom_bank = (bool)preg_match('/^[\p{L}\p{N}][\p{L}\p{N} .&\'\-]{1,59}$/u', $bank_name) && strcasecmp($bank_name, 'Other') !== 0;
        if ($method === 'bank_transfer' && !$listed_bank && !$custom_bank) {
            return $fail("Choose a supported originating bank for each bank transfer.");
        }
        if ($method === 'gcash' && $reference !== '' && !preg_match('/^\d{13}$/', $reference)) {
            return $fail("GCash reference numbers must be exactly 13 digits.");
        }
        if ($method === 'bank_transfer' && $reference !== '' && strlen($reference) > 55) {
            return $fail("Bank references must be 55 characters or fewer.");
        }
        if ($method !== 'bank_transfer') $bank_name = '';
        $part['method'] = $method;
        $part['amount'] = round((float)$amount_raw, 2);
        $part['bank_name'] = $bank_name ?: null;
        $part['reference_number'] = $reference ?: null;
        $normalized[] = $part;
        $total_cents += (int)round((float)$amount_raw * 100);
    }
    return ['ok' => true, 'parts' => $normalized, 'total_cents' => $total_cents];
}

// The portions a tenant submitted for a payment key, in order.
function payment_proof_parts($conn, $key) {
    $stmt = $conn->prepare("SELECT method, bank_name, amount, reference_number, proof_path FROM payment_proof_parts WHERE payment_key = ? ORDER BY position ASC, id ASC");
    $stmt->bind_param('s', $key);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $rows;
}

function clear_payment_proof_parts($conn, $key) {
    $stmt = $conn->prepare("DELETE FROM payment_proof_parts WHERE payment_key = ?");
    $stmt->bind_param('s', $key);
    $stmt->execute();
    $stmt->close();
}

// ── Reused payment references (manager interview Q22) ──
// The same GCash/bank reference on a different payment is flagged to the admin
// ('warn', the default) or refused ('block'), Settings -> Payments. References
// are compared normalized (no spaces or dashes, upper case) and only within the
// same channel: a GCash number and a BDO reference that look alike differ.
// What is never a match (the same payment): the bills' own proof awaiting
// verification (also a new proof after a rejected one), the tenant's own split
// parts for this payment, and the ledger rows of settled bills of the same
// payment_group (one transfer paying a combined payment is recorded on each
// bill). A part already recorded on a bill being paid is a match: one
// reference given for two installments. Cash and empty references are ignored.
const DUPLICATE_REFERENCE_POLICIES = ['warn', 'block'];
// An identical part (same invoice, reference and amount) recorded this
// recently is a double submit, refused whatever the policy.
const DOUBLE_SUBMIT_MINUTES = 10;

// Spaces, tabs, line breaks and dashes removed (anywhere), then upper case.
// Must give exactly the stored `reference_norm` generated column of
// payment_transactions, payment_proof_parts and invoices (SetupDB.sql), which
// the lookups below seek on; '' here is NULL there. MB_CASE_UPPER_SIMPLE is
// the one-to-one mapping MySQL's UPPER() uses (é -> É, but ß stays ß).
function normalize_payment_reference($reference) {
    $s = str_replace([' ', "\t", "\r", "\n", '-'], '', (string)$reference);
    return function_exists('mb_convert_case') ? mb_convert_case($s, MB_CASE_UPPER_SIMPLE, 'UTF-8') : strtoupper($s);
}

// 'GCASH', 'BANK:<bank>', 'CASH', or null when the method carries no reference
// of its own (a split label). Mirrored in SQL by reference_channel_sql().
function payment_reference_channel($method, $bank = null) {
    $m = strtolower(trim((string)$method));
    if ($m === '' || $m === 'split' || $m === strtolower(SPLIT_PAYMENT_LABEL)) return null;
    if (strpos($m, 'gcash') !== false) return 'GCASH';
    if (strpos($m, 'cash') !== false || strpos($m, 'in-person') !== false || strpos($m, 'in person') !== false) return 'CASH';
    $b = trim((string)$bank);
    return 'BANK:' . strtoupper($b !== '' ? $b : trim((string)$method));
}

// SQL form of payment_reference_channel(). Column names only — never request input.
function reference_channel_sql($method_col, $bank_col) {
    return "(CASE WHEN LOWER($method_col) LIKE '%gcash%' THEN 'GCASH'
                  WHEN $method_col IS NULL OR TRIM($method_col) = '' OR LOWER($method_col) IN ('split', '" . strtolower(SPLIT_PAYMENT_LABEL) . "') THEN NULL
                  WHEN LOWER($method_col) LIKE '%cash%' OR LOWER($method_col) LIKE '%in-person%' OR LOWER($method_col) LIKE '%in person%' THEN 'CASH'
                  ELSE CONCAT('BANK:', UPPER(TRIM(COALESCE(NULLIF(TRIM($bank_col), ''), $method_col)))) END)";
}

// Every stored reference matching, one row each: ledger parts, single proofs
// awaiting verification or paid, and split parts awaiting verification. Each
// branch seeks on its `reference_norm` index.
// Columns: invoice_id, grp (its payment_group; a split part's key), ref, ch,
// status, tenant, amount, src, row_id.
// $pending null: the rows whose reference_norm = ? (bind the normalized
// reference three times). $pending a SELECT of (key_id, key_grp, ref, ch): the
// rows matching each of its rows, prefixed with key_id, key_grp, key_ch.
function reference_rows_sql($pending = null) {
    $tenant = "TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), '')))";
    $keys = $pending === null ? '' : 'p.key_id, p.key_grp, p.ch AS key_ch, ';
    // STRAIGHT_JOIN: read the (few) pending references first and seek each
    // table by them, instead of scanning the table on a small dataset.
    $from = fn($table, $alias) => $pending === null ? "$table $alias" : "($pending) p STRAIGHT_JOIN $table $alias ON $alias.reference_norm = p.ref";
    $match = fn($alias) => $pending === null ? "$alias.reference_norm = ?" : "$alias.reference_norm IS NOT NULL";
    return "SELECT {$keys}pt.invoice_id, i.payment_group AS grp, pt.reference_norm AS ref,
                   " . reference_channel_sql('pt.payment_method', 'pt.bank_name') . " AS ch, i.status, $tenant AS tenant, pt.amount, 'ledger' AS src, pt.id AS row_id
              FROM " . $from('payment_transactions', 'pt') . " JOIN invoices i ON i.id = pt.invoice_id LEFT JOIN users u ON u.id = i.user_id
             WHERE " . $match('pt') . " AND i.status <> 'cancelled'
            UNION ALL
            SELECT {$keys}i.id, i.payment_group, i.reference_norm,
                   " . reference_channel_sql('i.payment_method', 'i.bank_name') . ", i.status, $tenant,
                   COALESCE(i.proof_amount, i.total_amount - i.amount_paid), 'proof', 0
              FROM " . $from('invoices', 'i') . " LEFT JOIN users u ON u.id = i.user_id
             WHERE " . $match('i') . " AND i.status IN ('pending-verification', 'paid')
            UNION ALL
            SELECT {$keys}pp.payment_key, pp.payment_key, pp.reference_norm,
                   " . reference_channel_sql('pp.method', 'pp.bank_name') . ", 'pending-verification',
                   COALESCE((SELECT TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))) FROM invoices i JOIN users u ON u.id = i.user_id WHERE i.id = pp.payment_key),
                            (SELECT TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))) FROM invoices i JOIN users u ON u.id = i.user_id WHERE i.payment_group = pp.payment_key LIMIT 1)),
                   pp.amount, 'split', pp.id
              FROM " . $from('payment_proof_parts', 'pp') . "
             WHERE " . $match('pp');
}

// A row of the same payment that is not a reuse: a proof or split part of
// these bills / this key, or the ledger row of a settled bill of the same
// group. $same: SQL that is true when row r belongs to the payment's bills,
// key or group. A ledger row on a bill still open is a part already received
// on it, so it counts.
function reference_same_payment_sql($same) {
    return "(($same) AND (r.src <> 'ledger' OR r.status NOT IN " . billing_open_status_sql() . "))";
}

function reuse_hit(array $r) {
    return ['invoice_id' => $r['invoice_id'], 'tenant_name' => $r['tenant'] !== '' ? $r['tenant'] : null,
            'amount' => round((float)$r['amount'], 2), 'status' => $r['status'], 'where' => $r['src']];
}

// The first other payment that used this reference, or null:
// ['invoice_id', 'tenant_name', 'amount', 'status', 'where' => ledger|proof|split].
// $key: the payment key being paid (invoice id or group id); $invoice_ids:
// its open bills. tenant_name is for admins only.
function find_reference_reuse($conn, $method, $bank, $reference, $key, array $invoice_ids) {
    $ref = normalize_payment_reference($reference);
    $ch = payment_reference_channel($method, $bank);
    if ($ref === '' || $ch === null || $ch === 'CASH') return null;
    $own = array_values(array_unique(array_filter(array_map('strval', array_merge([$key], $invoice_ids)), fn($v) => $v !== '')));
    if (!$own) $own = [''];
    $in = implode(',', array_fill(0, count($own), '?'));
    $same = reference_same_payment_sql("r.invoice_id IN ($in) OR COALESCE(r.grp, '') IN ($in)
               OR COALESCE(r.grp, '') IN (SELECT payment_group FROM invoices WHERE id IN ($in) AND payment_group IS NOT NULL)");
    $sql = "SELECT r.* FROM (" . reference_rows_sql() . ") r
             WHERE r.ch = ? AND NOT $same
             ORDER BY FIELD(r.src, 'ledger', 'proof', 'split'), r.invoice_id LIMIT 1";
    $params = array_merge([$ref, $ref, $ref, $ch], $own, $own, $own);
    $stmt = $conn->prepare($sql);
    if (!$stmt) return null;
    $stmt->bind_param(str_repeat('s', count($params)), ...$params);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ? reuse_hit($row) : null;
}

// Admin payments list: for every payment awaiting verification, the first other
// payment that used one of its references, in one query. Same rule as
// find_reference_reuse(). [payment key (invoice id or group id) => hit].
function reference_reuse_for_pending($conn) {
    $pending = "SELECT i.id AS key_id, i.payment_group AS key_grp, i.reference_norm AS ref,
                       " . reference_channel_sql('i.payment_method', 'i.bank_name') . " AS ch
                  FROM invoices i WHERE i.status = 'pending-verification' AND i.reference_norm IS NOT NULL
                UNION ALL
                SELECT pp.payment_key, NULL, pp.reference_norm, " . reference_channel_sql('pp.method', 'pp.bank_name') . "
                  FROM payment_proof_parts pp WHERE pp.reference_norm IS NOT NULL";
    $same = reference_same_payment_sql("r.invoice_id = r.key_id OR COALESCE(r.grp, '') = r.key_id
               OR (COALESCE(r.key_grp, '') <> '' AND (COALESCE(r.grp, '') = r.key_grp OR r.invoice_id = r.key_grp))");
    $sql = "SELECT r.* FROM (" . reference_rows_sql($pending) . ") r
            WHERE r.key_ch <> 'CASH' AND r.ch = r.key_ch AND NOT $same
            ORDER BY r.key_id, FIELD(r.src, 'ledger', 'proof', 'split'), r.invoice_id";
    $res = $conn->query($sql);
    $out = [];
    while ($res && ($r = $res->fetch_assoc())) {
        if (!isset($out[$r['key_id']])) $out[$r['key_id']] = reuse_hit($r);
    }
    return $out;
}

function reference_reuse_blocks($conn) {
    return get_setting($conn, 'duplicate_reference_policy', 'warn') === 'block';
}

// One payment-reference writer at a time (tenant proofs, split parts, desk
// recording): the reuse check and the write then cannot interleave, so two
// submissions of one reference cannot both pass under 'block'. Released by
// payment_reference_unlock(), and at the end of the request on any other way
// out (an early exit, an uncaught exception): a persistent connection
// (DB_PERSISTENT=1) would otherwise keep holding it.
function payment_reference_lock($conn) {
    $res = $conn->query("SELECT GET_LOCK('ams_payment_reference', 10) AS l");
    if (!$res || (int)($res->fetch_assoc()['l'] ?? 0) !== 1) return false;
    if (empty($GLOBALS['ams_reference_lock_hook'])) {
        $GLOBALS['ams_reference_lock_hook'] = true;
        register_shutdown_function(fn() => payment_reference_unlock($conn));
    }
    $GLOBALS['ams_reference_lock_held'] = true;
    return true;
}
// A no-op when the lock is not held (safe on every exit path).
function payment_reference_unlock($conn) {
    if (empty($GLOBALS['ams_reference_lock_held'])) return;
    $GLOBALS['ams_reference_lock_held'] = false;
    try {
        $conn->query("SELECT RELEASE_LOCK('ams_payment_reference')");
    } catch (Throwable $e) {
        // Connection already closed: closing released it.
    }
}

// Double submit: the same reference and amount already recorded on one of
// these invoices in the last DOUBLE_SUBMIT_MINUTES, or (when $pending_key is
// given) already waiting as a split part of that key. A split resubmission
// passes null: it replaces its own pending parts, so they are not a repeat.
function payment_double_submitted($conn, array $invoice_ids, $pending_key, $reference, $amount_cents) {
    $ref = normalize_payment_reference($reference);
    if ($ref === '') return false;
    $ids = array_values(array_unique(array_map('strval', $invoice_ids)));
    if (!$ids) $ids = [''];
    $in = implode(',', array_fill(0, count($ids), '?'));
    $amount = $amount_cents / 100;
    $minutes = DOUBLE_SUBMIT_MINUTES;
    $sql = "SELECT 1 FROM payment_transactions WHERE reference_norm = ? AND invoice_id IN ($in)
               AND ROUND(amount * 100) = ROUND(? * 100) AND created_at >= NOW() - INTERVAL $minutes MINUTE";
    $params = array_merge([$ref], $ids, [$amount]);
    $types = 's' . str_repeat('s', count($ids)) . 'd';
    if ($pending_key !== null) {
        $sql .= " UNION ALL
            SELECT 1 FROM payment_proof_parts WHERE reference_norm = ? AND payment_key = ?
               AND ROUND(amount * 100) = ROUND(? * 100)";
        array_push($params, $ref, (string)$pending_key, $amount);
        $types .= 'ssd';
    }
    $sql .= " LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) return false;
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $hit = (bool)$stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $hit;
}

// ── Advance payments (panel feedback 2026-09-26) ──
// A tenant can prepay several future months at once. Each month is its own
// rent invoice (so each gets its own receipt); the months share a
// payment_group 'ADV-…' and are paid with one payment. The pay endpoints take
// either an invoice id or a group id as their "payment key" and target rows
// with `? IN (id, payment_group)` — invoice ids start 'INV-', group ids
// 'ADV-', so one value can never match both.

// Most months a tenant can prepay in one advance payment.
const ADVANCE_PAYMENT_MAX_MONTHS = 6;

// A group key: a legacy advance payment ('ADV-…') or a combined payment of
// overdue bills ('BND-…', bundle_overdue_invoices()).
function is_payment_group_key($key) {
    return is_string($key) && (strncmp($key, 'ADV-', 4) === 0 || strncmp($key, 'BND-', 4) === 0);
}

function is_bundle_key($key) {
    return is_string($key) && strncmp($key, 'BND-', 4) === 0;
}

// "invoice INV-…", "advance payment ADV-…" or "combined payment BND-…", for messages and logs.
function payment_key_label($key) {
    if (is_bundle_key($key)) return 'combined payment ' . $key;
    return (is_payment_group_key($key) ? 'advance payment ' : 'invoice ') . $key;
}

// The invoices a payment key covers, oldest month first. $user_id limits them
// to one owner (null = any, for admins); $statuses to those states (null = all).
function payment_key_invoices($conn, $key, $user_id = null, $statuses = null) {
    $sql = "SELECT id, user_id, status, total_amount, amount_paid, proof_amount, advance_months, billing_period, due_date, checkout_session_id, checkout_payment_intent_id, payment_group, payment_method
            FROM invoices WHERE ? IN (id, payment_group)";
    $types = "s";
    $params = [$key];
    if ($user_id !== null) {
        $sql .= " AND user_id = ?";
        $types .= "i";
        $params[] = (int)$user_id;
    }
    if ($statuses !== null) {
        $sql .= " AND status IN ('" . implode("','", $statuses) . "')";
    }
    $sql .= " ORDER BY due_date ASC, id ASC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $rows;
}

// Settles everything a payment key covers: one invoice, or each open month of
// an advance payment through its own settle_invoice() call — so every month
// ends up a separate paid invoice with its own receipt. The tenant gets one
// "Payment Received" notice for the whole group, not one per month.
// $amount_paid (desk only) must cover the combined total. Returns
// settle_invoice()'s shape plus 'invoice_ids', the invoices settled.
function settle_payment_key($conn, $key, $payment_method, $payment_reference = null, $amount_paid = null, $payment_splits = null, $recorded_by = null) {
    if (!is_payment_group_key($key)) {
        $result = settle_invoice($conn, $key, $payment_method, $payment_reference, $amount_paid, true, $payment_splits, $recorded_by);
        $result['invoice_ids'] = $result['ok'] ? [$key] : [];
        return $result;
    }

    $fail = fn($message, $settled = []) => ['ok' => false, 'message' => $message, 'invoice_id' => $key,
                                            'user_id' => null, 'activated' => false, 'invoice_ids' => $settled];
    $rows = payment_key_invoices($conn, $key, null, BILLING_OPEN_STATUSES);
    $bundle = is_bundle_key($key);
    $what = $bundle ? 'combined payment' : 'advance payment';
    if (!$rows) return $fail(ucfirst($what) . " not found or already settled.");

    // What is still owed: a bill already part-paid (installments) can be in a
    // combined payment, and only its balance is settled here.
    $total = array_sum(array_map(fn($row) => invoice_balance_cents($row), $rows)) / 100;
    if ($amount_paid !== null && $amount_paid + 0.009 < $total) {
        return $fail("Amount tendered (₱" . number_format($amount_paid, 2) . ") is less than the $what total (₱" . number_format($total, 2) . "). A grouped payment is settled in full; part-payments are recorded on a single invoice.");
    }

    $settled = [];
    $settled_rows = [];
    $split_allocations = [];
    $legacy_cash_overpayment = $payment_splits === null && $amount_paid !== null && $amount_paid > $total && strtolower((string)$payment_method) === 'cash';
    if ($legacy_cash_overpayment) {
        $payment_splits = [[
            'method' => strtolower((string)$payment_method),
            'amount' => round($total, 2),
            'bank_name' => null,
            'reference_number' => $payment_reference,
        ]];
    }
    if (is_array($payment_splits)) {
        $split_index = 0;
        $split_remaining = (float)$payment_splits[0]['amount'];
        foreach ($rows as $row) {
            $invoice_allocations = [];
            $invoice_remaining = invoice_balance_cents($row) / 100;
            while ($invoice_remaining > 0.009 && isset($payment_splits[$split_index])) {
                $allocated = min($invoice_remaining, $split_remaining);
                $invoice_allocations[] = array_replace($payment_splits[$split_index], ['amount' => round($allocated, 2)]);
                $invoice_remaining = round($invoice_remaining - $allocated, 2);
                $split_remaining = round($split_remaining - $allocated, 2);
                if ($split_remaining <= 0.009) {
                    $split_index++;
                    if (isset($payment_splits[$split_index])) $split_remaining = (float)$payment_splits[$split_index]['amount'];
                }
            }
            if ($invoice_remaining > 0.009) return $fail("Payment split allocation did not cover every invoice.");
            $split_allocations[$row['id']] = $invoice_allocations;
        }
    }
    // One notice for the months that were settled, even when a later month
    // fails. A combined payment's notice opens its combined receipt (invoice:BND-…).
    $notify = function () use ($conn, $key, $payment_method, $bundle, &$settled_rows) {
        if (!$settled_rows) return;
        $periods = implode(', ', array_map(fn($row) => $row['billing_period'], $settled_rows));
        $amount = array_sum(array_map(fn($row) => invoice_balance_cents($row), $settled_rows)) / 100;
        $months = count($settled_rows);
        create_notification($conn, (int)$settled_rows[0]['user_id'], 'payment', 'Payment Received',
            $bundle
                ? "Your combined payment $key for $months bill(s) ($periods, ₱" . number_format($amount, 2) . ") has been confirmed and recorded ($payment_method). A combined receipt and a receipt for each billing period are ready in Payment History. Thank you!"
                : "Your advance payment $key for $months month(s) ($periods, ₱" . number_format($amount, 2) . ") has been confirmed and recorded ($payment_method). A receipt for each month is ready in Payment History. Thank you!",
            'Resolved', $bundle ? "invoice:$key" : "invoice:{$settled_rows[0]['id']}");
        try {
            require_once __DIR__ . '/api/services/send_notification.php';
            $receipt_rows = [];
            $ids = array_column($settled_rows, 'id');
            foreach ($ids as $settled_id) {
                $q = $conn->prepare("SELECT id, billing_period, total_amount FROM invoices WHERE id = ?");
                $q->bind_param('s', $settled_id);
                $q->execute();
                if ($row = $q->get_result()->fetch_assoc()) $receipt_rows[] = $row;
                $q->close();
            }
            $uid = (int)$settled_rows[0]['user_id'];
            dispatch_admin_action_notification($conn, $uid, 'payment', 'Payment Confirmed — Official Receipt', null,
                email_payment_confirmation_template(notify_recipient_name($conn, $uid), $receipt_rows, $payment_method, $key));
        } catch (Throwable $notification_error) {
            error_log('Could not dispatch advance payment confirmation email: ' . $notification_error->getMessage());
        }
    };
    foreach ($rows as $row) {
        $result = settle_invoice($conn, $row['id'], $payment_method, $payment_reference, null, false, $split_allocations[$row['id']] ?? null, $recorded_by);
        if ($result['ok'] === false) {
            $notify();
            return $fail("Settled " . count($settled) . " of " . count($rows) . " months; {$row['id']} failed: {$result['message']}", $settled);
        }
        $settled[] = $row['id'];
        $settled_rows[] = $row;
    }
    $notify();

    // The group's own queue rows (a proof or cash declaration made for the
    // whole group); settle_invoice() resolves per-invoice ones.
    resolve_admin_queue($conn, 'payment_verification', $key);
    resolve_admin_queue($conn, 'cash_payment_declared', $key);

    return ['ok' => true, 'message' => count($settled) . ($bundle ? " bill(s) of the combined payment settled." : " month(s) of the advance payment settled."), 'invoice_id' => $key,
            'user_id' => (int)$rows[0]['user_id'], 'activated' => false, 'invoice_ids' => $settled];
}

// ── Combined payment of overdue bills (panel feedback 2026-09-30) ──
// A tenant with two or more unpaid bills, at least one of them overdue, may
// pay them together (overdue plus current bills) or one at a time. Paying
// together stamps them with one payment_group 'BND-…', which every pay
// endpoint already accepts as a payment key (? IN (id, payment_group));
// settle_payment_key() then settles and receipts each bill on its own, and
// Payment History adds one combined receipt for the group.

// The tenant's bills that can be combined: unpaid with nothing submitted yet,
// overdue or current, not an advance and not already in a group.
function bundle_candidates($conn, $user_id) {
    $unpaid = "('" . implode("','", ADVANCE_UNPAID_STATUSES) . "')";
    $stmt = $conn->prepare("SELECT id, total_amount, billing_period, due_date FROM invoices
                            WHERE user_id = ? AND status IN $unpaid
                              AND payment_group IS NULL AND advance_months IS NULL
                            ORDER BY due_date ASC, id ASC");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $rows;
}

// The tenant's combined payment still open, or null.
function open_bundle_key($conn, $user_id) {
    $stmt = $conn->prepare("SELECT payment_group FROM invoices WHERE user_id = ? AND payment_group LIKE 'BND-%'
                            AND status IN " . billing_open_status_sql() . " LIMIT 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row['payment_group'] ?? null;
}

// Groups the tenant's unpaid bills into one combined payment and returns its
// key. A new one needs at least two bills, one of them past due; an unpaid
// bundle that already exists takes in any newly issued bills. Returns null
// when there is nothing to combine or the open bundle already has a payment
// in progress.
function bundle_overdue_invoices($conn, $user_id) {
    $key = open_bundle_key($conn, $user_id);
    $candidates = bundle_candidates($conn, $user_id);
    $today = date('Y-m-d');
    $has_overdue = (bool)array_filter($candidates, fn($c) => !empty($c['due_date']) && $c['due_date'] < $today);
    if ($key) {
        foreach (payment_key_invoices($conn, $key, $user_id, BILLING_OPEN_STATUSES) as $r) {
            if (!in_array($r['status'], ADVANCE_UNPAID_STATUSES, true)) return null;
        }
    } elseif (count($candidates) < 2 || !$has_overdue) {
        return null;
    } else {
        $key = 'BND-' . strtoupper(bin2hex(random_bytes(6)));
    }
    $unpaid = "('" . implode("','", ADVANCE_UNPAID_STATUSES) . "')";
    $stmt = $conn->prepare("UPDATE invoices SET payment_group = ? WHERE id = ? AND user_id = ? AND payment_group IS NULL AND status IN $unpaid");
    foreach ($candidates as $c) {
        $stmt->bind_param("ssi", $key, $c['id'], $user_id);
        $stmt->execute();
    }
    $stmt->close();
    return $key;
}

// Ungroups a combined payment so its bills are paid one at a time again, only
// while nothing has been submitted for it. Returns the number of bills
// released, or false when a payment for it is in progress or recorded.
function release_bundle($conn, $user_id, $key) {
    if (!is_bundle_key($key)) return false;
    foreach (payment_key_invoices($conn, $key, $user_id, BILLING_OPEN_STATUSES) as $r) {
        if (!in_array($r['status'], ADVANCE_UNPAID_STATUSES, true)) return false;
    }
    $stmt = $conn->prepare("UPDATE invoices SET payment_group = NULL WHERE payment_group = ? AND user_id = ? AND status IN " . billing_open_status_sql());
    $stmt->bind_param("si", $key, $user_id);
    $stmt->execute();
    $n = $stmt->affected_rows;
    $stmt->close();
    return $n;
}

// Utility readings (checklist 8.7) are keyed by a 'YYYY-MM' billing period — the
// month the meter covers — while every invoice stores a "September 2026" label.
// Comparing one against the other directly never matches, which is how
// sync_utility_to_invoice.php used to miss the month's rent invoice and bill
// rent a second time. Always convert with utility_period_label() first.
function is_valid_utility_period($period) {
    return is_string($period) && preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period) === 1;
}

function utility_period_label($period) {
    return billing_period_label(DateTime::createFromFormat('!Y-m', $period));
}

// A reading counts as a spike when consumption rises more than this percentage
// over the unit's previous billing period.
const UTILITY_SPIKE_THRESHOLD_PCT = 30;

// Current billable tenancy for a unit: ['id' => application id, 'user_id' => ...]
// or null. A tenant still waiting on their move-in payment is not yet billed.
function get_room_tenancy($conn, $room_name) {
    $stmt = $conn->prepare("SELECT ra.id, ra.user_id FROM rent_applications ra
                            WHERE ra.room_name = ?
                              AND ra.status IN ('Approved', 'active', 'pending-move-out')
                              AND NOT EXISTS (
                                  SELECT 1 FROM invoices i
                                  WHERE i.rent_application_id = ra.id
                                    AND i.status IN ('pending', 'pending-verification')
                                    AND i.security_deposit > 0
                              )
                            ORDER BY ra.id DESC LIMIT 1");
    $stmt->bind_param("s", $room_name);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

// Validates and stores a maintenance photo or video. Returns [path|null, error|null].
function store_maintenance_attachment($file) {
    if (!$file || $file['error'] === UPLOAD_ERR_NO_FILE) return [null, null];
    if ($file['error'] !== UPLOAD_ERR_OK) return [null, 'File upload failed. Attachments must be 10MB or smaller.'];
    if ($file['size'] > 10 * 1024 * 1024) return [null, 'Attachments must be 10MB or smaller.'];

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'm4v', 'webm', 'mov'], true)) {
        return [null, 'Allowed formats: JPG, PNG, GIF or WEBP images, or MP4, WEBM or MOV videos.'];
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    $allowed_mimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/x-m4v', 'video/webm', 'video/quicktime'];
    if (!in_array($mime, $allowed_mimes, true)) return [null, 'File content does not match an allowed image or video format.'];

    $dir = __DIR__ . '/uploads/maintenance/';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $name = time() . '_' . bin2hex(random_bytes(6)) . '_' . preg_replace('/[^a-zA-Z0-9.]/', '_', basename($file['name']));
    if (!move_uploaded_file($file['tmp_name'], $dir . $name)) return [null, 'Failed to save the attached file.'];

    return ['uploads/maintenance/' . $name, null];
}

// rooms.gallery is a JSON list. Older rows hold bare path strings; newer ones
// hold {path, alt, fit}. Always read it through room_gallery_items() so both
// shapes work, and write it back as objects.
const GALLERY_FITS = ['fill', 'fit', 'wide'];
const GALLERY_ALT_MAX = 200;

function room_gallery_items($raw) {
    $list = is_string($raw) ? json_decode($raw, true) : $raw;
    $items = [];
    foreach (is_array($list) ? $list : [] as $entry) {
        $path = is_array($entry) ? (string)($entry['path'] ?? '') : (string)$entry;
        if ($path === '') continue;
        $alt = is_array($entry) ? trim((string)($entry['alt'] ?? '')) : '';
        $fit = is_array($entry) ? ($entry['fit'] ?? 'fill') : 'fill';
        $items[] = ['path' => $path, 'alt' => $alt, 'fit' => in_array($fit, GALLERY_FITS, true) ? $fit : 'fill'];
    }
    return $items;
}

// Validates and stores an admin-uploaded unit showcase photo. Unlike other
// uploads, these are deliberately public (guests browsing Preview.jsx have
// no session) so they're stored under backend/room_images/, NOT
// backend/uploads/ — that directory is blanket-denied at the webserver
// level and everything in it is only reachable through the
// owner-authenticated download_file.php, which has no concept of a
// "showcase photo" owner. Returns [path|null, error|null].
function store_room_image($file) {
    if (!$file || $file['error'] === UPLOAD_ERR_NO_FILE) return [null, null];
    if ($file['error'] !== UPLOAD_ERR_OK) return [null, 'File upload failed. Images must be 10MB or smaller.'];
    if ($file['size'] > 10 * 1024 * 1024) return [null, 'Images must be 10MB or smaller.'];

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true)) {
        return [null, 'Allowed formats: JPG, PNG, GIF or WEBP images.'];
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    $allowed_mimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!in_array($mime, $allowed_mimes, true)) return [null, 'File content does not match an allowed image format.'];

    $dir = __DIR__ . '/room_images/';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $name = time() . '_' . bin2hex(random_bytes(6)) . '_' . preg_replace('/[^a-zA-Z0-9.]/', '_', basename($file['name']));
    if (!move_uploaded_file($file['tmp_name'], $dir . $name)) return [null, 'Failed to save the uploaded image.'];

    return ['room_images/' . $name, null];
}


// ── Follow-up monitor: missed payments and missing documents ──
// Tenants with overdue bills, and applicants/tenants who have not supplied what
// the office needs. Listed for the admin (monitor_followups.php), reminded by
// the tenant nudge, and mirrored into the admin queue by sync_followup_queue().

function followup_overdue_tenants($conn) {
    $rows = [];
    $res = $conn->query("SELECT i.user_id, u.first_name, u.last_name, u.suffix, MAX(ra.room_name) AS room_name,
            COUNT(*) AS bills, SUM(i.total_amount - i.amount_paid) AS amount, MIN(i.due_date) AS oldest_due,
            GREATEST(DATEDIFF(CURDATE(), MIN(i.due_date)), 0) AS days_overdue
        FROM invoices i
        JOIN users u ON u.id = i.user_id
        LEFT JOIN rent_applications ra ON ra.id = i.rent_application_id
        WHERE i.status = 'overdue' AND u.is_archived = 0
        GROUP BY i.user_id, u.first_name, u.last_name, u.suffix
        ORDER BY days_overdue DESC");
    while ($res && ($r = $res->fetch_assoc())) {
        $rows[] = [
            'kind' => 'payment', 'userId' => (int)$r['user_id'], 'id' => (int)$r['user_id'],
            'name' => person_name($r), 'room' => $r['room_name'],
            'issue' => 'Overdue payment', 'bills' => (int)$r['bills'], 'amount' => round((float)$r['amount'], 2),
            'dueDate' => $r['oldest_due'], 'daysLate' => (int)$r['days_overdue'],
            'detail' => (int)$r['bills'] . ' overdue bill' . ((int)$r['bills'] === 1 ? '' : 's') . ', ₱' . number_format((float)$r['amount'], 2),
        ];
    }
    // Applicants whose move-in payment lapsed (cancelled by the payment window).
    $res = $conn->query("SELECT ra.id, ra.user_id, ra.room_name, ra.first_name, ra.last_name, ra.suffix, ra.cancelled_at
        FROM rent_applications ra
        WHERE ra.status = 'Cancelled' AND ra.rejection_reason LIKE 'Move-in payment was not made%'
          AND ra.cancelled_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        ORDER BY ra.cancelled_at DESC");
    while ($res && ($r = $res->fetch_assoc())) {
        $rows[] = [
            'kind' => 'lapsed', 'userId' => (int)$r['user_id'], 'id' => (int)$r['id'],
            'name' => person_name($r), 'room' => $r['room_name'],
            'issue' => 'Payment window lapsed', 'bills' => 0, 'amount' => 0, 'dueDate' => substr((string)$r['cancelled_at'], 0, 10), 'daysLate' => 0,
            'detail' => 'Move-in payment not made in time; application cancelled.',
        ];
    }
    return $rows;
}

// ── Application documents (Settings → Application Requirements) ──
// The admin defines which documents an applicant uploads; the files live in
// application_documents, one row per application and requirement.

// SQL condition, true when application `$alias` lacks a file for at least one
// active, required requirement. One query for any number of applications.
function application_missing_required_docs_sql($alias = 'ra') {
    return "EXISTS (SELECT 1 FROM application_requirements areq
                    WHERE areq.is_active = 1 AND areq.is_required = 1
                      AND NOT EXISTS (SELECT 1 FROM application_documents adoc
                                      WHERE adoc.rent_application_id = $alias.id AND adoc.requirement_id = areq.id
                                        AND adoc.file_path NOT IN ('', 'placeholder')))";
}

// Requirements ordered for display; inactive ones only when $include_inactive.
function application_requirements_list($conn, $include_inactive = false) {
    $where = $include_inactive ? '' : 'WHERE is_active = 1';
    $res = $conn->query("SELECT id, label, label_fil, is_required, is_active, sort_order FROM application_requirements $where ORDER BY sort_order, id");
    $rows = [];
    while ($res && ($r = $res->fetch_assoc())) {
        $rows[] = [
            'id' => (int)$r['id'], 'label' => $r['label'], 'label_fil' => $r['label_fil'],
            'is_required' => (bool)$r['is_required'], 'is_active' => (bool)$r['is_active'], 'sort_order' => (int)$r['sort_order'],
        ];
    }
    return $rows;
}

// Documents grouped by application id: [app_id => [{id, requirement_id, label, file_path, uploaded_at}]].
// $app_ids null = every application (list endpoints); one query either way.
function application_documents_by_app($conn, $app_ids = null) {
    $sql = "SELECT id, rent_application_id, requirement_id, label_snapshot, file_path, uploaded_at FROM application_documents";
    if ($app_ids !== null) {
        $app_ids = array_values(array_unique(array_map('intval', $app_ids)));
        if (!$app_ids) return [];
        $sql .= " WHERE rent_application_id IN (" . implode(',', $app_ids) . ")";
    }
    $res = $conn->query($sql . " ORDER BY rent_application_id, id");
    $out = [];
    while ($res && ($r = $res->fetch_assoc())) {
        $out[(int)$r['rent_application_id']][] = [
            'id' => (int)$r['id'],
            'requirement_id' => $r['requirement_id'] !== null ? (int)$r['requirement_id'] : null,
            'label' => $r['label_snapshot'],
            'file_path' => $r['file_path'],
            'uploaded_at' => $r['uploaded_at'],
        ];
    }
    return $out;
}

// Labels of the active, required requirements this application has no file for.
function application_missing_document_labels($requirements, $documents) {
    $have = [];
    foreach ($documents as $d) {
        if ($d['requirement_id'] !== null && !in_array($d['file_path'], ['', 'placeholder'], true)) $have[$d['requirement_id']] = true;
    }
    $missing = [];
    foreach ($requirements as $r) {
        if ($r['is_active'] && $r['is_required'] && empty($have[$r['id']])) $missing[] = $r['label'];
    }
    return $missing;
}

function followup_missing_documents($conn) {
    $rows = [];
    $add = function ($r, $issue, $detail, $due) use (&$rows) {
        $rows[] = [
            'kind' => 'document', 'userId' => (int)$r['user_id'], 'id' => (int)$r['id'],
            'name' => person_name($r), 'room' => $r['room_name'],
            'issue' => $issue, 'detail' => $detail, 'dueDate' => $due, 'bills' => 0, 'amount' => 0, 'daysLate' => 0,
        ];
    };
    // The office asked for something and the applicant has not answered.
    $res = $conn->query("SELECT id, user_id, first_name, last_name, suffix, room_name, rejection_reason FROM rent_applications WHERE status = 'Action Required'");
    while ($res && ($r = $res->fetch_assoc())) $add($r, 'Action required', $r['rejection_reason'] ?: 'The office is waiting for more information.', null);
    // Approved but a required document or the terms agreement is missing. A
    // tenant the admin assigned in person (documents_verified_at) has no files.
    $missing_docs = application_missing_required_docs_sql('ra');
    $res = $conn->query("SELECT ra.id, ra.user_id, ra.first_name, ra.last_name, ra.suffix, ra.room_name FROM rent_applications ra
        WHERE ra.status = 'Approved' AND (ra.terms_agreed_at IS NULL OR (ra.documents_verified_at IS NULL AND $missing_docs))");
    while ($res && ($r = $res->fetch_assoc())) $add($r, 'Missing documents', 'A required application document or the terms agreement is missing.', null);
    // Move-in date passed and the tenant never moved in.
    $res = $conn->query("SELECT id, user_id, first_name, last_name, suffix, room_name, move_in_date FROM rent_applications
        WHERE status = 'Approved' AND move_in_date IS NOT NULL AND move_in_date < CURDATE()");
    while ($res && ($r = $res->fetch_assoc())) $add($r, 'Move-in deadline passed', 'The scheduled move-in date has passed without a confirmed move-in.', $r['move_in_date']);
    // Contract still has no signed copy once the rent period has begun.
    $res = $conn->query("SELECT ra.id, ra.user_id, ra.first_name, ra.last_name, ra.suffix, ra.room_name, lc.lease_start
        FROM lease_contracts lc JOIN rent_applications ra ON ra.id = lc.rent_application_id
        WHERE ra.status IN ('Approved', 'active') AND lc.status IN ('draft', 'active')
          AND COALESCE(lc.signed_lease_path,'') = '' AND lc.lease_start IS NOT NULL AND lc.lease_start < CURDATE()");
    while ($res && ($r = $res->fetch_assoc())) $add($r, 'Contract not signed', 'The signed rent contract has not been uploaded and the rent period has already started.', $r['lease_start']);
    return $rows;
}

// Tenant-facing nudge for one follow-up item. Once a day per item at most.
function send_followup_nudge($conn, $item) {
    $meta = 'followup:' . $item['kind'] . ':' . $item['id'];
    $q = $conn->prepare("SELECT 1 FROM notifications WHERE user_id = ? AND metadata_value = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 1");
    $q->bind_param("is", $item['userId'], $meta);
    $q->execute();
    $recent = (bool)$q->get_result()->fetch_assoc();
    $q->close();
    if ($recent) return false;
    if ($item['kind'] === 'payment') {
        create_notification($conn, $item['userId'], 'overdue', 'Payment Overdue', "You have {$item['detail']}. Please pay as soon as you can from Pay Bills, or contact the office.", 'Resolved', $meta);
    } elseif ($item['kind'] === 'document') {
        create_notification($conn, $item['userId'], 'application_update', $item['issue'] . ': Action Needed', $item['detail'] . ' Please open Track Application to complete this, or contact the office.', 'Resolved', $meta);
    } else {
        return false;
    }
    return true;
}

// Mirrors the current follow-up lists into the admin queue (one Pending row per
// tenant/application, created once) and clears rows whose problem has gone.
// Documents also get one tenant nudge when their queue row is first created.
function sync_followup_queue($conn) {
    $seen = ['payment_followup' => [], 'document_followup' => []];
    $created = 0;
    $has_pending = function ($type, $id) use ($conn) {
        $meta = "$type:$id";
        $q = $conn->prepare("SELECT 1 FROM notifications WHERE type = ? AND metadata_value = ? AND status = 'Pending' LIMIT 1");
        $q->bind_param("ss", $type, $meta);
        $q->execute();
        $found = (bool)$q->get_result()->fetch_assoc();
        $q->close();
        return $found;
    };
    foreach (followup_overdue_tenants($conn) as $it) {
        if ($it['kind'] !== 'payment') continue;
        $seen['payment_followup'][$it['id']] = true;
        if ($has_pending('payment_followup', $it['id'])) continue;
        notify_admins_queue($conn, 'payment_followup', $it['id'], 'Overdue Payment', "{$it['name']}" . ($it['room'] ? " (Unit {$it['room']})" : '') . ": {$it['detail']}, {$it['daysLate']} days late.");
        $created++;
    }
    foreach (followup_missing_documents($conn) as $it) {
        $seen['document_followup'][$it['id']] = true;
        if ($has_pending('document_followup', $it['id'])) continue;
        notify_admins_queue($conn, 'document_followup', $it['id'], $it['issue'], "{$it['name']}" . ($it['room'] ? " (Unit {$it['room']})" : '') . ": {$it['detail']}");
        send_followup_nudge($conn, $it);
        $created++;
    }
    foreach ($seen as $type => $ids) {
        $res = $conn->query("SELECT metadata_value FROM notifications WHERE type = '$type' AND status = 'Pending'");
        while ($res && ($r = $res->fetch_assoc())) {
            $id = (int)substr((string)$r['metadata_value'], strlen($type) + 1);
            if (!isset($ids[$id])) resolve_admin_queue($conn, $type, $id);
        }
    }
    return $created;
}

// ── Payment window ──
// system_settings.payment_window_days (default 3): how long a tenant has to
// finish paying. It applies to an online checkout (an invoice held in
// 'processing') and to the move-in invoice of an approved application, whose
// due date is set to the window when it is issued. Monthly rent keeps its own
// schedule and late fees: voiding a rent invoice would erase a real debt.
function payment_window_days($conn) {
    return max(1, min(30, (int)get_setting($conn, 'payment_window_days', 3)));
}

// Releases checkouts abandoned past the window and cancels approved
// applications whose move-in invoice went unpaid past its due date. Every row
// is claimed with a conditional UPDATE and notified only when this call won it,
// so concurrent pollers cannot double-process. Returns counts.
function void_lapsed_payments($conn) {
    $out = ['checkouts_released' => 0, 'applications_voided' => 0];
    $days = payment_window_days($conn);

    // 1. Abandoned checkouts (same release as release_checkout_session.php).
    $stmt = $conn->prepare("SELECT id, user_id FROM invoices
                            WHERE status = 'processing' AND processing_since IS NOT NULL
                              AND processing_since < DATE_SUB(NOW(), INTERVAL ? DAY)");
    $stmt->bind_param("i", $days);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    $released_by_user = [];
    foreach ($rows as $r) {
        $upd = $conn->prepare("UPDATE invoices
            SET status = CASE WHEN due_date IS NOT NULL AND due_date < CURDATE() THEN 'overdue' ELSE 'pending' END,
                checkout_session_id = NULL, checkout_payment_intent_id = NULL, processing_since = NULL
            WHERE id = ? AND status = 'processing' AND processing_since < DATE_SUB(NOW(), INTERVAL ? DAY)");
        $upd->bind_param("si", $r['id'], $days);
        $upd->execute();
        $won = $upd->affected_rows > 0;
        $upd->close();
        if ($won) {
            $out['checkouts_released']++;
            $released_by_user[(int)$r['user_id']][] = $r['id'];
        }
    }
    foreach ($released_by_user as $uid => $ids) {
        create_notification($conn, $uid, 'payment', 'Online Checkout Expired',
            "Your unfinished online payment was cancelled after $days days. You can pay again from Pay Bills.",
            'Resolved', 'invoice:' . $ids[0]);
    }

    // 2. Approved applications whose move-in invoice was never paid.
    $res = $conn->query("SELECT ra.id AS app_id, ra.user_id, ra.room_name, i.id AS invoice_id
        FROM rent_applications ra
        JOIN invoices i ON i.rent_application_id = ra.id AND i.security_deposit > 0
        WHERE ra.status = 'Approved'
          AND i.status IN ('pending', 'unpaid', 'overdue', 'payment-failed')
          AND i.due_date IS NOT NULL AND i.due_date < CURDATE()
          AND NOT EXISTS (SELECT 1 FROM invoices p WHERE p.rent_application_id = ra.id AND p.status IN ('paid', 'processing', 'pending-verification', 'scheduled'))
          -- An applicant who has paid part of the move-in invoice (installments)
          -- is not dropped; the admin extends the due date (adjust_invoice.php).
          AND NOT EXISTS (SELECT 1 FROM invoices pp WHERE pp.rent_application_id = ra.id AND pp.amount_paid > 0)");
    $lapsed = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
    foreach ($lapsed as $a) {
        $app_id = (int)$a['app_id'];
        $conn->begin_transaction();
        try {
            $reason = "Move-in payment was not made within $days days of approval.";
            $moved = transition_application($conn, $app_id, 'Cancelled', ['reason' => $reason, 'only_from' => ['Approved']]);
            if (!$moved['ok']) { $conn->rollback(); continue; }

            $room = (string)$a['room_name'];
            release_application_holds($conn, $app_id, (int)$a['user_id'], 'Payment window lapsed', ['room_name' => $room]);

            resolve_admin_queue($conn, 'rent_application', $app_id);
            create_notification($conn, (int)$a['user_id'], 'application_update', 'Application Cancelled',
                "Your approved rent application for Unit $room was cancelled because the move-in payment was not made within $days days. You may apply again.");
            $conn->commit();
            notify_admins_info($conn, 'rent_application', 'Application Cancelled Automatically',
                "Unit $room: the approved applicant did not pay the move-in invoice {$a['invoice_id']} in time.", "rent_application:$app_id");
            log_activity($conn, null, 'system', 'Payment Window Lapsed', "Application #$app_id cancelled; invoice {$a['invoice_id']} voided", 0);
            $out['applications_voided']++;
        } catch (Throwable $e) {
            $conn->rollback();
            error_log('[AMS] void_lapsed_payments: ' . $e->getMessage());
        }
    }
    if ($out['checkouts_released'] > 0) {
        log_activity($conn, null, 'system', 'Payment Window Lapsed', "Released {$out['checkouts_released']} abandoned checkout(s)", 0);
    }
    return $out;
}
// Promotes lapsed invoices to 'overdue' and applies the configured late fee.
//
// Both the promotion and the fee live here because they must always happen
// together: the fee is what makes checklist item 3.7's "late fee calculation"
// real rather than an admin typing a number by hand. Called from the invoice
// list and the reminder sweep, so it runs on any path that observes billing.
//
// The fee is applied once per invoice, guarded by late_fee = 0, and is added
// to total_amount so the stored total always equals the sum of its line items.
function promote_overdue_invoices($conn) {
    // Anything still owed past its due date becomes overdue — not just
    // 'pending'. An abandoned checkout ('processing'), a declined payment
    // ('payment-failed') or a missed in-person booking ('scheduled' whose date
    // has passed) previously stayed frozen forever: never overdue, never
    // reminded, and invisible in receivables.
    $conn->query("
        UPDATE invoices
        -- A checkout that never completed must not leave a session id
        -- behind that a late-arriving webhook could still match on.
        -- status is assigned last: MySQL/MariaDB apply SET left to right, so
        -- the CASEs must read the old status (they used to see 'overdue').
        SET checkout_session_id = CASE WHEN status = 'processing' THEN NULL ELSE checkout_session_id END,
            checkout_payment_intent_id = CASE WHEN status = 'processing' THEN NULL ELSE checkout_payment_intent_id END,
            processing_since = CASE WHEN status = 'processing' THEN NULL ELSE processing_since END,
            status = 'overdue'
        WHERE due_date IS NOT NULL AND due_date < CURDATE()
          AND (
                status IN ('pending', 'unpaid', 'payment-failed', 'processing')
                OR (status = 'scheduled' AND (scheduled_date IS NULL OR scheduled_date < CURDATE()))
              )
    ");
    $promoted = $conn->affected_rows;

    $settings = [];
    $res = $conn->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('late_fee_enabled', 'late_fee_type', 'late_fee_value')");
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $settings[$row['setting_key']] = $row['setting_value'];
        }
    }

    $enabled = ($settings['late_fee_enabled'] ?? 'false') === 'true' || ($settings['late_fee_enabled'] ?? '') === '1';
    $value = (float)($settings['late_fee_value'] ?? 0);
    if (!$enabled || $value <= 0) {
        return $promoted;
    }

    if (($settings['late_fee_type'] ?? 'flat') === 'percent') {
        $stmt = $conn->prepare("
            UPDATE invoices
            SET late_fee = ROUND(GREATEST(base_rent + water + electricity + parking + services + maintenance - amount_paid, 0) * ? / 100, 2),
                total_amount = total_amount + ROUND(GREATEST(base_rent + water + electricity + parking + services + maintenance - amount_paid, 0) * ? / 100, 2)
            WHERE status = 'overdue' AND late_fee = 0 AND late_fee_waived = 0 AND advance_months IS NULL
        ");
        $stmt->bind_param("dd", $value, $value);
    } else {
        $stmt = $conn->prepare("
            UPDATE invoices
            SET late_fee = ?, total_amount = total_amount + ?
            WHERE status = 'overdue' AND late_fee = 0 AND late_fee_waived = 0 AND advance_months IS NULL
        ");
        $stmt->bind_param("dd", $value, $value);
    }
    $stmt->execute();
    $stmt->close();

    return $promoted;
}

// Returns the owning tenant's user_id for a rent application, or null if the
// application does not exist. Used to check a non-admin caller's X-User-Id
// against the tenant that actually owns a rent_application/lease_contract
// row before letting them read or modify it.
function get_rent_application_owner($conn, $rent_application_id) {
    $stmt = $conn->prepare("SELECT user_id FROM rent_applications WHERE id = ?");
    $stmt->bind_param("i", $rent_application_id);
    $stmt->execute();
    $res = $stmt->get_result();
    if ($res->num_rows === 0) return null;
    return (int)$res->fetch_assoc()['user_id'];
}

// Same, but resolved from a lease_contracts.id.
function get_contract_owner($conn, $contract_id) {
    $stmt = $conn->prepare("SELECT ra.user_id FROM lease_contracts lc JOIN rent_applications ra ON ra.id = lc.rent_application_id WHERE lc.id = ?");
    $stmt->bind_param("s", $contract_id);
    $stmt->execute();
    $res = $stmt->get_result();
    if ($res->num_rows === 0) return null;
    return (int)$res->fetch_assoc()['user_id'];
}

// ── Role-based access & password management (checklist Module 11) ──

// Every path that sets a password uses this minimum. Password reset and the
// admin "reset password" action used to accept 6 characters while registration
// and change-password required 8.
const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignores everything past 72 bytes.
const PASSWORD_MAX_BYTES = 72;

// Rules for a NEW password (registration, reset, change, admin reset) — the
// same list as PASSWORD_RULES in ams-react/src/utils/validation.js. Login does
// not use it, so passwords set before the rule existed keep working.
// Returns an error message, or '' when the password is acceptable.
function password_policy_error($pw) {
    $pw = (string)$pw;
    if (strlen($pw) > PASSWORD_MAX_BYTES) return "Password must be " . PASSWORD_MAX_BYTES . " characters or fewer.";
    $missing = [];
    if (mb_strlen($pw) < PASSWORD_MIN_LENGTH) $missing[] = "at least " . PASSWORD_MIN_LENGTH . " characters";
    if (!preg_match('/[A-Z]/', $pw)) $missing[] = "one uppercase letter";
    if (!preg_match('/[a-z]/', $pw)) $missing[] = "one lowercase letter";
    if (!preg_match('/\d/', $pw)) $missing[] = "one number";
    if (!preg_match('/[^A-Za-z0-9\s]/', $pw)) $missing[] = "one symbol";
    return $missing ? "Password needs " . implode(', ', $missing) . "." : '';
}

// ---- Input validation ----------------------------------------------------
// An endpoint collects every bad field as $errors[field] = message, with the
// field names the form uses, and calls validation_fail($errors) once, so the
// form can mark all of them together (apiFieldErrors / applyServerErrors in
// ams-react). The v_* checkers return '' when the value is fine.

// Sends {success:false, message:<first error>, errors:{field:msg}, field:<first>}
// and exits.
function validation_fail(array $errors, $status = 422) {
    $field = array_key_first($errors);
    http_response_code($status);
    echo json_encode(["success" => false, "message" => $errors[$field], "errors" => $errors, "field" => $field]);
    exit;
}

function v_str($value, $label, $min, $max, $required = true) {
    if ($value !== null && !is_scalar($value)) return "$label is invalid.";
    $s = trim((string)$value);
    if ($s === '') return $required ? "$label is required." : '';
    $len = mb_strlen($s);
    if ($len < $min) return "$label must be at least $min characters.";
    if ($len > $max) return "$label must be $max characters or fewer.";
    return '';
}

// Money: numeric, within range. The default max fits decimal(10,2).
function v_amount($value, $label, $min = 0, $max = 99999999.99, $allow_zero = true) {
    if ($value === null || (is_string($value) && trim($value) === '')) return "$label is required.";
    if (!is_numeric($value)) return "$label must be a number.";
    $n = (float)$value;
    if ($n == 0 && !$allow_zero) return "$label must be more than zero.";
    if ($n < $min) return "$label cannot be less than " . number_format($min, 2) . ".";
    if ($n > $max) return "$label cannot be more than " . number_format($max, 2) . ".";
    return '';
}

function v_int_range($value, $label, $min, $max) {
    if ($value === null || $value === '') return "$label is required.";
    if (filter_var($value, FILTER_VALIDATE_INT) === false) return "$label must be a whole number.";
    $n = (int)$value;
    if ($n < $min || $n > $max) return "$label must be between $min and $max.";
    return '';
}

// A real calendar date in $format (round-trip, so 2026-02-30 is refused).
function v_date($value, $label, $required = true, $format = 'Y-m-d') {
    if (!is_scalar($value) || trim((string)$value) === '') return $required ? "$label is required." : '';
    $s = trim((string)$value);
    $d = DateTime::createFromFormat('!' . $format, $s);
    return ($d && $d->format($format) === $s) ? '' : "$label is not a valid date.";
}

// A date that exists on the calendar, as 'Y-m-d' (or a 'Y-m-d' date plus a time, for $with_time). Returns the
// normalised 'Y-m-d' / 'Y-m-d H:i:s' string, or null for anything else: free text ("tomorrow"), a rolled-over
// day (2026-11-31 would become 12-01 in PHP) or a loose format.
function real_date($value, $with_time = false) {
    if (!is_string($value)) return null;
    $s = trim($value);
    $formats = $with_time ? ['Y-m-d\TH:i', 'Y-m-d H:i', 'Y-m-d\TH:i:s', 'Y-m-d H:i:s'] : ['Y-m-d'];
    foreach ($formats as $format) {
        $d = DateTime::createFromFormat('!' . $format, $s);
        if ($d && $d->format($format) === $s) return $d->format($with_time ? 'Y-m-d H:i:s' : 'Y-m-d');
    }
    return null;
}

function v_enum($value, $label, array $allowed, $required = true) {
    if ($value === null || $value === '') return $required ? "$label is required." : '';
    return (is_scalar($value) && in_array((string)$value, array_map('strval', $allowed), true)) ? '' : "$label is not a valid choice.";
}

function v_id($value, $label) {
    return (filter_var($value, FILTER_VALIDATE_INT) !== false && (int)$value > 0) ? '' : "$label is missing or invalid.";
}

// Ends every session a user holds, optionally keeping the caller's own token.
// Called whenever a password, role or archive state changes, so the old
// credentials or privileges stop working at once (security audit A-8).
function revoke_user_sessions($conn, $user_id, $keep_token = null) {
    if ($keep_token) {
        $stmt = $conn->prepare("DELETE FROM sessions WHERE user_id = ? AND token <> ?");
        $stmt->bind_param("is", $user_id, $keep_token);
    } else {
        $stmt = $conn->prepare("DELETE FROM sessions WHERE user_id = ?");
        $stmt->bind_param("i", $user_id);
    }
    $stmt->execute();
    $count = $stmt->affected_rows;
    $stmt->close();
    return $count;
}

// Login throttling (A-5 / A-9 / audit M13). Failures are counted three ways:
//  - per account + IP (5): locks out the person guessing, not the account owner
//    — previously 5 failures from anywhere locked the account for everyone, so
//    a script could keep the admin locked out;
//  - per account across all IPs (25): still stops guessing from rotating IPs;
//  - per IP (20): stops one client spraying many accounts.
// A successful login clears only that account's failures. change_password.php
// shares the same counters, so it is not an unthrottled side door.
const LOGIN_MAX_FAILURES_PER_IP = 20;
const LOGIN_MAX_FAILURES_PER_ACCOUNT_IP = 5;
const LOGIN_MAX_FAILURES_PER_ACCOUNT = 25;
const LOGIN_LOCKOUT_MINUTES = 15;

function login_throttle_message($conn, $ip, $email) {
    $email = strtolower(trim((string)$email));
    $stmt = $conn->prepare("SELECT
            SUM(ip_address = ?) AS by_ip,
            SUM(email = ?) AS by_email,
            SUM(email = ? AND ip_address = ?) AS by_email_ip
        FROM login_attempts
        WHERE attempt_time > DATE_SUB(NOW(), INTERVAL " . LOGIN_LOCKOUT_MINUTES . " MINUTE)");
    $stmt->bind_param("ssss", $ip, $email, $email, $ip);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ((int)($row['by_email_ip'] ?? 0) >= LOGIN_MAX_FAILURES_PER_ACCOUNT_IP
        || (int)($row['by_email'] ?? 0) >= LOGIN_MAX_FAILURES_PER_ACCOUNT) {
        return "Too many failed attempts for this account. Please wait " . LOGIN_LOCKOUT_MINUTES . " minutes before trying again.";
    }
    if ((int)($row['by_ip'] ?? 0) >= LOGIN_MAX_FAILURES_PER_IP) {
        return "Too many failed login attempts. Please wait " . LOGIN_LOCKOUT_MINUTES . " minutes before trying again.";
    }
    return null;
}

function record_login_failure($conn, $ip, $email) {
    $email = strtolower(trim((string)$email));
    $stmt = $conn->prepare("INSERT INTO login_attempts (ip_address, email, attempt_time) VALUES (?, ?, NOW())");
    $stmt->bind_param("ss", $ip, $email);
    $stmt->execute();
    $stmt->close();
}

// Password-reset request throttle (policy decided 2026-09-16, docs/planning/todo.md).
// Every request counts, whether or not the email has an account, so the limit
// can't be used to find out which addresses are registered.
const RESET_MAX_REQUESTS_PER_EMAIL = 3;
const RESET_MAX_REQUESTS_PER_IP = 10;
const RESET_WINDOW_MINUTES = 60;

function password_reset_throttle_message($conn, $ip, $email) {
    $email = strtolower(trim((string)$email));
    $stmt = $conn->prepare("SELECT
            SUM(ip_address = ?) AS by_ip,
            SUM(email = ?) AS by_email
        FROM password_reset_requests
        WHERE requested_at > DATE_SUB(NOW(), INTERVAL " . RESET_WINDOW_MINUTES . " MINUTE)");
    $stmt->bind_param("ss", $ip, $email);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ((int)($row['by_email'] ?? 0) >= RESET_MAX_REQUESTS_PER_EMAIL
        || (int)($row['by_ip'] ?? 0) >= RESET_MAX_REQUESTS_PER_IP) {
        return "Too many password reset requests. Please try again in an hour.";
    }
    return null;
}

function record_password_reset_request($conn, $ip, $email) {
    $email = strtolower(trim((string)$email));
    $stmt = $conn->prepare("INSERT INTO password_reset_requests (email, ip_address, requested_at) VALUES (?, ?, NOW())");
    $stmt->bind_param("ss", $email, $ip);
    $stmt->execute();
    $stmt->close();
    // Only the last window is ever counted; older rows are just clutter.
    $conn->query("DELETE FROM password_reset_requests WHERE requested_at < DATE_SUB(NOW(), INTERVAL 1 DAY)");
}

// Generic counter for public forms with no account to throttle on (audit M13),
// backed by rate_limit_events. $key is usually the client IP.
const REGISTRATION_MAX_PER_IP = 5;
const REGISTRATION_WINDOW_MINUTES = 60;

function rate_limit_exceeded($conn, $action, $key, $max, $window_minutes) {
    try {
        $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM rate_limit_events
                                WHERE action = ? AND rate_key = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)");
        $stmt->bind_param("ssi", $action, $key, $window_minutes);
        $stmt->execute();
        $count = (int)($stmt->get_result()->fetch_assoc()['c'] ?? 0);
        $stmt->close();
    } catch (mysqli_sql_exception $e) {
        return false; // table not migrated yet: don't block the form
    }
    return $count >= $max;
}

function rate_limit_record($conn, $action, $key) {
    try {
        $stmt = $conn->prepare("INSERT INTO rate_limit_events (action, rate_key) VALUES (?, ?)");
        $stmt->bind_param("ss", $action, $key);
        $stmt->execute();
        $stmt->close();
        // Only recent rows are ever counted; older ones are clutter.
        $conn->query("DELETE FROM rate_limit_events WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)");
    } catch (mysqli_sql_exception $e) {
        // table not migrated yet
    }
}

// ---- Guest chat links ----------------------------------------------------
// A guest inquiry chat is opened with inquiries.guest_token, kept in the
// guest's browser and only ever sent in a header. To reopen it on another
// device the guest gets a one-time code by email (guest_chat_resume.php); only
// its sha256 is stored, it expires after GUEST_CHAT_LINK_DAYS and works once.
const GUEST_CHAT_LINK_DAYS = 7;

// Issues a code for the thread and returns it. Unused older codes for the
// thread stop working, so at most one link is live at a time.
function guest_chat_issue_link($conn, $inquiry_id) {
    $code = bin2hex(random_bytes(32));
    $hash = hash('sha256', $code);
    $old = $conn->prepare("UPDATE guest_chat_links SET used_at = NOW() WHERE inquiry_id = ? AND used_at IS NULL");
    $old->bind_param("i", $inquiry_id);
    $old->execute();
    $old->close();
    $days = GUEST_CHAT_LINK_DAYS;
    $ins = $conn->prepare("INSERT INTO guest_chat_links (inquiry_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))");
    $ins->bind_param("isi", $inquiry_id, $hash, $days);
    $ins->execute();
    $ins->close();
    return $code;
}

// Emails a link to the address stored on the guest thread (never one taken
// from the request). $kind: 'resume' (asked for a link, or a repeat inquiry)
// or 'reply' (the admin answered). Never throws: a mail problem is logged and
// must not undo a saved message or inquiry. Returns true when sent.
function guest_chat_email_link($conn, $inquiry_id, $kind = 'resume') {
    try {
        $q = $conn->prepare("SELECT guest_name, guest_email FROM inquiries WHERE id = ? AND thread_type = 'guest'");
        $q->bind_param("i", $inquiry_id);
        $q->execute();
        $thread = $q->get_result()->fetch_assoc();
        $q->close();
        if (!$thread || !filter_var($thread['guest_email'] ?? '', FILTER_VALIDATE_EMAIL)) return false;

        require_once __DIR__ . '/api/services/send_email.php';
        require_once __DIR__ . '/api/services/frontend_origin.php';
        $code = guest_chat_issue_link($conn, (int)$inquiry_id);
        $link = rtrim(password_reset_frontend_origin(null, $_SERVER), '/') . '/inquire?resume=' . rawurlencode($code);

        $name = trim((string)$thread['guest_name']) ?: 'there';
        if ($kind === 'reply') {
            $subject = 'You have a reply about your inquiry';
            $intro = 'The apartment management replied to your inquiry. Open the conversation to read it and answer.';
        } else {
            $subject = 'Continue your conversation with the apartment management';
            $intro = 'Use the button below to open your inquiry conversation on this device.';
        }
        $e = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
        $html = '<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b"><div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden"><div style="background:#3b4276;padding:26px;text-align:center;color:white;font-size:24px;font-weight:bold">AMS</div><div style="padding:32px">'
            . '<p>Hi ' . $e($name) . ',</p><p>' . $e($intro) . '</p>'
            . '<p style="text-align:center;margin:28px"><a href="' . $e($link) . '" style="background:#6366f1;color:white;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:bold">Continue the conversation</a></p>'
            . '<p style="font-size:13px;color:#64748b">This link works once and expires in ' . GUEST_CHAT_LINK_DAYS . ' days. If you did not send an inquiry, you can ignore this email.</p>'
            . '</div></div></body></html>';
        return (bool)send_email($conn, $thread['guest_email'], $subject, $html, 'guest_chat', null);
    } catch (Throwable $e) {
        error_log('guest_chat_email_link: ' . $e->getMessage());
        return false;
    }
}

function clear_login_failures($conn, $email) {
    $email = strtolower(trim((string)$email));
    $stmt = $conn->prepare("DELETE FROM login_attempts WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $stmt->close();
}

// Notification types that form the admin's action queue. An admin may read and
// act on these regardless of which admin row they were addressed to; every
// other notification belongs only to its own user_id.
const ADMIN_QUEUE_NOTIFICATION_TYPES = [
    'rent_application', 'maintenance_request', 'cctv_request', 'parking_reservation',
    'service_request', 'inquiry', 'occupancy_request', 'lease_extension_request',
    'payment_verification', 'visitor_registration', 'visitor_overstay',
    'household_request', 'unit_waitlist',
    // Audit M12: a move-out notice needs an admin to schedule clearance, and a
    // cash-on-hand declaration needs an admin to expect the tenant at the desk
    // — neither reached the queue before.
    'move_out_request', 'cash_payment_declared',
    // Refund requests wait for an admin decision.
    'refund_request', 'deposit_review',
    // Follow-up monitor: an overdue tenant, or an applicant with documents outstanding.
    'payment_followup', 'document_followup'
];

// Age categories (infant / toddler / minor ...), edited in Settings → Minors & Pets.
// Returns [['key','label','min_age','max_age','rule','rule_fil'], ...] ordered by min_age.
function age_categories($conn) {
    $res = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'age_categories'");
    $row = $res ? $res->fetch_assoc() : null;
    $cats = $row ? json_decode($row['setting_value'], true) : [];
    if (!is_array($cats)) return [];
    usort($cats, fn($a, $b) => (int)$a['min_age'] <=> (int)$b['min_age']);
    return $cats;
}

// Youngest age allowed anywhere in the building (children below it are refused).
// 0 = no building-wide limit, the default since the per-floor rule below
// replaced the old "no children under 12".
function min_household_age($conn) {
    $res = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'min_household_age'");
    $row = $res ? $res->fetch_assoc() : null;
    return ($row && ctype_digit((string)$row['setting_value'])) ? (int)$row['setting_value'] : 0;
}

// Floors where young children may not live (the 3rd floor, because of the
// stairs), and the age limit: ['floors' => ['3F'], 'below_age' => 5].
// Edited in Settings -> Minors & Pets. An empty list means no floor is restricted.
function child_floor_restriction($conn) {
    $floors = ['3F'];
    $below = 5;
    $res = $conn->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('child_restricted_floors', 'child_restricted_below_age')");
    while ($res && ($row = $res->fetch_assoc())) {
        if ($row['setting_key'] === 'child_restricted_floors') {
            $decoded = json_decode((string)$row['setting_value'], true);
            if (is_array($decoded)) $floors = array_values(array_filter($decoded, 'is_string'));
        } elseif (ctype_digit((string)$row['setting_value'])) {
            $below = (int)$row['setting_value'];
        }
    }
    return ['floors' => $floors, 'below_age' => $below];
}

// Display name of a deposit_deductions.category.
function deposit_deduction_label($category) {
    return [
        'damage' => 'Damage', 'electricity' => 'Electricity', 'water' => 'Water',
        'unpaid_rent' => 'Unpaid rent', 'other' => 'Other', 'forfeiture' => 'Deposit withheld',
    ][$category] ?? 'Other';
}

// Itemized move-out deductions for several applications in one query:
// [app_id => [['category','label','reason','amount','created_at'], ...]].
function deposit_deductions_for($conn, array $app_ids) {
    $ids = array_values(array_unique(array_filter(array_map('intval', $app_ids))));
    if (!$ids) return [];
    $res = $conn->query("SELECT rent_application_id, category, reason, amount, created_at FROM deposit_deductions
                         WHERE rent_application_id IN (" . implode(',', $ids) . ") ORDER BY id");
    $out = [];
    while ($res && ($r = $res->fetch_assoc())) {
        $out[(int)$r['rent_application_id']][] = [
            'category' => $r['category'], 'label' => deposit_deduction_label($r['category']),
            'reason' => $r['reason'], 'amount' => round((float)$r['amount'], 2), 'created_at' => $r['created_at'],
        ];
    }
    return $out;
}

// Invoice adjustment history (adjust_invoice.php), admin only, in one query:
// [invoice_id => [['id','admin','reason','old_total','new_total','changes','created_at'], ...]],
// newest first. $user_id limits it to one tenant's invoices (null = all).
function invoice_adjustments_for($conn, $user_id = null) {
    $sql = "SELECT a.id, a.invoice_id, a.reason, a.old_total, a.new_total, a.changes, a.created_at,
                   TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))) AS admin_name
              FROM invoice_adjustments a
              LEFT JOIN users u ON u.id = a.admin_id" .
           ($user_id !== null ? " JOIN invoices i ON i.id = a.invoice_id WHERE i.user_id = ?" : "") .
           " ORDER BY a.id DESC";
    $stmt = $conn->prepare($sql);
    if (!$stmt) return [];
    if ($user_id !== null) {
        $uid = (int)$user_id;
        $stmt->bind_param('i', $uid);
    }
    $stmt->execute();
    $res = $stmt->get_result();
    $out = [];
    while ($res && ($r = $res->fetch_assoc())) {
        $changes = json_decode((string)$r['changes'], true);
        $out[$r['invoice_id']][] = [
            'id' => (int)$r['id'],
            'admin' => $r['admin_name'] !== '' ? $r['admin_name'] : null,
            'reason' => $r['reason'],
            'old_total' => round((float)$r['old_total'], 2),
            'new_total' => round((float)$r['new_total'], 2),
            'changes' => is_array($changes) ? $changes : new stdClass(),
            'created_at' => $r['created_at'],
        ];
    }
    $stmt->close();
    return $out;
}

// "3F" -> "3rd floor"; any other label -> "floor <label>".
function floor_display_name($floor) {
    $floor = trim((string)$floor);
    if (preg_match('/^(\d+)F$/i', $floor, $m)) {
        $n = (int)$m[1];
        $suffix = ($n % 100 >= 11 && $n % 100 <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][$n % 10] ?? 'th');
        return $n . $suffix . ' floor';
    }
    return 'floor ' . $floor;
}

// The age rule for one household (rent application): null when a member of this
// age may live there, otherwise the refusal message. Used when the tenant asks
// to add a member and again when an admin approves the request.
function household_age_refusal($conn, $rent_application_id, $age) {
    if ($age === null) return null;
    $age = (int)$age;
    $min_age = min_household_age($conn);
    if ($age < $min_age) return "Children under {$min_age} are not allowed to live in the apartment.";

    $rule = child_floor_restriction($conn);
    if ($rule['below_age'] <= 0 || !$rule['floors'] || $age >= $rule['below_age']) return null;
    $stmt = $conn->prepare("SELECT rm.floor FROM rent_applications ra JOIN rooms rm ON rm.id = ra.room_name WHERE ra.id = ?");
    $stmt->bind_param("i", $rent_application_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $floor = $row ? (string)$row['floor'] : '';
    if ($floor !== '' && in_array($floor, $rule['floors'], true)) {
        return "Children under {$rule['below_age']} cannot live on the " . floor_display_name($floor) . " because of the stairs.";
    }
    return null;
}

// The category an age falls into, or null when it is outside every range (e.g. adults).
function age_category_for($conn, $age) {
    foreach (age_categories($conn) as $c) {
        if ($age >= (int)$c['min_age'] && $age <= (int)$c['max_age']) return $c['key'];
    }
    return null;
}

// Fixed monthly rent for a floor (Settings → Floor Rent), or null when none is set.
function floor_rate_for($conn, $floor) {
    $res = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'floor_rates'");
    $row = $res ? $res->fetch_assoc() : null;
    $rates = $row ? json_decode($row['setting_value'], true) : [];
    $floor = trim((string)$floor);
    return (is_array($rates) && isset($rates[$floor]) && is_numeric($rates[$floor])) ? round((float)$rates[$floor], 2) : null;
}

// ── Refund requests ──
// Advance rent, overpayments and cancelled never-occupied move-in invoices.
// A refundable security deposit comes back at move-out as a 'deposit' request
// (settle_deposit()); a deposit paid before move-in can be included in an
// application-cancellation refund review.
// Admin actions: approve / reject / request_info / mark_refunded. Tenant
// actions: reply (answers an info request) / cancel.
const REFUND_TRANSITIONS = [
    'Pending Review' => ['Approved', 'Rejected', 'Info Requested', 'Cancelled'],
    'Info Requested' => ['Pending Review', 'Cancelled'],
    'Approved'       => ['Refunded'],
];
const REFUND_OPEN_STATUSES = ['Pending Review', 'Info Requested', 'Approved'];

// What a tenant could still ask back, net of requests that already hold it.
// advance: credits in refund-due/available not tied to a request.
// overpayment: paid invoices whose recorded payments exceed the bill.
function refund_eligible($conn, $user_id) {
    $user_id = (int)$user_id;
    $advance = 0.0;
    $stmt = $conn->prepare("SELECT COALESCE(SUM(amount),0) FROM advance_credits WHERE user_id = ? AND status IN ('refund-due','available') AND refund_request_id IS NULL");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $stmt->bind_result($advance);
    $stmt->fetch();
    $stmt->close();

    $over = [];
    $stmt = $conn->prepare("SELECT i.id, i.billing_period, i.total_amount, COALESCE(SUM(t.amount),0) AS paid
        FROM invoices i JOIN payment_transactions t ON t.invoice_id = i.id
        WHERE i.user_id = ? AND i.status = 'paid'
        GROUP BY i.id, i.billing_period, i.total_amount
        HAVING paid > i.total_amount");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($r = $res->fetch_assoc()) {
        $held = 0.0;
        $q = $conn->prepare("SELECT COALESCE(SUM(amount),0) FROM refund_requests WHERE invoice_id = ? AND type <> 'advance' AND status IN ('Pending Review','Info Requested','Approved','Refunded')");
        $q->bind_param("s", $r['id']);
        $q->execute();
        $q->bind_result($held);
        $q->fetch();
        $q->close();
        $left = round((float)$r['paid'] - (float)$r['total_amount'] - (float)$held, 2);
        if ($left > 0) $over[] = ['invoiceId' => $r['id'], 'label' => $r['billing_period'], 'amount' => $left];
    }
    $stmt->close();
    return ['advance' => round((float)$advance, 2), 'overpayments' => $over];
}

// Inserts a refund request with its 'raised' event; throws on failure. The
// caller owns the transaction and the credit holds. Admin-queue notice is
// separate (notify_refund_raised) so it only fires after commit.
function insert_refund_request($conn, $user_id, $app_id, $type, $invoice_id, $amount, $reason, $actor_id, $actor_role) {
    $ins = $conn->prepare("INSERT INTO refund_requests (user_id, rent_application_id, type, invoice_id, amount, reason, raised_by, raised_by_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    $ins->bind_param("iissdsis", $user_id, $app_id, $type, $invoice_id, $amount, $reason, $actor_id, $actor_role);
    if (!$ins->execute()) throw new Exception("Could not save the refund request.");
    $rid = (int)$conn->insert_id;
    $ins->close();
    $ev = $conn->prepare("INSERT INTO refund_request_events (refund_request_id, actor_id, actor_role, action, message) VALUES (?, ?, ?, 'raised', ?)");
    $ev->bind_param("iiss", $rid, $actor_id, $actor_role, $reason);
    $ev->execute();
    $ev->close();
    return $rid;
}

function notify_refund_raised($conn, $rid, $amount, $label) {
    notify_admins_queue($conn, 'refund_request', $rid, 'Refund Request',
        "A refund of ₱" . number_format($amount, 2) . " for $label needs review.");
}

// ── Security deposit settlement ──
// A contract is deposit_refundable = 1 (copied from the deposit_refundable_default
// setting when it is issued) or 0 (applied to rent / bills / damage). Both
// move-out paths (clearance in update_tenant_status.php, termination in
// update_contract_status.php) settle through settle_deposit(), so they cannot drift.

function deposit_refundable_default($conn) {
    return in_array((string)get_setting($conn, 'deposit_refundable_default', '1'), ['1', 'true'], true) ? 1 : 0;
}

// Days after the clearance within which a refundable deposit is paid back.
function deposit_refund_days($conn) {
    $n = get_setting($conn, 'deposit_refund_days', '30');
    return ctype_digit((string)$n) ? max(1, min(90, (int)$n)) : 30;
}

// Why a refundable deposit is withheld. $ctx: 'terminate' (ended by Management
// for cause) or 'move_out' with 'prior_status' (the application status before
// the clearance), 'move_out_date' (requested date, else null) and 'lease_end'.
function deposit_forfeiture_reasons(array $ctx) {
    $reasons = [];
    if (($ctx['kind'] ?? '') === 'terminate') {
        return ['Contract terminated by Management for a breach'];
    }
    if (($ctx['prior_status'] ?? '') === 'active') $reasons[] = 'No move-out notice was given';
    $left = !empty($ctx['move_out_date']) ? $ctx['move_out_date'] : date('Y-m-d');
    if (!empty($ctx['lease_end']) && $left < $ctx['lease_end']) {
        $reasons[] = 'Moved out before the contract end date (' . $ctx['lease_end'] . ')';
    }
    return $reasons;
}

// Settles the held deposit of one contract. The caller owns the transaction.
//   $opts: damage, utility (deductions entered at clearance), kind
//   ('move_out' | 'terminate'), prior_status, move_out_date, set_expired
//   (clearance marks the contract expired), waive_reason (admin keeps the deposit
//   refundable despite a forfeiture; recorded in the log), admin_id, user_id.
// Returns ['contract_id', 'deposit', 'open_total', 'balance', 'status', 'refundable',
//   'refund_amount', 'forfeited', 'forfeit_reasons', 'refund_id'] or null when the
//   contract is not settled here (none, or already settled). refund_id is set when
//   a refund request was opened: send notify_refund_raised() after commit.
function settle_deposit($conn, $app_id, $contract_id, array $opts) {
    $app_id = (int)$app_id;
    if ($contract_id !== null) {
        $q = $conn->prepare("SELECT id, deposit_amount, deposit_status, deposit_refundable, lease_end FROM lease_contracts WHERE id = ? AND deposit_status IN ('Held', 'Pending') FOR UPDATE");
        $q->bind_param("s", $contract_id);
    } else {
        $q = $conn->prepare("SELECT id, deposit_amount, deposit_status, deposit_refundable, lease_end FROM lease_contracts
                             WHERE rent_application_id = ? AND status IN ('active', 'expired', 'eviction-pending') AND deposit_status IN ('Held', 'Pending')
                             ORDER BY generated_at DESC LIMIT 1 FOR UPDATE");
        $q->bind_param("i", $app_id);
    }
    $q->execute();
    $c = $q->get_result()->fetch_assoc();
    $q->close();
    if (!$c) return null;

    $damage = round((float)($opts['damage'] ?? 0), 2);
    $utility = round((float)($opts['utility'] ?? 0), 2);
    // Only a deposit that was actually paid ('Held') can cover anything or be returned.
    $deposit = $c['deposit_status'] === 'Held' ? round((float)$c['deposit_amount'], 2) : 0.0;
    $refundable = (int)$c['deposit_refundable'] === 1 && $deposit > 0;

    $o = $conn->prepare("SELECT COALESCE(SUM(" . invoice_balance_sql('i') . "), 0) AS open_total FROM invoices i WHERE i.rent_application_id = ? AND " . invoice_owed_where_sql('i'));
    $o->bind_param("i", $app_id);
    $o->execute();
    $open_total = round((float)$o->get_result()->fetch_assoc()['open_total'], 2);
    $o->close();

    $consumed = round($open_total + $damage + $utility, 2);
    $balance = round($consumed - $deposit, 2);
    $remaining = max(0.0, round($deposit - $consumed, 2));

    $reasons = [];
    $refund = 0.0;
    $forfeited = 0.0;
    if ($refundable) {
        $reasons = deposit_forfeiture_reasons([
            'kind' => $opts['kind'] ?? 'move_out', 'prior_status' => $opts['prior_status'] ?? '',
            'move_out_date' => $opts['move_out_date'] ?? null, 'lease_end' => $c['lease_end'],
        ]);
        if ($reasons && trim((string)($opts['waive_reason'] ?? '')) === '') {
            $forfeited = $remaining;
        } else {
            $refund = $remaining;
        }
        $status = $refund > 0 ? 'Refund Pending' : ($forfeited > 0 ? 'Forfeited' : 'Applied to Bills/Damages');
    } else {
        $status = ($damage > 0 || $utility > 0 || $open_total > 0) ? 'Applied to Bills/Damages' : 'Applied to Rent';
    }
    if ($c['deposit_status'] !== 'Held') $status = 'Not Collected';

    $set_expired = !empty($opts['set_expired']) ? ", status = 'expired'" : '';
    $u = $conn->prepare("UPDATE lease_contracts SET deposit_status = ?, damage_deduction = ?, utility_deduction = ?, refund_amount = ?, refund_date = CURDATE()$set_expired
                         WHERE id = ? AND deposit_status IN ('Held', 'Pending')");
    $u->bind_param("sddds", $status, $damage, $utility, $refund, $c['id']);
    $u->execute();
    $won = $u->affected_rows > 0;
    $u->close();
    if (!$won) return null;

    if ($forfeited > 0) {
        $why = mb_substr(implode('; ', $reasons), 0, 255);
        $f = $conn->prepare("INSERT INTO deposit_deductions (rent_application_id, contract_id, category, reason, amount, recorded_by) VALUES (?, ?, 'forfeiture', ?, ?, ?)");
        $admin = (int)($opts['admin_id'] ?? 0) ?: null;
        $f->bind_param("issdi", $app_id, $c['id'], $why, $forfeited, $admin);
        if (!$f->execute()) throw new Exception("Could not record the forfeited deposit.");
        $f->close();
    }

    $refund_id = null;
    $user_id = (int)($opts['user_id'] ?? 0);
    if ($refund > 0 && $user_id > 0) {
        $due = date('M j, Y', strtotime('+' . deposit_refund_days($conn) . ' days'));
        $why = "Security deposit returned after move-out, less deductions. To be paid back by $due.";
        $refund_id = insert_refund_request($conn, $user_id, $app_id, 'deposit', null, $refund, $why, (int)($opts['admin_id'] ?? 0), 'admin');
    }

    return [
        'contract_id' => $c['id'], 'deposit' => $deposit, 'open_total' => $open_total, 'balance' => $balance,
        'status' => $status, 'refundable' => $refundable, 'refund_amount' => $refund, 'forfeited' => $forfeited,
        'forfeit_reasons' => $reasons, 'refund_id' => $refund_id,
    ];
}

// Money already paid on a rent application's invoices, for a rejection after
// approval: [['invoiceId','label','amount']] (what the payments recorded, or
// the invoice total when none were itemised), minus anything a refund request
// already holds. Invoices settled from an advance credit are not new money.
function paid_invoices_for_application($conn, $app_id, $include_existing = false) {
    $app_id = (int)$app_id;
    $out = [];
    // Paid invoices, and any invoice with parts received (installments) whatever
    // its status now: those parts are refunded too.
    $existing_filter = $include_existing ? "" : "AND NOT EXISTS (SELECT 1 FROM refund_requests r WHERE r.invoice_id = i.id AND r.status IN ('Pending Review','Info Requested','Approved','Refunded'))";
    $stmt = $conn->prepare("SELECT i.id, i.billing_period, i.total_amount, i.status, i.amount_paid, i.security_deposit,
            (SELECT COALESCE(SUM(t.amount),0) FROM payment_transactions t WHERE t.invoice_id = i.id) AS tx_paid
        FROM invoices i
        WHERE i.rent_application_id = ? AND (i.status = 'paid' OR i.amount_paid > 0)
          $existing_filter
          AND (i.payment_method IS NULL OR i.payment_method <> 'Advance credit')");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($r = $res->fetch_assoc()) {
        $amt = $r['status'] !== 'paid' ? (float)$r['amount_paid'] : ((float)$r['tx_paid'] > 0 ? (float)$r['tx_paid'] : (float)$r['total_amount']);
        if ($amt > 0) $out[] = ['invoiceId' => $r['id'], 'label' => $r['billing_period'], 'amount' => round($amt, 2), 'depositAmount' => min((float)$r['security_deposit'], $amt)];
    }
    $stmt->close();
    return $out;
}

// What happened to a tenant's security deposit at move-out, for the tenant's own
// "Your security deposit" card and for a review request: their latest settled
// contract with the itemized deductions, the refund, and whether a review can
// still be asked for (inside deposit_refund_days of the settlement, something
// was kept, and none was asked for yet). Null when nothing was settled yet.
function deposit_statement_for_user($conn, $user_id) {
    $user_id = (int)$user_id;
    $q = $conn->prepare("SELECT lc.id AS contract_id, lc.rent_application_id AS app_id, lc.deposit_amount, lc.deposit_status, lc.deposit_refundable,
                                lc.refund_amount, lc.refund_date, lc.damage_deduction, lc.utility_deduction
                         FROM lease_contracts lc JOIN rent_applications ra ON ra.id = lc.rent_application_id
                         WHERE ra.user_id = ? AND lc.deposit_status NOT IN ('Pending', 'Held', 'Not Collected') AND lc.refund_date IS NOT NULL
                         ORDER BY lc.refund_date DESC, lc.generated_at DESC LIMIT 1");
    $q->bind_param("i", $user_id);
    $q->execute();
    $c = $q->get_result()->fetch_assoc();
    $q->close();
    if (!$c) return null;

    $app_id = (int)$c['app_id'];
    $items = deposit_deductions_for($conn, [$app_id])[$app_id] ?? [];
    $deposit = round((float)$c['deposit_amount'], 2);
    $refund = round((float)$c['refund_amount'], 2);
    $forfeited = 0.0;
    foreach ($items as $it) if ($it['category'] === 'forfeiture') $forfeited += (float)$it['amount'];

    $r = $conn->prepare("SELECT id, message, status, outcome, adjusted_amount, admin_response, created_at, resolved_at
                         FROM deposit_reviews WHERE rent_application_id = ? ORDER BY id DESC LIMIT 1");
    $r->bind_param("i", $app_id);
    $r->execute();
    $review = $r->get_result()->fetch_assoc() ?: null;
    $r->close();

    $window_end = date('Y-m-d', strtotime($c['refund_date'] . ' +' . deposit_refund_days($conn) . ' days'));
    $kept = $deposit > 0 && ($items || ((int)$c['deposit_refundable'] === 1 && $refund < $deposit));
    return [
        'applicationId' => $app_id, 'contractId' => $c['contract_id'], 'deposit' => $deposit,
        'status' => $c['deposit_status'], 'refundable' => (int)$c['deposit_refundable'] === 1,
        'refundAmount' => $refund, 'settledOn' => $c['refund_date'], 'forfeited' => round($forfeited, 2),
        'deductions' => $items, 'review' => $review, 'reviewWindowEnds' => $window_end,
        'canRequestReview' => $kept && date('Y-m-d') <= $window_end && !$review, // one review per settlement
    ];
}

// Flat fee (₱) kept from the refund when a tenant asks to cancel an application
// they have already paid for (request_application_cancellation.php). The admin
// can still approve a different amount up to what was paid.
function cancellation_fee($conn) {
    $v = get_setting($conn, 'cancellation_fee', '0');
    return is_numeric($v) ? max(0.0, round((float)$v, 2)) : 0.0;
}

// A cancellation an admin makes at the tenant's request starts its refund reason
// with this. Admin rejections and admin cancellations are both raised_by_role
// 'admin', so get_refund_requests.php tells them apart by the prefix.
const ADMIN_CANCELLATION_REASON_PREFIX = "Application cancelled by management at the tenant's request";

// Opens the cancellation refund request for the move-in payment of an application
// that is cancelled before move-in: either the tenant's own request
// (request_application_cancellation.php, $actor_role 'user') or an admin
// cancelling at their request (update_tenant_status.php, 'admin'). The one place
// the cancellation fee is worked out: it is kept out of `amount`, while
// paid_amount records everything paid so the admin can still approve up to it.
// $apply_fee false asks back everything. Runs inside the caller's transaction and
// locks the invoice. Returns ['state' => ...] with
//   'opened'        a request was inserted (id, refund, fee, paid, invoice)
//   'none'          no move-in payment to refund (message)
//   'exists'        a request is already open for it (message)
//   'fee_takes_all' the fee is as much as was paid, nothing opened (fee, paid, invoice, message)
function open_cancellation_refund($conn, $app_id, $user_id, $actor_id, $actor_role, $reason, $payout = null, $apply_fee = true) {
    $app_id = (int)$app_id;
    $inv = $conn->prepare("SELECT id, billing_period, total_amount, security_deposit, amount_paid, status,
            (SELECT COALESCE(SUM(t.amount), 0) FROM payment_transactions t WHERE t.invoice_id = invoices.id) AS tx_paid
        FROM invoices WHERE rent_application_id = ? AND security_deposit > 0 AND amount_paid > 0 AND status IN ('paid','pending','pending-verification','overdue','processing') ORDER BY created_at ASC LIMIT 1 FOR UPDATE");
    $inv->bind_param('i', $app_id);
    $inv->execute();
    $invoice = $inv->get_result()->fetch_assoc();
    $inv->close();
    if (!$invoice) return ['state' => 'none', 'message' => 'No move-in payment was found. Use the unpaid application cancellation option.'];

    $paid = round((float)$invoice['amount_paid'], 2);
    if ($invoice['status'] === 'paid') {
        $paid = (float)$invoice['tx_paid'] > 0 ? round((float)$invoice['tx_paid'], 2) : round((float)$invoice['total_amount'], 2);
    }
    $paid = min($paid, (float)$invoice['total_amount']);
    if ($paid <= 0) return ['state' => 'none', 'message' => 'No refundable payment was found.'];

    $existing = $conn->prepare("SELECT id, raised_by_role FROM refund_requests WHERE invoice_id = ? AND type = 'rejected_application' AND status IN ('Pending Review','Info Requested','Approved','Refunded') LIMIT 1 FOR UPDATE");
    $existing->bind_param('s', $invoice['id']);
    $existing->execute();
    $already = $existing->get_result()->fetch_assoc();
    $existing->close();
    if ($already) {
        return ['state' => 'exists', 'invoice' => $invoice['id'], 'message' => $already['raised_by_role'] === 'admin'
            ? 'Management has already opened a refund request for this move-in payment.'
            : 'A cancellation refund request already exists for this move-in payment.'];
    }

    $fee = $apply_fee ? min(cancellation_fee($conn), $paid) : 0.0;
    $refund = round($paid - $fee, 2);
    if ($refund <= 0) {
        return ['state' => 'fee_takes_all', 'fee' => $fee, 'paid' => $paid, 'invoice' => $invoice['id'],
            'message' => 'The cancellation fee of ₱' . number_format($fee, 2) . ' is as much as you paid, so nothing would be refunded. Please contact management.'];
    }

    $prefix = $actor_role === 'user' ? 'Application cancellation requested by applicant: ' : ADMIN_CANCELLATION_REASON_PREFIX . ': ';
    $why = $prefix . $reason . ($fee > 0 ? ' (cancellation fee of ₱' . number_format($fee, 2) . ' kept from the ₱' . number_format($paid, 2) . ' paid)' : '');
    $status = 'Pending Review';
    $deposit = min((float)$invoice['security_deposit'], $paid);
    $ins = $conn->prepare("INSERT INTO refund_requests (user_id, rent_application_id, type, invoice_id, amount, reason, status, raised_by, raised_by_role, payout_destination, paid_amount, deposit_amount) VALUES (?, ?, 'rejected_application', ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $ins->bind_param('iisdssissdd', $user_id, $app_id, $invoice['id'], $refund, $why, $status, $actor_id, $actor_role, $payout, $paid, $deposit);
    if (!$ins->execute()) throw new Exception('Could not create the cancellation refund request.');
    $rid = (int)$conn->insert_id;
    $ins->close();
    $event = $conn->prepare("INSERT INTO refund_request_events (refund_request_id, actor_id, actor_role, action, message) VALUES (?, ?, ?, 'raised', ?)");
    $event->bind_param('iiss', $rid, $actor_id, $actor_role, $why);
    $event->execute();
    $event->close();
    return ['state' => 'opened', 'id' => $rid, 'refund' => $refund, 'fee' => $fee, 'paid' => $paid, 'invoice' => $invoice['id']];
}

// Raises one refund request per paid invoice of an application that is being
// rejected or cancelled after approval. Runs inside the caller's transaction.
// Returns the list of [rid, amount] raised; the caller notifies after commit.
// $prefix words the reason; $skip lists invoice ids to leave out (a move-in
// payment whose cancellation fee used all of it).
function raise_rejection_refunds($conn, $user_id, $app_id, $reason, $actor_id, $prefix = "Application rejected by admin after payment: ", $skip = []) {
    $raised = [];
    foreach (paid_invoices_for_application($conn, $app_id) as $p) {
        if (in_array($p['invoiceId'], $skip, true)) continue;
        $why = $prefix . $reason;
        $rid = insert_refund_request($conn, (int)$user_id, (int)$app_id, 'rejected_application', $p['invoiceId'], $p['amount'], $why, (int)$actor_id, 'admin');
        $meta = $conn->prepare("UPDATE refund_requests SET paid_amount = ?, deposit_amount = ? WHERE id = ?");
        $meta->bind_param('ddi', $p['amount'], $p['depositAmount'], $rid); $meta->execute(); $meta->close();
        $raised[] = ['id' => $rid, 'amount' => $p['amount']];
    }
    return $raised;
}

function admin_queue_types_sql() {
    return "('" . implode("','", ADMIN_QUEUE_NOTIFICATION_TYPES) . "')";
}

// ── In-app notifications (checklist Module 6) ──
//
// Status vocabulary: 'Pending' means "an admin still has to act on this" and is
// used only for ADMIN_QUEUE_NOTIFICATION_TYPES rows (plus a tenant's own open
// occupancy / lease request). Everything informational is 'Resolved'. Rows used
// to default to 'Pending', which made announcements and reminders look like open
// requests, so a tenant's "Clear all" never removed them.

// Categories a user may switch off (checklist 6.8). Types not listed here —
// overdue alerts, billing, payments, application and maintenance updates,
// contract and move-out notices, request decisions — are always delivered.
const NOTIFICATION_PREF_CATEGORIES = [
    'announcements'     => ['label' => 'Building announcements',             'types' => ['info', 'warning', 'action']],
    'payment_reminders' => ['label' => 'Rent due reminders (before due date)', 'types' => ['rent_due']],
    'service_updates'   => ['label' => 'Service, CCTV and parking updates',  'types' => ['service_status', 'cctv_request', 'parking_reservation']],
    'visitor_updates'   => ['label' => 'Visitor updates',                    'types' => ['visitor_log']],
    'inquiry_updates'   => ['label' => 'Inquiry and unit hold updates',      'types' => ['inquiry_update', 'unit_reservation', 'waitlist_update']],
];

function notification_pref_category_for_type($type) {
    foreach (NOTIFICATION_PREF_CATEGORIES as $key => $cat) {
        if (in_array($type, $cat['types'], true)) return $key;
    }
    return null;
}

// The single insert path for notifications. Returns the new id, or 0 when the
// recipient has muted that category. Admin queue rows ignore preferences.
function create_notification($conn, $user_id, $type, $title, $message, $status = 'Resolved', $metadata = null) {
    $user_id = (int)$user_id;
    if ($user_id <= 0) return 0;

    $category = notification_pref_category_for_type($type);
    if ($category !== null && $status !== 'Pending') {
        $pref = $conn->prepare("SELECT in_app_enabled FROM notification_preferences WHERE user_id = ? AND category = ?");
        $pref->bind_param("is", $user_id, $category);
        $pref->execute();
        $row = $pref->get_result()->fetch_assoc();
        $pref->close();
        if ($row && !(int)$row['in_app_enabled']) return 0;
    }

    $stmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, metadata_value, is_read) VALUES (?, ?, ?, ?, ?, ?, 0)");
    $stmt->bind_param("isssss", $user_id, $type, $title, $message, $status, $metadata);
    $stmt->execute();
    $id = $stmt->insert_id;
    $stmt->close();
    return $id;
}

// ── Secret settings ───────────────────────────────────────
// system_settings rows whose value is a credential. Three things read this:
// get_system_settings.php (strips them for non-admins, masks them for admins),
// update_system_settings.php (keeps them out of the audit log, and treats a
// masked value as "unchanged"), and nothing else. It lives here because the two
// endpoints used to carry separate copies, which is exactly how they drifted
// apart into two different key sets.
const SECRET_SETTING_KEYS = [
    'paymongo_secret_key',
    'paymongo_webhook_secret',
    'smtp_username',
    'smtp_password',
    'sms_api_key',
];

// ── Who may read which settings (get_system_settings.php) ──
// Three tiers. A logged-out caller gets only PUBLIC_SETTING_KEYS: what Home,
// Preview, the inquiry form, the theme and the language switch read. A tenant
// gets every setting except ADMIN_ONLY_SETTING_KEYS (mail and SMS delivery, the
// notification schedule, sweep timestamps). An admin gets everything, with the
// credentials in SECRET_SETTING_KEYS masked. A key in neither list reaches
// tenants and admins but stays hidden from logged-out callers, so a new setting
// is private until someone decides it is public.
const PUBLIC_SETTING_KEYS = [
    'system_name', 'contact_email', 'contact_phone', 'currency_symbol', 'property_address',
    'home_content', 'preview_hero', 'room_preview_mode', 'upcoming_rooms_enabled',
    'glass_bg_image', 'glass_overlay_opacity', 'glass_blur', 'glass_tint',
    'language_switch_enabled',
    'floor_rates', 'min_household_age', 'child_restricted_floors', 'child_restricted_below_age', 'age_categories',
    'max_occupants_per_unit', 'included_occupants', 'occupant_surcharge_per_person',
    'inquiry_move_in_max_months', 'move_in_min_days', 'move_in_max_days',
];

const ADMIN_ONLY_SETTING_KEYS = [
    'smtp_host', 'smtp_port', 'smtp_from_name', 'smtp_from_email', 'email_driver',
    'sms_provider', 'sms_sender_name', 'sms_sender_approved', 'sms_daily_cap', 'sms_unit_cost',
    'notifications_email_enabled', 'notifications_sms_enabled', 'notifications_dispatch_mode',
    'notifications_quiet_start', 'notifications_quiet_end', 'notification_log_retention_days',
    'notification_sweep_last_run', 'notification_queue_last_run',
    'billing_checks_last_run', 'poll_checks_last_run', 'room_hold_check_last_run',
    'login_otp_enabled', 'email_verification_enabled',
    'paymongo_public_key', 'maintenance_monthly_budget',
    'landlord_name', 'landlord_address', 'landlord_contact',
];

const SECRET_MASK_PREFIX = '••••';

// What an admin's browser receives instead of the real credential. The last
// four characters are kept so a key can still be told apart from another one.
// An empty setting stays empty, or the form would show a mask over nothing.
function mask_secret_value($value) {
    $value = (string)$value;
    if ($value === '') return '';
    return SECRET_MASK_PREFIX . substr($value, -4);
}

// True when the value posted back is the placeholder this API handed out, which
// means the admin did not touch that field and the stored secret must stand.
function is_masked_secret($value) {
    return is_string($value) && strpos($value, SECRET_MASK_PREFIX) === 0;
}

// ── Tenant Glass theme backdrop (Other Settings → Glass Mode) ──
// upload_glass_background.php writes the photo to backend/site_assets/, which is
// public (guests see it on Home) but runs no scripts. setting glass_bg_image
// holds the path relative to backend/, or '' for the app's built-in photo.
// Only names this app generated are accepted, so the stored value can never
// point anywhere else or carry markup into the page's <img src>.
const GLASS_BG_DIR = 'site_assets';
const GLASS_BG_PATH_PATTERN = '/^site_assets\/glass_bg_[0-9]+_[a-f0-9]{8}\.(jpg|jpeg|png|webp)$/';

function glass_bg_absolute_path($relative) {
    return __DIR__ . '/' . $relative;
}

function is_valid_glass_bg_path($relative) {
    return is_string($relative)
        && preg_match(GLASS_BG_PATH_PATTERN, $relative) === 1
        && is_file(glass_bg_absolute_path($relative));
}

// Deletes an uploaded backdrop no longer in use. Only ever a file matching the
// generated pattern, so a bad value cannot reach outside site_assets/.
function delete_glass_bg_file($relative) {
    if (is_string($relative) && preg_match(GLASS_BG_PATH_PATTERN, $relative) === 1) {
        $path = glass_bg_absolute_path($relative);
        if (is_file($path)) @unlink($path);
    }
}

// ── Recent site photos (Glass Mode background, Preview page hero) ──
// Each kind of admin photo lives in site_assets/ as <prefix><ms>_<hex8>.<ext>.
// Its tab offers the last SITE_IMAGE_KEEP uploads to switch back to; the live
// one always stays and counts toward them, older ones are deleted. The kinds
// never touch each other's files (different prefix and pattern).
const SITE_IMAGE_KEEP = 6;
const GLASS_BG_KEEP = SITE_IMAGE_KEEP;
const SITE_IMAGE_KINDS = ['glass', 'preview'];

// [glob prefix, path pattern] for a kind ('glass' or 'preview').
function site_image_kind($kind) {
    return $kind === 'preview'
        ? ['preview_hero_', PREVIEW_HERO_PATH_PATTERN]
        : ['glass_bg_', GLASS_BG_PATH_PATTERN];
}

function is_valid_site_image($kind, $relative) {
    [, $pattern] = site_image_kind($kind);
    return is_string($relative) && preg_match($pattern, $relative) === 1 && is_file(glass_bg_absolute_path($relative));
}

// Deletes one upload of that kind; only a generated name, so nothing outside
// site_assets/ (or of the other kind) can be reached.
function delete_site_image($kind, $relative) {
    [, $pattern] = site_image_kind($kind);
    if (is_string($relative) && preg_match($pattern, $relative) === 1) {
        $path = glass_bg_absolute_path($relative);
        if (is_file($path)) @unlink($path);
    }
}

// When an upload was made, from the number in its generated name: milliseconds,
// or seconds for Glass uploads made before the history existed.
function site_image_stamp_ms($relative) {
    if (!preg_match('/_([0-9]+)_[a-f0-9]{8}\.[a-z]+$/', (string)$relative, $m)) return 0;
    $n = (int)$m[1];
    return $n < 100000000000 ? $n * 1000 : $n;
}
function glass_bg_stamp_ms($relative) { return site_image_stamp_ms($relative); }

// Every stored upload of a kind, newest first.
function site_image_files($kind) {
    [$prefix, $pattern] = site_image_kind($kind);
    $files = [];
    foreach (glob(glass_bg_absolute_path(GLASS_BG_DIR) . '/' . $prefix . '*') ?: [] as $abs) {
        $relative = GLASS_BG_DIR . '/' . basename($abs);
        if (preg_match($pattern, $relative) === 1 && is_file($abs)) $files[] = $relative;
    }
    usort($files, fn($a, $b) => [site_image_stamp_ms($b), $b] <=> [site_image_stamp_ms($a), $a]);
    return $files;
}
function glass_bg_files() { return site_image_files('glass'); }

// The stored uploads for the tab, newest first, the live one marked.
function site_image_history($kind, $live) {
    return array_map(fn($relative) => [
        'path' => $relative,
        'uploaded_at' => gmdate('c', intdiv(site_image_stamp_ms($relative), 1000)),
        'live' => $relative === $live,
    ], site_image_files($kind));
}
function glass_bg_history($live) { return site_image_history('glass', $live); }

// Keeps the live photo and the newest others, SITE_IMAGE_KEEP in all.
function prune_site_images($kind, $live) {
    $kept = is_valid_site_image($kind, $live) ? 1 : 0;
    foreach (site_image_files($kind) as $relative) {
        if ($relative === $live) continue;
        if ($kept < SITE_IMAGE_KEEP) { $kept++; continue; }
        delete_site_image($kind, $relative);
    }
}
function prune_glass_bg_files($live) { prune_site_images('glass', $live); }

// The photo of that kind tenants see now ('' = the built-in one).
function current_site_image($conn, $kind) {
    $key = $kind === 'preview' ? 'preview_hero' : 'glass_bg_image';
    $stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?");
    $stmt->bind_param("s", $key);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $value = $row ? (string)$row['setting_value'] : '';
    if ($kind !== 'preview') return $value;
    [$hero] = normalize_preview_hero($value);
    return $hero['image'] ?? '';
}
function current_glass_bg($conn) { return current_site_image($conn, 'glass'); }

// ── Home page text (Other Settings → Home Page) ──
// setting home_content: {"badge": {"show": true, "en": "", "fil": ""}, ...}.
// Empty text means the app's own wording for that language (i18n.js), so an
// untouched page reads as before in English and Filipino. Value = max length.
const HOME_CONTENT_FIELDS = ['badge' => 60, 'heading' => 80, 'location' => 80, 'description' => 400];

function home_content_defaults() {
    $out = [];
    foreach (HOME_CONTENT_FIELDS as $field => $_) $out[$field] = ['show' => true, 'en' => '', 'fil' => ''];
    return $out;
}

// Posted or stored home_content → [canonical array, null] or [null, problem].
// Each text is one line of plain text (the page prints it as text, never HTML).
function normalize_home_content($raw) {
    $decoded = is_array($raw) ? $raw : json_decode((string)$raw, true);
    if (!is_array($decoded)) return [null, 'The Home page text could not be read.'];
    $out = home_content_defaults();
    foreach (HOME_CONTENT_FIELDS as $field => $max) {
        if (!array_key_exists($field, $decoded)) continue;
        $item = $decoded[$field];
        if (!is_array($item) || !is_bool($item['show'] ?? null)) {
            return [null, "Choose whether the $field is shown."];
        }
        $out[$field]['show'] = $item['show'];
        foreach (['en' => 'English', 'fil' => 'Filipino'] as $lang => $language) {
            $text = $item[$lang] ?? '';
            if (!is_string($text)) return [null, "The $language $field must be text."];
            // Line breaks, tabs and other control characters become one space.
            $text = preg_replace('/[\p{Cc}\s]+/u', ' ', $text);
            if ($text === null) return [null, "The $language $field has characters that cannot be saved."];
            $text = trim($text);
            if (mb_strlen($text) > $max) return [null, "The $language $field can be at most $max characters."];
            $out[$field][$lang] = $text;
        }
    }
    return [$out, null];
}

// One line of plain text from admin input: control characters and runs of
// whitespace become one space. null when it is not valid UTF-8.
function plain_line($text) {
    $text = preg_replace('/[\p{Cc}\s]+/u', ' ', (string)$text);
    return $text === null ? null : trim($text);
}

// ── Preview page hero (Other Settings → Preview Page) ──
// setting preview_hero: {"image": "", "badge"|"title"|"location": {show, en, fil},
// "features": [{en, fil}, ...]}. image '' = the built-in photo, else a
// site_assets/preview_hero_* upload (upload_preview_image.php). Empty badge,
// title or location text means the app's own wording; features are the chips
// under the location, written out in full so the admin can remove any of them.
const PREVIEW_HERO_PATH_PATTERN = '/^site_assets\/preview_hero_[0-9]+_[a-f0-9]{8}\.(jpg|jpeg|png|webp)$/';
const PREVIEW_HERO_TEXT_FIELDS = ['badge' => 40, 'title' => 60, 'location' => 80];
const PREVIEW_HERO_FEATURE_MAX_LEN = 40;
const PREVIEW_HERO_FEATURE_MAX_COUNT = 6;

function preview_hero_defaults() {
    $out = ['image' => ''];
    foreach (PREVIEW_HERO_TEXT_FIELDS as $field => $_) $out[$field] = ['show' => true, 'en' => '', 'fil' => ''];
    $out['features'] = [
        ['en' => 'Motorcycle Parking', 'fil' => 'Paradahan ng Motor'],
        ['en' => 'Bathroom per Room', 'fil' => 'Banyo sa Bawat Kwarto'],
    ];
    return $out;
}

function is_valid_preview_hero_path($relative) {
    return is_string($relative)
        && preg_match(PREVIEW_HERO_PATH_PATTERN, $relative) === 1
        && is_file(glass_bg_absolute_path($relative));
}

// Posted or stored preview_hero → [canonical array, null] or [null, problem].
// The image path is only checked for shape here; update_system_settings.php
// also requires the file to exist when it changes.
function normalize_preview_hero($raw) {
    $decoded = is_array($raw) ? $raw : json_decode((string)$raw, true);
    if (!is_array($decoded)) return [null, 'The Preview page settings could not be read.'];
    $out = preview_hero_defaults();

    if (array_key_exists('image', $decoded)) {
        $image = $decoded['image'];
        if (!is_string($image) || ($image !== '' && preg_match(PREVIEW_HERO_PATH_PATTERN, $image) !== 1)) {
            return [null, 'Upload the Preview photo again, or use the default photo.'];
        }
        $out['image'] = $image;
    }

    foreach (PREVIEW_HERO_TEXT_FIELDS as $field => $max) {
        if (!array_key_exists($field, $decoded)) continue;
        $item = $decoded[$field];
        if (!is_array($item) || !is_bool($item['show'] ?? null)) return [null, "Choose whether the $field is shown."];
        $out[$field]['show'] = $item['show'];
        foreach (['en' => 'English', 'fil' => 'Filipino'] as $lang => $language) {
            $text = $item[$lang] ?? '';
            if (!is_string($text) || ($text = plain_line($text)) === null) return [null, "The $language $field must be plain text."];
            if (mb_strlen($text) > $max) return [null, "The $language $field can be at most $max characters."];
            $out[$field][$lang] = $text;
        }
    }

    if (array_key_exists('features', $decoded)) {
        $features = $decoded['features'];
        if (!is_array($features) || ($features && array_keys($features) !== range(0, count($features) - 1))) {
            return [null, 'The features must be a list.'];
        }
        if (count($features) > PREVIEW_HERO_FEATURE_MAX_COUNT) {
            return [null, 'Show at most ' . PREVIEW_HERO_FEATURE_MAX_COUNT . ' features.'];
        }
        $clean = [];
        foreach ($features as $i => $feature) {
            $n = $i + 1;
            if (!is_array($feature)) return [null, "Feature $n could not be read."];
            $en = $feature['en'] ?? '';
            $fil = $feature['fil'] ?? '';
            if (!is_string($en) || !is_string($fil) || ($en = plain_line($en)) === null || ($fil = plain_line($fil)) === null) {
                return [null, "Feature $n must be plain text."];
            }
            if ($en === '') return [null, "Feature $n needs English text (or remove it)."];
            if (mb_strlen($en) > PREVIEW_HERO_FEATURE_MAX_LEN || mb_strlen($fil) > PREVIEW_HERO_FEATURE_MAX_LEN) {
                return [null, "Feature $n can be at most " . PREVIEW_HERO_FEATURE_MAX_LEN . " characters."];
            }
            $clean[] = ['en' => $en, 'fil' => $fil];
        }
        $out['features'] = $clean;
    }
    return [$out, null];
}

// The checks every site photo upload shares (Glass background, Preview hero):
// the type from the content, never the name; 640-8000 px; 5 MB. Returns
// [['ext', 'width', 'height', 'size'], null] or [null, [status, message]].
const SITE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const SITE_IMAGE_MIN_SIDE = 640;     // smaller than this looks blurry stretched over a screen
const SITE_IMAGE_MAX_SIDE = 8000;    // decoding anything bigger costs every visitor's phone

function check_site_image_upload($file) {
    if (!$file || !is_array($file) || !isset($file['error']) || is_array($file['error']) || $file['error'] === UPLOAD_ERR_NO_FILE) {
        return [null, [422, "Choose an image to upload."]];
    }
    if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE || $file['size'] > SITE_IMAGE_MAX_BYTES) {
        return [null, [422, "The image must be 5 MB or smaller."]];
    }
    if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
        return [null, [422, "The upload failed. Please try again."]];
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($extensions[$mime])) return [null, [422, "Use a JPG, PNG or WEBP image."]];

    $size = @getimagesize($file['tmp_name']);
    if (!$size || $size[0] < 1 || $size[1] < 1) return [null, [422, "This file is not a readable image."]];
    [$width, $height] = $size;
    if (max($width, $height) < SITE_IMAGE_MIN_SIDE) {
        return [null, [422, "The image is too small. Use one at least " . SITE_IMAGE_MIN_SIDE . " pixels wide or tall."]];
    }
    if ($width > SITE_IMAGE_MAX_SIDE || $height > SITE_IMAGE_MAX_SIDE) {
        return [null, [422, "The image is too large. Use one at most " . SITE_IMAGE_MAX_SIDE . " pixels on each side."]];
    }
    return [['ext' => $extensions[$mime], 'width' => $width, 'height' => $height, 'size' => (int)$file['size']], null];
}

// Moves a checked upload into backend/site_assets/ as <prefix><ms>_<hex8>.<ext>
// and returns the path relative to backend/, or null. Writes the folder's
// .htaccess too, in case the committed one was not deployed.
function store_site_image($file, $prefix, $ext) {
    $dir = glass_bg_absolute_path(GLASS_BG_DIR) . '/';
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) return null;
    $htaccess = $dir . '.htaccess';
    if (!is_file($htaccess)) {
        file_put_contents($htaccess, "Options -Indexes\n<FilesMatch \"\\.(php|phtml|php3|php4|php5|php7|phps|phar|pht|cgi|pl|py|sh|svg|html?)$\">\n    Require all denied\n</FilesMatch>\n");
    }
    // Milliseconds, so uploads made within the same second still sort in order.
    $name = $prefix . (int)floor(microtime(true) * 1000) . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    return move_uploaded_file($file['tmp_name'], $dir . $name) ? GLASS_BG_DIR . '/' . $name : null;
}


// ── Contract end (Other Settings → Contract End) ──
// extension_deadline_days: a tenant may ask to extend until this many days
// before the rent ends (0 = until the last day). It limits the tenant's own
// request only; the approval of a request filed in time, and the admin's
// Units → Extend Rent, are not limited by it.
// lease_end_reminders_enabled / lease_end_reminder_email / lease_end_reminder_sms:
// the rent-end reminder (send_lease_end_reminders) and its outside channels.
// upcoming_rooms_enabled: the Preview page lists occupied units that will free up.
const EXTENSION_DEADLINE_MAX_DAYS = 90;

function setting_is_on($conn, $key, $default = true) {
    $value = get_setting($conn, $key, null);
    if ($value === null) return $default;
    return in_array(strtolower(trim((string)$value)), ['1', 'true'], true);
}

function extension_deadline_days($conn) {
    $value = (string)get_setting($conn, 'extension_deadline_days', '0');
    return ctype_digit($value) ? min(EXTENSION_DEADLINE_MAX_DAYS, (int)$value) : 0;
}

// The last day a tenant may ask to extend rent ending on $lease_end, or null
// when there is no deadline.
function extension_deadline_date($conn, $lease_end) {
    $days = extension_deadline_days($conn);
    if ($days < 1 || empty($lease_end)) return null;
    return date('Y-m-d', strtotime("$lease_end -$days days"));
}

function extension_deadline_reason($conn, $lease_end) {
    $deadline = extension_deadline_date($conn, $lease_end);
    if ($deadline === null || date('Y-m-d') <= $deadline) return null;
    return "Extension requests closed on " . date('M j, Y', strtotime($deadline)) . ", " . extension_deadline_days($conn)
        . " days before your rent ends. Please contact the office if you still want to stay.";
}

// Whether a unit can take a new rent application: a vacant one, or an occupied
// one that will free up while Preview lists upcoming rooms. Returns
// [available_from or null, error or null]; available_from is set for an
// upcoming unit (the move-in date may not be earlier).
function room_open_for_application($conn, $room_name) {
    $stmt = $conn->prepare("SELECT status FROM rooms WHERE id = ? AND archived_at IS NULL");
    $stmt->bind_param("s", $room_name);
    $stmt->execute();
    $room = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$room) return [null, "This unit is no longer available for applications."];
    if ($room['status'] === 'vacant') return [null, null];
    if (setting_is_on($conn, 'upcoming_rooms_enabled')) {
        $dates = upcoming_room_dates($conn);
        if (isset($dates[$room_name])) return [$dates[$room_name], null];
    }
    return [null, "Room $room_name is not open for applications right now. Please choose another unit."];
}

// Occupied units that will free up, as ['A' => 'YYYY-MM-DD'] (the day it is
// free). A scheduled move-out counts from its date. An active contract counts
// once its extension deadline has passed with no extension request open; with
// no deadline set a tenant may still extend on the last day, so only scheduled
// move-outs are listed. Two queries, whatever the number of units.
function upcoming_room_dates($conn) {
    $res = $conn->query("SELECT ra.room_name, ra.user_id, ra.status, ra.requested_move_out_date,
                                lc.status AS contract_status, lc.lease_end
                         FROM rent_applications ra
                         JOIN rooms r ON r.id = ra.room_name AND r.status = 'occupied'
                         LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id
                         WHERE ra.status IN ('active', 'pending-move-out')");
    if (!$res) return [];
    $rows = $res->fetch_all(MYSQLI_ASSOC);

    $asking = [];
    $res = $conn->query("SELECT DISTINCT user_id FROM notifications WHERE type = 'lease_extension_request' AND status = 'Pending'");
    while ($res && ($row = $res->fetch_assoc())) $asking[(int)$row['user_id']] = true;

    $today = date('Y-m-d');
    $days = extension_deadline_days($conn);
    $out = [];
    foreach ($rows as $row) {
        $from = null;
        if ($row['status'] === 'pending-move-out' && !empty($row['requested_move_out_date'])) {
            $from = $row['requested_move_out_date'];
        } elseif ($days > 0 && $row['status'] === 'active' && $row['contract_status'] === 'active' && !empty($row['lease_end'])
                  && $row['lease_end'] >= $today && empty($asking[(int)$row['user_id']])) {
            $deadline = date('Y-m-d', strtotime("{$row['lease_end']} -$days days"));
            if ($today > $deadline) $from = $row['lease_end'];
        }
        if ($from !== null && $from >= $today && (!isset($out[$row['room_name']]) || $from < $out[$row['room_name']])) {
            $out[$row['room_name']] = $from;
        }
    }
    return $out;
}

// ── External channels: SMS & email (checklist 6.6 / 6.7) ──
// These helpers are the shared rules every sender must obey. The services that
// actually talk to a provider are built on top of them; nothing here sends.

// May this user be contacted on 'sms' or 'email' about this notification type?
//
// Order matters. Most notification types belong to no preference category at
// all (maintenance_update, overdue, payment_received, lease_expiring, every
// decision notice), so the per-category table cannot switch them off — without
// the per-user flag below a tenant could not stop SMS at all. That is fine for
// an in-app row; it is not fine for a paid, regulated channel. So:
//   1. the tenant's own global opt-out on users, then
//   2. the building-wide switch an admin controls, then
//   3. the per-category row, where an absent row still means "opted in".
function user_channel_allowed($conn, $user_id, $type, $channel) {
    $user_id = (int)$user_id;
    if ($user_id <= 0 || !in_array($channel, ['sms', 'email'], true)) return false;

    $column = $channel === 'sms' ? 'sms_opt_out' : 'email_opt_out';
    $stmt = $conn->prepare("SELECT `$column` AS opted_out FROM users WHERE id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row || (int)$row['opted_out'] === 1) return false;

    $switch = $channel === 'sms' ? 'notifications_sms_enabled' : 'notifications_email_enabled';
    if (get_setting($conn, $switch, '0') !== '1') return false;

    $category = notification_pref_category_for_type($type);
    if ($category === null) return true;

    $column = $channel === 'sms' ? 'sms_enabled' : 'email_enabled';
    $pref = $conn->prepare("SELECT `$column` AS enabled FROM notification_preferences WHERE user_id = ? AND category = ?");
    $pref->bind_param("is", $user_id, $category);
    $pref->execute();
    $row = $pref->get_result()->fetch_assoc();
    $pref->close();
    return $row ? (int)$row['enabled'] === 1 : true;
}

// users.contact_no is free-text varchar(30), so numbers arrive as '0917 123 4567',
// '(0917) 123-4567' or '+63 917 123 4567'. Strip everything that is not a digit
// first, then decide — matching on the raw string silently loses real numbers.
// Returns E.164 (+639XXXXXXXXX), or null when it is not a PH mobile.
function normalize_ph_mobile($phone) {
    $digits = preg_replace('/\D+/', '', (string)$phone);
    if ($digits === '') return null;

    if (strpos($digits, '00') === 0)  $digits = substr($digits, 2);   // 0063...
    if (strpos($digits, '63') === 0)  $digits = substr($digits, 2);   // 63...
    elseif (strpos($digits, '0') === 0) $digits = substr($digits, 1); // 0917...

    // A PH mobile subscriber number is always 9 digits after the 63, starting 9.
    return preg_match('/^9\d{9}$/', $digits) ? '+63' . $digits : null;
}

// The window for a preferred move-in date (Settings → Rental): 'min' to 'max'
// days from today. 0 means today is allowed. Garbled stored values fall back to
// the shipped 0 / 365, and max is never below min.
const MOVE_IN_DEFAULT_MIN_DAYS = 0;
const MOVE_IN_DEFAULT_MAX_DAYS = 365;
function move_in_window_days($conn) {
    $min = get_setting($conn, 'move_in_min_days', null);
    $max = get_setting($conn, 'move_in_max_days', null);
    $min = ($min !== null && ctype_digit((string)$min)) ? (int)$min : MOVE_IN_DEFAULT_MIN_DAYS;
    $max = ($max !== null && ctype_digit((string)$max)) ? (int)$max : MOVE_IN_DEFAULT_MAX_DAYS;
    return ['min' => $min, 'max' => max($min, $max)];
}

// The latest preferred move-in date on an inquiry (submit_inquiry.php): today
// plus inquiry_move_in_max_months (Settings → Rental, 1-24, default 6). Wider
// than the application window above: an inquiry is a question, not a booking.
const INQUIRY_MOVE_IN_DEFAULT_MONTHS = 6;
function inquiry_move_in_latest($conn) {
    $months = get_setting($conn, 'inquiry_move_in_max_months', null);
    $months = ($months !== null && ctype_digit((string)$months) && (int)$months >= 1 && (int)$months <= 24)
        ? (int)$months : INQUIRY_MOVE_IN_DEFAULT_MONTHS;
    return ['months' => $months, 'date' => date('Y-m-d', strtotime("+$months months"))];
}

// A preferred move-in date (rent_application.php, resubmit_date.php): a real
// YYYY-MM-DD inside move_in_window_days() from today (APP_TIMEZONE). The date
// input's `min` only stops the picker; a typed or posted 2023-02-01 used to be
// saved. Returns '' when valid, else the message to show (naming the first or
// last allowed day).
// $available_from: for a unit that is still occupied but will free up
// (upcoming_room_dates()), the first day it is free. The date may not be
// earlier, and the window's latest day stretches to reach it if needed.
function move_in_date_error($conn, $date, $available_from = null) {
    $date = (string)$date;
    $parsed = DateTime::createFromFormat('!Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date) return "Enter the move-in date as a valid date.";
    if ($available_from !== null && $date < $available_from) {
        return "This unit is available from " . date('F j, Y', strtotime($available_from)) . ". Choose that day or later.";
    }
    $window = move_in_window_days($conn);
    $earliest = strtotime('+' . $window['min'] . ' days');
    $latest = strtotime('+' . $window['max'] . ' days');
    if ($available_from !== null) $latest = max($latest, strtotime($available_from));
    if ($date < date('Y-m-d', $earliest)) {
        return $window['min'] === 0
            ? "The move-in date cannot be in the past."
            : "The move-in date must be at least {$window['min']} day(s) from today: the earliest is " . date('F j, Y', $earliest) . ".";
    }
    if ($date > date('Y-m-d', $latest)) return "The move-in date can be at most {$window['max']} days from today: the latest is " . date('F j, Y', $latest) . ".";
    return '';
}

// Semaphore bills one credit per 160 ASCII characters. A peso sign, an em dash,
// a smart quote or an accented letter makes the message Unicode, and the segment
// size drops to 70 — so a message that looks like one SMS silently bills as three.
// Fold those characters to plain ASCII (ñ → n keeps "Parañaque" readable) and
// drop anything still outside it. The GSM extension characters [ ] { } ~ ^ | \ `
// are dropped too: carriers count each as two.
function gsm7_safe($text) {
    $map = [
        '₱' => 'PHP ', '—' => '-', '–' => '-', '…' => '...',
        '“' => '"', '”' => '"', '‘' => "'", '’' => "'",
        '•' => '*', '₽' => '', '°' => 'deg', '™' => '', '®' => '', '©' => '',
        '£' => 'GBP ', '¥' => 'JPY ', '€' => 'EUR ',
        'ñ' => 'n', 'Ñ' => 'N', 'ç' => 'c', 'Ç' => 'C', 'ß' => 'ss',
        'á' => 'a', 'à' => 'a', 'â' => 'a', 'ä' => 'a', 'å' => 'a', 'æ' => 'ae',
        'Á' => 'A', 'À' => 'A', 'Â' => 'A', 'Ä' => 'A', 'Å' => 'A', 'Æ' => 'AE',
        'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'É' => 'E', 'È' => 'E', 'Ê' => 'E', 'Ë' => 'E',
        'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'Í' => 'I', 'Ì' => 'I', 'Î' => 'I', 'Ï' => 'I',
        'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'ö' => 'o', 'ø' => 'o', 'Ó' => 'O', 'Ò' => 'O', 'Ô' => 'O', 'Ö' => 'O', 'Ø' => 'O',
        'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'Ú' => 'U', 'Ù' => 'U', 'Û' => 'U', 'Ü' => 'U',
        "\xC2\xA0" => ' ', "\t" => ' ',
    ];
    $text = strtr((string)$text, $map);
    // Printable ASCII, minus the GSM extension characters.
    $text = preg_replace('/[^A-Za-z0-9\r\n .,:;!?"#%&\'()*+\-\/<=>@_$]/', '', $text);
    return preg_replace('/ {2,}/', ' ', $text);
}

// One SMS segment, hard. Anything longer belongs in an email: a second segment
// costs the same as the first and the tail is usually the disposable part.
function sms_single_segment($text, $limit = 160) {
    $text = trim(gsm7_safe($text));
    return mb_strlen($text) <= $limit ? $text : rtrim(mb_substr($text, 0, $limit - 1)) . '.';
}

// Semaphore silently drops any message that starts with "TEST": the API accepts
// it, returns a message_id and bills nothing, and it never arrives — so the log
// would say 'sent'. Prefix such text instead of trusting admins to avoid the
// word. Matched case-insensitively and as a prefix ("Testing", "TEST:") to be safe.
function sms_avoid_ignored_prefix($text) {
    $text = ltrim((string)$text);
    return stripos($text, 'test') === 0 ? 'AMS: ' . $text : $text;
}

// The only writer into notification_log. message_body is truncated because the
// log otherwise keeps names, unit numbers, amounts, phone numbers and email
// addresses in full and forever; prune_notification_log() bounds how long.
// $status is 'sent', 'failed' or 'skipped'. $provider_message_id / $provider_status
// are what Semaphore answered (message_id, and Queued/Pending/Sent/...): 'sent'
// here means the provider accepted it, and the id lets a later check trace delivery.
function log_notification_delivery($conn, $user_id, $channel, $event_type, $recipient, $subject, $body, $status = 'sent', $error = null,
                                   $provider_message_id = null, $provider_status = null) {
    if (!in_array($channel, ['in-app', 'email', 'sms'], true)) return 0;
    if (!in_array($status, ['sent', 'failed', 'skipped'], true)) $status = 'sent';

    $user_id   = (int)$user_id > 0 ? (int)$user_id : null;
    $recipient = $recipient === null ? null : mb_substr((string)$recipient, 0, 255);
    $subject   = $subject === null ? null : mb_substr((string)$subject, 0, 255);
    $body      = $body === null ? null : mb_substr((string)$body, 0, 500);
    $provider_message_id = $provider_message_id === null || $provider_message_id === '' ? null : mb_substr((string)$provider_message_id, 0, 64);
    $provider_status     = $provider_status === null || $provider_status === '' ? null : mb_substr((string)$provider_status, 0, 20);

    $stmt = $conn->prepare("INSERT INTO notification_log (user_id, channel, event_type, recipient, subject, message_body, status, error_message,
                                                          provider_message_id, provider_status)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    if (!$stmt) return 0;
    $stmt->bind_param("isssssssss", $user_id, $channel, $event_type, $recipient, $subject, $body, $status, $error,
                      $provider_message_id, $provider_status);
    $stmt->execute();
    $id = $stmt->insert_id;
    $stmt->close();
    return $id;
}

// Retention (RA 10173): the log holds personal data, so it is not kept without
// a limit. Capped per call so a long-neglected table cannot lock up the drain
// that calls it; idx_log_sent_at makes the scan cheap. Returns rows removed.
function prune_notification_log($conn, $limit = 5000) {
    $days = (int)get_setting($conn, 'notification_log_retention_days', '90');
    if ($days <= 0) return 0;

    $limit = max(1, (int)$limit);
    $stmt = $conn->prepare("DELETE FROM notification_log WHERE sent_at < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT $limit");
    if (!$stmt) return 0;
    $stmt->bind_param("i", $days);
    $stmt->execute();
    $n = $stmt->affected_rows;
    $stmt->close();
    return $n;
}

// Adds a row to the admin action queue. metadata "<type>:<id>" is what lets the
// decision endpoint clear exactly this row later (resolve_admin_queue()).
function notify_admins_queue($conn, $type, $entity_id, $title, $message) {
    $admin = $conn->query("SELECT id FROM users WHERE role = 'admin' AND is_archived = 0 ORDER BY id LIMIT 1");
    $row = $admin ? $admin->fetch_assoc() : null;
    if (!$row) return 0;
    return create_notification($conn, (int)$row['id'], $type, $title, $message, 'Pending', "$type:$entity_id");
}

// An FYI for the admin bell that needs no action (e.g. an online payment that
// settled on its own). $type must not be a queue type: the admin feed shows
// non-queue rows addressed to the admin, and queue rows only while Pending.
function notify_admins_info($conn, $type, $title, $message, $metadata = null) {
    $admin = $conn->query("SELECT id FROM users WHERE role = 'admin' AND is_archived = 0 ORDER BY id LIMIT 1");
    $row = $admin ? $admin->fetch_assoc() : null;
    if (!$row) return 0;
    return create_notification($conn, (int)$row['id'], $type, $title, $message, 'Resolved', $metadata);
}

// Clears a decided request from the admin bell. Before this existed only service
// bookings were ever cleared, so every application, maintenance ticket, CCTV
// request, parking request and inquiry stayed in the queue forever.
function resolve_admin_queue($conn, $type, $entity_id) {
    $metadata = "$type:$entity_id";
    $stmt = $conn->prepare("UPDATE notifications SET status = 'Resolved', is_read = 1 WHERE type = ? AND metadata_value = ? AND status = 'Pending'");
    $stmt->bind_param("ss", $type, $metadata);
    $stmt->execute();
    $n = $stmt->affected_rows;
    $stmt->close();
    return $n;
}

// ── Household roster & unit waitlist (decided 2026-09-16, docs/planning/todo.md) ──

// Upper bound on a unit's occupant count (lease holder + household members).
function max_occupants_per_unit($conn) {
    $row = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'max_occupants_per_unit'")->fetch_assoc();
    $max = $row ? (int)$row['setting_value'] : 8;
    return $max > 0 ? $max : 8;
}

// Named co-occupants currently on the lease (the lease holder is not a row).
function household_active_count($conn, $app_id) {
    $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM household_members WHERE rent_application_id = ? AND status = 'Active'");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $count = (int)($stmt->get_result()->fetch_assoc()['c'] ?? 0);
    $stmt->close();
    return $count;
}

// Settings -> Rental: how many people the room rate covers (included_occupants,
// default 4) and the monthly charge for each person above that
// (occupant_surcharge_per_person, default 1000). Maximum Occupants per Unit
// caps the total, so with 4 included and a maximum of 6, two people are paid.
const INCLUDED_OCCUPANTS_DEFAULT = 4;
function occupant_pricing($conn) {
    $included = get_setting($conn, 'included_occupants', null);
    $included = ($included !== null && ctype_digit((string)$included) && (int)$included >= 1 && (int)$included <= 20)
        ? (int)$included : INCLUDED_OCCUPANTS_DEFAULT;
    $fee = get_setting($conn, 'occupant_surcharge_per_person', null);
    $fee = ($fee !== null && is_numeric($fee) && (float)$fee >= 0) ? (float)$fee : 1000.0;
    return ['included' => $included, 'fee' => $fee];
}

// The monthly extra for $occupants people (0 up to the included number).
function occupant_surcharge($conn, $occupants) {
    $p = occupant_pricing($conn);
    return max(0, (int)$occupants - $p['included']) * $p['fee'];
}

// Sets a lease's occupant count and recalculates its rent: the room's base rate
// plus occupant_surcharge() for the people above the included number.
// rooms.monthly_rent (the catalog rate) is never written here. Returns the new
// monthly rent, or null if not found.
function apply_occupant_count($conn, $app_id, $occupants) {
    $stmt = $conn->prepare("SELECT ra.room_name, r.monthly_rent AS base_rent FROM rent_applications ra LEFT JOIN rooms r ON r.id = ra.room_name WHERE ra.id = ?");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $app = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$app) return null;

    $base_rent = $app['base_rent'] !== null ? (float)$app['base_rent'] : 4000;
    $new_rent = $base_rent + occupant_surcharge($conn, $occupants);

    $upd = $conn->prepare("UPDATE rent_applications SET occupants = ?, monthly_rent = ? WHERE id = ?");
    $upd->bind_param("idi", $occupants, $new_rent, $app_id);
    $upd->execute();
    $upd->close();

    $room = $conn->prepare("UPDATE rooms SET occupants = ? WHERE id = ?");
    $room->bind_param("is", $occupants, $app['room_name']);
    $room->execute();
    $room->close();

    return $new_rent;
}

// Moving out or archiving ends the whole household: every member leaves with
// the lease holder, and any open add/remove request is closed.
function end_household($conn, $app_id) {
    $stmt = $conn->prepare("SELECT id FROM household_members WHERE rent_application_id = ? AND (status = 'Pending' OR removal_requested_at IS NOT NULL)");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $open = array_column($stmt->get_result()->fetch_all(MYSQLI_ASSOC), 'id');
    $stmt->close();

    $upd = $conn->prepare("UPDATE household_members SET status = IF(status = 'Pending', 'Cancelled', 'Removed'), removed_at = NOW(), removal_requested_at = NULL WHERE rent_application_id = ? AND status IN ('Active', 'Pending')");
    $upd->bind_param("i", $app_id);
    $upd->execute();
    $ended = $upd->affected_rows;
    $upd->close();

    if ($open) {
        $close = $conn->prepare("UPDATE notifications SET status = 'Rejected', is_read = 1 WHERE type = 'household_request' AND status = 'Pending' AND metadata_value IN (?, ?)");
        foreach ($open as $member_id) {
            $add = "add:$member_id";
            $remove = "remove:$member_id";
            $close->bind_param("ss", $add, $remove);
            $close->execute();
        }
        $close->close();
    }
    return $ended;
}

// Basic unit waitlist (inquiry_reservation_design.md §8). When a unit becomes
// vacant, the first person still waiting for it is marked Notified. A tenant
// account gets an in-app notice; the admin always gets a queue item to follow
// up, since there is no automatic hold. Returns 1 if someone was notified.
function notify_unit_waitlist($conn, $room_name) {
    if (empty($room_name)) return 0;
    $stmt = $conn->prepare("SELECT id, user_id, full_name, contact_no, email FROM unit_waitlist WHERE room_name = ? AND status = 'Waiting' ORDER BY created_at, id LIMIT 1");
    if (!$stmt) return 0; // table not migrated yet
    $stmt->bind_param("s", $room_name);
    $stmt->execute();
    $entry = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$entry) return 0;

    $claim = $conn->prepare("UPDATE unit_waitlist SET status = 'Notified', notified_at = NOW() WHERE id = ? AND status = 'Waiting'");
    $claim->bind_param("i", $entry['id']);
    $claim->execute();
    $claimed = $claim->affected_rows > 0;
    $claim->close();
    if (!$claimed) return 0;

    $id = (int)$entry['id'];
    if (!empty($entry['user_id'])) {
        create_notification($conn, (int)$entry['user_id'], 'waitlist_update', "Unit $room_name is now available",
            "You are first on the waitlist for Unit $room_name. The office will contact you to arrange a viewing or a hold.");
    }
    $contact = $entry['contact_no'] ?: ($entry['email'] ?: 'no contact on file');
    notify_admins_queue($conn, 'unit_waitlist', $id, "Waitlist: Unit $room_name is vacant",
        "{$entry['full_name']} ($contact) is first on the waitlist for Unit $room_name. Contact them to arrange a viewing or place a hold.");
    log_activity($conn, null, 'inquiry', 'Notified Waitlist', "Unit $room_name vacant; waitlist entry #$id ({$entry['full_name']}) notified");
    return 1;
}

// Invoices a rent-due reminder is sent for. 'processing' (checkout at the gateway)
// and 'pending-verification' (tenant already paid) are open but need no nudge;
// 'overdue' gets the overdue alert instead.
const REMINDER_UPCOMING_STATUSES = ['pending', 'unpaid', 'scheduled', 'payment-failed'];

// Atomic per-invoice claim: at most one reminder per invoice per day, however many
// requests race (two admins, two tabs, React StrictMode's double mount). The
// notification is only sent when this returns true.
function claim_invoice_reminder($conn, $invoice_id, $min_days_between = 1) {
    $min_days_between = max(1, (int)$min_days_between);
    $stmt = $conn->prepare("UPDATE invoices SET last_reminder_date = CURDATE(), reminder_count = reminder_count + 1
                            WHERE id = ? AND (last_reminder_date IS NULL OR DATEDIFF(CURDATE(), last_reminder_date) >= ?)");
    $stmt->bind_param("si", $invoice_id, $min_days_between);
    $stmt->execute();
    $claimed = $stmt->affected_rows > 0;
    $stmt->close();
    return $claimed;
}

// A person's display name: first name, last name and suffix ("Juan Dela Cruz
// Jr."), blanks skipped. $row is a users or rent_applications row; $prefix reads
// prefixed keys (e.g. 'tenant_' for tenant_first_name). In SQL the same is
// TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))).
function person_name($row, $prefix = '') {
    $parts = [];
    foreach (['first_name', 'last_name', 'suffix'] as $key) {
        $value = trim((string)($row[$prefix . $key] ?? ''));
        if ($value !== '') $parts[] = $value;
    }
    return implode(' ', $parts);
}

function get_setting($conn, $key, $default = null) {
    $stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?");
    $stmt->bind_param("s", $key);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ? $row['setting_value'] : $default;
}

// CCTV footage requests (Settings → CCTV): the camera locations and incident
// types a tenant can pick, how many days back an incident may be, and the
// shortest reason. Defaults are what the form shipped with, so a DB that never
// saved these keys behaves as before. "other" is the one fixed type: it is
// always present, always last, and needs a written description.
const CCTV_DEFAULT_LOCATIONS = ['1st Floor', '2nd Floor', '3rd Floor', 'All Floors'];
const CCTV_DEFAULT_INCIDENT_TYPES = [
    ['key' => 'theft', 'label' => 'Theft or missing item'],
    ['key' => 'vandalism', 'label' => 'Vandalism'],
    ['key' => 'accident_injury', 'label' => 'Accident or injury'],
    ['key' => 'property_damage', 'label' => 'Property damage'],
    ['key' => 'security_concern', 'label' => 'Security concern (trespassing, harassment)'],
    ['key' => 'other', 'label' => 'Other incident (describe below)'],
];
const CCTV_DEFAULT_LOOKBACK_DAYS = 60;
const CCTV_DEFAULT_MIN_REASON_LENGTH = 10;
const CCTV_MAX_LOCATIONS = 12;
const CCTV_MAX_INCIDENT_TYPES = 10;
const CCTV_DEFAULT_FOOTAGE_DAYS = 14;
const CCTV_FOOTAGE_MAX_BYTES = 25 * 1024 * 1024;

// [clean list, null] or [null, message]. Used to validate a save and to read
// back what is stored, so a garbled row falls back to the defaults.
function cctv_normalize_locations($list) {
    if (!is_array($list) || $list !== array_values($list)) return [null, 'Camera locations must be a list.'];
    if (count($list) < 1 || count($list) > CCTV_MAX_LOCATIONS) return [null, 'Keep between 1 and ' . CCTV_MAX_LOCATIONS . ' camera locations.'];
    $clean = [];
    $seen = [];
    foreach ($list as $loc) {
        $loc = is_string($loc) ? trim(preg_replace('/\s+/', ' ', $loc)) : '';
        if ($loc === '' || mb_strlen($loc) > 50) return [null, 'Each camera location needs a name of 1 to 50 characters.'];
        $k = mb_strtolower($loc);
        if (isset($seen[$k])) return [null, "\"$loc\" is listed twice."];
        $seen[$k] = true;
        $clean[] = $loc;
    }
    return [$clean, null];
}

function cctv_normalize_incident_types($list) {
    if (!is_array($list) || $list !== array_values($list)) return [null, 'Incident types must be a list.'];
    if (count($list) < 2 || count($list) > CCTV_MAX_INCIDENT_TYPES) {
        return [null, 'Keep between 2 and ' . CCTV_MAX_INCIDENT_TYPES . ' incident types (Other plus at least one more).'];
    }
    $clean = [];
    $keys = [];
    $labels = [];
    foreach ($list as $t) {
        $label = is_array($t) && is_string($t['label'] ?? null) ? trim(preg_replace('/\s+/', ' ', $t['label'])) : '';
        if ($label === '' || mb_strlen($label) > 60) return [null, 'Each incident type needs a name of 1 to 60 characters.'];
        $lk = mb_strtolower($label);
        if (isset($labels[$lk])) return [null, "\"$label\" is listed twice."];
        $labels[$lk] = true;

        // A key an existing type already has is kept (saved requests refer to
        // it); a new type gets one made from its name.
        $key = is_array($t) && is_string($t['key'] ?? null) ? $t['key'] : '';
        if (preg_match('/^[a-z0-9_]{1,30}$/', $key)) {
            if (isset($keys[$key])) return [null, 'An incident type is listed twice.'];
        } else {
            $base = substr(trim(preg_replace('/[^a-z0-9]+/', '_', strtolower($label)), '_'), 0, 24);
            $key = $base !== '' ? $base : 'type';
            for ($n = 2; isset($keys[$key]) || $key === 'other'; $n++) $key = $base . '_' . $n;
            $key = substr($key, 0, 30);
        }
        $keys[$key] = true;
        $clean[] = ['key' => $key, 'label' => $label];
    }
    if ($clean[count($clean) - 1]['key'] !== 'other') return [null, '"Other" must stay as the last incident type.'];
    if (count(array_filter($clean, fn($t) => $t['key'] === 'other')) !== 1) return [null, '"Other" must appear exactly once.'];
    return [$clean, null];
}

function cctv_settings($conn) {
    $raw = [];
    $res = $conn->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('cctv_locations', 'cctv_incident_types', 'cctv_lookback_days', 'cctv_min_reason_length', 'cctv_footage_days')");
    if ($res) {
        while ($row = $res->fetch_assoc()) $raw[$row['setting_key']] = $row['setting_value'];
    }
    [$locations] = cctv_normalize_locations(json_decode($raw['cctv_locations'] ?? '', true));
    [$types] = cctv_normalize_incident_types(json_decode($raw['cctv_incident_types'] ?? '', true));
    $days = $raw['cctv_lookback_days'] ?? '';
    $min = $raw['cctv_min_reason_length'] ?? '';
    $keep = $raw['cctv_footage_days'] ?? '';
    return [
        'locations' => $locations ?? CCTV_DEFAULT_LOCATIONS,
        'incidentTypes' => $types ?? CCTV_DEFAULT_INCIDENT_TYPES,
        'lookbackDays' => ctype_digit((string)$days) && (int)$days >= 1 && (int)$days <= 365 ? (int)$days : CCTV_DEFAULT_LOOKBACK_DAYS,
        'minReasonLength' => ctype_digit((string)$min) && (int)$min >= 5 && (int)$min <= 200 ? (int)$min : CCTV_DEFAULT_MIN_REASON_LENGTH,
        'footageDays' => ctype_digit((string)$keep) && (int)$keep >= 1 && (int)$keep <= 90 ? (int)$keep : CCTV_DEFAULT_FOOTAGE_DAYS,
    ];
}

// Approved CCTV footage the admin hands to the tenant: a short clip stored under
// uploads/cctv/ (served only by download_file.php) or a private https link. It is
// available for cctv_footage_days after it is attached, then removed.

// Absolute path of a stored footage file, or null if it is not a plain file
// inside uploads/cctv/ (so a bad stored value can never delete anything else).
function cctv_footage_file_path($path) {
    if (!is_string($path) || !preg_match('#^uploads/cctv/[a-zA-Z0-9_.-]+$#', $path)) return null;
    $full = __DIR__ . '/' . $path;
    return is_file($full) ? $full : null;
}

function delete_cctv_footage_file($path) {
    $full = cctv_footage_file_path($path);
    if ($full !== null) @unlink($full);
}

// Validates and stores footage. Returns [path|null, error|null].
function store_cctv_footage($file) {
    if (!$file || $file['error'] === UPLOAD_ERR_NO_FILE) return [null, 'Choose a footage file or paste a link.'];
    if ($file['error'] !== UPLOAD_ERR_OK) return [null, 'File upload failed. Footage files must be 25MB or smaller.'];
    if ($file['size'] > CCTV_FOOTAGE_MAX_BYTES) return [null, 'Footage files must be 25MB or smaller. For longer footage, paste a link instead.'];

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['mp4', 'm4v', 'webm', 'mov', 'jpg', 'jpeg', 'png', 'webp'], true)) {
        return [null, 'Allowed formats: MP4, WEBM or MOV video, or JPG, PNG or WEBP images.'];
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    if (!in_array($mime, ['video/mp4', 'video/x-m4v', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp'], true)) {
        return [null, 'File content does not match an allowed video or image format.'];
    }

    $dir = __DIR__ . '/uploads/cctv/';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $name = time() . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
    if (!move_uploaded_file($file['tmp_name'], $dir . $name)) return [null, 'Failed to save the footage file.'];
    return ['uploads/cctv/' . $name, null];
}

// A private https link, without credentials in it. Returns [url|null, error|null].
function cctv_footage_link($raw) {
    $url = trim((string)$raw);
    if ($url === '' || strlen($url) > 500) return [null, 'Paste a link of up to 500 characters.'];
    $parts = parse_url($url);
    if (!filter_var($url, FILTER_VALIDATE_URL) || !$parts || strtolower($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])
        || isset($parts['user']) || isset($parts['pass'])) {
        return [null, 'The link must be a full https:// address without a username or password.'];
    }
    return [$url, null];
}

// Records that a tenant opened their footage. A <video> sends several requests
// for one play, so the same tenant opening the same request again within a
// minute is one entry. Admins' own opens are not logged.
function log_cctv_footage_view($conn, $viewer, $request_id, $kind) {
    if (!$viewer || $viewer['role'] === 'admin') return;
    $uid = (int)$viewer['id'];
    $details = "CCTV Request ID: " . (int)$request_id . " footage opened ($kind)";
    $stmt = $conn->prepare("SELECT 1 FROM activity_logs WHERE performed_by = ? AND action = 'Viewed CCTV Footage' AND details = ? AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND) LIMIT 1");
    $stmt->bind_param("is", $uid, $details);
    $stmt->execute();
    $recent = (bool)$stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$recent) log_activity($conn, $uid, 'service', 'Viewed CCTV Footage', $details);
}

// Deletes footage past its expiry and clears the link. Claim-first: the row is
// cleared before the file goes, and only by the process whose UPDATE matched.
// Access is also refused once expired, so a late run is harmless.
function purge_expired_cctv_footage($conn) {
    $out = ['cctv_footage_purged' => 0];
    $res = $conn->query("SELECT id, footage_path FROM cctv_requests
                         WHERE footage_expires_at IS NOT NULL AND footage_expires_at <= NOW()
                           AND (footage_path IS NOT NULL OR footage_url IS NOT NULL) LIMIT 200");
    if (!$res) return $out;
    $rows = $res->fetch_all(MYSQLI_ASSOC);
    $claim = $conn->prepare("UPDATE cctv_requests SET footage_path = NULL, footage_url = NULL
                             WHERE id = ? AND footage_expires_at IS NOT NULL AND footage_expires_at <= NOW()");
    if (!$claim) return $out;
    foreach ($rows as $r) {
        $id = (int)$r['id'];
        $claim->bind_param("i", $id);
        $claim->execute();
        if ($claim->affected_rows !== 1) continue;
        delete_cctv_footage_file($r['footage_path']);
        log_activity($conn, 0, 'service', 'Expired CCTV Footage Removed', "CCTV Request ID: $id footage passed its availability period and was removed", 0);
        $out['cctv_footage_purged']++;
    }
    $claim->close();
    return $out;
}

// ── Announcements: delivery and scheduling ──
// An announcement goes to the tenants living in the building (or in one unit)
// at the moment it is sent. create_announcement.php sends immediately; a
// scheduled one is stored with status 'scheduled' and sent by
// send_due_announcements() from the poll in get_notifications.php and
// cron/process_queue.php. Both use the same three steps below.
const ANNOUNCEMENT_MAX_SCHEDULE_DAYS = 365;

// $send_to_label is the stored label: 'All Tenants' or 'Unit X'.
function announcement_recipients($conn, $send_to_label) {
    $sql = "SELECT DISTINCT ra.user_id FROM rent_applications ra
            JOIN users u ON u.id = ra.user_id
            WHERE ra.status IN ('Approved', 'active', 'pending-move-out') AND u.role = 'user' AND u.is_archived = 0";
    if (strncmp($send_to_label, 'Unit ', 5) === 0) {
        $unit = substr($send_to_label, 5);
        $stmt = $conn->prepare("$sql AND ra.room_name = ?");
        $stmt->bind_param("s", $unit);
    } else {
        $stmt = $conn->prepare($sql);
    }
    $stmt->execute();
    $ids = array_map('intval', array_column($stmt->get_result()->fetch_all(MYSQLI_ASSOC), 'user_id'));
    $stmt->close();
    return $ids;
}

function announcement_notification_type($tag) {
    return ['Urgent' => 'warning', 'Reminder' => 'action'][$tag] ?? 'info';
}

// The in-app half, inside the caller's transaction: one notification per
// recipient (respecting their "Building announcements" preference) carrying the
// attachment. Returns how many were delivered.
function announcement_notify($conn, $announcement_id, $tag, $title, $body, $recipients, $attachment_path) {
    $type = announcement_notification_type($tag);
    $delivered = 0;
    $notif_ids = [];
    foreach ($recipients as $uid) {
        $nid = create_notification($conn, $uid, $type, $title, $body);
        if ($nid) {
            $delivered++;
            $notif_ids[] = $nid;
        }
    }
    if ($attachment_path) {
        if ($notif_ids) {
            $upd = $conn->prepare("UPDATE notifications SET attachment_path = ? WHERE id = ?");
            foreach ($notif_ids as $nid) {
                $upd->bind_param("si", $attachment_path, $nid);
                $upd->execute();
            }
            $upd->close();
        }
        // The admin's history shows that a file went out, and opens it.
        $ann_upd = $conn->prepare("UPDATE announcements SET attachment_path = ? WHERE id = ?");
        $ann_upd->bind_param("si", $attachment_path, $announcement_id);
        $ann_upd->execute();
        $ann_upd->close();
    }
    return $delivered;
}

// After the commit: SMS and email, then the channels that actually reached
// someone. An SMS or email problem must not undo an announcement tenants can
// already see in-app. Returns the dispatch summary.
function announcement_broadcast($conn, $announcement_id, $tag, $title, $body, $recipients, $requested_channels) {
    require_once __DIR__ . '/api/services/send_notification.php';
    $requested = is_array($requested_channels) ? array_map('strtolower', $requested_channels) : [];
    $want_sms = in_array('sms', $requested, true);
    $want_email = in_array('email', $requested, true);
    $dispatch = dispatch_admin_action_broadcast(
        $conn, $recipients, announcement_notification_type($tag), $title,
        // null skips that channel in dispatch_external_notification().
        $want_sms ? sms_announcement_template($title, $body, $tag) : null,
        $want_email ? email_announcement_template($title, $body, $tag) : null
    );
    $used = ['in-app'];
    if ($dispatch['sms'] > 0) $used[] = 'sms';
    if ($dispatch['email'] > 0) $used[] = 'email';
    $used_json = json_encode($used);
    $stmt = $conn->prepare("UPDATE announcements SET channels = ? WHERE id = ?");
    $stmt->bind_param("si", $used_json, $announcement_id);
    $stmt->execute();
    $stmt->close();
    $dispatch['channels'] = $used;
    return $dispatch;
}

// Sends one scheduled announcement. $only_if_due is true for the sweep (the
// time must have come) and false for the admin's "Send now". Claim-first: the
// row is flipped to 'sent' by exactly one caller. Returns null when it was not
// (or no longer) scheduled, ['status' => 'no_recipients'] when nobody lives in
// the building (it goes back to a draft), or ['status' => 'sent', 'delivered' => n, ...].
function send_scheduled_announcement($conn, $id, $admin_id = 0, $only_if_due = true) {
    $id = (int)$id;
    $admin_id = (int)$admin_id;
    $due = $only_if_due ? " AND scheduled_date <= NOW()" : "";
    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("SELECT tag, title, body, send_to, channels, attachment_path FROM announcements WHERE id = ? AND status = 'scheduled'$due FOR UPDATE");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row) {
            $conn->rollback();
            return null;
        }

        $recipients = announcement_recipients($conn, $row['send_to']);
        if (!$recipients) {
            $stmt = $conn->prepare("UPDATE announcements SET status = 'draft', scheduled_date = NULL WHERE id = ?");
            $stmt->bind_param("i", $id);
            $stmt->execute();
            $stmt->close();
            $conn->commit();
            notify_admins_info($conn, 'info', 'Scheduled announcement not sent',
                "\"{$row['title']}\" was due, but {$row['send_to']} has no current tenants. It was saved back as a draft.");
            log_activity($conn, $admin_id, 'communication', 'Scheduled Announcement Not Sent', "Title: {$row['title']}; To: {$row['send_to']}; no current tenants, returned to draft", $admin_id);
            return ['status' => 'no_recipients'];
        }

        $count = count($recipients);
        $stmt = $conn->prepare("UPDATE announcements SET status = 'sent', created_at = NOW(), recipient_count = ? WHERE id = ?");
        $stmt->bind_param("ii", $count, $id);
        $stmt->execute();
        $stmt->close();
        $delivered = announcement_notify($conn, $id, $row['tag'], $row['title'], $row['body'], $recipients, $row['attachment_path']);
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        error_log('[AMS] scheduled announcement #' . $id . ' failed: ' . $e->getMessage());
        return null;
    }

    $dispatch = ['channels' => ['in-app']];
    try {
        $dispatch = announcement_broadcast($conn, $id, $row['tag'], $row['title'], $row['body'], $recipients, json_decode($row['channels'] ?? '[]', true));
    } catch (Throwable $e) {
        error_log('[AMS] scheduled announcement #' . $id . ' SMS/email failed after send: ' . $e->getMessage());
    }
    log_activity($conn, $admin_id, 'communication', $only_if_due ? 'Sent Scheduled Announcement' : 'Sent Announcement Now',
        "Title: {$row['title']}; To: {$row['send_to']}; Delivered in-app to $delivered of $count; channels: " . implode(', ', $dispatch['channels']), $admin_id);
    return ['status' => 'sent', 'delivered' => $delivered, 'recipient_count' => $count, 'dispatch' => $dispatch];
}

// Sends every scheduled announcement whose time has come. Returns how many went out.
function send_due_announcements($conn) {
    $res = $conn->query("SELECT id FROM announcements WHERE status = 'scheduled' AND scheduled_date <= NOW() ORDER BY scheduled_date, id LIMIT 20");
    if (!$res) return 0;
    $sent = 0;
    foreach ($res->fetch_all(MYSQLI_ASSOC) as $r) {
        $out = send_scheduled_announcement($conn, (int)$r['id'], 0, true);
        if ($out && $out['status'] === 'sent') $sent++;
    }
    return $sent;
}

// How far ahead a tenant must give a move-out notice (Settings → Rental). The
// date has to fall between 'min' and 'max' days from today. Garbled stored
// values fall back to the shipped 15 / 30, and max is never below min.
const MOVE_OUT_NOTICE_DEFAULT_MIN = 15;
const MOVE_OUT_NOTICE_DEFAULT_MAX = 30;
function move_out_notice_days($conn) {
    $min = get_setting($conn, 'move_out_min_notice_days', null);
    $max = get_setting($conn, 'move_out_max_notice_days', null);
    $min = ($min !== null && ctype_digit((string)$min)) ? (int)$min : MOVE_OUT_NOTICE_DEFAULT_MIN;
    $max = ($max !== null && ctype_digit((string)$max)) ? (int)$max : MOVE_OUT_NOTICE_DEFAULT_MAX;
    return ['min' => $min, 'max' => max($min, $max)];
}

// Sends the response now and lets the script keep running, so work that follows
// (the poll sweep) does not hold up the page. Call after the final echo.
function finish_response_early() {
    ignore_user_abort(true);
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
        return;
    }
    // Without FastCGI, the client only sees the end of the body when told its
    // length; that needs the output buffered (ob_start() before the echo).
    $len = ob_get_length();
    if ($len !== false && !headers_sent()) {
        header('Connection: close');
        header('Content-Length: ' . $len);
    }
    while (ob_get_level() > 0) ob_end_flush();
    flush();
}

// True for at most one caller per $seconds (audit L7). Checks that every page
// poll or GET used to run (sweep claim, overstay scan, overdue promotion, hold
// release) are gated with this, so they run about once a minute instead of on
// every request. Claimed atomically on a system_settings row holding a Unix
// timestamp, the same pattern as notification_sweep_last_run.
function throttle_claim($conn, $key, $seconds) {
    try {
        $stmt = $conn->prepare("UPDATE system_settings SET setting_value = UNIX_TIMESTAMP()
                                WHERE setting_key = ? AND CAST(setting_value AS UNSIGNED) + ? <= UNIX_TIMESTAMP()");
        $stmt->bind_param("si", $key, $seconds);
        $stmt->execute();
        $claimed = $stmt->affected_rows > 0;
        $stmt->close();
        if ($claimed) return true;

        // First run: create the row; whoever inserts it owns this run.
        $ins = $conn->prepare("INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES (?, UNIX_TIMESTAMP())");
        $ins->bind_param("s", $key);
        $ins->execute();
        $claimed = $ins->affected_rows > 0;
        $ins->close();
        return $claimed;
    } catch (mysqli_sql_exception $e) {
        return true; // never skip the check because the throttle itself failed
    }
}

// Daily automation (checklist 6.2 / 6.3 / 9.6 / 10.3): overdue promotion,
// rent-due and overdue reminders, contract expiry and lease-end reminders,
// parking permit expiry and automatic parking billing. Visitor overstay
// alerts (checklist 12.3) are NOT here — their threshold is in hours, so
// alert_overstayed_visitors() runs on every get_notifications.php poll
// instead of once a day.
//
// There is no always-on scheduler in XAMPP, so this runs from two places:
//   - get_notifications.php, which every signed-in page polls — the first request
//     of the day claims the run and everyone else skips it;
//   - backend/cron/daily_sweep.php, for Windows Task Scheduler.
// $force skips the once-a-day claim (admin "Run now" button, CLI script). Even when
// forced, each reminder and each parking month is individually claimed, so a
// forced re-run never sends a duplicate reminder or bills a month twice.
function run_notification_sweep($conn, $force = false) {
    if (!$force) {
        $stmt = $conn->prepare("UPDATE system_settings SET setting_value = CURDATE()
                                WHERE setting_key = 'notification_sweep_last_run' AND setting_value < CURDATE()");
        $stmt->execute();
        $claimed = $stmt->affected_rows > 0;
        $stmt->close();
        if (!$claimed) {
            // Row missing (database not migrated): create it and run once.
            $exists = $conn->query("SELECT 1 FROM system_settings WHERE setting_key = 'notification_sweep_last_run'")->fetch_assoc();
            if ($exists) return ['ran' => false];
            $conn->query("INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES ('notification_sweep_last_run', CURDATE())");
        }
    } else {
        $conn->query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('notification_sweep_last_run', CURDATE())
                      ON DUPLICATE KEY UPDATE setting_value = CURDATE()");
    }

    // Expired sessions are never read again; drop them once a day.
    $conn->query("DELETE FROM sessions WHERE expires_at < NOW() - INTERVAL 1 DAY");

    $result = [
        'ran' => true,
        'marked_overdue' => promote_overdue_invoices($conn),
        // Before the parking step, so a month's parking charge lands on that
        // month's rent invoice rather than opening one of its own.
        'rent_invoices_created' => generate_due_rent_invoices($conn),
        'upcoming_reminders_sent' => 0,
        'overdue_reminders_sent' => 0,
        'parking_released' => 0,
        'parking_charges_posted' => 0,
        'contracts_expired' => 0,
        'lease_end_reminders_sent' => 0,
        'followups_queued' => 0,
        'deposit_refunds_overdue' => 0,
    ];

    $reminders_enabled = get_setting($conn, 'rent_due_reminders_enabled', 'true') !== 'false';
    $reminder_days = max(0, (int)get_setting($conn, 'rent_due_reminder_days', 3));
    $overdue_enabled = get_setting($conn, 'overdue_reminders_enabled', 'true') !== 'false';
    $overdue_interval = max(1, (int)get_setting($conn, 'overdue_reminder_interval_days', 3));
    $today = new DateTime(date('Y-m-d'));

    if ($reminders_enabled) {
        $statuses = "('" . implode("','", REMINDER_UPCOMING_STATUSES) . "')";
        $stmt = $conn->prepare("SELECT i.id, i.user_id, i.total_amount - i.amount_paid AS total_amount, i.amount_paid, i.due_date, i.billing_period, ra.room_name, " . INVOICE_PERIOD_COLUMNS . "
                                FROM invoices i
                                LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
                                WHERE i.status IN $statuses AND i.due_date IS NOT NULL
                                  AND (ra.status IS NULL OR ra.status NOT IN ('Cancelled', 'Rejected', 'Declined', 'moved-out', 'archived'))
                                  AND i.due_date >= CURDATE() AND DATEDIFF(i.due_date, CURDATE()) <= ?
                                  AND (i.last_reminder_date IS NULL OR i.last_reminder_date < CURDATE())");
        $stmt->bind_param("i", $reminder_days);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        foreach ($rows as $inv) {
            if (!claim_invoice_reminder($conn, $inv['id'])) continue;
            [$title, $message] = reminder_text($inv, $today, false);
            create_notification($conn, $inv['user_id'], 'rent_due', $title, $message);
            try {
                require_once __DIR__ . '/api/services/send_notification.php';
                dispatch_system_notification($conn, (int)$inv['user_id'], 'rent_due', $title, null,
                    email_payment_reminder_template(notify_recipient_name($conn, $inv['user_id']), $inv, false));
            } catch (Throwable $notification_error) {
                error_log('Could not dispatch due payment reminder email: ' . $notification_error->getMessage());
            }
            $result['upcoming_reminders_sent']++;
        }
    }

    if ($overdue_enabled) {
        $stmt = $conn->prepare("SELECT i.id, i.user_id, i.total_amount - i.amount_paid AS total_amount, i.amount_paid, i.due_date, i.billing_period, ra.room_name, " . INVOICE_PERIOD_COLUMNS . "
                                FROM invoices i
                                LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
                                WHERE i.status = 'overdue' AND i.due_date IS NOT NULL AND i.due_date < CURDATE()
                                  AND (ra.status IS NULL OR ra.status NOT IN ('Cancelled', 'Rejected', 'Declined', 'moved-out', 'archived'))
                                  AND (i.last_reminder_date IS NULL OR DATEDIFF(CURDATE(), i.last_reminder_date) >= ?)");
        $stmt->bind_param("i", $overdue_interval);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        foreach ($rows as $inv) {
            if (!claim_invoice_reminder($conn, $inv['id'], $overdue_interval)) continue;
            [$title, $message] = reminder_text($inv, $today, true);
            create_notification($conn, $inv['user_id'], 'overdue', $title, $message);
            try {
                require_once __DIR__ . '/api/services/send_notification.php';
                dispatch_system_notification($conn, (int)$inv['user_id'], 'overdue', $title, null,
                    email_payment_reminder_template(notify_recipient_name($conn, $inv['user_id']), $inv, true));
            } catch (Throwable $notification_error) {
                error_log('Could not dispatch overdue payment email: ' . $notification_error->getMessage());
            }
            $result['overdue_reminders_sent']++;
        }
    }

    $result['parking_released'] = release_lapsed_parking($conn);

    if (get_setting($conn, 'parking_billing_mode', 'manual') === 'auto') {
        $month = new DateTime('now', new DateTimeZone('Asia/Manila'));
        // Free permits (monthly_fee 0) are never billed.
        $ids = $conn->query("SELECT id FROM parking_reservations WHERE status = 'Assigned' AND (monthly_fee IS NULL OR monthly_fee > 0)");
        while ($ids && ($r = $ids->fetch_assoc())) {
            $posted = post_invoice_charge($conn, 'parking', (int)$r['id'], $month);
            if ($posted['ok'] && !empty($posted['invoice_id'])) $result['parking_charges_posted']++;
        }
    }

    $result['contracts_expired'] = expire_lapsed_contracts($conn);
    $result['lease_end_reminders_sent'] = send_lease_end_reminders($conn);
    $result['followups_queued'] = sync_followup_queue($conn);
    $result['deposit_refunds_overdue'] = notify_overdue_deposit_refunds($conn);

    $did = $result['deposit_refunds_overdue'] + $result['marked_overdue'] + $result['rent_invoices_created'] + $result['upcoming_reminders_sent'] + $result['overdue_reminders_sent']
         + $result['parking_released'] + $result['parking_charges_posted']
         + $result['contracts_expired'] + $result['lease_end_reminders_sent'] + $result['followups_queued'];
    if ($did > 0) {
        log_activity($conn, null, 'system', 'Daily Notification Sweep',
            "Marked overdue: {$result['marked_overdue']}; rent invoices created: {$result['rent_invoices_created']}; due reminders: {$result['upcoming_reminders_sent']}; overdue alerts: {$result['overdue_reminders_sent']}; parking released: {$result['parking_released']}; parking charges posted: {$result['parking_charges_posted']}; contracts expired: {$result['contracts_expired']}; rent-end reminders sent: {$result['lease_end_reminders_sent']}",
            0);
    }

    return $result;
}

// Tells the admins, once, that a returned security deposit is still unpaid past
// its due date (created_at + deposit_refund_days), and tells the tenant it is
// being chased. The claim is the conditional UPDATE on overdue_notified_at, so
// concurrent sweeps notify each refund once. Returns how many were notified.
function notify_overdue_deposit_refunds($conn) {
    $days = deposit_refund_days($conn);
    $stmt = $conn->prepare("SELECT id, user_id, amount, created_at FROM refund_requests
                            WHERE type = 'deposit' AND status IN ('Pending Review', 'Info Requested', 'Approved')
                              AND overdue_notified_at IS NULL AND DATE_ADD(created_at, INTERVAL ? DAY) < CURDATE()");
    $stmt->bind_param("i", $days);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    $notified = 0;
    foreach ($rows as $r) {
        $rid = (int)$r['id'];
        $claim = $conn->prepare("UPDATE refund_requests SET overdue_notified_at = NOW() WHERE id = ? AND overdue_notified_at IS NULL");
        $claim->bind_param("i", $rid);
        $claim->execute();
        $won = $claim->affected_rows > 0;
        $claim->close();
        if (!$won) continue;
        $amount = number_format((float)$r['amount'], 2);
        $due = date('M j, Y', strtotime($r['created_at'] . " +$days days"));
        notify_admins_info($conn, 'refund_update', 'Deposit Refund Overdue',
            "Deposit refund #$rid of ₱$amount was due $due and is still unpaid. Approve it or record the payout under Refunds.");
        create_notification($conn, (int)$r['user_id'], 'refund_update', 'Your Deposit Refund Is Late',
            "Your deposit refund of ₱$amount was due $due. Management has been reminded and will pay it out; you can follow it under My Refunds.");
        $notified++;
    }
    return $notified;
}

// Title and message for a rent-due or overdue reminder. Shared by the sweep and
// the admin's manual "Send reminder" action so the wording never drifts.
// An overdue alert names the period the bill covers (from the move-in day)
// instead of the due date that has passed; $inv may carry INVOICE_PERIOD_COLUMNS.
function reminder_text(array $inv, DateTime $today, $overdue, $custom_message = '') {
    $due = new DateTime($inv['due_date']);
    $unit = !empty($inv['room_name']) ? $inv['room_name'] : 'your unit';
    // Callers pass the balance as total_amount (total less parts already paid).
    $amount = number_format((float)$inv['total_amount'], 2);
    if ((float)($inv['amount_paid'] ?? 0) > 0) $amount .= " (balance, after ₱" . number_format((float)$inv['amount_paid'], 2) . " already paid)";
    $due_text = $due->format('M j, Y');
    $period = $inv['billing_period'] ?? '';

    if ($overdue) {
        $days = (int)$due->diff($today)->format('%a');
        $days_text = $days === 1 ? '1 day' : "$days days";
        $bounds = invoice_covered_period($inv, $inv['lease_start'] ?? null);
        $covers = $bounds ? covered_period_text($bounds) : $period;
        return ["Overdue Rent Alert: $period",
            $custom_message !== '' ? $custom_message
                : "Your payment of ₱$amount for Unit $unit, covering $covers, is $days_text overdue. Please settle your outstanding balance immediately to avoid further penalties."];
    }

    $days = (int)$today->diff($due)->format('%r%a');
    if ($days <= 0) {
        return ["Payment Due Today: $period",
            $custom_message !== '' ? $custom_message
                : "Your rent payment of ₱$amount for Unit $unit is due today ($due_text). Please settle your bill promptly."];
    }
    $days_text = $days === 1 ? '1 day' : "$days days";
    return ["Rent Due Reminder: $period",
        $custom_message !== '' ? $custom_message
            : "Your rent payment of ₱$amount for Unit $unit is due on $due_text ($days_text remaining). Please settle your bill on time."];
}

// ── Parking reservation (checklist Module 10) ──

// Assigned is the only status that holds a slot. Released and Rejected are
// terminal; a tenant who needs parking again files a new request.
const PARKING_TRANSITIONS = [
    'Pending'   => ['Assigned', 'Rejected', 'Cancelled'],
    'Assigned'  => ['Released'],
    'Rejected'  => [],
    'Cancelled' => [],
    'Released'  => [],
];

// Vehicle types a slot can take and the icons a slot can show (Admin → Parking
// → Slots). An e-bike has no plate and no transmission, so both are optional.
const PARKING_VEHICLE_TYPES = ['motorcycle', 'ebike', 'sedan', 'suv', 'pickup', 'van'];
const PARKING_SLOT_ICONS = ['motorcycle', 'car', 'ebike', 'van'];
const PARKING_SLOT_STATUSES = ['active', 'maintenance'];
const PARKING_NO_PLATE_TYPES = ['ebike'];
const PARKING_MAX_DURATION_MONTHS = 6;   // default for the parking_max_duration_months setting
const PARKING_MAX_SLOTS = 200;           // slots not archived

function parking_setting_int($conn, $key, $default, $min, $max) {
    $v = get_setting($conn, $key, $default);
    return ctype_digit((string)$v) && (int)$v >= $min && (int)$v <= $max ? (int)$v : $default;
}

// Longest permit a tenant may ask for, in months (Parking settings, 1-12).
function parking_max_duration_months($conn) {
    return parking_setting_int($conn, 'parking_max_duration_months', PARKING_MAX_DURATION_MONTHS, 1, 12);
}

// Open (Pending + Assigned) reservations one tenant may hold (Parking settings, 1-5).
function parking_max_per_tenant($conn) {
    return parking_setting_int($conn, 'parking_max_per_tenant', 1, 1, 5);
}

// The "Free parking" switch: new requests cost nothing and are never billed.
function parking_is_free($conn) {
    return in_array((string)get_setting($conn, 'parking_free', '0'), ['1', 'true'], true);
}

// The fee a new request is charged per month: 0 while parking is free.
function parking_monthly_fee($conn) {
    if (parking_is_free($conn)) return 0.0;
    $v = get_setting($conn, 'parking_monthly_fee', 300);
    return is_numeric($v) && (float)$v > 0 ? (float)$v : 300.0;
}

// A reservation's own fee per month (fixed when it was requested); rows from
// before monthly_fee existed fall back to the current fee.
function parking_reservation_fee($conn, $row) {
    return isset($row['monthly_fee']) && $row['monthly_fee'] !== null ? (float)$row['monthly_fee'] : parking_monthly_fee($conn);
}

function parking_slot_row($row) {
    $types = json_decode((string)$row['vehicle_types'], true);
    $types = is_array($types) ? array_values(array_intersect(array_map('strtolower', $types), PARKING_VEHICLE_TYPES)) : [];
    return [
        'id' => (int)$row['id'],
        'label' => (string)$row['label'],
        'icon' => in_array($row['icon'], PARKING_SLOT_ICONS, true) ? $row['icon'] : 'motorcycle',
        'vehicle_types' => $types,
        'requires_registration' => (int)$row['requires_registration'] === 1,
        'status' => $row['status'] === 'maintenance' ? 'maintenance' : 'active',
        'archived' => $row['archived_at'] !== null,
    ];
}

// Slots in display order (archived ones only when asked), keyed by id.
function parking_slots($conn, $include_archived = false) {
    $sql = "SELECT id, label, icon, vehicle_types, requires_registration, status, archived_at FROM parking_slots"
         . ($include_archived ? '' : ' WHERE archived_at IS NULL')
         . " ORDER BY sort_order, id";
    $res = $conn->query($sql);
    $slots = [];
    while ($res && ($row = $res->fetch_assoc())) $slots[(int)$row['id']] = parking_slot_row($row);
    return $slots;
}

// Slot id => the Assigned reservation holding it.
function parking_assigned_by_slot($conn) {
    $taken = [];
    $res = $conn->query("SELECT id, user_id, slot_number, vehicle_type FROM parking_reservations WHERE status = 'Assigned' AND slot_number IS NOT NULL");
    while ($res && ($row = $res->fetch_assoc())) $taken[(int)$row['slot_number']] = $row;
    return $taken;
}

// Free slots (active, not archived, not assigned), optionally only those that take $type.
function parking_free_slots($slots, $taken, $type = null) {
    $type = $type === null ? null : strtolower((string)$type);
    return array_filter($slots, fn($s) => !$s['archived'] && $s['status'] === 'active' && !isset($taken[$s['id']])
        && ($type === null || in_array($type, $s['vehicle_types'], true)));
}

// ['max' => usable slots, 'taken' => [assigned slot ids], 'occupied' => n,
//  'available' => free slots, 'maintenance' => n, 'free_by_type' => [type => n]]
function parking_capacity($conn, $slots = null, $taken = null) {
    $slots = $slots ?? parking_slots($conn);
    $taken = $taken ?? parking_assigned_by_slot($conn);
    $usable = array_filter($slots, fn($s) => $s['status'] === 'active');
    $free = parking_free_slots($slots, $taken);
    $by_type = array_fill_keys(PARKING_VEHICLE_TYPES, 0);
    foreach ($free as $s) foreach ($s['vehicle_types'] as $t) $by_type[$t]++;
    return [
        'max' => count($usable),
        'taken' => array_map('intval', array_keys($taken)),
        'occupied' => count(array_intersect_key($taken, $slots)),
        'available' => count($free),
        'maintenance' => count($slots) - count($usable),
        'free_by_type' => $by_type,
    ];
}

// Once the lot is full for a vehicle type, the requests still waiting for that
// type cannot be given a slot: each is closed as Rejected and the tenant is told
// the parking is full. Run after a slot is assigned. Returns the closed ids.
function parking_close_unservable_requests($conn) {
    $slots = parking_slots($conn);
    $taken = parking_assigned_by_slot($conn);
    $res = $conn->query("SELECT id, user_id, vehicle_type, vehicle_model, plate_number FROM parking_reservations WHERE status = 'Pending'");
    $pending = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
    $closed = [];
    $free_by_type = [];
    foreach ($pending as $p) {
        $type = strtolower((string)$p['vehicle_type']);
        $free_by_type[$type] ??= count(parking_free_slots($slots, $taken, $type));
        if ($free_by_type[$type] > 0) continue;

        $reason = 'Parking is full';
        $upd = $conn->prepare("UPDATE parking_reservations SET status = 'Rejected', rejection_reason = ? WHERE id = ? AND status = 'Pending'");
        $id = (int)$p['id'];
        $upd->bind_param('si', $reason, $id);
        $upd->execute();
        $changed = $upd->affected_rows > 0;
        $upd->close();
        if (!$changed) continue;

        resolve_admin_queue($conn, 'parking_reservation', $id);
        $vehicle = $p['vehicle_model'] . ($p['plate_number'] ? " ({$p['plate_number']})" : '');
        create_notification($conn, (int)$p['user_id'], 'parking_reservation', 'Parking Is Full',
            "Unfortunately the parking is full: every slot for your vehicle type is taken, so your request for $vehicle has been closed. You can send a new request when a slot frees up.");
        $closed[] = $id;
    }
    return $closed;
}

// First day after a permit's last billable month, or null if never assigned.
function parking_term_end($assigned_at, $duration_months) {
    if (!$assigned_at) return null;
    $start = new DateTime(substr($assigned_at, 0, 10));
    return $start->modify('+' . (int)$duration_months . ' months');
}

// Ends a user's open parking when their tenancy ends (move-out, archive): an
// Assigned slot is Released, a Pending request is Cancelled. Returns rows changed.
function release_user_parking($conn, $user_id, $reason) {
    $stmt = $conn->prepare("SELECT id, status, slot_number FROM parking_reservations WHERE user_id = ? AND status IN ('Pending', 'Assigned')");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    foreach ($rows as $r) {
        $new = $r['status'] === 'Assigned' ? 'Released' : 'Cancelled';
        $upd = $conn->prepare("UPDATE parking_reservations SET status = ?, released_at = NOW(), release_reason = ? WHERE id = ? AND status = ?");
        $upd->bind_param("ssis", $new, $reason, $r['id'], $r['status']);
        $upd->execute();
        $upd->close();
        resolve_admin_queue($conn, 'parking_reservation', $r['id']);
        $slot = $r['slot_number'] ? " (slot #{$r['slot_number']})" : '';
        create_notification($conn, $user_id, 'parking_reservation', "Parking " . ($new === 'Released' ? 'Slot Released' : 'Request Cancelled'),
            "Your parking reservation$slot has been " . strtolower($new) . ": $reason.");
    }
    return count($rows);
}

// Sweep step: releases Assigned permits whose term has ended, or whose tenant no
// longer has an active tenancy (e.g. moved out before this release existed).
function release_lapsed_parking($conn) {
    $released = 0;
    $res = $conn->query("SELECT id, user_id, assigned_at, duration_months FROM parking_reservations WHERE status = 'Assigned'");
    $rows = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
    $today = new DateTime(date('Y-m-d'));

    foreach ($rows as $r) {
        $end = parking_term_end($r['assigned_at'], $r['duration_months']);
        $reason = null;
        if ($end && $end <= $today) {
            $reason = 'Permit term ended';
        } elseif (!get_active_tenancy($conn, (int)$r['user_id'])) {
            $reason = 'Tenancy ended';
        }
        if ($reason === null) continue;

        $upd = $conn->prepare("UPDATE parking_reservations SET status = 'Released', released_at = NOW(), release_reason = ? WHERE id = ? AND status = 'Assigned'");
        $upd->bind_param("si", $reason, $r['id']);
        $upd->execute();
        $changed = $upd->affected_rows > 0;
        $upd->close();
        if (!$changed) continue;

        create_notification($conn, (int)$r['user_id'], 'parking_reservation', 'Parking Slot Released',
            "Your parking slot has been released: $reason. Submit a new request if you still need parking.");
        $released++;
    }
    return $released;
}

// ── Visitor management (checklist Module 12) ──

// Ends a user's open visitor pre-registrations when their tenancy ends
// (move-out, archive, contract termination): a Pending request is Cancelled.
// Mirrors release_user_parking() above. Returns rows changed.
function cancel_user_visitor_registrations($conn, $user_id, $reason) {
    $stmt = $conn->prepare("SELECT id, visitor_name, room_name FROM visitor_logs WHERE user_id = ? AND status = 'pending_approval'");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    foreach ($rows as $r) {
        $upd = $conn->prepare("UPDATE visitor_logs SET status = 'cancelled', admin_notes = ? WHERE id = ? AND status = 'pending_approval'");
        $upd->bind_param("si", $reason, $r['id']);
        $upd->execute();
        $upd->close();
        resolve_admin_queue($conn, 'visitor_registration', $r['id']);
    }
    return count($rows);
}

// Alerts admins and the host tenant, once per visit, when a checked-in
// visitor has stayed past the configurable overstay threshold. Before this
// existed, "overstayed" was only a label computed at read time — nobody was
// actually notified (panel flow: "Alert Admin of Overstay"). Called from
// get_notifications.php on every poll: the threshold is in hours, so the
// once-a-day sweep is too coarse. overstay_alerted_at is the atomic claim,
// so a race between two requests can never double-alert one visit.
function alert_overstayed_visitors($conn) {
    $hours = (int)get_setting($conn, 'visitor_overstay_hours', 24);
    if ($hours <= 0) $hours = 24;

    $stmt = $conn->prepare("SELECT id, user_id, visitor_name, room_name FROM visitor_logs
                            WHERE status = 'checked_in' AND overstay_alerted_at IS NULL
                              AND TIMESTAMPDIFF(HOUR, check_in_at, NOW()) >= ?");
    if (!$stmt) return 0; // column not migrated yet
    $stmt->bind_param("i", $hours);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    $alerted = 0;
    $claim = $conn->prepare("UPDATE visitor_logs SET overstay_alerted_at = NOW() WHERE id = ? AND overstay_alerted_at IS NULL");
    foreach ($rows as $r) {
        $claim->bind_param("i", $r['id']);
        $claim->execute();
        if ($claim->affected_rows === 0) continue; // claimed by a concurrent poll
        $alerted++;

        $unit = $r['room_name'] ?: 'a unit';
        notify_admins_queue($conn, 'visitor_overstay', $r['id'], "Visitor Overstay: {$r['visitor_name']}",
            "{$r['visitor_name']} has stayed past $hours hour(s) at Unit $unit and has not checked out.");
        if (!empty($r['user_id'])) {
            create_notification($conn, (int)$r['user_id'], 'visitor_log', 'Visitor Overstay',
                "Your visitor {$r['visitor_name']} has stayed past $hours hour(s). Please check them out or contact management.");
        }
    }
    $claim->close();
    return $alerted;
}

// ── Activity log vocabulary (checklist 8.6) ──
const LOG_CATEGORIES = [
    'auth'          => 'Authentication',
    'user'          => 'User Accounts',
    'tenant'        => 'Tenants',
    'unit'          => 'Units',
    'contract'      => 'Contracts',
    'billing'       => 'Billing & Payments',
    'utilities'     => 'Utilities',
    'maintenance'   => 'Maintenance',
    'service'       => 'Services, CCTV, Parking & Visitors',
    'inquiry'       => 'Inquiries & Reservations',
    'communication' => 'Announcements',
    'system'        => 'System & Settings',
];

function normalize_log_category($value) {
    $map = [
        'payment' => 'billing', 'invoice' => 'billing', 'billing' => 'billing',
        'user management' => 'user', 'user' => 'user',
        'tenant management' => 'tenant', 'application' => 'tenant', 'rent_application' => 'tenant', 'tenant' => 'tenant',
        'contract' => 'contract', 'document' => 'contract', 'lease' => 'contract',
        'unit' => 'unit', 'room' => 'unit',
        'utilities' => 'utilities', 'utility' => 'utilities',
        'maintenance' => 'maintenance',
        'service' => 'service', 'cctv' => 'service', 'parking' => 'service', 'visitor' => 'service',
        'inquiry' => 'inquiry', 'reservation' => 'inquiry',
        'communication' => 'communication', 'announcement' => 'communication', 'notification' => 'communication',
        'auth' => 'auth', 'security' => 'auth', 'login' => 'auth',
        'system' => 'system',
    ];
    return $map[strtolower(trim((string)$value))] ?? 'system';
}

// ── Legacy identity headers ──
// About forty endpoints still read $_SERVER['HTTP_X_USER_ID'] / ['HTTP_X_ADMIN_ID'],
// values the client sets freely. Rather than trust whatever arrived, both are
// overwritten here — before any endpoint code runs — with the id of the verified
// session, and removed entirely when there is none. A forged header therefore
// resolves to nothing, in every endpoint at once, including the ones that use
// the value for attribution columns such as created_by.
(function ($conn) {
    unset($_SERVER['HTTP_X_USER_ID'], $_SERVER['HTTP_X_ADMIN_ID']);
    $user = get_authenticated_user($conn);
    if ($user) {
        $_SERVER['HTTP_X_USER_ID'] = (string)$user['id'];
        if ($user['role'] === 'admin') {
            $_SERVER['HTTP_X_ADMIN_ID'] = (string)$user['id'];
        }
    }
})($conn);
?>
