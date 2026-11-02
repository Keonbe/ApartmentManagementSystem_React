<?php
/** Critical auth mail bypasses user notification switches; log-only environments expose contents to PHP error log. */
function send_auth_email($conn, string $recipient, string $subject, string $html, ?string &$errorMessage = null): bool {
    $errorMessage = null;
    $driver = strtolower((string)get_setting($conn, 'email_driver', 'log'));
    if ($driver !== 'smtp') {
        error_log('[AMS AUTH EMAIL LOG ONLY] To: ' . $recipient . ' | Subject: ' . $subject . ' | ' . trim(strip_tags($html)));
        return true;
    }
    $mail = null;
    try {
        $autoload = __DIR__ . '/../vendor/autoload.php';
        if (!is_file($autoload)) throw new RuntimeException('PHPMailer autoload missing');
        require_once $autoload;
        $mail = new PHPMailer\PHPMailer\PHPMailer(true);
        $smtpHost = trim((string)get_setting($conn, 'smtp_host', ''));
        $smtpPort = (int)get_setting($conn, 'smtp_port', '587');
        $smtpUsername = trim((string)get_setting($conn, 'smtp_username', ''));
        $smtpPassword = (string)get_setting($conn, 'smtp_password', '');
        if ($smtpHost === '' || $smtpUsername === '' || $smtpPassword === '' || $smtpPort < 1) {
            $errorMessage = 'SMTP credentials missing from database';
            error_log($errorMessage);
            return false;
        }
        $mail->isSMTP(); $mail->Host = $smtpHost;
        $mail->Port = $smtpPort; $mail->SMTPAuth = true;
        $mail->Username = $smtpUsername; $mail->Password = $smtpPassword;
        $mail->SMTPSecure = $mail->Port === 465
            ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
            : PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->CharSet = 'UTF-8';
        $from = get_setting($conn, 'smtp_from_email', $mail->Username);
        $mail->setFrom($from, get_setting($conn, 'smtp_from_name', 'AMS Notifications'));
        $mail->addAddress($recipient); $mail->isHTML(true); $mail->Subject = $subject; $mail->Body = $html;
        $mail->AltBody = trim(strip_tags($html)); $mail->send(); return true;
    } catch (Throwable $e) {
        // Preserve PHPMailer's exact SMTP diagnostic for server-side debugging.
        $errorMessage = ($mail instanceof PHPMailer\PHPMailer\PHPMailer && $mail->ErrorInfo !== '') ? $mail->ErrorInfo : $e->getMessage();
        error_log('[AMS AUTH EMAIL FAILED] ' . $errorMessage);
        return false;
    }
}