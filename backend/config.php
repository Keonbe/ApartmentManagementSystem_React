<?php
// Load environment configuration if available
if (file_exists(__DIR__ . '/config.env.php')) {
    require_once __DIR__ . '/config.env.php';
}

// Settings come from, in order: config.env.php constants (XAMPP), environment
// variables (Railway / Docker), then local defaults. $_ENV/$_SERVER are checked
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
if (!defined('APP_ENV')) define('APP_ENV', ams_env('APP_ENV', 'development'));
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

require_once __DIR__ . '/cors.php';

// Error reporting & resource limits (D-1, D-6)
if (APP_ENV === 'production') {
    @ini_set('display_errors', '0');
    @ini_set('log_errors', '1');
}

@ini_set('upload_max_filesize', '10M');
@ini_set('post_max_size', '12M');
@ini_set('memory_limit', '128M');

// An uncaught exception used to print PHP's own error page — or, in the many
// endpoints that catch and echo $e->getMessage(), the raw SQL error — to the
// client, while nothing was recorded on the server. Uncaught ones now go to the
// PHP error log and the client gets a generic message.
if (PHP_SAPI !== 'cli') {
    set_exception_handler(function ($e) {
        error_log('[AMS] ' . ($_SERVER['SCRIPT_NAME'] ?? 'cli') . ': ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json');
        }
        echo json_encode(["success" => false, "message" => "Server error. Please try again."]);
    });
}

