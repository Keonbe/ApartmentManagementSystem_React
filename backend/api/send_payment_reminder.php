<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . "/../config.php";

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

try {
    // Ensure columns exist
    @$conn->query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_date DATE DEFAULT NULL;");
    @$conn->query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_count INT DEFAULT 0;");

    $input = json_decode(file_get_contents("php://input"), true) ?? [];
    $invoice_id = trim($input['invoice_id'] ?? '');
    $is_batch = !empty($input['all']);
    $custom_message = trim($input['custom_message'] ?? '');

    $today = new DateTime(date('Y-m-d'));

    if ($is_batch) {
        // Find all invoices that are pending or overdue with a due date
        $query = "
            SELECT i.id, i.user_id, i.total_amount, i.due_date, i.billing_period, i.status,
                   u.first_name, u.last_name, ra.room_name
            FROM invoices i
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
            WHERE i.status IN ('pending', 'overdue')
              AND i.due_date IS NOT NULL
        ";
        $result = $conn->query($query);
        $count = 0;

        while ($inv = $result->fetch_assoc()) {
            $dueDateObj = new DateTime($inv['due_date']);
            $unit = !empty($inv['room_name']) ? $inv['room_name'] : 'your unit';
            $amountFormatted = number_format((float)$inv['total_amount'], 2);
            $formattedDueDate = $dueDateObj->format('M j, Y');

            $isOverdue = $dueDateObj < $today;
            $type = $isOverdue ? 'overdue' : 'rent_due';

            if ($isOverdue) {
                $diffDays = (int)$dueDateObj->diff($today)->format("%a");
                $daysText = $diffDays === 1 ? "1 day" : "{$diffDays} days";
                $title = "Overdue Rent Alert: {$inv['billing_period']}";
                $message = !empty($custom_message) ? $custom_message : "Notice from Management: Your rent payment of ₱{$amountFormatted} for Unit {$unit} was due on {$formattedDueDate} ({$daysText} overdue). Please settle your bill immediately.";
            } else {
                $diffDays = (int)$today->diff($dueDateObj)->format("%a");
                $daysText = $diffDays === 0 ? "today" : ($diffDays === 1 ? "in 1 day" : "in {$diffDays} days");
                $title = "Rent Due Reminder: {$inv['billing_period']}";
                $message = !empty($custom_message) ? $custom_message : "Notice from Management: Your rent payment of ₱{$amountFormatted} for Unit {$unit} is due {$daysText} ({$formattedDueDate}). Please settle your bill on time.";
            }

            $notif = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read, created_at) VALUES (?, ?, ?, ?, 'Pending', 0, NOW())");
            $notif->bind_param("isss", $inv['user_id'], $type, $title, $message);
            $notif->execute();
            $notif->close();

            $upd = $conn->prepare("UPDATE invoices SET last_reminder_date = CURDATE(), reminder_count = reminder_count + 1 WHERE id = ?");
            $upd->bind_param("s", $inv['id']);
            $upd->execute();
            $upd->close();

            $count++;
        }

        log_activity($conn, $admin_id, 'billing', 'batch_reminder', "Dispatched payment reminders to {$count} tenant(s) with pending/overdue balances.");

        echo json_encode([
            "success" => true,
            "message" => "Dispatched payment reminders to {$count} tenant(s).",
            "count" => $count
        ]);
        exit;
    }

    if (empty($invoice_id)) {
        echo json_encode(["success" => false, "message" => "Invoice ID is required."]);
        exit;
    }

    // Single invoice reminder
    $stmt = $conn->prepare("
        SELECT i.id, i.user_id, i.total_amount, i.due_date, i.billing_period, i.status, i.reminder_count,
               u.first_name, u.last_name, ra.room_name
        FROM invoices i
        LEFT JOIN users u ON i.user_id = u.id
        LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
        WHERE i.id = ?
    ");
    $stmt->bind_param("s", $invoice_id);
    $stmt->execute();
    $res = $stmt->get_result();
    $inv = $res->fetch_assoc();
    $stmt->close();

    if (!$inv) {
        echo json_encode(["success" => false, "message" => "Invoice not found."]);
        exit;
    }

    if (!in_array($inv['status'], ['pending', 'overdue', 'pending-verification'])) {
        echo json_encode(["success" => false, "message" => "Invoice is already {$inv['status']}."]);
        exit;
    }

    $dueDateObj = new DateTime($inv['due_date']);
    $unit = !empty($inv['room_name']) ? $inv['room_name'] : 'your unit';
    $tenantName = trim(($inv['first_name'] ?? '') . ' ' . ($inv['last_name'] ?? '')) ?: 'Tenant';
    $amountFormatted = number_format((float)$inv['total_amount'], 2);
    $formattedDueDate = $dueDateObj->format('M j, Y');

    $isOverdue = $dueDateObj < $today;
    $type = $isOverdue ? 'overdue' : 'rent_due';

    if ($isOverdue) {
        $diffDays = (int)$dueDateObj->diff($today)->format("%a");
        $daysText = $diffDays === 1 ? "1 day" : "{$diffDays} days";
        $title = "Overdue Rent Alert: {$inv['billing_period']}";
        $message = !empty($custom_message) ? $custom_message : "Notice from Management: Your rent payment of ₱{$amountFormatted} for Unit {$unit} was due on {$formattedDueDate} ({$daysText} overdue). Please settle your balance immediately.";
    } else {
        $diffDays = (int)$today->diff($dueDateObj)->format("%a");
        $daysText = $diffDays === 0 ? "today" : ($diffDays === 1 ? "in 1 day" : "in {$diffDays} days");
        $title = "Rent Due Reminder: {$inv['billing_period']}";
        $message = !empty($custom_message) ? $custom_message : "Notice from Management: Your rent payment of ₱{$amountFormatted} for Unit {$unit} is due {$daysText} ({$formattedDueDate}). Please settle your bill promptly.";
    }

    $notif = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read, created_at) VALUES (?, ?, ?, ?, 'Pending', 0, NOW())");
    $notif->bind_param("isss", $inv['user_id'], $type, $title, $message);
    $notif->execute();
    $notif->close();

    $newCount = (int)($inv['reminder_count'] ?? 0) + 1;
    $upd = $conn->prepare("UPDATE invoices SET last_reminder_date = CURDATE(), reminder_count = ? WHERE id = ?");
    $upd->bind_param("is", $newCount, $invoice_id);
    $upd->execute();
    $upd->close();

    log_activity($conn, $admin_id, 'billing', 'send_reminder', "Sent payment reminder to {$tenantName} (Unit {$unit}) for invoice {$invoice_id}.");

    echo json_encode([
        "success" => true,
        "message" => "Reminder sent to {$tenantName} successfully.",
        "invoice_id" => $invoice_id,
        "last_reminder_date" => date('Y-m-d'),
        "reminder_count" => $newCount
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$conn->close();
?>
