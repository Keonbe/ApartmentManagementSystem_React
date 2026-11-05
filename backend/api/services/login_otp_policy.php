<?php
// Whether a sign-in on a new device needs the emailed 6-digit code
// (Admin → Other Settings → Sign-in Codes, login_otp_settings.php).
//   users.login_otp_mode 'on'  → always ask this account
//                        'off' → never ask this account
//                        'default' → the login_otp_enabled setting ('1' = ask)
// A trusted-device cookie still skips the code when one is needed; admins and
// the non-production demo domains never reach this (login.php checks first).

const LOGIN_OTP_MODES = ['default', 'on', 'off'];

function login_otp_globally_enabled($conn) {
    return (string)get_setting($conn, 'login_otp_enabled', '1') !== '0';
}

function login_needs_device_code($conn, $userId) {
    $mode = 'default';
    // Read on its own and guarded: a server that has not run the
    // 2026_11_login_otp_controls migration yet keeps asking as before instead
    // of failing every sign-in on an unknown column.
    try {
        $stmt = $conn->prepare('SELECT login_otp_mode FROM users WHERE id = ?');
        if ($stmt) {
            $stmt->bind_param('i', $userId);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if ($row && in_array($row['login_otp_mode'], LOGIN_OTP_MODES, true)) $mode = $row['login_otp_mode'];
        }
    } catch (Throwable $e) {
        error_log('login_otp_mode unavailable: ' . $e->getMessage());
    }
    if ($mode === 'on') return true;
    if ($mode === 'off') return false;
    return login_otp_globally_enabled($conn);
}