// For endpoints that catch an exception themselves: log the detail, return a
// safe message.
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
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
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

    if (empty($expired)) return 0;

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

    return $released;
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
function send_lease_end_reminders($conn) {
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
            create_notification($conn, (int)$row['user_id'], 'contract_update', 'Rent Approaching End',
                "Your rent for $unit ends on $end. Visit My Room to request an extension if you'd like to stay.");

            // SMS and email too. After the claim, so a re-run never texts twice,
            // and never allowed to stop the rest of the sweep.
            try {
                require_once __DIR__ . '/api/services/send_notification.php';
                dispatch_system_notification($conn, (int)$row['user_id'], 'contract_update', 'Rent Approaching End',
                    sms_lease_reminder_template($row['room_name'], $row['lease_end'], $row['days_left']),
                    email_lease_reminder_template(notify_recipient_name($conn, $row['user_id']),
                        $row['room_name'] ?: '-', $end, (int)$row['days_left']),
                    null);
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
    'active'           => ['flag', 'terminate', 'edit'],
    'eviction-pending' => ['clear', 'terminate', 'edit'],
    'expired'          => ['terminate', 'edit'],
    'terminated'       => [],
];

function contract_action_allowed($current_status, $action) {
    $allowed = CONTRACT_TRANSITIONS[$current_status] ?? [];
    return in_array($action, $allowed, true);
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
    $stmt = $conn->prepare("SELECT first_name, last_name, room_name, user_id FROM rent_applications WHERE id = ?");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $app = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$app) return null;

    $full_name = trim($app['first_name'] . ' ' . $app['last_name']);
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

// Posts a completed service request's cost onto the tenant's invoice for the
// current billing period, mirroring how sync_utility_to_invoice.php merges
// utility amounts. Unlike water/electricity the `services` column ACCUMULATES,
// so several completed requests in one month add up on the same invoice.
//
// The is_invoiced flag is claimed FIRST, inside the transaction, so a repeated
// call (double-click, replayed request) can never bill twice. A rollback
// un-claims it, leaving the request billable again via sync_service_to_invoice.php.
//
// Returns ['ok' => bool, 'invoice_id' => string|null, 'message' => string].
function post_service_charge($conn, $service_request_id) {
    $conn->begin_transaction();

    try {
        //1.ClaimTheRowBeforeTouchingAnyMoney
        $claim = $conn->prepare("UPDATE service_requests SET is_invoiced = 1 WHERE id = ? AND is_invoiced = 0");
        $claim->bind_param("i", $service_request_id);
        $claim->execute();
        $claimed = $claim->affected_rows;
        $claim->close();

        if ($claimed === 0) {
            $conn->rollback();
            return ['ok' => false, 'invoice_id' => null, 'message' => 'This service request has already been billed.'];
        }

        //2.LoadTheClaimedRequest
        $stmt = $conn->prepare("SELECT user_id, total_cost, service_name FROM service_requests WHERE id = ? FOR UPDATE");
        $stmt->bind_param("i", $service_request_id);
        $stmt->execute();
        $request = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$request) {
            $conn->rollback();
            return ['ok' => false, 'invoice_id' => null, 'message' => 'Service request not found.'];
        }

        $user_id = (int)$request['user_id'];
        $amount = (float)$request['total_cost'];

        //FreeServicesStayClaimedButNeverReachAnInvoice
        if ($amount <= 0) {
            $conn->commit();
            return ['ok' => true, 'invoice_id' => null, 'message' => 'No charge for this service.'];
        }

        //3.BillingPeriodIsTheMonthOfDelivery,InManilaTime
        $now = new DateTime('now', new DateTimeZone('Asia/Manila'));
        $period = billing_period_label($now);
        $legacy_period = $now->format('Y-m');

        //4.FindThisTenantsAdjustableInvoiceForThePeriod (label format, plus legacy 'Y-m')
        $adjustable = "('" . implode("','", SERVICE_ADJUSTABLE_INVOICE_STATUSES) . "')";
        $stmt = $conn->prepare("SELECT id FROM invoices WHERE user_id = ? AND billing_period IN (?, ?) AND status IN $adjustable AND payment_group IS NULL ORDER BY created_at ASC LIMIT 1");
        $stmt->bind_param("iss", $user_id, $period, $legacy_period);
        $stmt->execute();
        $invoice = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        $invoice_id = $invoice ? $invoice['id'] : null;

        //5.NoAdjustableInvoice-CreateAServicesOnlyInvoice. Rent is never billed from here.
        if (!$invoice_id) {
            $lease = get_active_tenancy($conn, $user_id);

            if (!$lease) {
                //RollbackUnclaimsTheRowSoTheChargeCanBePostedLater
                $conn->rollback();
                return ['ok' => false, 'invoice_id' => null, 'message' => 'No active approved rental — cannot post service charge.'];
            }

            $invoice_id = 'INV-' . $now->format('Ym') . '-' . strtoupper(bin2hex(random_bytes(4)));
            $due_date = (clone $now)->modify('first day of next month')->modify('+4 days')->format('Y-m-d');

            $stmt = $conn->prepare("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date)
                                    VALUES (?, ?, ?, 0, 0, ?, 'pending', ?)");
            $stmt->bind_param("siiss", $invoice_id, $user_id, $lease['id'], $period, $due_date);
            if (!$stmt->execute()) {
                $stmt->close();
                throw new Exception("Failed to create services invoice: " . $conn->error);
            }
            $stmt->close();
        }

        //6.AccumulateOntoTheServicesColumn,NeverOverwrite
        $stmt = $conn->prepare("UPDATE invoices SET services = services + ?, total_amount = total_amount + ? WHERE id = ?");
        $stmt->bind_param("dds", $amount, $amount, $invoice_id);
        if (!$stmt->execute()) {
            $stmt->close();
            throw new Exception("Failed to post service charge: " . $conn->error);
        }
        $stmt->close();

        //7.LinkTheRequestBackToTheInvoiceItLandedOn
        $stmt = $conn->prepare("UPDATE service_requests SET invoice_id = ?, billing_period = ? WHERE id = ?");
        $stmt->bind_param("ssi", $invoice_id, $period, $service_request_id);
        $stmt->execute();
        $stmt->close();

        $conn->commit();
        return ['ok' => true, 'invoice_id' => $invoice_id, 'message' => "Charge posted to invoice $invoice_id ($period)."];

    } catch (Exception $e) {
        $conn->rollback();
        return ['ok' => false, 'invoice_id' => null, 'message' => $e->getMessage()];
    }
}

// Backs a service charge out of its invoice. Only possible while that invoice is
// still unpaid — once settled the money has changed hands, so the admin must
// issue a manual credit instead.
//
// Returns ['ok' => bool, 'message' => string].
function reverse_service_charge($conn, $service_request_id) {
    $conn->begin_transaction();

    try {
        $stmt = $conn->prepare("SELECT total_cost, invoice_id, is_invoiced FROM service_requests WHERE id = ? FOR UPDATE");
        $stmt->bind_param("i", $service_request_id);
        $stmt->execute();
        $request = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$request || !(int)$request['is_invoiced'] || !$request['invoice_id']) {
            $conn->rollback();
            return ['ok' => true, 'message' => 'Nothing to reverse.'];
        }

        $amount = (float)$request['total_cost'];

        //TheStatusGuardIsWhatMakesThisSafe:APaidOrInFlightInvoiceMatchesNoRows
        $adjustable = "('" . implode("','", SERVICE_ADJUSTABLE_INVOICE_STATUSES) . "')";
        $stmt = $conn->prepare("UPDATE invoices SET services = GREATEST(services - ?, 0), total_amount = GREATEST(total_amount - ?, 0) WHERE id = ? AND status IN $adjustable");
        $stmt->bind_param("dds", $amount, $amount, $request['invoice_id']);
        $stmt->execute();
        $reversed = $stmt->affected_rows;
        $stmt->close();

        if ($reversed === 0) {
            $conn->rollback();
            $inv = $conn->prepare("SELECT status FROM invoices WHERE id = ?");
            $inv->bind_param("s", $request['invoice_id']);
            $inv->execute();
            $inv_status = $inv->get_result()->fetch_assoc()['status'] ?? null;
            $inv->close();
            $reason = match ($inv_status) {
                'processing' => 'has an online payment in progress',
                'pending-verification' => 'has a payment under verification',
                'paid' => 'is already paid; issue a manual credit instead',
                default => 'can no longer be adjusted',
            };
            return ['ok' => false, 'message' => 'Invoice ' . $request['invoice_id'] . ' ' . $reason . '.'];
        }

        $stmt = $conn->prepare("UPDATE service_requests SET is_invoiced = 0, invoice_id = NULL, billing_period = NULL WHERE id = ?");
        $stmt->bind_param("i", $service_request_id);
        $stmt->execute();
        $stmt->close();

        $conn->commit();
        return ['ok' => true, 'message' => 'Service charge reversed from invoice ' . $request['invoice_id'] . '.'];

    } catch (Exception $e) {
        $conn->rollback();
        return ['ok' => false, 'message' => $e->getMessage()];
    }
}

