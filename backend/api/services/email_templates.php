<?php
/**
 * AMS email templates. Each function returns a complete HTML document.
 *
 * C10 — every caller-supplied value is escaped with esc() at the point of
 * interpolation. A maintenance description, a rejection reason and a room label
 * are all tenant- or admin-authored, and the admin receives a copy of the same
 * mail, so an unescaped value is markup injected into someone else's inbox.
 * email_base_template() is the only function that accepts HTML, and only from
 * the functions below, which have already escaped their parts.
 */

function esc($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }

function email_base_template($title, $content_html) {
    $portal_url = defined('APP_URL') ? (string)APP_URL : (string)(getenv('APP_URL') ?: '');
    $portal_url = rtrim($portal_url, '/');
    $action = $portal_url !== ''
        ? '<p style="margin:24px 0 0;"><a href="' . esc($portal_url) . '" style="display:inline-block;padding:12px 20px;border-radius:6px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;">Open Tenant Portal</a></p>'
        : '';
    $safe_title = esc($title);
    return <<<HTML
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#2563eb;color:#ffffff;padding:20px 28px;font-size:18px;font-weight:bold;">
            Apartment Management System
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <h2 style="margin:0 0 16px 0;color:#1e293b;font-size:20px;">{$safe_title}</h2>
            {$content_html}
            {$action}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;">
            This is an automated notification from your apartment management office.<br>
            If you have questions, please contact the admin office directly.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;
}

function email_application_submitted_template($tenant_name, $reference_id, $room) {
    $content = '<p style="color:#334155;line-height:1.6;">Hello <strong>' . esc($tenant_name) . '</strong>,</p>'
             . '<p style="color:#334155;line-height:1.6;">We received your rental application for Unit <strong>' . esc($room) . '</strong>. Our team will review your submitted details and documents.</p>'
             . '<p style="color:#334155;line-height:1.6;">Application reference: <strong>' . esc($reference_id) . '</strong>. Keep this reference for your records. You can track your application in the tenant portal.</p>';
    return email_base_template('Rental Application Received', $content);
}

function email_application_decision_template($tenant_name, $room, $status, $reason = '') {
    $content = '<p style="color:#334155;line-height:1.6;">Hello <strong>' . esc($tenant_name) . '</strong>,</p>'
             . '<p style="color:#334155;line-height:1.6;">Your rental application for Unit <strong>' . esc($room) . '</strong> was <strong>' . esc($status) . '</strong>.</p>'
             . ($reason !== '' ? '<p style="color:#334155;line-height:1.6;background:#f1f5f9;padding:12px;border-radius:6px;"><strong>Reason:</strong><br>' . nl2br(esc($reason)) . '</p>' : '')
             . '<p style="color:#334155;line-height:1.6;">' . ($status === 'Approved' ? 'Please review your move-in invoice and complete the required payment. Management will send your confirmed move-in date separately after payment is verified.' : ($status === 'Cancelled' ? 'Your application has been cancelled as requested. Please sign in to review the status.' : 'Please sign in to review the decision and any available next steps.')) . '</p>';
    return email_base_template('Rental Application ' . $status, $content);
}

function email_move_in_scheduled_template($tenant_name, $room, $move_in_date, $message = '') {
    $content = '<p style="color:#334155;line-height:1.6;">Hello <strong>' . esc($tenant_name) . '</strong>,</p>'
             . '<p style="color:#334155;line-height:1.6;">Your move-in for Unit <strong>' . esc($room) . '</strong> is scheduled for <strong>' . esc(date('F j, Y', strtotime($move_in_date))) . '</strong>.</p>'
             . ($message !== '' ? '<p style="color:#334155;line-height:1.6;">' . nl2br(esc($message)) . '</p>' : '')
             . '<p style="color:#334155;line-height:1.6;">Please review any instructions in your tenant portal and contact the management office if you have questions.</p>';
    return email_base_template('Your Move-In Date Is Confirmed', $content);
}

