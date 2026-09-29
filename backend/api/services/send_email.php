<?php
/**
 * Email sender (checklist 6.7).
 *
 * Usage:
 *   require_once __DIR__ . '/services/send_email.php';
 *   $ok = send_email($conn, $to_email, $subject, $html_body, $event_type, $user_id);
 *
 * Two drivers, chosen by system_settings.email_driver:
 *   log  — dry run. Renders the message, records it, writes it to the mock
 *          outbox, opens no socket. No SMTP account and no PHPMailer needed.
 *   smtp — PHPMailer over the configured SMTP server. Requires Composer; see
 *          §1.2 of docs/features/sms_email_implementation.md.
 *
 * config.php must already be loaded (get_setting, log_notification_delivery).
 */

require_once __DIR__ . '/send_sms.php'; // write_mock_outbox()

function send_email($conn, $to_email, $subject, $html_body, $event_type = 'general', $user_id = null) {
    try {
        return _send_email_impl($conn, $to_email, $subject, $html_body, $event_type, $user_id);
    } catch (Throwable $e) {
        error_log('Email dispatch failed [' . $event_type . ']: ' . $e->getMessage());
        _email_try_log($conn, $user_id, $event_type, $to_email, $subject, $e->getMessage(), 'failed');
        return false;
    }
}

function _email_try_log($conn, $user_id, $event_type, $recipient, $subject, $error, $status = 'sent') {
    try {
        if ($status === 'failed' && !function_exists('log_notification_delivery')) {
            error_log('Email delivery failed [' . $event_type . ']: ' . $error);
            return;
        }
        log_notification_delivery($conn, $user_id, 'email', $event_type, $recipient, $subject, null, $status, $error);
    } catch (Throwable $log_error) {
        error_log('Email delivery failure could not be logged: ' . $log_error->getMessage());
    }
}

function _send_email_impl($conn, $to_email, $subject, $html_body, $event_type, $user_id) {
    // Building-wide switch. Ships off.
    $enabled = get_setting($conn, 'notifications_email_enabled', '0');
    if ($enabled !== '1' && $enabled !== 'true') {
        _email_try_log($conn, $user_id, $event_type, $to_email, $subject, 'Email globally disabled', 'skipped');
        return false;
    }

    if (trim((string)$to_email) === '' || !filter_var($to_email, FILTER_VALIDATE_EMAIL)) {
        _email_try_log($conn, $user_id, $event_type, $to_email, $subject, 'Invalid email address', 'failed');
        return false;
    }

    $driver = strtolower(get_setting($conn, 'email_driver', 'log'));

    $result = $driver === 'smtp'
        ? _email_via_smtp($conn, $to_email, $subject, $html_body)
        : _email_via_log($conn, $to_email, $subject, $html_body, $event_type, $user_id);

    if ($result['ok']) {
        _email_try_log($conn, $user_id, $event_type, $to_email, $subject, null, 'sent');
        return true;
    }

    _email_try_log($conn, $user_id, $event_type, $to_email, $subject, $result['error'], 'failed');
    return false;
}

// ──────────────────────────────────────────────
//  Driver: log  (dry run — the default)
// ──────────────────────────────────────────────
//  Writes the rendered HTML to the mock outbox so it can be opened in a browser.
//  That file is the closest thing to seeing the real email, which is what makes
//  the template work reviewable before any SMTP account exists.
function _email_via_log($conn, $to_email, $subject, $html_body, $event_type, $user_id) {
    $from_name  = get_setting($conn, 'smtp_from_name', 'AMS Notifications');
    $from_email = get_setting($conn, 'smtp_from_email', '');

    $header = "<!-- DRY RUN - email_driver = 'log'. Nothing was sent.\n"
            . "     To:      $to_email\n"
            . "     From:    $from_name" . ($from_email !== '' ? " <$from_email>" : '') . "\n"
            . "     Subject: $subject\n"
            . "     Event:   $event_type\n"
            . "     User:    " . ($user_id ?: '-') . "\n"
            . "     Sent:    " . date('Y-m-d H:i:s') . "\n-->\n";

    write_mock_outbox('email', 'html', $header . $html_body);
    return ['ok' => true];
}

// ──────────────────────────────────────────────
//  Driver: smtp  (PHPMailer)
// ──────────────────────────────────────────────
//  vendor/ is loaded inside this branch on purpose: the log driver must work on
//  a checkout with no Composer install, and a missing dependency has to surface
//  as a failed row, never as a fatal that takes the request down with it.
function _email_via_smtp($conn, $to_email, $subject, $html_body) {
    $autoload = __DIR__ . '/../../vendor/autoload.php';
    if (!is_file($autoload)) {
        return ['ok' => false, 'error' => "PHPMailer is not installed. Run 'composer require phpmailer/phpmailer:^6.9' in backend/, or set email_driver to 'log'."];
    }
    require_once $autoload;
    if (!class_exists('PHPMailer\PHPMailer\PHPMailer')) {
        return ['ok' => false, 'error' => 'PHPMailer class not found after autoload.'];
    }

    $smtp_host     = get_setting($conn, 'smtp_host', 'smtp.gmail.com');
    $smtp_port     = (int)get_setting($conn, 'smtp_port', '587');
    $smtp_username = get_setting($conn, 'smtp_username', '');
    $smtp_password = get_setting($conn, 'smtp_password', '');
    $from_name     = get_setting($conn, 'smtp_from_name', 'AMS Notifications');
    $from_email    = get_setting($conn, 'smtp_from_email', '');
    if ($from_email === '') $from_email = $smtp_username;

    if ($smtp_username === '' || $smtp_password === '') {
        return ['ok' => false, 'error' => 'SMTP credentials not configured'];
    }

    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = $smtp_host;
        $mail->SMTPAuth   = true;
        $mail->Username   = $smtp_username;
        $mail->Password   = $smtp_password;
        $mail->SMTPSecure = $smtp_port === 465
            ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
            : PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = $smtp_port;
        $mail->CharSet    = 'UTF-8';

        $mail->setFrom($from_email, $from_name);
        $mail->addAddress($to_email);

        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $html_body;
        $mail->AltBody = trim(html_entity_decode(strip_tags(preg_replace('/<br\s*\/?>/i', "\n", $html_body)), ENT_QUOTES, 'UTF-8'));

        $mail->send();
        return ['ok' => true];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => $mail->ErrorInfo ?: $e->getMessage()];
    }
}