// Posts a completed, tenant-caused repair's cost onto the tenant's invoice
// for the current billing period — the same accumulate-not-overwrite pattern
// post_service_charge() uses for `services`, but landing on its own
// `maintenance` column so a repair recharge never blends into "Add-On
// Service Revenue" in Reports (audit H10). Before this existed, a ticket
// flagged tenant_responsible = 1 was excluded from building expenses and
// totalled in the UI as "tenant charged", but nothing ever billed it — the
// revenue reports counted as collected was never actually invoiced.
//
// The is_invoiced flag is claimed FIRST, inside the transaction, exactly like
// post_service_charge(), so a repeated call can never bill twice.
//
// Returns ['ok' => bool, 'invoice_id' => string|null, 'message' => string].
function post_maintenance_charge($conn, $maintenance_request_id) {
    $conn->begin_transaction();

    try {
        $claim = $conn->prepare("UPDATE maintenance_requests SET is_invoiced = 1 WHERE id = ? AND is_invoiced = 0");
        $claim->bind_param("i", $maintenance_request_id);
        $claim->execute();
        $claimed = $claim->affected_rows;
        $claim->close();

        if ($claimed === 0) {
            $conn->rollback();
            return ['ok' => false, 'invoice_id' => null, 'message' => 'This maintenance request has already been billed.'];
        }

        $stmt = $conn->prepare("SELECT user_id, actual_cost, estimated_cost FROM maintenance_requests WHERE id = ? FOR UPDATE");
        $stmt->bind_param("i", $maintenance_request_id);
        $stmt->execute();
        $request = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$request) {
            $conn->rollback();
            return ['ok' => false, 'invoice_id' => null, 'message' => 'Maintenance request not found.'];
        }

        $user_id = (int)$request['user_id'];
        $amount = (float)($request['actual_cost'] ?? $request['estimated_cost'] ?? 0);

        if ($amount <= 0) {
            $conn->commit();
            return ['ok' => true, 'invoice_id' => null, 'message' => 'No charge for this ticket.'];
        }

        $now = new DateTime('now', new DateTimeZone('Asia/Manila'));
        $period = billing_period_label($now);
        $legacy_period = $now->format('Y-m');

        $adjustable = "('" . implode("','", SERVICE_ADJUSTABLE_INVOICE_STATUSES) . "')";
        $stmt = $conn->prepare("SELECT id FROM invoices WHERE user_id = ? AND billing_period IN (?, ?) AND status IN $adjustable AND payment_group IS NULL ORDER BY created_at ASC LIMIT 1");
        $stmt->bind_param("iss", $user_id, $period, $legacy_period);
        $stmt->execute();
        $invoice = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        $invoice_id = $invoice ? $invoice['id'] : null;

        if (!$invoice_id) {
            $lease = get_active_tenancy($conn, $user_id);

            if (!$lease) {
                $conn->rollback();
                return ['ok' => false, 'invoice_id' => null, 'message' => 'No active approved rental — cannot post maintenance charge.'];
            }

            $invoice_id = 'INV-' . $now->format('Ym') . '-' . strtoupper(bin2hex(random_bytes(4)));
            $due_date = (clone $now)->modify('first day of next month')->modify('+4 days')->format('Y-m-d');

            $stmt = $conn->prepare("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date)
                                    VALUES (?, ?, ?, 0, 0, ?, 'pending', ?)");
            $stmt->bind_param("siiss", $invoice_id, $user_id, $lease['id'], $period, $due_date);
            if (!$stmt->execute()) {
                $stmt->close();
                throw new Exception("Failed to create maintenance invoice: " . $conn->error);
            }
            $stmt->close();
        }

        $stmt = $conn->prepare("UPDATE invoices SET maintenance = maintenance + ?, total_amount = total_amount + ? WHERE id = ?");
        $stmt->bind_param("dds", $amount, $amount, $invoice_id);
        if (!$stmt->execute()) {
            $stmt->close();
            throw new Exception("Failed to post maintenance charge: " . $conn->error);
        }
        $stmt->close();

        $stmt = $conn->prepare("UPDATE maintenance_requests SET invoice_id = ?, billing_period = ? WHERE id = ?");
        $stmt->bind_param("ssi", $invoice_id, $period, $maintenance_request_id);
        $stmt->execute();
        $stmt->close();

        $conn->commit();
        return ['ok' => true, 'invoice_id' => $invoice_id, 'message' => "Charge posted to invoice $invoice_id ($period)."];

    } catch (Exception $e) {
        $conn->rollback();
        return ['ok' => false, 'invoice_id' => null, 'message' => $e->getMessage()];
    }
}

