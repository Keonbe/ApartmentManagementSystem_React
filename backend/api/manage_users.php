<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden"]);
    exit;
}

// GET: list all users (non-admin)
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
            'is_archived'  => (int)($row['is_archived'] ?? 0)
        ];
    }
    echo json_encode(["success" => true, "users" => $users]);
    $conn->close();
    exit;
}

// POST: actions
$data = json_decode(file_get_contents('php://input'), true) ?? [];
$action  = $data['action']  ?? '';
$user_id = (int)($data['user_id'] ?? 0);

if (!$user_id || !$action) {
    echo json_encode(["success" => false, "message" => "Missing action or user_id"]);
    exit;
}

// Prevent acting on self
if ($user_id === (int)$admin_id) {
    echo json_encode(["success" => false, "message" => "Cannot modify your own account here."]);
    exit;
}

switch ($action) {
    case 'update':
        $fn = $conn->real_escape_string($data['first_name'] ?? '');
        $mn = $conn->real_escape_string($data['middle_name'] ?? '');
        $ln = $conn->real_escape_string($data['last_name'] ?? '');
        $sx = $conn->real_escape_string($data['suffix'] ?? '');
        $ph = $conn->real_escape_string($data['contact_no'] ?? '');
        $gd = $conn->real_escape_string($data['gender'] ?? '');
        $em = $conn->real_escape_string($data['email'] ?? '');

        if (!$fn || !$ln || !$em) {
            echo json_encode(["success" => false, "message" => "First name, last name, and email are required."]);
            break;
        }

        // Check email uniqueness
        $chk = $conn->prepare("SELECT id FROM users WHERE email_address = ? AND id != ?");
        $chk->bind_param("si", $em, $user_id);
        $chk->execute();
        if ($chk->get_result()->num_rows > 0) {
            echo json_encode(["success" => false, "message" => "Email already in use by another user."]);
            $chk->close();
            break;
        }
        $chk->close();

        $stmt = $conn->prepare("UPDATE users SET first_name=?, middle_name=?, last_name=?, suffix=?, contact_no=?, gender=?, email_address=? WHERE id=?");
        $stmt->bind_param("sssssssi", $fn, $mn, $ln, $sx, $ph, $gd, $em, $user_id);
        $stmt->execute();
        $stmt->close();
        log_activity($conn, $admin_id, 'User Management', 'Edit User', "Edited user ID $user_id ($em)");
        echo json_encode(["success" => true]);
        break;

    case 'reset_password':
        $new_pass = $data['new_password'] ?? '';
        if (strlen($new_pass) < 6) {
            echo json_encode(["success" => false, "message" => "Password must be at least 6 characters."]);
            break;
        }
        $hash = password_hash($new_pass, PASSWORD_BCRYPT);
        $stmt = $conn->prepare("UPDATE users SET password=? WHERE id=?");
        $stmt->bind_param("si", $hash, $user_id);
        $stmt->execute();
        $stmt->close();
        log_activity($conn, $admin_id, 'User Management', 'Reset Password', "Reset password for user ID $user_id");
        echo json_encode(["success" => true]);
        break;

    case 'set_role':
        $role = $data['role'] ?? '';
        if (!in_array($role, ['user', 'admin'])) {
            echo json_encode(["success" => false, "message" => "Invalid role."]);
            break;
        }
        if ($role === 'admin') {
            $count_res = $conn->query("SELECT COUNT(*) as admin_count FROM users WHERE role = 'admin'");
            $count_row = $count_res->fetch_assoc();
            if ($count_row['admin_count'] >= 3) {
                echo json_encode(["success" => false, "message" => "Maximum limit of 3 admin accounts reached."]);
                break;
            }
        }
        $stmt = $conn->prepare("UPDATE users SET role=? WHERE id=?");
        $stmt->bind_param("si", $role, $user_id);
        $stmt->execute();
        $stmt->close();
        log_activity($conn, $admin_id, 'User Management', 'Set Role', "Changed user ID $user_id role to $role");
        echo json_encode(["success" => true]);
        break;

    case 'delete':
        $stmt = $conn->prepare("UPDATE users SET is_archived=1 WHERE id=? AND role != 'admin'");
        $stmt->bind_param("i", $user_id);
        $stmt->execute();
        if ($stmt->affected_rows === 0) {
            echo json_encode(["success" => false, "message" => "Cannot archive admin accounts."]);
        } else {
            log_activity($conn, $admin_id, 'User Management', 'Archive User', "Archived user ID $user_id");
            echo json_encode(["success" => true]);
        }
        $stmt->close();
        break;

    case 'unarchive':
        $stmt = $conn->prepare("UPDATE users SET is_archived=0 WHERE id=? AND role != 'admin'");
        $stmt->bind_param("i", $user_id);
        $stmt->execute();
        log_activity($conn, $admin_id, 'User Management', 'Restore User', "Restored archived user ID $user_id");
        echo json_encode(["success" => true]);
        $stmt->close();
        break;

    default:
        echo json_encode(["success" => false, "message" => "Unknown action."]);
}

$conn->close();
?>