function email_invoice_template($tenant_name, array $invoice) {
    $labels = ['base_rent' => 'Rent', 'water' => 'Water', 'electricity' => 'Electricity', 'parking' => 'Parking', 'services' => 'Services', 'maintenance' => 'Maintenance', 'late_fee' => 'Late fee'];
    $rows = '';
    foreach ($labels as $key => $label) {
        $amount = (float)($invoice[$key] ?? 0);
        if ($amount != 0.0) $rows .= '<tr><td style="padding:7px 0;color:#64748b;">' . esc($label) . '</td><td style="padding:7px 0;text-align:right;">PHP ' . number_format($amount, 2) . '</td></tr>';
    }
    $content = '<p style="color:#334155;line-height:1.6;">Hello <strong>' . esc($tenant_name) . '</strong>, your bill for <strong>' . esc($invoice['billing_period'] ?? '') . '</strong> is ready.</p>'
             . '<table style="width:100%;border-collapse:collapse;margin:16px 0;">' . $rows
             . '<tr><td style="padding:10px 0;border-top:1px solid #e2e8f0;font-weight:bold;">Total</td><td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;font-weight:bold;">PHP ' . number_format((float)($invoice['total_amount'] ?? 0), 2) . '</td></tr>'
             . '</table><p style="color:#334155;line-height:1.6;">Invoice: <strong>' . esc($invoice['id'] ?? '') . '</strong><br>Payment due: <strong>' . esc($invoice['due_date'] ?? '') . '</strong></p>';
    return email_base_template('New Monthly Bill', $content);
}

function email_payment_confirmation_template($tenant_name, array $invoices, $payment_method, $reference = '') {
    $total = 0.0;
    $rows = '';
    foreach ($invoices as $invoice) {
        $amount = (float)($invoice['total_amount'] ?? 0);
        $total += $amount;
        $rows .= '<tr><td style="padding:7px 0;color:#64748b;">' . esc($invoice['id'] ?? '') . ' — ' . esc($invoice['billing_period'] ?? '') . '</td><td style="padding:7px 0;text-align:right;">PHP ' . number_format($amount, 2) . '</td></tr>';
    }
    $content = '<p style="color:#334155;line-height:1.6;">Hello <strong>' . esc($tenant_name) . '</strong>, your payment has been confirmed.</p>'
             . '<table style="width:100%;border-collapse:collapse;margin:16px 0;">' . $rows
             . '<tr><td style="padding:10px 0;border-top:1px solid #e2e8f0;font-weight:bold;">Total received</td><td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;font-weight:bold;">PHP ' . number_format($total, 2) . '</td></tr></table>'
             . '<p style="color:#334155;line-height:1.6;">Payment method: <strong>' . esc($payment_method) . '</strong>' . ($reference !== '' ? '<br>Reference: <strong>' . esc($reference) . '</strong>' : '') . '</p>'
             . '<p style="color:#334155;line-height:1.6;">Your official payment record/receipt is available in Payment History.</p>';
    return email_base_template('Payment Confirmed — Official Receipt', $content);
}

function email_payment_reminder_template($tenant_name, array $invoice, $overdue = false) {
    $content = '<p style="color:#334155;line-height:1.6;">Hello <strong>' . esc($tenant_name) . '</strong>,</p>'
             . '<p style="color:#334155;line-height:1.6;">' . ($overdue ? 'Your bill is overdue.' : 'A payment reminder for your upcoming bill.') . '</p>'
             . '<table style="width:100%;border-collapse:collapse;margin:16px 0;">'
             . '<tr><td style="padding:7px 0;color:#64748b;">Invoice</td><td style="padding:7px 0;">' . esc($invoice['id'] ?? '') . '</td></tr>'
             . '<tr><td style="padding:7px 0;color:#64748b;">Billing period</td><td style="padding:7px 0;">' . esc($invoice['billing_period'] ?? '') . '</td></tr>'
             . '<tr><td style="padding:7px 0;color:#64748b;">Amount due</td><td style="padding:7px 0;font-weight:bold;">PHP ' . number_format((float)($invoice['total_amount'] ?? 0), 2) . '</td></tr>'
             . '<tr><td style="padding:7px 0;color:#64748b;">Due date</td><td style="padding:7px 0;">' . esc($invoice['due_date'] ?? '') . '</td></tr></table>'
             . '<p style="color:#334155;line-height:1.6;">Please sign in to your tenant portal to review and pay your bill.</p>';
    return email_base_template($overdue ? 'Overdue Payment Notice' : 'Payment Due Reminder', $content);
}

function email_bill_voided_template($tenant_name, $invoice_id, $reason = '') {
    $content = '<p style="color:#334155;line-height:1.6;">Hello <strong>' . esc($tenant_name) . '</strong>, invoice <strong>' . esc($invoice_id) . '</strong> has been voided and is no longer payable.</p>'
             . ($reason !== '' ? '<p style="color:#334155;line-height:1.6;background:#f1f5f9;padding:12px;border-radius:6px;"><strong>Reason:</strong><br>' . nl2br(esc($reason)) . '</p>' : '')
             . '<p style="color:#334155;line-height:1.6;">Please contact management if you believe this action was made in error.</p>';
    return email_base_template('Invoice Voided', $content);
}