// Backs a tenant-responsibility repair charge out of its invoice, mirroring
// reverse_service_charge(). Only possible while that invoice is still
// unpaid — once settled the money has changed hands, so the admin must issue
// a manual credit instead.
//
// Returns ['ok' => bool, 'message' => string].
function reverse_maintenance_charge($conn, $maintenance_request_id) {
    $conn->begin_transaction();

    try {
        $stmt = $conn->prepare("SELECT actual_cost, estimated_cost, invoice_id, is_invoiced FROM maintenance_requests WHERE id = ? FOR UPDATE");
        $stmt->bind_param("i", $maintenance_request_id);
        $stmt->execute();
        $request = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$request || !(int)$request['is_invoiced'] || !$request['invoice_id']) {
            $conn->rollback();
            return ['ok' => true, 'message' => 'Nothing to reverse.'];
        }

        $amount = (float)($request['actual_cost'] ?? $request['estimated_cost'] ?? 0);

        $adjustable = "('" . implode("','", SERVICE_ADJUSTABLE_INVOICE_STATUSES) . "')";
        $stmt = $conn->prepare("UPDATE invoices SET maintenance = GREATEST(maintenance - ?, 0), total_amount = GREATEST(total_amount - ?, 0) WHERE id = ? AND status IN $adjustable");
        $stmt->bind_param("dds", $amount, $amount, $request['invoice_id']);
        $stmt->execute();
        $reversed = $stmt->affected_rows;
        $stmt->close();

        if ($reversed === 0) {
            $conn->rollback();
            $inv = $conn->prepare("SELECT status FROM invoices WHERE id = ?");
            $inv->bind_param("s", $request['invoice_id']);
            $inv->execute();
            $inv_status = $inv->get_result()->fetch_assoc()['status'] ?? null;
            $inv->close();
            $reason = match ($inv_status) {
                'processing' => 'has an online payment in progress',
                'pending-verification' => 'has a payment under verification',
                'paid' => 'is already paid; issue a manual credit instead',
                default => 'can no longer be adjusted',
            };
            return ['ok' => false, 'message' => 'Invoice ' . $request['invoice_id'] . ' ' . $reason . '.'];
        }

        $stmt = $conn->prepare("UPDATE maintenance_requests SET is_invoiced = 0, invoice_id = NULL, billing_period = NULL WHERE id = ?");
        $stmt->bind_param("i", $maintenance_request_id);
        $stmt->execute();
        $stmt->close();

        $conn->commit();
        return ['ok' => true, 'message' => 'Maintenance charge reversed from invoice ' . $request['invoice_id'] . '.'];

    } catch (Exception $e) {
        $conn->rollback();
        return ['ok' => false, 'message' => $e->getMessage()];
    }
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

    $touch = $conn->prepare("UPDATE sessions SET last_seen_at = NOW() WHERE token = ?");
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

// Ready-to-interpolate SQL tuple, e.g. "('pending','unpaid',...)". The values
// are hardcoded constants above (never request input), so inlining them is
// safe and keeps the many call sites from each needing dynamic placeholders.
function billing_open_status_sql() {
    return "('" . implode("','", BILLING_OPEN_STATUSES) . "')";
}

