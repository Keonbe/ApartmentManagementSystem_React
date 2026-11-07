<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Building expenses entered by an admin (decided 2026-09-16, docs/planning/todo.md › Reports).
// get_report_data.php adds these to the maintenance costs it already derives, so
// repairs are never entered here.
$admin_id = require_admin($conn);

const EXPENSE_CATEGORIES = ['utilities', 'supplies', 'salaries', 'repairs_common', 'taxes_fees', 'insurance', 'other'];

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

function format_expense($row) {
    return [
        'id'          => (int)$row['id'],
        'category'    => $row['category'],
        'amount'      => (float)$row['amount'],
        'expenseDate' => $row['expense_date'],
        'description' => $row['description'],
        'createdBy'   => person_name($row) ?: null,
        'createdAt'   => $row['created_at'],
    ];
}

// Shared by create and update. Returns the cleaned values or fails with 422.
function validate_expense($input) {
    $category = (string)($input['category'] ?? '');
    $amount = $input['amount'] ?? null;
    $date = (string)($input['expenseDate'] ?? '');
    $description = trim((string)($input['description'] ?? ''));

    if (!in_array($category, EXPENSE_CATEGORIES, true)) fail(422, "Category must be one of: " . implode(', ', EXPENSE_CATEGORIES) . ".");
    if (!is_numeric($amount) || (float)$amount <= 0 || (float)$amount > 10000000) fail(422, "Amount must be a positive number.");
    $d = DateTime::createFromFormat('Y-m-d', $date);
    if (!$d || $d->format('Y-m-d') !== $date) fail(422, "Expense date must be a valid date (YYYY-MM-DD).");
    if ($date > date('Y-m-d', strtotime('+1 day'))) fail(422, "Expense date cannot be in the future.");
    if (mb_strlen($description) > 255) fail(422, "Description must be 255 characters or fewer.");

    return [$category, round((float)$amount, 2), $date, $description === '' ? null : $description];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Optional YYYY-MM filter; otherwise the most recent 200 entries.
    $month = $_GET['month'] ?? '';
    if ($month !== '' && !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) fail(422, "Month must be YYYY-MM.");

    $sql = "SELECT e.*, u.first_name, u.last_name, u.suffix FROM expenses e LEFT JOIN users u ON u.id = e.created_by";
    if ($month !== '') {
        $sql .= " WHERE DATE_FORMAT(e.expense_date, '%Y-%m') = ?";
    }
    $sql .= " ORDER BY e.expense_date DESC, e.id DESC LIMIT 200";
    $stmt = $conn->prepare($sql);
    if ($month !== '') $stmt->bind_param("s", $month);
    $stmt->execute();
    $res = $stmt->get_result();
    $expenses = [];
    while ($row = $res->fetch_assoc()) $expenses[] = format_expense($row);
    $stmt->close();

    echo json_encode(["success" => true, "expenses" => $expenses, "categories" => EXPENSE_CATEGORIES]);
    $conn->close();
    exit;
}

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$action = $input['action'] ?? '';

switch ($action) {
    case 'create': {
        [$category, $amount, $date, $description] = validate_expense($input);
        $stmt = $conn->prepare("INSERT INTO expenses (category, amount, expense_date, description, created_by) VALUES (?, ?, ?, ?, ?)");
        $stmt->bind_param("sdssi", $category, $amount, $date, $description, $admin_id);
        if (!$stmt->execute()) fail(500, "Could not save the expense.");
        $id = $stmt->insert_id;
        $stmt->close();
        log_activity($conn, $admin_id, 'billing', 'Added Expense', "Expense #$id: $category ₱" . number_format($amount, 2) . " on $date");
        echo json_encode(["success" => true, "message" => "Expense added.", "id" => $id]);
        break;
    }

    case 'update': {
        $id = (int)($input['id'] ?? 0);
        if ($id <= 0) fail(422, "Expense id is required.");
        [$category, $amount, $date, $description] = validate_expense($input);
        $stmt = $conn->prepare("UPDATE expenses SET category = ?, amount = ?, expense_date = ?, description = ? WHERE id = ?");
        $stmt->bind_param("sdssi", $category, $amount, $date, $description, $id);
        if (!$stmt->execute()) fail(500, "Could not update the expense.");
        $stmt->close();
        // affected_rows is 0 for an unchanged row too, so check existence separately.
        $check = $conn->prepare("SELECT id FROM expenses WHERE id = ?");
        $check->bind_param("i", $id);
        $check->execute();
        $exists = $check->get_result()->num_rows > 0;
        $check->close();
        if (!$exists) fail(404, "Expense not found.");
        log_activity($conn, $admin_id, 'billing', 'Updated Expense', "Expense #$id: $category ₱" . number_format($amount, 2) . " on $date");
        echo json_encode(["success" => true, "message" => "Expense updated."]);
        break;
    }

    case 'delete': {
        $id = (int)($input['id'] ?? 0);
        if ($id <= 0) fail(422, "Expense id is required.");
        $stmt = $conn->prepare("DELETE FROM expenses WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $deleted = $stmt->affected_rows;
        $stmt->close();
        if ($deleted === 0) fail(404, "Expense not found.");
        log_activity($conn, $admin_id, 'billing', 'Deleted Expense', "Expense #$id deleted");
        echo json_encode(["success" => true, "message" => "Expense deleted."]);
        break;
    }

    default:
        fail(422, "Unknown action.");
}

$conn->close();
?>
