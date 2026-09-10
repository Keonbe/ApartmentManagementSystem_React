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
function log_activity($conn, $user_id, $category, $action, $details = "") {
    $stmt = $conn->prepare("INSERT INTO activity_logs (performed_by, category, action, details) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("isss", $user_id, $category, $action, $details);
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
        $period = (new DateTime('now', new DateTimeZone('Asia/Manila')))->format('Y-m');

        //4.FindThisTenantsOpenInvoiceForThePeriod
        $stmt = $conn->prepare("SELECT id FROM invoices WHERE user_id = ? AND billing_period = ? AND status = 'pending' LIMIT 1");
        $stmt->bind_param("is", $user_id, $period);
        $stmt->execute();
        $invoice = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        $invoice_id = $invoice ? $invoice['id'] : null;

        //5.NoOpenInvoiceYet-AutoGenerateOneFromTheActiveLease
        if (!$invoice_id) {
            $lease_q = "SELECT id AS rent_application_id, monthly_rent
                        FROM rent_applications
                        WHERE user_id = ? AND status IN ('Approved', 'active', 'pending-move-out')
                        ORDER BY id DESC LIMIT 1";
            $stmt = $conn->prepare($lease_q);
            $stmt->bind_param("i", $user_id);
            $stmt->execute();
            $lease = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            if (!$lease) {
                //RollbackUnclaimsTheRowSoTheChargeCanBePostedLater
                $conn->rollback();
                return ['ok' => false, 'invoice_id' => null, 'message' => 'No active approved lease — cannot post service charge.'];
            }

            $invoice_id = "INV-" . strtoupper(uniqid());
            $base_rent = (float)$lease['monthly_rent'];
            $due_date = date('Y-m-d', strtotime($period . '-01 +1 month +4 days'));

            $insert = "INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date)
                       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)";
            $stmt = $conn->prepare($insert);
            $stmt->bind_param("siiddss", $invoice_id, $user_id, $lease['rent_application_id'], $base_rent, $base_rent, $period, $due_date);
            if (!$stmt->execute()) {
                $stmt->close();
                throw new Exception("Failed to auto-generate invoice: " . $conn->error);
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

        //TheStatusGuardIsWhatMakesThisSafe:APaidInvoiceMatchesNoRows
        $stmt = $conn->prepare("UPDATE invoices SET services = GREATEST(services - ?, 0), total_amount = GREATEST(total_amount - ?, 0) WHERE id = ? AND status = 'pending'");
        $stmt->bind_param("dds", $amount, $amount, $request['invoice_id']);
        $stmt->execute();
        $reversed = $stmt->affected_rows;
        $stmt->close();

        if ($reversed === 0) {
            $conn->rollback();
            return ['ok' => false, 'message' => 'Invoice ' . $request['invoice_id'] . ' is already paid; issue a manual credit instead.'];
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
function verify_admin($conn, $admin_id) {
    if (!$admin_id) return false;
    $stmt = $conn->prepare("SELECT role FROM users WHERE id = ?");
    $stmt->bind_param("i", $admin_id);
    $stmt->execute();
    $res = $stmt->get_result();
    if ($res->num_rows > 0) {
        $user = $res->fetch_assoc();
        return $user['role'] === 'admin';
    }
    return false;
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
?>