// Settles an invoice in full, whichever channel the money actually arrived
// through — the front desk (record_payment_admin.php) or a verified PayMongo
// webhook event (paymongo_webhook.php). Before this existed each path ran its
// own copy of the move-in cascade, so an online move-in payment never
// activated the room/application/contract the way a desk payment did (audit
// M12) — an online-paid move-in invoice left the application 'Approved' and
// the contract a draft forever.
//
// $amount_paid is the desk-only short-payment guard — this system settles in
// full, there is no partial-payment ledger. The webhook validates the paid
// amount against total_amount itself before calling this (audit H9b), so it
// always passes null here.
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
        if ($amount_paid !== null) {
            $due_q = $conn->prepare("SELECT total_amount FROM invoices WHERE id = ?");
            $due_q->bind_param("s", $invoice_id);
            $due_q->execute();
            $due_row = $due_q->get_result()->fetch_assoc();
            $due_q->close();
            if ($due_row && $amount_paid + 0.009 < (float)$due_row['total_amount']) {
                throw new Exception("Amount tendered (₱" . number_format($amount_paid, 2) . ") is less than the invoice total (₱" . number_format((float)$due_row['total_amount'], 2) . "). Partial payments are not supported.");
            }
        }

        $inv_q = $conn->prepare("SELECT user_id, rent_application_id, security_deposit, advance_months, id, billing_period, total_amount, payment_reference FROM invoices WHERE id = ?");
        $inv_q->bind_param("s", $invoice_id);
        $inv_q->execute();
        $inv_res = $inv_q->get_result()->fetch_assoc();
        $inv_q->close();
        if (!$inv_res) throw new Exception("Invoice not found.");

        $bank_name = null;
        if (is_array($payment_splits) && count($payment_splits) === 1) $bank_name = $payment_splits[0]['bank_name'] ?? null;
        $stmt = $conn->prepare("UPDATE invoices SET status = 'paid', payment_method = ?, payment_reference = COALESCE(?, payment_reference), bank_name = COALESCE(?, bank_name), paid_at = COALESCE(paid_at, NOW()) WHERE id = ? AND status IN " . billing_open_status_sql());
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
            'amount' => (float)$inv_res['total_amount'],
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

        foreach (is_array($payment_splits) ? $transactions : [] as $transaction) {
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
            $app_q = $conn->prepare("SELECT first_name, last_name, room_name FROM rent_applications WHERE id = ? AND status = 'Approved'");
            $app_q->bind_param("i", $app_id);
            $app_q->execute();
            $app_row = $app_q->get_result()->fetch_assoc();
            $app_q->close();
            if ($app_row) {
                resolve_admin_queue($conn, 'rent_application', $app_id);
                notify_admins_queue($conn, 'rent_application', $app_id, 'Move-In Payment Received',
                    "{$app_row['first_name']} {$app_row['last_name']} paid the move-in invoice $invoice_id for Unit {$app_row['room_name']} ($payment_method). Schedule their move-in date.");
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
const MAINTENANCE_TRANSITIONS = [
    'Pending'     => ['In Progress', 'Rejected'],
    'In Progress' => ['Completed', 'Pending'],
    'Completed'   => ['In Progress'],
    'Rejected'    => [],
    'Cancelled'   => [],
];

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
        $due_date = date('Y-m-d', strtotime('+7 days'));
        $total_amount = $monthly_rent * 2; // 1st month + 1 month deposit
        $inv_stmt = $conn->prepare("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, security_deposit, total_amount, billing_period, status, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)");
        $inv_stmt->bind_param("siidddss", $invoice_id, $user_id, $app_id, $monthly_rent, $monthly_rent, $total_amount, $billing_period, $due_date);
        if (!$inv_stmt->execute()) {
            throw new Exception("Failed to create move-in invoice: " . $inv_stmt->error);
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
        $template_version_id = null;
        if (file_exists(__DIR__ . '/contract_template.php')) {
            require_once __DIR__ . '/contract_template.php';
            if (function_exists('contract_template_pin_version_id')) {
                $template_version_id = contract_template_pin_version_id($conn);
            }
        }
        if ($template_version_id) {
            $ctr_stmt = $conn->prepare("INSERT INTO lease_contracts (id, rent_application_id, deposit_amount, lease_start, lease_end, status, deposit_status, template_version_id) VALUES (?, ?, ?, ?, ?, 'draft', 'Pending', ?)");
            $ctr_stmt->bind_param("sidssi", $contract_id, $app_id, $monthly_rent, $lease_start, $lease_end, $template_version_id);
        } else {
            $ctr_stmt = $conn->prepare("INSERT INTO lease_contracts (id, rent_application_id, deposit_amount, lease_start, lease_end, status, deposit_status) VALUES (?, ?, ?, ?, ?, 'draft', 'Pending')");
            $ctr_stmt->bind_param("sidss", $contract_id, $app_id, $monthly_rent, $lease_start, $lease_end);
        }
        if (!$ctr_stmt->execute()) {
            throw new Exception("Failed to create rent contract: " . $ctr_stmt->error);
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

// Issues the rent invoice for one tenancy month, due on the month's start.
// Returns the new invoice id, or null when that month is already billed
// (including by a concurrent writer — the unique key refuses the second row).
function create_rent_invoice($conn, $user_id, $app_id, $period_start, $rent, $payment_group = null) {
    if (rent_period_billed($conn, $user_id, $period_start)) return null;

    $period = new DateTime($period_start);
    $label = billing_period_label($period);
    $invoice_id = 'INV-' . $period->format('Ym') . '-' . strtoupper(bin2hex(random_bytes(4)));
    $rent = round((float)$rent, 2);

    $stmt = $conn->prepare("INSERT IGNORE INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date, rent_period_start, payment_group)
                            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)");
    $stmt->bind_param("siiddssss", $invoice_id, $user_id, $app_id, $rent, $rent, $label, $period_start, $period_start, $payment_group);
    $stmt->execute();
    $created = $stmt->affected_rows > 0;
    $stmt->close();
    return $created ? $invoice_id : null;
}

// Issues one tenancy month's rent invoice and tells the tenant. With an
// 'available' advance credit (advance_credits row) the month is billed at the
// credited amount and settled from it at once, so it still gets its own
// invoice and receipt. Returns the invoice id, or null when already billed.
function issue_rent_invoice($conn, $user_id, $app_id, $start, $rent, $credit = null) {
    $amount = $credit ? (float)$credit['amount'] : (float)$rent;
    $invoice_id = create_rent_invoice($conn, $user_id, $app_id, $start, $amount);
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
    $due = (new DateTime($start))->format('M j, Y');
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
    return [];
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
    $sql = "SELECT id, user_id, status, total_amount, billing_period, due_date, checkout_session_id, payment_group, payment_method
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

    $total = array_sum(array_map(fn($row) => (float)$row['total_amount'], $rows));
    if ($amount_paid !== null && $amount_paid + 0.009 < $total) {
        return $fail("Amount tendered (₱" . number_format($amount_paid, 2) . ") is less than the $what total (₱" . number_format($total, 2) . "). Partial payments are not supported.");
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
            $invoice_remaining = (float)$row['total_amount'];
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
        $amount = array_sum(array_map(fn($row) => (float)$row['total_amount'], $settled_rows));
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
        SET status = 'overdue',
            -- A checkout that never completed must not leave a session id
            -- behind that a late-arriving webhook could still match on.
            checkout_session_id = CASE WHEN status = 'processing' THEN NULL ELSE checkout_session_id END
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
            SET late_fee = ROUND((base_rent + water + electricity + parking + services + maintenance) * ? / 100, 2),
                total_amount = total_amount + ROUND((base_rent + water + electricity + parking + services + maintenance) * ? / 100, 2)
            WHERE status = 'overdue' AND late_fee = 0 AND advance_months IS NULL
        ");
        $stmt->bind_param("dd", $value, $value);
    } else {
        $stmt = $conn->prepare("
            UPDATE invoices
            SET late_fee = ?, total_amount = total_amount + ?
            WHERE status = 'overdue' AND late_fee = 0 AND advance_months IS NULL
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

// Login throttling (A-5 / A-9). Failures are counted per IP and per account.
// The per-account limit is what stops password guessing from rotating IPs, and a
// successful login clears only that account's failures — previously one good
// login (even to the attacker's own account) wiped the whole IP's counter.
// change_password.php shares the same counters, so it is no longer an
// unthrottled side door for guessing a password.
const LOGIN_MAX_FAILURES_PER_IP = 20;
const LOGIN_MAX_FAILURES_PER_ACCOUNT = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

function login_throttle_message($conn, $ip, $email) {
    $email = strtolower(trim((string)$email));
    $stmt = $conn->prepare("SELECT
            SUM(ip_address = ?) AS by_ip,
            SUM(email = ?) AS by_email
        FROM login_attempts
        WHERE attempt_time > DATE_SUB(NOW(), INTERVAL " . LOGIN_LOCKOUT_MINUTES . " MINUTE)");
    $stmt->bind_param("ss", $ip, $email);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ((int)($row['by_email'] ?? 0) >= LOGIN_MAX_FAILURES_PER_ACCOUNT) {
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

// Password-reset request throttle (policy decided 2026-09-16, docs/todo.md).
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
    'move_out_request', 'cash_payment_declared'
];

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

// ── Household roster & unit waitlist (decided 2026-09-16, docs/todo.md) ──

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

// Sets a lease's occupant count and recalculates its rent: the room's base rate
// plus the per-person surcharge above 4. rooms.monthly_rent (the catalog rate)
// is never written here. Returns the new monthly rent, or null if not found.
function apply_occupant_count($conn, $app_id, $occupants) {
    $stmt = $conn->prepare("SELECT ra.room_name, r.monthly_rent AS base_rent FROM rent_applications ra LEFT JOIN rooms r ON r.id = ra.room_name WHERE ra.id = ?");
    $stmt->bind_param("i", $app_id);
    $stmt->execute();
    $app = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$app) return null;

    $base_rent = $app['base_rent'] !== null ? (float)$app['base_rent'] : 4000;
    $setting = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'occupant_surcharge_per_person'")->fetch_assoc();
    $surcharge = $setting ? (float)$setting['setting_value'] : 1000;
    $new_rent = $base_rent + ($occupants > 4 ? ($occupants - 4) * $surcharge : 0);

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

function get_setting($conn, $key, $default = null) {
    $stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?");
    $stmt->bind_param("s", $key);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ? $row['setting_value'] : $default;
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
    ];

    $reminders_enabled = get_setting($conn, 'rent_due_reminders_enabled', 'true') !== 'false';
    $reminder_days = max(0, (int)get_setting($conn, 'rent_due_reminder_days', 3));
    $overdue_enabled = get_setting($conn, 'overdue_reminders_enabled', 'true') !== 'false';
    $overdue_interval = max(1, (int)get_setting($conn, 'overdue_reminder_interval_days', 3));
    $today = new DateTime(date('Y-m-d'));

    if ($reminders_enabled) {
        $statuses = "('" . implode("','", REMINDER_UPCOMING_STATUSES) . "')";
        $stmt = $conn->prepare("SELECT i.id, i.user_id, i.total_amount, i.due_date, i.billing_period, ra.room_name, " . INVOICE_PERIOD_COLUMNS . "
                                FROM invoices i
                                LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
                                WHERE i.status IN $statuses AND i.due_date IS NOT NULL
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
        $stmt = $conn->prepare("SELECT i.id, i.user_id, i.total_amount, i.due_date, i.billing_period, ra.room_name, " . INVOICE_PERIOD_COLUMNS . "
                                FROM invoices i
                                LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
                                WHERE i.status = 'overdue' AND i.due_date IS NOT NULL AND i.due_date < CURDATE()
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
        $ids = $conn->query("SELECT id FROM parking_reservations WHERE status = 'Assigned'");
        while ($ids && ($r = $ids->fetch_assoc())) {
            $posted = post_parking_charge($conn, (int)$r['id'], $month);
            if ($posted['ok'] && !empty($posted['invoice_id'])) $result['parking_charges_posted']++;
        }
    }

    $result['contracts_expired'] = expire_lapsed_contracts($conn);
    $result['lease_end_reminders_sent'] = send_lease_end_reminders($conn);

    $did = $result['marked_overdue'] + $result['rent_invoices_created'] + $result['upcoming_reminders_sent'] + $result['overdue_reminders_sent']
         + $result['parking_released'] + $result['parking_charges_posted']
         + $result['contracts_expired'] + $result['lease_end_reminders_sent'];
    if ($did > 0) {
        log_activity($conn, null, 'system', 'Daily Notification Sweep',
            "Marked overdue: {$result['marked_overdue']}; rent invoices created: {$result['rent_invoices_created']}; due reminders: {$result['upcoming_reminders_sent']}; overdue alerts: {$result['overdue_reminders_sent']}; parking released: {$result['parking_released']}; parking charges posted: {$result['parking_charges_posted']}; contracts expired: {$result['contracts_expired']}; rent-end reminders sent: {$result['lease_end_reminders_sent']}",
            0);
    }

    return $result;
}

// Title and message for a rent-due or overdue reminder. Shared by the sweep and
// the admin's manual "Send reminder" action so the wording never drifts.
// An overdue alert names the period the bill covers (from the move-in day)
// instead of the due date that has passed; $inv may carry INVOICE_PERIOD_COLUMNS.
function reminder_text(array $inv, DateTime $today, $overdue, $custom_message = '') {
    $due = new DateTime($inv['due_date']);
    $unit = !empty($inv['room_name']) ? $inv['room_name'] : 'your unit';
    $amount = number_format((float)$inv['total_amount'], 2);
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

const PARKING_MAX_DURATION_MONTHS = 6;

function parking_max_slots($conn) {
    $v = get_setting($conn, 'max_parking_slots', 3);
    return is_numeric($v) && (int)$v > 0 ? (int)$v : 3;
}

function parking_monthly_fee($conn) {
    $v = get_setting($conn, 'parking_monthly_fee', 300);
    return is_numeric($v) && (float)$v > 0 ? (float)$v : 300.0;
}

// ['max' => n, 'taken' => [slot numbers], 'occupied' => n, 'available' => n]
function parking_capacity($conn) {
    $max = parking_max_slots($conn);
    $taken = [];
    $res = $conn->query("SELECT slot_number FROM parking_reservations WHERE status = 'Assigned' AND slot_number IS NOT NULL ORDER BY slot_number");
    while ($res && ($row = $res->fetch_assoc())) $taken[] = (int)$row['slot_number'];
    $occupied = (int)$conn->query("SELECT COUNT(*) AS c FROM parking_reservations WHERE status = 'Assigned'")->fetch_assoc()['c'];
    return ['max' => $max, 'taken' => $taken, 'occupied' => $occupied, 'available' => max(0, $max - $occupied)];
}

// First day after a permit's last billable month, or null if never assigned.
function parking_term_end($assigned_at, $duration_months) {
    if (!$assigned_at) return null;
    $start = new DateTime(substr($assigned_at, 0, 10));
    return $start->modify('+' . (int)$duration_months . ' months');
}

// Posts one month's parking fee onto the tenant's invoice for that month
// (checklist 10.3), mirroring post_service_charge(). The parking_charges row is
// inserted first as the claim: its (reservation_id, billing_period) key means the
// same month can never be billed twice, whether by the admin's button, the
// automatic sweep, or both.
//
// Returns ['ok' => bool, 'invoice_id' => string|null, 'message' => string,
//          'already' => bool].
function post_parking_charge($conn, $reservation_id, DateTime $month) {
    $period = $month->format('Y-m');
    $label = billing_period_label($month);

    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("SELECT user_id, status, assigned_at, duration_months FROM parking_reservations WHERE id = ? FOR UPDATE");
        $stmt->bind_param("i", $reservation_id);
        $stmt->execute();
        $res = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$res) {
            $conn->rollback();
            return ['ok' => false, 'invoice_id' => null, 'message' => 'Parking reservation not found.', 'already' => false];
        }
        if ($res['status'] !== 'Assigned') {
            $conn->rollback();
            return ['ok' => false, 'invoice_id' => null, 'message' => 'Only an assigned parking slot can be billed.', 'already' => false];
        }

        // Billable months run from the month of assignment for duration_months.
        $first = (new DateTime(substr($res['assigned_at'], 0, 7) . '-01'));
        $end = (clone $first)->modify('+' . (int)$res['duration_months'] . ' months');
        $this_month = new DateTime($period . '-01');
        if ($this_month < $first || $this_month >= $end) {
            $conn->rollback();
            return ['ok' => false, 'invoice_id' => null, 'message' => "$label is outside this permit's term.", 'already' => false];
        }

        $user_id = (int)$res['user_id'];
        $amount = parking_monthly_fee($conn);

        $claim = $conn->prepare("INSERT IGNORE INTO parking_charges (reservation_id, billing_period, amount) VALUES (?, ?, ?)");
        $claim->bind_param("isd", $reservation_id, $period, $amount);
        $claim->execute();
        $charge_id = $claim->affected_rows > 0 ? $claim->insert_id : 0;
        $claim->close();

        if (!$charge_id) {
            $conn->rollback();
            return ['ok' => false, 'invoice_id' => null, 'message' => "Parking for $label has already been billed.", 'already' => true];
        }

        $adjustable = "('" . implode("','", SERVICE_ADJUSTABLE_INVOICE_STATUSES) . "')";
        $stmt = $conn->prepare("SELECT id FROM invoices WHERE user_id = ? AND billing_period IN (?, ?) AND status IN $adjustable AND payment_group IS NULL ORDER BY created_at ASC LIMIT 1");
        $stmt->bind_param("iss", $user_id, $label, $period);
        $stmt->execute();
        $invoice = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        $invoice_id = $invoice ? $invoice['id'] : null;

        if (!$invoice_id) {
            $lease = get_active_tenancy($conn, $user_id);
            if (!$lease) {
                $conn->rollback();
                return ['ok' => false, 'invoice_id' => null, 'message' => 'The tenant has no active rental, so parking cannot be billed.', 'already' => false];
            }
            // Parking-only invoice. Rent is never billed from here.
            $invoice_id = 'INV-' . $month->format('Ym') . '-' . strtoupper(bin2hex(random_bytes(4)));
            $due_date = (clone $this_month)->modify('first day of next month')->modify('+4 days')->format('Y-m-d');
            $stmt = $conn->prepare("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date)
                                    VALUES (?, ?, ?, 0, 0, ?, 'pending', ?)");
            $stmt->bind_param("siiss", $invoice_id, $user_id, $lease['id'], $label, $due_date);
            if (!$stmt->execute()) {
                $stmt->close();
                throw new Exception("Failed to create parking invoice: " . $conn->error);
            }
            $stmt->close();
        }

        $stmt = $conn->prepare("UPDATE invoices SET parking = parking + ?, total_amount = total_amount + ? WHERE id = ?");
        $stmt->bind_param("dds", $amount, $amount, $invoice_id);
        $stmt->execute();
        $stmt->close();

        $stmt = $conn->prepare("UPDATE parking_charges SET invoice_id = ? WHERE id = ?");
        $stmt->bind_param("si", $invoice_id, $charge_id);
        $stmt->execute();
        $stmt->close();

        $conn->commit();

        create_notification($conn, $user_id, 'billing', "Parking Fee Added: $label",
            "Your parking fee of ₱" . number_format($amount, 2) . " for $label has been added to invoice $invoice_id.");

        return ['ok' => true, 'invoice_id' => $invoice_id, 'message' => "Parking for $label posted to invoice $invoice_id.", 'already' => false];
    } catch (Exception $e) {
        $conn->rollback();
        error_log('[AMS] post_parking_charge: ' . $e->getMessage());
        return ['ok' => false, 'invoice_id' => null, 'message' => 'Could not post the parking charge.', 'already' => false];
    }
}

// Backs one month's parking charge out of its invoice while that invoice can still
// be adjusted. Once paid or mid-payment the admin must issue a manual credit.
function reverse_parking_charge($conn, $reservation_id, $period) {
    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("SELECT id, invoice_id, amount FROM parking_charges WHERE reservation_id = ? AND billing_period = ? FOR UPDATE");
        $stmt->bind_param("is", $reservation_id, $period);
        $stmt->execute();
        $charge = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$charge) {
            $conn->rollback();
            return ['ok' => false, 'message' => 'That month has not been billed.'];
        }

        $adjustable = "('" . implode("','", SERVICE_ADJUSTABLE_INVOICE_STATUSES) . "')";
        $stmt = $conn->prepare("UPDATE invoices SET parking = GREATEST(parking - ?, 0), total_amount = GREATEST(total_amount - ?, 0) WHERE id = ? AND status IN $adjustable");
        $stmt->bind_param("dds", $charge['amount'], $charge['amount'], $charge['invoice_id']);
        $stmt->execute();
        $reversed = $stmt->affected_rows;
        $stmt->close();

        if ($reversed === 0) {
            $conn->rollback();
            return ['ok' => false, 'message' => "Invoice {$charge['invoice_id']} can no longer be adjusted (paid or payment in progress)."];
        }

        $stmt = $conn->prepare("DELETE FROM parking_charges WHERE id = ?");
        $stmt->bind_param("i", $charge['id']);
        $stmt->execute();
        $stmt->close();

        $conn->commit();
        return ['ok' => true, 'message' => "Parking charge reversed from invoice {$charge['invoice_id']}."];
    } catch (Exception $e) {
        $conn->rollback();
        error_log('[AMS] reverse_parking_charge: ' . $e->getMessage());
        return ['ok' => false, 'message' => 'Could not reverse the parking charge.'];
    }
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
