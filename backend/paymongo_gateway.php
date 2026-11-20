<?php
// PayMongo API calls shared by create_checkout_session.php (checkout sessions),
// update_refund_request.php (refund payouts), paymongo_webhook.php and the payment
// reconciliation (reconcile_gateway_payments.php). Needs config.php loaded first.

function paymongo_secret_key($conn) {
    $key = ams_env_setting('paymongo_secret_key');
    if ($key !== null && $key !== '') return $key;
    $res = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'paymongo_secret_key'");
    return $res ? (string)($res->fetch_assoc()['setting_value'] ?? '') : '';
}

// One authenticated call to api.paymongo.com. Returns
// ['ok' => bool, 'http' => int, 'data' => array|null, 'message' => string, 'tls_missing' => bool].
// 'ok' means HTTP 200 with no `errors`; 'message' is then PayMongo's own detail.
function paymongo_request($method, $path, $secret_key, $payload = null, $extra_headers = []) {
    $fail = fn($message, $http = 0, $data = null, $tls = false) =>
        ['ok' => false, 'http' => $http, 'data' => $data, 'message' => $message, 'tls_missing' => $tls];

    // This request carries the PayMongo secret key, so the gateway's certificate
    // must actually be verified. XAMPP ships without curl.cainfo configured, so
    // locate a CA bundle and point cURL at it.
    $ca_bundle = ini_get('curl.cainfo') ?: ini_get('openssl.cafile') ?: '';
    if (!$ca_bundle || !is_readable($ca_bundle)) {
        foreach (['C:/xampp/apache/bin/curl-ca-bundle.crt', 'C:/xampp/php/extras/ssl/cacert.pem', '/etc/ssl/certs/ca-certificates.crt'] as $candidate) {
            if (is_readable($candidate)) { $ca_bundle = $candidate; break; }
        }
    }
    $verify = true;
    if (!$ca_bundle || !is_readable($ca_bundle)) {
        if (APP_ENV === 'production') return $fail("Payment gateway TLS certificate store is not configured on this server.", 0, null, true);
        // No bundle anywhere on a dev box: keep the sandbox demo working, but say
        // so loudly rather than silently shipping an unverified TLS connection.
        error_log("PayMongo: no CA bundle found; TLS peer verification disabled (development only).");
        $verify = false;
    }

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "https://api.paymongo.com" . $path);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    if ($payload !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge([
        "Content-Type: application/json",
        "Accept: application/json",
        "Authorization: Basic " . base64_encode($secret_key . ":")
    ], $extra_headers));
    if ($verify) {
        curl_setopt($ch, CURLOPT_CAINFO, $ca_bundle);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    } else {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    }

    $response = curl_exec($ch);
    $http_code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($ch);
    curl_close($ch);

    $data = $response === false ? null : json_decode($response, true);
    if ($http_code !== 200 || $response === false || isset($data['errors'])) {
        error_log("PayMongo Error: " . $response . " (cURL: $curl_error)");
        $detail = $data['errors'][0]['detail'] ?? null;
        return $fail($detail ? "PayMongo: $detail" : "Failed to connect to payment gateway.", $http_code, $data);
    }
    return ['ok' => true, 'http' => $http_code, 'data' => $data, 'message' => '', 'tls_missing' => false];
}

