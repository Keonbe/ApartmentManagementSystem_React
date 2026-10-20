<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

// Tenant monitoring (checklist 8.4): lease status, payment status and lease end.
$admin_id = require_admin($conn);
promote_overdue_invoices($conn);

$open = billing_open_status_sql();

// A tenant's balance covers invoices tied to this application, plus any invoice
// for the same user that carries no application (e.g. older manual invoices).
$invoice_scope = "(i.rent_application_id = ra.id OR (i.rent_application_id IS NULL AND i.user_id = ra.user_id))";

$result = $conn->query("
    SELECT ra.*, lc.lease_start, lc.lease_end, lc.status AS contract_status,
           (SELECT COALESCE(SUM(i.total_amount), 0) FROM invoices i WHERE $invoice_scope AND i.status IN $open) AS outstanding,
           (SELECT COALESCE(SUM(i.total_amount), 0) FROM invoices i WHERE $invoice_scope AND i.status IN $open AND i.due_date < CURDATE()) AS overdue_amount,
           (SELECT MIN(i.due_date) FROM invoices i WHERE $invoice_scope AND i.status IN $open AND i.due_date < CURDATE()) AS oldest_overdue_due
    FROM rent_applications ra
    LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id
    ORDER BY ra.id DESC
");

$tenants = [];
$requirements = application_requirements_list($conn);
$documents_by_app = application_documents_by_app($conn);
$rows = $result->fetch_all(MYSQLI_ASSOC);
// Itemized deposit deductions of moved-out/archived tenants: one query in total.
$ended_statuses = ['moved-out', 'archived'];
$deductions_by_app = deposit_deductions_for($conn, array_map(
    fn($r) => (int)$r['id'],
    array_filter($rows, fn($r) => in_array($r['status'], $ended_statuses, true))
));
foreach ($rows as $row) {
    $documents = $documents_by_app[(int)$row['id']] ?? [];
    $deposit_outcome = null;
    if (in_array($row['status'], $ended_statuses, true) && $row['contract_id'] !== null) {
        $deposit_outcome = [
            'status' => $row['deposit_status'],
            'amount' => round((float)$row['deposit_amount'], 2),
            'damage' => round((float)$row['damage_deduction'], 2),
            'utility' => round((float)$row['utility_deduction'], 2),
            'refundDate' => $row['refund_date'],
            'items' => $deductions_by_app[(int)$row['id']] ?? [],
        ];
    }
    $outstanding = (float)$row['outstanding'];
    $overdue = (float)$row['overdue_amount'];

    // Was hardcoded to 'paid' for every tenant, overdue or not.
    $payment_status = $overdue > 0 ? 'overdue' : ($outstanding > 0 ? 'due' : 'current');

    // The contract's own dates when there is one; otherwise the application's
    // submission date plus the requested term, as before.
    $lease_end = $row['lease_end'] ?: date('Y-m-d', strtotime($row['created_at'] . ' + ' . (int)$row['months_of_rent'] . ' months'));
    $move_in = $row['status'] === 'Pending Review' ? null : ($row['lease_start'] ?: $row['created_at']);

    $tenants[] = [
        'id' => $row['id'],
        'name' => $row['first_name'] . ' ' . $row['last_name'],
        'email' => $row['email'],
        'phone' => $row['contact_no'],
        'unit' => $row['room_name'],
        'rent' => '₱' . number_format($row['monthly_rent']),
        'moveIn' => $move_in,
        'leaseEnd' => $lease_end,
        'contractStatus' => $row['contract_status'],
        'status' => $row['status'],
        'paymentStatus' => $payment_status,
        'outstandingBalance' => round($outstanding, 2),
        'overdueBalance' => round($overdue, 2),
        'daysOverdue' => $row['oldest_overdue_due'] ? (int)((strtotime(date('Y-m-d')) - strtotime($row['oldest_overdue_due'])) / 86400) : 0,
        'documents' => $documents,
        'missingDocuments' => application_missing_document_labels($requirements, $documents),
        'documentsVerifiedAt' => $row['documents_verified_at'] ?? null,
        'previousAddress' => $row['previous_address'] ?? null,
        'archiveDate' => $row['archive_date'] ?? null,
        'archiveReason' => $row['archive_reason'] ?? null,
        'archiveNotes' => $row['archive_notes'] ?? null,
        'requestedMoveOutDate' => $row['requested_move_out_date'] ?? null,
        'depositOutcome' => $deposit_outcome,
        'user_id' => $row['user_id'] ?? null,
    ];
}

echo json_encode(["success" => true, "data" => $tenants]);
$conn->close();
?>
