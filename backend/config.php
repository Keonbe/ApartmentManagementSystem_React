<?php
// Load environment configuration if available
if (file_exists(__DIR__ . '/config.env.php')) {
    require_once __DIR__ . '/config.env.php';
}

// Fallback defaults if constants are not defined
if (!defined('DB_HOST')) define('DB_HOST', 'localhost');
if (!defined('DB_USER')) define('DB_USER', 'root');
if (!defined('DB_PASS')) define('DB_PASS', '');
if (!defined('DB_NAME')) define('DB_NAME', 'ams_db');
if (!defined('APP_ENV')) define('APP_ENV', 'development');

// Error reporting & resource limits (D-1, D-6)
if (APP_ENV === 'production') {
    @ini_set('display_errors', '0');
    @ini_set('log_errors', '1');
}

@ini_set('upload_max_filesize', '10M');
@ini_set('post_max_size', '12M');
@ini_set('memory_limit', '128M');

$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

if ($conn->connect_error) {
    if (APP_ENV === 'production') {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Database connection failed"]);
        exit;
    } else {
        die("Connection failed: " . $conn->connect_error);
    }
}

// Priority 4: Observability
//
// Audit trail (checklist 8.6). The performer is the verified session user
// whenever there is one, so a call site that still passes a client-supplied id
// can no longer attribute an action to someone else. The passed id is used only
// for requests that have no session at all (password reset by emailed token,
// payment gateway webhooks). Categories are normalised to LOG_CATEGORIES so the
// log can actually be filtered — call sites historically wrote a dozen spellings.
function log_activity($conn, $user_id, $category, $action, $details = "") {
    $session = get_authenticated_user($conn);
    $performer = $session ? $session['id'] : ((int)$user_id > 0 ? (int)$user_id : null);
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
        $released++;
    }

    $res_stmt->close();
    $room_stmt->close();

    return $released;
}

// Expires lease contracts whose lease_end has passed. Only 'active' contracts
// are affected — a 'draft' contract was never activated so it has nothing to
// expire, and 'terminated'/'eviction-pending' are already terminal states.
// UPDATE-only (no DDL) and safe to call opportunistically, same pattern as
// release_expired_reservations() above.
function expire_lapsed_contracts($conn) {
    $stmt = $conn->prepare("UPDATE lease_contracts SET status = 'expired' WHERE status = 'active' AND lease_end IS NOT NULL AND lease_end < CURDATE()");
    if (!$stmt) return 0; // column/table not migrated yet
    $stmt->execute();
    $count = $stmt->affected_rows;
    $stmt->close();
    return $count;
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
        $stmt = $conn->prepare("SELECT id FROM invoices WHERE user_id = ? AND billing_period IN (?, ?) AND status IN $adjustable ORDER BY created_at ASC LIMIT 1");
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
                return ['ok' => false, 'invoice_id' => null, 'message' => 'No active approved lease — cannot post service charge.'];
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
            SET late_fee = ROUND((base_rent + water + electricity + parking + services) * ? / 100, 2),
                total_amount = total_amount + ROUND((base_rent + water + electricity + parking + services) * ? / 100, 2)
            WHERE status = 'overdue' AND late_fee = 0
        ");
        $stmt->bind_param("dd", $value, $value);
    } else {
        $stmt = $conn->prepare("
            UPDATE invoices
            SET late_fee = ?, total_amount = total_amount + ?
            WHERE status = 'overdue' AND late_fee = 0
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
    'service_request', 'inquiry', 'occupancy_request', 'lease_extension_request'
];

function admin_queue_types_sql() {
    return "('" . implode("','", ADMIN_QUEUE_NOTIFICATION_TYPES) . "')";
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