// Refunds money to the payer of a PayMongo payment (POST /v1/refunds).
// $idempotency_key makes a retry of the same payout return the same refund
// instead of a second one. Returns ['ok', 'refund_id', 'status', 'message'].
// The API test suite (AMS_TEST_MODE) never reaches the network: a payment id
// containing "fail" is declined, any other succeeds as 'pending'.
function paymongo_create_refund($conn, $payment_id, $amount_cents, $notes, $idempotency_key) {
    if (getenv('AMS_TEST_MODE') === '1') {
        if (stripos($payment_id, 'fail') !== false) return ['ok' => false, 'refund_id' => null, 'status' => null, 'message' => 'PayMongo: test refund declined'];
        return ['ok' => true, 'refund_id' => 're_test_' . substr(md5($idempotency_key), 0, 12), 'status' => 'pending', 'message' => ''];
    }
    $secret = paymongo_secret_key($conn);
    if ($secret === '') return ['ok' => false, 'refund_id' => null, 'status' => null, 'message' => 'PayMongo is not configured.'];

    $res = paymongo_request('POST', '/v1/refunds', $secret, [
        'data' => ['attributes' => [
            'amount' => (int)$amount_cents,
            'payment_id' => $payment_id,
            'reason' => 'others',
            'notes' => mb_substr($notes, 0, 255),
        ]],
    ], ["Idempotency-Key: $idempotency_key"]);
    if (!$res['ok']) return ['ok' => false, 'refund_id' => null, 'status' => null, 'message' => $res['message']];
    return [
        'ok' => true,
        'refund_id' => $res['data']['data']['id'] ?? null,
        'status' => $res['data']['data']['attributes']['status'] ?? 'pending',
        'message' => '',
    ];
}

// The PayMongo payment a refund request is taken from, or null when the money
// came in another way (desk, bank proof) and must be paid back by hand.
function refund_source_payment($conn, $req) {
    if (!empty($req['paymongo_payment_id'])) return $req['paymongo_payment_id'];
    $invoice_id = $req['invoice_id'] ?? null;
    if (!$invoice_id && ($req['type'] ?? '') === 'advance') {
        // Advance rent: the held credits point at the advance invoice that was paid.
        $q = $conn->prepare("SELECT advance_invoice_id FROM advance_credits WHERE refund_request_id = ? LIMIT 1");
        $q->bind_param("i", $req['id']);
        $q->execute();
        $q->bind_result($invoice_id);
        $q->fetch();
        $q->close();
    }
    if (!$invoice_id) return null;
    $q = $conn->prepare("SELECT paymongo_payment_id FROM invoices WHERE id = ?");
    $q->bind_param("s", $invoice_id);
    $q->execute();
    $pid = null;
    $q->bind_result($pid);
    $q->fetch();
    $q->close();
    return $pid ?: null;
}

// An online payment PayMongo collected that AMS could not apply to a bill (the
// invoice was cancelled, paid already, or the settle cascade failed). Nothing
// else would ever show it, so it becomes an 'online_payment' refund request the
// admin can pay back through PayMongo. Once per payment id, so a webhook retry
// adds nothing. Returns the request id (0 if there is nothing to refund or one
// exists already).
function raise_unapplied_payment($conn, $payment_id, $paid_centavos, $user_id, $invoice_key, $why) {
    if (!$payment_id || !$paid_centavos || !$user_id) return 0;
    $exists = $conn->prepare("SELECT id FROM refund_requests WHERE paymongo_payment_id = ? LIMIT 1");
    $exists->bind_param("s", $payment_id);
    $exists->execute();
    $exists->store_result();
    $known = $exists->num_rows > 0;
    $exists->close();
    if ($known) return 0;

    $amount = round($paid_centavos / 100, 2);
    $reason = "Online payment for $invoice_key could not be applied: $why";
    $conn->begin_transaction();
    try {
        $rid = insert_refund_request($conn, (int)$user_id, null, 'online_payment', null, $amount, $reason, null, 'system');
        $u = $conn->prepare("UPDATE refund_requests SET paymongo_payment_id = ? WHERE id = ?");
        $u->bind_param("si", $payment_id, $rid);
        $u->execute();
        $u->close();
        $conn->commit();
    } catch (Exception $e) {
        $conn->rollback();
        error_log("raise_unapplied_payment failed for $payment_id: " . $e->getMessage());
        return 0;
    }
    notify_refund_raised($conn, $rid, $amount, "an online payment that could not be applied ($invoice_key)");
    create_notification($conn, (int)$user_id, 'payment', 'Payment Needs a Refund',
        "Your online payment of ₱" . number_format($amount, 2) . " for $invoice_key was received but could not be applied. Management will refund it to you.",
        'Resolved', "invoice:$invoice_key");
    log_activity($conn, (int)$user_id, 'billing', 'Online Payment Unapplied', "$invoice_key, payment $payment_id, ₱" . number_format($amount, 2) . " — $why", (int)$user_id);
    return $rid;
}