function email_application_cancelled_by_admin_template($tenant_name, $room, $reason) {
    return email_application_decision_template($tenant_name, $room, 'Cancelled', $reason);
}

function email_payment_proof_template($tenant_name, $payment_key, $status, $reason = '', array $invoices = []) {
    $breakdown = '';
    foreach ($invoices as $invoice) {
        $breakdown .= '<tr><td style="padding:7px 0;color:#64748b;">' . esc($invoice['id'] ?? '') . ' — ' . esc($invoice['billing_period'] ?? '') . '</td><td style="padding:7px 0;text-align:right;">PHP ' . number_format((float)($invoice['total_amount'] ?? 0), 2) . '</td></tr>';
    }
    if ($breakdown !== '') $breakdown = '<table style="width:100%;border-collapse:collapse;margin:16px 0;">' . $breakdown . '</table>';
    $content = '<p style="color:#334155;line-height:1.6;">Hello <strong>' . esc($tenant_name) . '</strong>, your payment proof for <strong>' . esc($payment_key) . '</strong> was <strong>' . esc($status) . '</strong>.</p>'
             . $breakdown
             . ($reason !== '' ? '<p style="color:#334155;line-height:1.6;background:#f1f5f9;padding:12px;border-radius:6px;"><strong>Review notes:</strong><br>' . nl2br(esc($reason)) . '</p>' : '')
             . '<p style="color:#334155;line-height:1.6;">' . ($status === 'Approved' ? 'The payment has been recorded. Your receipt is available in Payment History.' : ($status === 'Rejected' ? 'Please review the reason and submit corrected proof through Pay Bills.' : 'Management will review your submission. You will receive another update when a decision is made.')) . '</p>';
    return email_base_template('Payment Proof ' . $status, $content);
}

function email_maintenance_received_template($tenant_name, $request_id, $category, $date) {
    $content = '<p style="color:#334155;line-height:1.6;">Hello <strong>' . esc($tenant_name) . '</strong>, we received maintenance request <strong>#' . (int)$request_id . '</strong> (' . esc($category) . ').</p>'
             . '<p style="color:#334155;line-height:1.6;">Your preferred visit date is ' . esc($date) . '. The team will review the request and update its status in your portal.</p>';
    return email_base_template('Maintenance Request Received', $content);
}

function email_utility_invoice_template($tenant_name, array $invoice, $reading) {
    $water_amount = round((float)($reading['water_amount'] ?? 0) + (float)($reading['water_other_fees'] ?? 0), 2);
    $electric_amount = round((float)($reading['electric_amount'] ?? 0) + (float)($reading['electric_other_fees'] ?? 0), 2);
    $content = '<p style="color:#334155;line-height:1.6;">Hello <strong>' . esc($tenant_name) . '</strong>, utility charges for ' . esc($invoice['billing_period'] ?? '') . ' have been billed.</p>'
             . '<table style="width:100%;border-collapse:collapse;margin:16px 0;">'
             . (($reading['entry_mode'] ?? 'metered') === 'total'
                 ? '<tr><td style="padding:7px 0;color:#64748b;">Utilities (total)</td><td style="padding:7px 0;text-align:right;">PHP ' . number_format((float)($reading['total_amount'] ?? 0), 2) . '</td></tr>'
                 : '<tr><td style="padding:7px 0;color:#64748b;">Water usage</td><td style="padding:7px 0;text-align:right;">' . number_format((float)($reading['water_consumption'] ?? 0), 2) . ' m³ — PHP ' . number_format($water_amount, 2) . '</td></tr>'
             . '<tr><td style="padding:7px 0;color:#64748b;">Electricity usage</td><td style="padding:7px 0;text-align:right;">' . number_format((float)($reading['electric_consumption'] ?? 0), 2) . ' kWh — PHP ' . number_format($electric_amount, 2) . '</td></tr>')
             . '<tr><td style="padding:7px 0;color:#64748b;">Invoice total</td><td style="padding:7px 0;text-align:right;font-weight:bold;">PHP ' . number_format((float)($invoice['total_amount'] ?? 0), 2) . '</td></tr></table>'
             . '<p style="color:#334155;line-height:1.6;">Due date: <strong>' . esc($invoice['due_date'] ?? '') . '</strong></p>';
    return email_base_template('Utility Charges Billed', $content);
}

