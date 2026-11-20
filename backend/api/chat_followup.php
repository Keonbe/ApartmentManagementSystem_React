<?php
// "Is it resolved?" in an account chat (SPRINT 226, backend/followups.php).
//   POST {action:'ask', topic:'inquiry'|'complaint', id}       admin: posts the question in the chat
//   POST {action:'answer', message_id, answer:'resolved'|'not_yet'}  the user it was sent to
//   POST {action:'resolve_report', complaint_id}               tenant: "My problem is fixed"
// A guest chat asks and answers through guest_chat.php instead.
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../followups.php';

$auth = require_user($conn);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed"]);
    exit;
}

$input = read_json_input();
$action = (string)($input['action'] ?? '');
$is_admin = $auth['role'] === 'admin';

try {
    if ($action === 'ask') {
        if (!$is_admin) {
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "Only the office can ask this."]);
            exit;
        }
        $topic = (string)($input['topic'] ?? '');
        if (!in_array($topic, ['inquiry', 'complaint'], true)) validation_fail(['topic' => 'Choose an inquiry or a problem report.']);
        $id = (int)($input['id'] ?? 0);
        if ($id <= 0) validation_fail(['id' => 'Choose an inquiry or a problem report.']);
        [$code, $body] = ask_resolution($conn, (int)$auth['id'], $topic, $id);
    } elseif ($action === 'answer') {
        if ($is_admin) {
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "Only the person asked can answer this."]);
            exit;
        }
        [$code, $body] = answer_resolution($conn, (int)$auth['id'], (int)($input['message_id'] ?? 0), (string)($input['answer'] ?? ''));
    } elseif ($action === 'resolve_report') {
        if ($is_admin) {
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "The office resolves a report from Messages."]);
            exit;
        }
        $cid = (int)($input['complaint_id'] ?? 0);
        $own = $conn->prepare("SELECT id FROM complaints WHERE id = ? AND user_id = ?");
        $uid = (int)$auth['id'];
        $own->bind_param('ii', $cid, $uid);
        $own->execute();
        $mine = (bool)$own->get_result()->fetch_assoc();
        $own->close();
        if (!$mine) {
            [$code, $body] = [404, ['success' => false, 'message' => 'Report not found.']];
        } elseif (!resolve_complaint($conn, $cid, null)) {
            [$code, $body] = [409, ['success' => false, 'message' => 'This report is already resolved.']];
        } else {
            [$code, $body] = [200, ['success' => true]];
        }
    } else {
        validation_fail(['action' => 'Unknown action.']);
    }
    http_response_code($code);
    echo json_encode($body);
} catch (Throwable $e) {
    server_error_response($e, 'Could not save that. Please try again.');
}
