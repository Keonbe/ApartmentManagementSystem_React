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
    return <<<HTML
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#2563eb;color:#ffffff;padding:20px 28px;font-size:18px;font-weight:bold;">
            Apartment Management System
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <h2 style="margin:0 0 16px 0;color:#1e293b;font-size:20px;">{$title}</h2>
            {$content_html}
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

function email_announcement_template($title, $body, $tag = 'General') {
    $tag_color = match ($tag) {
        'Urgent'   => '#dc2626',
        'Reminder' => '#d97706',
        default    => '#2563eb',
    };
    $tag_badge = "<span style=\"display:inline-block;padding:2px 10px;border-radius:4px;background:{$tag_color};color:#fff;font-size:12px;\">" . esc($tag) . "</span>";
    $content = "<p style=\"margin:0 0 12px 0;\">{$tag_badge}</p>"
             . "<p style=\"margin:0;color:#334155;line-height:1.6;\">" . nl2br(esc($body)) . "</p>";
    return email_base_template("Announcement: " . esc($title), $content);
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

function email_application_approved_template($tenant_name, $room, $monthly_rent, $due_date) {
    $amount = 'PHP ' . number_format((float)$monthly_rent * 2, 2);
    $content = "<p style=\"color:#334155;line-height:1.6;\">Hello <strong>" . esc($tenant_name) . "</strong>,</p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Congratulations! Your rental application has been approved and <strong>Unit " . esc($room) . "</strong> has been assigned to you.</p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Your move-in invoice covers one month of advance rent and one month of security deposit:</p>"
             . "<p style=\"color:#334155;line-height:1.6;\"><strong>Total: {$amount}</strong><br>Payment due: <strong>" . esc($due_date) . "</strong></p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Please sign in to your tenant portal to review your invoice and complete the move-in payment. Contact the admin if you need assistance.</p>";
    return email_base_template('Your Rental Application Is Approved', $content);
}

function email_status_update_template($tenant_name, $request_type, $request_label, $new_status, $details = '') {
    // $details is usually a tenant-authored description or an admin rejection
    // reason, and $request_label is whatever the tenant typed. Both are escaped.
    $content = "<p style=\"color:#334155;line-height:1.6;\">Hello <strong>" . esc($tenant_name) . "</strong>,</p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Your " . esc($request_type) . " request <strong>\"" . esc($request_label) . "\"</strong> has been updated to: "
             . "<strong style=\"color:#2563eb;\">" . esc($new_status) . "</strong></p>"
             . ($details !== '' ? "<p style=\"color:#475569;line-height:1.6;background:#f1f5f9;padding:12px;border-radius:6px;\">" . nl2br(esc($details)) . "</p>" : "");
    return email_base_template(ucfirst(esc($request_type)) . " Update - " . esc($request_label), $content);
}

function email_lease_reminder_template($tenant_name, $room, $lease_end, $days_left) {
    $content = "<p style=\"color:#334155;line-height:1.6;\">Hello <strong>" . esc($tenant_name) . "</strong>,</p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Your lease for <strong>Unit " . esc($room) . "</strong> expires on <strong>" . esc($lease_end) . "</strong> "
             . "(<strong>" . (int)$days_left . " days remaining</strong>).</p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Please contact the admin office to discuss renewal options.</p>";
    return email_base_template("Lease Expiring Soon - Unit " . esc($room), $content);
}