function email_announcement_template($title, $body, $tag = 'General') {
    $tag_color = match ($tag) {
        'Urgent'   => '#dc2626',
        'Reminder' => '#d97706',
        default    => '#2563eb',
    };
    $tag_badge = "<span style=\"display:inline-block;padding:2px 10px;border-radius:4px;background:{$tag_color};color:#fff;font-size:12px;\">" . esc($tag) . "</span>";
    $content = "<p style=\"margin:0 0 12px 0;\">{$tag_badge}</p>"
             . "<p style=\"margin:0;color:#334155;line-height:1.6;\">" . nl2br(esc($body)) . "</p>";
    return email_base_template("Announcement: " . $title, $content);
}

function email_payment_template($tenant_name, $amount, $room, $period, $status, $ref = '') {
    $amount_fmt = 'PHP ' . number_format((float)$amount, 2);
    $content = "<p style=\"color:#334155;line-height:1.6;\">Hello <strong>" . esc($tenant_name) . "</strong>,</p>"
             . "<table style=\"width:100%;border-collapse:collapse;margin:16px 0;\">"
             . "<tr><td style=\"padding:8px 0;color:#64748b;\">Amount</td><td style=\"padding:8px 0;font-weight:bold;\">{$amount_fmt}</td></tr>"
             . "<tr><td style=\"padding:8px 0;color:#64748b;\">Unit</td><td style=\"padding:8px 0;\">" . esc($room) . "</td></tr>"
             . "<tr><td style=\"padding:8px 0;color:#64748b;\">Period</td><td style=\"padding:8px 0;\">" . esc($period) . "</td></tr>"
             . ($ref !== '' ? "<tr><td style=\"padding:8px 0;color:#64748b;\">Reference</td><td style=\"padding:8px 0;\">" . esc($ref) . "</td></tr>" : "")
             . "</table>";
    $title = $status === 'confirmed' ? 'Payment Received' : 'Payment Reminder';
    return email_base_template($title . " - Unit " . esc($room), $content);
}

function email_application_approved_template($tenant_name, $room, $monthly_rent, $due_date, $move_in_date = null) {
    $amount = 'PHP ' . number_format((float)$monthly_rent * 2, 2);
    $content = "<p style=\"color:#334155;line-height:1.6;\">Hello <strong>" . esc($tenant_name) . "</strong>,</p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Congratulations! Your rental application has been approved and <strong>Unit " . esc($room) . "</strong> has been assigned to you.</p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Please review your move-in invoice in the tenant portal and complete payment by <strong>" . esc($due_date) . "</strong>. "
             . ($move_in_date ? "Your scheduled move-in date is <strong>" . esc(date('F j, Y', strtotime($move_in_date))) . "</strong>." : "Management will send your confirmed move-in date separately after your initial payment is verified.") . "</p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Monthly rent: <strong>PHP " . number_format((float)$monthly_rent, 2) . "</strong><br>Initial invoice (one month advance + one month deposit): <strong>{$amount}</strong></p>";
    return email_base_template('Your Rental Application Is Approved', $content);
}

function email_status_update_template($tenant_name, $request_type, $request_label, $new_status, $details = '') {
    // $details is usually a tenant-authored description or an admin rejection
    // reason, and $request_label is whatever the tenant typed. Both are escaped.
    $content = "<p style=\"color:#334155;line-height:1.6;\">Hello <strong>" . esc($tenant_name) . "</strong>,</p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Your " . esc($request_type) . " request <strong>\"" . esc($request_label) . "\"</strong> has been updated to: "
             . "<strong style=\"color:#2563eb;\">" . esc($new_status) . "</strong></p>"
             . ($details !== '' ? "<p style=\"color:#475569;line-height:1.6;background:#f1f5f9;padding:12px;border-radius:6px;\">" . nl2br(esc($details)) . "</p>" : "");
    return email_base_template(ucfirst($request_type) . " Update - " . $request_label, $content);
}

function email_lease_reminder_template($tenant_name, $room, $lease_end, $days_left) {
    $content = "<p style=\"color:#334155;line-height:1.6;\">Hello <strong>" . esc($tenant_name) . "</strong>,</p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Your rent for <strong>Unit " . esc($room) . "</strong> expires on <strong>" . esc($lease_end) . "</strong> "
             . "(<strong>" . (int)$days_left . " days remaining</strong>).</p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Please contact the admin office to discuss renewal options.</p>";
    return email_base_template("Rent Contract Expiring Soon - Unit " . $room, $content);
}
