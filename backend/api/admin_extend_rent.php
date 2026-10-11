<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Units -> Extend Rent. A real extension, the same as approving a tenant's
// request (config.php extend_tenancy()): contract end, Rent History
// (lease_renewals), monthly billing of the added months, and the same rules —
// no overdue bills, no scheduled move-out, an active or expired contract, and
// within max_rent_ahead_months. It used to only rewrite rooms.lease_end, so the
// added months were never billed and the contract still expired on the old date.
$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true) ?: [];
$room_id = trim((string)($input['roomId'] ?? ''));
$add_months = (int)($input['addMonths'] ?? 0);
$new_rent = isset($input['newRent']) && $input['newRent'] !== '' && $input['newRent'] !== null ? (float)$input['newRent'] : null;

if ($room_id === '') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Room is required."]);
    exit;
}
if ($new_rent !== null && ($new_rent <= 0 || $new_rent > 99999999.99)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "New rent must be a positive amount."]);
    exit;
}

// The tenancy running in this room (a scheduled move-out is found too, so it
// can be refused with a clear reason).
$stmt = $conn->prepare("SELECT id, user_id FROM rent_applications WHERE room_name = ? AND status IN ('active', 'pending-move-out') ORDER BY id DESC LIMIT 1");
$stmt->bind_param("s", $room_id);
$stmt->execute();
$app = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$app) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Unit $room_id has no tenant who has moved in, so there is no rent to extend."]);
    exit;
}

$conn->begin_transaction();
try {
    $extension = extend_tenancy($conn, (int)$app['id'], $add_months, $admin_id, $new_rent);

    $detail = "Unit $room_id, contract {$extension['contract_id']} extended by $add_months month(s): {$extension['previous_end']} → {$extension['new_end']}"
        . ($new_rent !== null ? ", rent ₱" . number_format($new_rent, 2) : '');
    if ($extension['holdover_invoices']) {
        $detail .= "; billed " . count($extension['holdover_invoices']) . " holdover month(s) since expiry (₱" . number_format($extension['holdover_total'], 2) . ")";
    }
    log_activity($conn, $admin_id, 'contract', 'Extended Rent', $detail);

    $msg = "Your rent for Unit $room_id was extended by $add_months month(s), to " . date('M j, Y', strtotime($extension['new_end'])) . "."
        . ($new_rent !== null ? " Monthly rent from now on: ₱" . number_format($new_rent, 2) . "." : '')
        . " Each added month is billed a week before it starts.";
    if ($extension['holdover_invoices']) {
        $msg .= " Your contract had expired, so the " . count($extension['holdover_invoices']) . " month(s) you stayed since then (₱"
            . number_format($extension['holdover_total'], 2) . ") are now billed, due " . date('M j, Y', strtotime('+' . RENT_INVOICE_LEAD_DAYS . ' days')) . ".";
    }
    create_notification($conn, $extension['user_id'], 'contract_update', 'Rent Extended', $msg);

    $conn->commit();
} catch (ExtensionRefused $e) {
    $conn->rollback();
    http_response_code(409);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
    exit;
} catch (Throwable $e) {
    $conn->rollback();
    server_error_response($e, "Could not extend the rent. Please try again.");
    exit;
}

// After commit, like an approved request: a month starting within the invoice
// lead time is billed now rather than at the next daily sweep.
$billed_now = generate_due_rent_invoices($conn, $extension['user_id']);

echo json_encode([
    "success" => true,
    "message" => "Rent extended to " . date('M j, Y', strtotime($extension['new_end'])) . "."
        . ($extension['holdover_invoices'] ? " " . count($extension['holdover_invoices']) . " holdover month(s) billed." : '')
        . ($billed_now ? " $billed_now upcoming invoice(s) issued now." : ''),
    "newLeaseEnd" => $extension['new_end'],
    "holdoverInvoices" => $extension['holdover_invoices'],
]);
$conn->close();
