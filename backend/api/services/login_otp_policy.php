<?php
// Whether a sign-in on a new device needs the emailed 6-digit code
// (Admin → Other Settings → Sign-in Codes, login_otp_settings.php).
//   users.login_otp_mode 'on'  → always ask this account
//                        'off' → never ask this account
//                        'default' → the login_otp_enabled setting ('1' = ask)
// A trusted-device cookie still skips the code when one is needed; admins and
// the non-production demo domains never reach this (login.php checks first).

const LOGIN_OTP_MODES = ['default', 'on', 'off'];

// Admin → Other Settings → Sign-in Codes → Email verification. On (the
// default, also when the row is missing): a new account must open the emailed
// link before it can sign in. Off: new accounts are verified at sign-up and no
// link is sent, and an account still waiting for its link can sign in.
function email_verification_enabled($conn) {
    return (string)get_setting($conn, 'email_verification_enabled', '1') !== '0';
}

// Records this sign-in on users.last_login_at and says whether it was the
// account's first (the column was NULL). The NULL check and the stamp are one
// UPDATE, so two sign-ins at once cannot both count as the first. A server
// without the 2026_11_last_login migration yet treats every sign-in as a
// return visit instead of failing it.
function record_sign_in($conn, $userId) {
    $userId = (int)$userId;
    $first = $conn->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ? AND last_login_at IS NULL');
    if (!$first) return false;
    $first->bind_param('i', $userId);
    $first->execute();
    $isFirst = $first->affected_rows === 1;
    $first->close();
    if (!$isFirst) {
        $again = $conn->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?');
        if ($again) {
            $again->bind_param('i', $userId);
            $again->execute();
            $again->close();
        }
    }
    return $isFirst;
}

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