// One checkout session as PayMongo reports it now (GET /v1/checkout_sessions/{id}).
// Returns ['ok', 'state' => 'paid'|'expired'|'unpaid'|'error', 'payment_id',
// 'paid_centavos', 'source_type', 'message']. The webhook can be lost (a bad
// moment of the server, a retry window that ran out); this is the way to ask
// instead of waiting. Reads the same fields the webhook reads: payments[0].id,
// .attributes.amount and .attributes.source.type.
// NOT checked against the real API yet (no sandbox call has been made from this
// repo): the response shape below is what the webhook payload suggests.
// The API test suite (AMS_TEST_MODE) never reaches the network. A session id decides
// the answer: containing "paid_<centavos>" it is paid for that amount (a "gcash" or
// "maya" in the id picks the channel, otherwise card), "expired" is expired, "fail"
// is an error, anything else is still unpaid.
function paymongo_retrieve_checkout_session($conn, $session_id) {
    $none = fn($state, $message = '') => ['ok' => $state !== 'error', 'state' => $state, 'payment_id' => null, 'paid_centavos' => null, 'source_type' => null, 'message' => $message];
    if (!is_string($session_id) || !preg_match('/^[A-Za-z0-9_\-]{3,100}$/', $session_id)) return $none('error', 'Not a checkout session id.');

    if (getenv('AMS_TEST_MODE') === '1') {
        if (stripos($session_id, 'fail') !== false) return $none('error', 'PayMongo: test lookup failed');
        if (preg_match('/paid_(\d+)/i', $session_id, $m)) {
            $type = stripos($session_id, 'gcash') !== false ? 'gcash' : (stripos($session_id, 'maya') !== false ? 'paymaya' : 'card');
            return ['ok' => true, 'state' => 'paid', 'payment_id' => 'pay_test_' . substr(md5($session_id), 0, 12), 'paid_centavos' => (int)$m[1], 'source_type' => $type, 'message' => ''];
        }
        if (stripos($session_id, 'expired') !== false) return $none('expired');
        return $none('unpaid');
    }

    $secret = paymongo_secret_key($conn);
    if ($secret === '') return $none('error', 'PayMongo is not configured.');
    $res = paymongo_request('GET', '/v1/checkout_sessions/' . rawurlencode($session_id), $secret);
    if (!$res['ok']) return $none('error', $res['message']);

    $attrs = $res['data']['data']['attributes'] ?? [];
    foreach (($attrs['payments'] ?? []) as $p) {
        $pstatus = $p['attributes']['status'] ?? 'paid'; // a listed payment with no status is taken as paid
        if ($pstatus === 'paid') {
            return ['ok' => true, 'state' => 'paid', 'payment_id' => $p['id'] ?? null,
                    'paid_centavos' => isset($p['attributes']['amount']) ? (int)$p['attributes']['amount'] : null,
                    'source_type' => $p['attributes']['source']['type'] ?? null, 'message' => ''];
        }
    }
    if (($attrs['status'] ?? '') === 'expired') return $none('expired');
    return $none('unpaid');
}

