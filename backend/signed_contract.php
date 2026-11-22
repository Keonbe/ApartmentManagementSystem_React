<?php
// The office's check of a tenant's signed rent contract (lease_contracts.signed_lease_*,
// migration section signed_contract_review).
//
// The tenant prints the contract, signs it and uploads a photo or a PDF from Track
// Application (upload_lease_document.php, docType signedLease). That copy waits as
// 'pending' in the admin queue (type signed_contract) until an admin accepts it or
// sends it back with a note (review_signed_contract.php), from Applications or
// Contracts. A copy sent back can be replaced by the tenant even after the contract
// left draft. A copy the admin uploads is accepted at once.
//
// Requires config.php (create_notification, notify_admins_queue, resolve_admin_queue).

const SIGNED_CONTRACT_QUEUE = 'signed_contract';
const SIGNED_CONTRACT_REVIEWS = ['pending', 'accepted', 'rejected'];

// pending | accepted | rejected, or null when there is no copy. A copy from before
// the review existed (no review value) counts as accepted.
function signed_contract_review_state($row) {
    $path = (string)($row['signed_lease_path'] ?? '');
    if ($path === '') return null;
    $review = $row['signed_lease_review'] ?? null;
    return in_array($review, SIGNED_CONTRACT_REVIEWS, true) ? $review : 'accepted';
}

// The review fields as the API returns them (camelCase, for Applications and Contracts).
function signed_contract_review_payload($row) {
    return [
        'review' => signed_contract_review_state($row),
        'note' => $row['signed_lease_review_note'] ?? null,
        'uploadedAt' => $row['signed_lease_uploaded_at'] ?? null,
        'reviewedAt' => $row['signed_lease_reviewed_at'] ?? null,
    ];
}

// Who the contract belongs to: ['user_id' => int|null, 'name' => string, 'unit' => string].
function signed_contract_tenant($conn, $contract_id) {
    $stmt = $conn->prepare("SELECT ra.user_id, ra.first_name, ra.last_name, ra.room_name
                              FROM lease_contracts lc
                              LEFT JOIN rent_applications ra ON ra.id = lc.rent_application_id
                             WHERE lc.id = ?");
    $stmt->bind_param("s", $contract_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc() ?: [];
    $stmt->close();
    return [
        'user_id' => isset($row['user_id']) ? (int)$row['user_id'] : null,
        'name' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')) ?: 'A tenant',
        'unit' => (string)($row['room_name'] ?? ''),
    ];
}

// ── Notarized copy (SPRINT 240, migration section notarized_contract) ──
// The tenant has the signed contract notarized and tells the office from My Room
// (notarized_contract.php action ready, queue type notarized_contract); the office
// marks it received on Contracts (action mark). A scan the office uploads
// (notarized_lease_path) counts as notarized too. Whether a contract needs it at all
// is the contract_require_notarized setting (Contracts page settings; missing = on).
const NOTARIZED_CONTRACT_QUEUE = 'notarized_contract';

function contract_requires_notarized($conn) {
    $res = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'contract_require_notarized' LIMIT 1");
    $row = $res ? $res->fetch_assoc() : null;
    return !$row || in_array((string)$row['setting_value'], ['1', 'true'], true);
}

// True when the office has the notarized copy (marked received or a scan on file).
function contract_is_notarized($row) {
    return !empty($row['notarized_at']) || (string)($row['notarized_lease_path'] ?? '') !== '';
}

// After a tenant's upload: one queue row per contract (a new copy replaces the old alert).
function signed_contract_queue_review($conn, $contract_id) {
    $tenant = signed_contract_tenant($conn, $contract_id);
    resolve_admin_queue($conn, SIGNED_CONTRACT_QUEUE, $contract_id);
    notify_admins_queue($conn, SIGNED_CONTRACT_QUEUE, $contract_id, 'Signed contract to check',
        $tenant['name'] . ' uploaded their signed rent contract' . ($tenant['unit'] !== '' ? ' for Unit ' . $tenant['unit'] : '') . '. Check it on Applications or Contracts.');
}
