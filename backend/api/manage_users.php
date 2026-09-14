<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// Admin account management (checklist 11.1). The acting admin is the session
// user — the old code read X-Admin-Id, so the "cannot modify your own account"
// guard and every audit entry depended on a header the client chooses.
$admin_id = require_admin($conn);

const MAX_ADMIN_ACCOUNTS = 3;

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

function active_admin_count($conn) {
    return (int)$conn->query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_archived = 0")->fetch_assoc()['c'];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $result = $conn->query("
        SELECT id, first_name, middle_name, last_name, suffix, contact_no, gender, email_address, role, is_archived
        FROM users
        ORDER BY role DESC, first_name, last_name
    ");
    $users = [];
    while ($row = $result->fetch_assoc()) {
        $users[] = [
            'id'           => (int)$row['id'],
            'first_name'   => $row['first_name'],
            'middle_name'  => $row['middle_name'],
            'last_name'    => $row['last_name'],
            'suffix'       => $row['suffix'],
            'contact_no'   => $row['contact_no'],
            'gender'       => $row['gender'],
            'email'        => $row['email_address'],
            'role'         => $row['role'],
            'is_archived'  => (int)($row['is_archived'] ?? 0),
            'is_self'      => (int)$row['id'] === $admin_id,
        ];
    }
    echo json_encode(["success" => true, "users" => $users, "max_admins" => MAX_ADMIN_ACCOUNTS]);
    $conn->close();
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$action  = $data['action']  ?? '';
$user_id = (int)($data['user_id'] ?? 0);

if (!$user_id || !$action) fail(422, "Missing action or user_id");

// An admin changes their own details, password and role from Account Settings,
// never here — otherwise the last admin could demote or lock out themselves.
if ($user_id === $admin_id) fail(409, "You cannot change your own account here. Use Account Settings instead.");

$stmt = $conn->prepare("SELECT id, email_address, role, is_archived FROM users WHERE id = ?");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$target = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$target) fail(404, "User not found.");
$target_label = "{$target['email_address']} (ID $user_id)";

switch ($action) {
    case 'update':
        // Plain values into a prepared statement. These used to go through
        // real_escape_string first as well, so "O'Brien" was stored as "O\'Brien".
        $fn = trim((string)($data['first_name'] ?? ''));
        $mn = trim((string)($data['middle_name'] ?? ''));
        $ln = trim((string)($data['last_name'] ?? ''));
        $sx = trim((string)($data['suffix'] ?? ''));
        $ph = trim((string)($data['contact_no'] ?? ''));
        $gd = trim((string)($data['gender'] ?? ''));
        $em = trim((string)($data['email'] ?? ''));

        if ($fn === '' || $ln === '' || $em === '') fail(422, "First name, last name, and email are required.");
        if (!filter_var($em, FILTER_VALIDATE_EMAIL)) fail(422, "Please enter a valid email address.");
        if ($ph !== '' && !preg_match('/^(\+63|0)?9\d{9}$/', preg_replace('/[\s\-]/', '', $ph))) {
            fail(422, "Invalid Philippine mobile number (e.g. 09123456789).");
        }

        $chk = $conn->prepare("SELECT 1 FROM users WHERE email_address = ? AND id != ?");
        $chk->bind_param("si", $em, $user_id);
        $chk->execute();
        $taken = (bool)$chk->get_result()->fetch_assoc();
        $chk->close();
        if ($taken) fail(409, "Email already in use by another user.");

        $stmt = $conn->prepare("UPDATE users SET first_name=?, middle_name=?, last_name=?, suffix=?, contact_no=?, gender=?, email_address=? WHERE id=?");
        $stmt->bind_param("sssssssi", $fn, $mn, $ln, $sx, $ph, $gd, $em, $user_id);
        $stmt->execute();
        $stmt->close();
        log_activity($conn, $admin_id, 'user', 'Edited User', "Edited $target_label" . ($em !== $target['email_address'] ? "; email changed to $em" : ""));
        echo json_encode(["success" => true, "message" => "User updated."]);
        break;

    case 'reset_password':
        $new_pass = (string)($data['new_password'] ?? '');
        if (strlen($new_pass) < PASSWORD_MIN_LENGTH) fail(422, "Password must be at least " . PASSWORD_MIN_LENGTH . " characters.");
        $hash = password_hash($new_pass, PASSWORD_BCRYPT);
        $stmt = $conn->prepare("UPDATE users SET password=? WHERE id=?");
        $stmt->bind_param("si", $hash, $user_id);
        $stmt->execute();
        $stmt->close();
        $ended = revoke_user_sessions($conn, $user_id);
        log_activity($conn, $admin_id, 'user', 'Reset User Password', "Reset password for $target_label; $ended session(s) signed out");
        echo json_encode(["success" => true, "message" => "Password reset. The user has been signed out everywhere."]);
        break;

    case 'set_role':
        $role = $data['role'] ?? '';
        if (!in_array($role, ['user', 'admin'], true)) fail(422, "Invalid role.");
        if ($role === $target['role']) fail(409, "This account already has the '$role' role.");

        if ($role === 'admin') {
            if ((int)$target['is_archived'] === 1) fail(409, "Restore this account before promoting it.");
            if (active_admin_count($conn) >= MAX_ADMIN_ACCOUNTS) fail(409, "Maximum limit of " . MAX_ADMIN_ACCOUNTS . " admin accounts reached.");
        } elseif (active_admin_count($conn) <= 1) {
            fail(409, "The last remaining admin cannot be demoted.");
        }

        $stmt = $conn->prepare("UPDATE users SET role=? WHERE id=?");
        $stmt->bind_param("si", $role, $user_id);
        $stmt->execute();
        $stmt->close();
        // Their current sessions carry the old privileges in the browser; end them.
        $ended = revoke_user_sessions($conn, $user_id);
        log_activity($conn, $admin_id, 'user', 'Changed User Role', "Changed $target_label from {$target['role']} to $role; $ended session(s) signed out");
        echo json_encode(["success" => true, "message" => "Role changed to $role."]);
        break;

    case 'delete':
        if ($target['role'] === 'admin') fail(409, "Admin accounts cannot be archived. Revoke admin access first.");
        if ((int)$target['is_archived'] === 1) fail(409, "This account is already archived.");
        $stmt = $conn->prepare("UPDATE users SET is_archived=1 WHERE id=?");
        $stmt->bind_param("i", $user_id);
        $stmt->execute();
        $stmt->close();
        $ended = revoke_user_sessions($conn, $user_id);
        log_activity($conn, $admin_id, 'user', 'Archived User', "Archived $target_label; $ended session(s) signed out");
        echo json_encode(["success" => true, "message" => "User archived."]);
        break;

    case 'unarchive':
        if ((int)$target['is_archived'] === 0) fail(409, "This account is not archived.");
        $stmt = $conn->prepare("UPDATE users SET is_archived=0 WHERE id=?");
        $stmt->bind_param("i", $user_id);
        $stmt->execute();
        $stmt->close();
        log_activity($conn, $admin_id, 'user', 'Restored User', "Restored archived account $target_label");
        echo json_encode(["success" => true, "message" => "User restored."]);
        break;

    default:
        fail(422, "Unknown action.");
}

$conn->close();
?>