// What a gateway event does to a bill (or to the group of bills the checkout
// covered). Shared by paymongo_webhook.php (a signed event) and the reconciliation
// (the same facts read from PayMongo on request), so a payment found either way is
// settled by exactly one set of rules: the checkout session must still be the one
// the bill opened, the same payment twice is a no-op, a different payment on a
// paid bill is raised as a refund, the amount collected must match the balance,
// and the settle goes through settle_payment_key() like a desk payment.
// $event_type is 'checkout_session.payment.paid' or 'payment.failed'.
// Returns ['http' => int, 'success' => bool, 'message' => string|null, 'outcome' => ...]
// where outcome is settled | mismatch | already | superseded | unknown | review |
// failed (a failed checkout recorded) | ignored.
function paymongo_process_checkout_event($conn, $event_type, $invoice_id, $session_id, $intent_id, $payment_id, $paid_centavos, $source_type) {
    $status = $event_type === 'checkout_session.payment.paid' ? 'paid' : 'payment-failed';
    $done = fn($outcome, $message = null, $http = 200, $success = true) => ['http' => $http, 'success' => $success, 'message' => $message, 'outcome' => $outcome];
    if (!$invoice_id) return $done('ignored');

    // Bind the event to the checkout session this invoice actually opened.
    // Without this, any validly-signed event naming an invoice id could
    // settle it, including a stale event from a superseded session.
    //
    // The metadata id may be an advance payment's group id (config.php,
    // "Advance payments"): then the event covers every month in it, and
    // the checks below apply to the months together — the same session on
    // each, the sum as the amount due, "paid" only once all are.
    $all_rows = payment_key_invoices($conn, $invoice_id);
    $group_rows = array_values(array_filter($all_rows, fn($row) => $row['status'] !== 'cancelled'));

    if (!$group_rows) {
        // Cancelled while the tenant was at the checkout: the money was
        // still collected, so it goes to the admin as a refund to pay back.
        if ($status === 'paid' && $all_rows) {
            raise_unapplied_payment($conn, $payment_id, $paid_centavos, $all_rows[0]['user_id'], $invoice_id, "the bill was cancelled before the payment arrived");
        }
        return $done('unknown', "Unknown invoice; ignored");
    }

    $unpaid_rows = array_values(array_filter($group_rows, fn($row) => $row['status'] !== 'paid'));
    $session_rows = array_filter($group_rows, fn($row) => !empty($row['checkout_session_id']));
    $inv_row = [
        'status' => $unpaid_rows ? $unpaid_rows[0]['status'] : 'paid',
        'user_id' => $group_rows[0]['user_id'],
        // What the checkout charged: the balance after any parts already received.
        'total_amount' => array_sum(array_map(fn($row) => invoice_balance_cents($row) / 100, $group_rows)),
    ];
    $superseded = false;
    foreach ($session_rows as $row) {
        if ($session_id && !hash_equals($row['checkout_session_id'], $session_id)) $superseded = true;
    }
    // Rows opened before the intent id was stored have none; those match
    // on the invoice id alone.
    foreach ($group_rows as $row) {
        if (empty($row['checkout_payment_intent_id'])) continue;
        // A failed event that names no intent cannot be tied to the open
        // checkout, so it is treated as stale rather than risk failing an
        // invoice whose newer checkout is still in progress.
        if ($event_type === 'payment.failed' && !$intent_id) $superseded = true;
        elseif ($intent_id && !hash_equals($row['checkout_payment_intent_id'], $intent_id)) $superseded = true;
    }

    if ($superseded) {
        // A paid event on an old checkout is real money PayMongo holds.
        if ($status === 'paid') {
            raise_unapplied_payment($conn, $payment_id, $paid_centavos, $inv_row['user_id'], $invoice_id, "it came from an older checkout than the one now open");
        }
        return $done('superseded', "Event belongs to a superseded checkout session; ignored");
    }

    // Already settled — acknowledge so PayMongo stops retrying, but do
    // not rewrite the row.
    if ($inv_row['status'] === 'paid' && $status === 'paid') {
        // A different payment on a bill that is already paid is a double
        // payment; the same payment again is just PayMongo retrying. A bill
        // paid at the desk has no stored PayMongo payment, so any online
        // payment on it is a double payment too (raised once per payment id).
        $stored = $conn->prepare("SELECT paymongo_payment_id FROM invoices WHERE ? IN (id, payment_group) AND paymongo_payment_id IS NOT NULL LIMIT 1");
        $stored->bind_param("s", $invoice_id);
        $stored->execute();
        $stored_payment = $stored->get_result()->fetch_assoc()['paymongo_payment_id'] ?? null;
        $stored->close();
        if ($payment_id && $stored_payment !== $payment_id) {
            raise_unapplied_payment($conn, $payment_id, $paid_centavos, $inv_row['user_id'], $invoice_id, "the bill was already paid");
        }
        return $done('already', "Already recorded");
    }

    if ($status === 'paid') {
        // The total can change after the checkout session was created —
        // promote_overdue_invoices() may have moved it processing ->
        // overdue and added a late fee — so a paid event is trusted only
        // when the amount PayMongo actually collected still matches the
        // invoice as it stands today (audit H9b). This never happened
        // before: a paid event settled the invoice at its current total
        // regardless of what was actually collected at checkout.
        $expected_centavos = (int)round((float)$inv_row['total_amount'] * 100);

        // Keep the payment id on the bill whatever happens next: a refund
        // through PayMongo needs it.
        if ($payment_id) {
            $keep = $conn->prepare("UPDATE invoices SET paymongo_payment_id = ? WHERE ? IN (id, payment_group)");
            $keep->bind_param("ss", $payment_id, $invoice_id);
            $keep->execute();
            $keep->close();
        }

        if ($paid_centavos === null || (int)$paid_centavos !== $expected_centavos) {
            $mismatch = $conn->prepare("UPDATE invoices SET status = 'pending-verification' WHERE ? IN (id, payment_group) AND status IN " . billing_open_status_sql());
            $mismatch->bind_param("s", $invoice_id);
            $mismatch->execute();
            $mismatch->close();

            $paid_display = $paid_centavos !== null ? number_format($paid_centavos / 100, 2) : 'unknown';
            notify_admins_queue($conn, 'payment_verification', $invoice_id, 'Payment Amount Mismatch',
                "PayMongo reported ₱$paid_display for invoice $invoice_id, but the invoice total is ₱" . number_format((float)$inv_row['total_amount'], 2) . ". Verify manually before marking it paid.");

            $actor = !empty($inv_row['user_id']) ? (int)$inv_row['user_id'] : null;
            if ($actor) {
                create_notification($conn, $actor, 'payment', 'Payment Being Verified',
                    "Your online payment for invoice $invoice_id was received and is being verified by management. You will be notified once it is confirmed.",
                    'Resolved', "invoice:$invoice_id");
            }
            log_activity($conn, $actor, 'billing', 'Online Payment Amount Mismatch',
                "Invoice: $invoice_id, Session: " . ($session_id ?? 'n/a') . ", Paid: ₱$paid_display, Expected: ₱" . number_format((float)$inv_row['total_amount'], 2), $actor ?? 0);

            return $done('mismatch', "Amount mismatch; queued for manual verification");
        }

        $pm_label = null;
        if ($source_type) {
            $type_map = [
                'gcash' => 'GCash (Sandbox)',
                'paymaya' => 'Maya (Sandbox)',
                'card' => 'Card (Sandbox)',
                'dob' => 'Online Banking (Sandbox)'
            ];
            $pm_label = $type_map[$source_type] ?? (ucfirst($source_type) . ' (Sandbox)');
        }

        // Shared with the front desk (audit M12) — settle_invoice() carries
        // the admin-queue updates (a paid move-in invoice asks the admin to
        // schedule the move-in) and the tenant notification, exactly like a
        // desk payment. Payment never activates the tenancy by itself.
        // An advance payment settles each of its months (settle_payment_key()).
        // The collected amount goes in so settle_invoice() re-checks it against
        // the balance under the row lock: a late fee or part-payment that landed
        // after the check above is refused there instead of being marked paid.
        $result = settle_payment_key($conn, $invoice_id, $pm_label ?: 'PayMongo (Sandbox)', null, $paid_centavos / 100);

        $actor = !empty($inv_row['user_id']) ? (int)$inv_row['user_id'] : null;

        if (!$result['ok']) {
            // A business-logic failure here (e.g. the room was taken by
            // someone else in the meantime) can't be fixed by PayMongo
            // retrying the same event, so acknowledge it — but log loudly,
            // since the tenant did pay and the cascade needs a manual look.
            error_log("PayMongo settle_invoice failed for invoice $invoice_id: " . $result['message']);
            log_activity($conn, $actor, 'billing', 'Online Payment Needs Review',
                "Invoice: $invoice_id, Session: " . ($session_id ?? 'n/a') . " — " . $result['message'], $actor ?? 0);
            notify_admins_queue($conn, 'payment_verification', $invoice_id, 'Online Payment Needs Review',
                "An online payment for $invoice_id was received but could not be recorded: " . $result['message']);
            // A group is settled all or nothing (settle_payment_key()), so a
            // failure applied none of it: the whole collected amount goes back.
            raise_unapplied_payment($conn, $payment_id, $paid_centavos, $actor, $invoice_id, $result['message']);
            return $done('review', "Payment recorded but needs manual review: " . $result['message']);
        }

        log_activity($conn, $actor, 'billing', 'Online Payment Received', "Invoice: $invoice_id, Session: " . ($session_id ?? 'n/a'), $actor ?? 0);
        notify_admins_info($conn, 'payment', 'Online Payment Received',
            "Invoice $invoice_id was paid online (" . ($pm_label ?: 'PayMongo') . ") and recorded automatically.", "invoice:$invoice_id");
        return $done('settled');
    }

    // Only a checkout still in progress fails. The session is released
    // like a cancelled one, so the tenant can open a new checkout
    // (create_checkout_session.php stores a session only on rows
    // without one).
    $stmt = $conn->prepare("UPDATE invoices SET status = ?, checkout_session_id = NULL, checkout_payment_intent_id = NULL, processing_since = NULL WHERE ? IN (id, payment_group) AND status = 'processing'");
    $stmt->bind_param("ss", $status, $invoice_id);

    if (!$stmt->execute()) {
        // Returning 200 on a failed write used to mean PayMongo never
        // retried, so a collected payment could be permanently lost.
        error_log("PayMongo DB write failed for invoice $invoice_id: " . $stmt->error);
        return $done('error', "Failed to record payment", 500, false);
    }

    // Attribute to the invoice's owner as stored in the database — the
    // payload metadata is only as trustworthy as whoever built the session.
    $actor = !empty($inv_row['user_id']) ? (int)$inv_row['user_id'] : null;
    $changed = $stmt->affected_rows > 0;
    log_activity($conn, $actor, 'billing', 'Online Payment Failed', "Invoice: $invoice_id, Payment intent: " . ($intent_id ?? 'n/a'), $actor ?? 0);

    if ($changed && $actor) {
        create_notification($conn, $actor, 'payment', 'Payment Failed',
            "Your online payment for invoice $invoice_id did not go through. Please try again or choose another payment method.");
    }
    return $done('failed');
}

