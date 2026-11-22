<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Contracts → a contract's History tab (admin only): every contract of the same
// tenant (newest first), each with its rent extensions and the signed and
// notarized copies each extension archived (lease_renewals.previous_*_lease_path,
// written by extend_tenancy()). Two queries, whatever the number of contracts.
$admin_id = require_admin($conn);

$contract_id = isset($_GET['contractId']) && is_scalar($_GET['contractId']) ? trim((string)$_GET['contractId']) : '';
if ($contract_id === '' || strlen($contract_id) > 64) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Choose a contract.", "errors" => ["contractId" => "Choose a contract."]]);
    exit;
}

try {
    $stmt = $conn->prepare("SELECT lc.id, ra.user_id FROM lease_contracts lc
                            LEFT JOIN rent_applications ra ON ra.id = lc.rent_application_id
                            WHERE lc.id = ?");
    $stmt->bind_param("s", $contract_id);
    $stmt->execute();
    $base = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$base) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Contract not found."]);
        exit;
    }

    $columns = "lc.id, lc.status, lc.lease_start, lc.lease_end, lc.generated_at, lc.terminated_at, lc.termination_reason,
                lc.signed_lease_path, lc.signed_lease_uploaded_at, lc.signed_lease_review,
                lc.notarized_lease_path, lc.notarized_at,
                ra.id AS application_id, ra.room_name, ra.monthly_rent, ra.status AS application_status";
    $user_id = $base['user_id'] !== null ? (int)$base['user_id'] : 0;
    if ($user_id > 0) {
        $stmt = $conn->prepare("SELECT $columns FROM lease_contracts lc
                                JOIN rent_applications ra ON ra.id = lc.rent_application_id
                                WHERE ra.user_id = ?
                                ORDER BY lc.generated_at DESC, lc.id DESC");
        $stmt->bind_param("i", $user_id);
    } else {
        // A contract with no application (older data): only itself.
        $stmt = $conn->prepare("SELECT $columns FROM lease_contracts lc
                                LEFT JOIN rent_applications ra ON ra.id = lc.rent_application_id
                                WHERE lc.id = ?");
        $stmt->bind_param("s", $contract_id);
    }
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    $renewals_by_contract = [];
    $ids = array_column($rows, 'id');
    if ($ids) {
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $conn->prepare("SELECT id, contract_id, added_months, previous_lease_end, new_lease_end, previous_rent, rent_at_renewal,
                                       previous_signed_lease_path, previous_notarized_lease_path, created_at
                                FROM lease_renewals WHERE contract_id IN ($marks) ORDER BY id DESC");
        $stmt->bind_param(str_repeat('s', count($ids)), ...$ids);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($r = $res->fetch_assoc()) {
            $renewals_by_contract[$r['contract_id']][] = [
                'id' => (int)$r['id'],
                'addedMonths' => (int)$r['added_months'],
                'previousLeaseEnd' => $r['previous_lease_end'],
                'newLeaseEnd' => $r['new_lease_end'],
                'previousRent' => $r['previous_rent'] !== null ? (float)$r['previous_rent'] : null,
                'rentAtRenewal' => $r['rent_at_renewal'] !== null ? (float)$r['rent_at_renewal'] : null,
                'previousSignedLeasePath' => $r['previous_signed_lease_path'] ?: null,
                'previousNotarizedLeasePath' => $r['previous_notarized_lease_path'] ?: null,
                'createdAt' => $r['created_at'],
            ];
        }
        $stmt->close();
    }

    $contracts = [];
    foreach ($rows as $row) {
        $contracts[] = [
            'id' => $row['id'],
            'status' => $row['status'],
            'applicationId' => $row['application_id'] !== null ? (int)$row['application_id'] : null,
            'applicationStatus' => $row['application_status'],
            'room' => $row['room_name'],
            'monthlyRent' => $row['monthly_rent'] !== null ? (float)$row['monthly_rent'] : null,
            'leaseStart' => $row['lease_start'],
            'leaseEnd' => $row['lease_end'],
            'generatedAt' => $row['generated_at'],
            'terminatedAt' => $row['terminated_at'],
            'terminationReason' => $row['termination_reason'],
            'signedLeasePath' => $row['signed_lease_path'] ?: null,
            'signedUploadedAt' => $row['signed_lease_uploaded_at'],
            'signedReview' => $row['signed_lease_review'],
            'notarizedLeasePath' => $row['notarized_lease_path'] ?: null,
            'notarizedAt' => $row['notarized_at'],
            'renewals' => $renewals_by_contract[$row['id']] ?? [],
        ];
    }

    echo json_encode(["success" => true, "contracts" => $contracts]);
} catch (Exception $e) {
    server_error_response($e, "Could not load the contract history.");
}
$conn->close();
