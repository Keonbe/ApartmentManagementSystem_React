<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . "/../config.php";

try {
    // 1. Ensure tracking columns exist on invoices table
    @$conn->query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_date DATE DEFAULT NULL;");
    @$conn->query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_count INT DEFAULT 0;");

    // 2. Load system settings for reminders
    $settings = [];
    $s_res = $conn->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('rent_due_reminders_enabled', 'rent_due_reminder_days', 'overdue_reminders_enabled', 'overdue_reminder_interval_days')");
    if ($s_res) {
        while ($row = $s_res->fetch_assoc()) {
            $settings[$row['setting_key']] = $row['setting_value'];
        }
    }

    $reminders_enabled = ($settings['rent_due_reminders_enabled'] ?? 'true') !== 'false';
    $reminder_days = (int)($settings['rent_due_reminder_days'] ?? 3);
    $overdue_enabled = ($settings['overdue_reminders_enabled'] ?? 'true') !== 'false';
    $overdue_interval = (int)($settings['overdue_reminder_interval_days'] ?? 3);

    // 3. Auto-mark pending invoices whose due date has passed as 'overdue'
    $conn->query("UPDATE invoices SET status = 'overdue' WHERE status = 'pending' AND due_date IS NOT NULL AND due_date < CURDATE()");
    $marked_overdue = $conn->affected_rows;

    $upcoming_sent = 0;
    $overdue_sent = 0;

    $today = new DateTime(date('Y-m-d'));

    // 4. Check upcoming due date reminders (due within $reminder_days days)
    if ($reminders_enabled) {
        $upcoming_query = "
            SELECT i.id, i.user_id, i.total_amount, i.due_date, i.billing_period, i.last_reminder_date, i.reminder_count,
                   u.first_name, u.last_name, ra.room_name
            FROM invoices i
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
            WHERE i.status = 'pending'
              AND i.due_date IS NOT NULL
              AND i.due_date >= CURDATE()
              AND DATEDIFF(i.due_date, CURDATE()) <= ?
              AND (i.last_reminder_date IS NULL OR i.last_reminder_date < CURDATE())
        ";
        $u_stmt = $conn->prepare($upcoming_query);
        $u_stmt->bind_param("i", $reminder_days);
        $u_stmt->execute();
        $u_result = $u_stmt->get_result();

        while ($inv = $u_result->fetch_assoc()) {
            $dueDateObj = new DateTime($inv['due_date']);
            $diffDays = (int)$today->diff($dueDateObj)->format("%r%a");
            $unit = !empty($inv['room_name']) ? $inv['room_name'] : 'your unit';
            $amountFormatted = number_format((float)$inv['total_amount'], 2);
            $formattedDueDate = $dueDateObj->format('M j, Y');

            if ($diffDays === 0) {
                $title = "Payment Due Today: {$inv['billing_period']}";
                $message = "Your rent payment of ₱{$amountFormatted} for Unit {$unit} is due today ({$formattedDueDate}). Please settle your bill promptly.";
            } else {
                $title = "Rent Due Reminder: {$inv['billing_period']}";
                $daysText = $diffDays === 1 ? "1 day" : "{$diffDays} days";
                $message = "Your rent payment of ₱{$amountFormatted} for Unit {$unit} is due on {$formattedDueDate} ({$daysText} remaining). Please settle your bill on time.";
            }

            // Insert notification for tenant
            $notif = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read, created_at) VALUES (?, 'rent_due', ?, ?, 'Pending', 0, NOW())");
            $notif->bind_param("iss", $inv['user_id'], $title, $message);
            $notif->execute();
            $notif->close();

            // Update invoice reminder tracking
            $upd = $conn->prepare("UPDATE invoices SET last_reminder_date = CURDATE(), reminder_count = reminder_count + 1 WHERE id = ?");
            $upd->bind_param("s", $inv['id']);
            $upd->execute();
            $upd->close();

            $upcoming_sent++;
        }
        $u_stmt->close();
    }

    // 5. Check overdue invoice reminders (remind every $overdue_interval days)
    if ($overdue_enabled) {
        $overdue_query = "
            SELECT i.id, i.user_id, i.total_amount, i.due_date, i.billing_period, i.last_reminder_date, i.reminder_count,
                   u.first_name, u.last_name, ra.room_name
            FROM invoices i
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
            WHERE i.status = 'overdue'
              AND i.due_date IS NOT NULL
              AND i.due_date < CURDATE()
              AND (i.last_reminder_date IS NULL OR DATEDIFF(CURDATE(), i.last_reminder_date) >= ?)
        ";
        $o_stmt = $conn->prepare($overdue_query);
        $o_stmt->bind_param("i", $overdue_interval);
        $o_stmt->execute();
        $o_result = $o_stmt->get_result();

        while ($inv = $o_result->fetch_assoc()) {
            $dueDateObj = new DateTime($inv['due_date']);
            $diffDays = (int)$dueDateObj->diff($today)->format("%a");
            $unit = !empty($inv['room_name']) ? $inv['room_name'] : 'your unit';
            $amountFormatted = number_format((float)$inv['total_amount'], 2);
            $formattedDueDate = $dueDateObj->format('M j, Y');
            $daysText = $diffDays === 1 ? "1 day" : "{$diffDays} days";

            $title = "Overdue Rent Alert: {$inv['billing_period']}";
            $message = "Your payment of ₱{$amountFormatted} for Unit {$unit} was due on {$formattedDueDate} ({$daysText} overdue). Please settle your outstanding balance immediately to avoid further penalties.";

            // Insert notification for tenant
            $notif = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read, created_at) VALUES (?, 'overdue', ?, ?, 'Pending', 0, NOW())");
            $notif->bind_param("iss", $inv['user_id'], $title, $message);
            $notif->execute();
            $notif->close();

            // Update invoice reminder tracking
            $upd = $conn->prepare("UPDATE invoices SET last_reminder_date = CURDATE(), reminder_count = reminder_count + 1 WHERE id = ?");
            $upd->bind_param("s", $inv['id']);
            $upd->execute();
            $upd->close();

            $overdue_sent++;
        }
        $o_stmt->close();
    }

    echo json_encode([
        "success" => true,
        "message" => "Due date reminder check completed.",
        "marked_overdue" => $marked_overdue,
        "upcoming_reminders_sent" => $upcoming_sent,
        "overdue_reminders_sent" => $overdue_sent
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$conn->close();
?>