// Settles the online checkouts whose webhook never arrived (SPRINT 183, panel F-08).
// A bill sits in 'processing' while the tenant is at the PayMongo checkout; if the
// "paid" event is lost, nothing in AMS records the money, and the sweeps that clear
// abandoned checkouts would reopen the bill (the tenant could pay twice). So each
// such bill's session is asked about:
//   paid    -> settled by paymongo_process_checkout_event(), the webhook's own rules;
//   expired -> released like an abandoned checkout (pending, or overdue past due);
//   unpaid  -> left alone (the tenant may still be paying).
// $opts: 'key' (one bill or ADV-/BND- group, any age: the admin's button),
//        'lapsing' (only the bills the sweeps are about to release: past their due date or
//                   older than the payment window; called before they do),
//        'min_minutes' (default 10: a checkout opened a moment ago is left alone).
// Returns counts and one line per bill. A failed lookup changes nothing.
function reconcile_gateway_payments($conn, array $opts = []) {
    $out = ['checked' => 0, 'settled' => 0, 'expired' => 0, 'unpaid' => 0, 'needs_review' => 0, 'errors' => 0, 'details' => []];
    $key = $opts['key'] ?? null;
    $minutes = (int)($opts['min_minutes'] ?? 10);
    $where = "status = 'processing' AND checkout_session_id IS NOT NULL";
    $types = '';
    $params = [];
    if ($key !== null) {
        $where .= " AND COALESCE(payment_group, id) = ?";
        $types .= 's';
        $params[] = $key;
    } elseif (!empty($opts['lapsing'])) {
        $days = payment_window_days($conn);
        $where .= " AND ((due_date IS NOT NULL AND due_date < CURDATE()) OR processing_since < DATE_SUB(NOW(), INTERVAL $days DAY))";
    } else {
        $where .= " AND (processing_since IS NULL OR processing_since < DATE_SUB(NOW(), INTERVAL $minutes MINUTE))";
    }
    $stmt = $conn->prepare("SELECT COALESCE(payment_group, id) AS pkey, MIN(checkout_session_id) AS session_id, MAX(user_id) AS user_id
                            FROM invoices WHERE $where GROUP BY COALESCE(payment_group, id) LIMIT 100");
    if ($types !== '') $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $groups = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    foreach ($groups as $g) {
        $out['checked']++;
        $pkey = $g['pkey'];
        $look = paymongo_retrieve_checkout_session($conn, $g['session_id']);
        if (!$look['ok']) {
            $out['errors']++;
            $out['details'][] = ['invoice' => $pkey, 'result' => 'error', 'message' => $look['message']];
            continue;
        }
        if ($look['state'] === 'paid') {
            $r = paymongo_process_checkout_event($conn, 'checkout_session.payment.paid', $pkey, $g['session_id'], null, $look['payment_id'], $look['paid_centavos'], $look['source_type']);
            $settled = in_array($r['outcome'], ['settled', 'already'], true);
            $out[$settled ? 'settled' : 'needs_review']++;
            $out['details'][] = ['invoice' => $pkey, 'result' => $r['outcome'], 'message' => $r['message']];
            if ($r['outcome'] === 'settled') {
                log_activity($conn, null, 'billing', 'Online Payment Reconciled', "Invoice: $pkey, session {$g['session_id']}, found paid at PayMongo (the webhook had not arrived)", 0);
            }
        } elseif ($look['state'] === 'expired') {
            $upd = $conn->prepare("UPDATE invoices
                SET status = CASE WHEN due_date IS NOT NULL AND due_date < CURDATE() THEN 'overdue' ELSE 'pending' END,
                    checkout_session_id = NULL, checkout_payment_intent_id = NULL, processing_since = NULL
                WHERE ? IN (id, payment_group) AND status = 'processing' AND checkout_session_id = ?");
            $upd->bind_param("ss", $pkey, $g['session_id']);
            $upd->execute();
            $won = $upd->affected_rows > 0;
            $upd->close();
            if ($won) {
                $out['expired']++;
                $out['details'][] = ['invoice' => $pkey, 'result' => 'expired', 'message' => 'The checkout expired unpaid; the bill is open again.'];
                if (!empty($g['user_id'])) {
                    create_notification($conn, (int)$g['user_id'], 'payment', 'Online Checkout Expired',
                        "Your unfinished online payment expired. You can pay again from Pay Bills.", 'Resolved', "invoice:$pkey");
                }
            }
        } else {
            $out['unpaid']++;
            $out['details'][] = ['invoice' => $pkey, 'result' => 'unpaid', 'message' => 'Not paid at PayMongo yet.'];
        }
    }
    return $out;
}
