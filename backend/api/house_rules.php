<?php
header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../cors.php';
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../config.php';
$method = $_SERVER['REQUEST_METHOD'];
$isAdmin = verify_admin($conn);

try {
    if ($method === 'GET') {
        $sql = 'SELECT id, category, title, description, is_highlight, is_active, sort_order FROM house_rules WHERE is_active = 1 ORDER BY sort_order ASC, id ASC';
        $result = $conn->query($sql);
        $rules = [];
        while ($row = $result->fetch_assoc()) {
            $row['id'] = (int)$row['id'];
            $row['is_highlight'] = (int)$row['is_highlight'];
            $row['is_active'] = (int)$row['is_active'];
            $row['sort_order'] = (int)$row['sort_order'];
            $rules[] = $row;
        }
        echo json_encode(['success' => true, 'rules' => $rules]);
        exit();
    }

    if (!$isAdmin) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Administrator access required.']);
        exit();
    }

    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    if ($method === 'PUT' && ($input['action'] ?? '') === 'reorder') {
        $orderedRules = $input['rules'] ?? null;
        if (!is_array($orderedRules) || count($orderedRules) > 1000) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'A valid ordered rules list is required.']);
            exit();
        }

        $normalized = [];
        $seenIds = [];
        foreach ($orderedRules as $position => $rule) {
            $id = (int)($rule['id'] ?? 0);
            if ($id < 1 || isset($seenIds[$id])) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => 'Rule IDs must be valid and unique.']);
                exit();
            }
            $seenIds[$id] = true;
            $normalized[] = ['id' => $id, 'sort_order' => $position];
        }

        $conn->begin_transaction();
        try {
            $stmt = $conn->prepare('UPDATE house_rules SET sort_order = ? WHERE id = ?');
            foreach ($normalized as $rule) {
                $sortOrder = $rule['sort_order'];
                $id = $rule['id'];
                $stmt->bind_param('ii', $sortOrder, $id);
                $stmt->execute();
                if ($stmt->affected_rows === 0) {
                    $check = $conn->prepare('SELECT id FROM house_rules WHERE id = ?');
                    $check->bind_param('i', $id);
                    $check->execute();
                    $exists = (bool)$check->get_result()->fetch_assoc();
                    $check->close();
                    if (!$exists) throw new RuntimeException('A rule in the requested order no longer exists.');
                }
            }
            $stmt->close();
            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            throw $e;
        }

        echo json_encode(['success' => true]);
        exit();
    }

    if ($method === 'POST' || $method === 'PUT') {
        $id = (int)($input['id'] ?? 0);
        $category = trim((string)($input['category'] ?? 'General'));
        $title = trim((string)($input['title'] ?? ''));
        $description = trim((string)($input['description'] ?? ''));
        $highlight = !empty($input['is_highlight']) ? 1 : 0;
        $active = array_key_exists('is_active', $input) ? (!empty($input['is_active']) ? 1 : 0) : 1;
        $sortOrder = (int)($input['sort_order'] ?? 0);
        if ($category === '') $category = 'General';
        if (mb_strlen($category) > 100 || $title === '' || mb_strlen($title) > 255 || $description === '') {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Title and description are required; title must fit its length limit.']);
            exit();
        }
        if ($method === 'POST') {
            $stmt = $conn->prepare('INSERT INTO house_rules (category, title, description, is_highlight, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
            $stmt->bind_param('sssiii', $category, $title, $description, $highlight, $active, $sortOrder);
        } else {
            if ($id < 1) { http_response_code(422); echo json_encode(['success' => false, 'message' => 'A valid rule ID is required.']); exit(); }
            $stmt = $conn->prepare('UPDATE house_rules SET category = ?, title = ?, description = ?, is_highlight = ?, is_active = ?, sort_order = ? WHERE id = ?');
            $stmt->bind_param('sssiiii', $category, $title, $description, $highlight, $active, $sortOrder, $id);
        }
        $stmt->execute();
        if ($method === 'PUT' && $stmt->affected_rows === 0) {
            $check = $conn->prepare('SELECT id FROM house_rules WHERE id = ?');
            $check->bind_param('i', $id); $check->execute();
            $exists = (bool)$check->get_result()->fetch_assoc(); $check->close();
            if (!$exists) { http_response_code(404); echo json_encode(['success' => false, 'message' => 'Rule not found.']); exit(); }
        }
        $newId = $method === 'POST' ? $conn->insert_id : $id;
        $stmt->close();
        echo json_encode(['success' => true, 'id' => $newId]);
        exit();
    }

    if ($method === 'DELETE') {
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if ($id < 1) { http_response_code(422); echo json_encode(['success' => false, 'message' => 'A valid rule ID is required.']); exit(); }
        $stmt = $conn->prepare('UPDATE house_rules SET is_active = 0 WHERE id = ?');
        $stmt->bind_param('i', $id); $stmt->execute();
        if ($stmt->affected_rows === 0) {
            $check = $conn->prepare('SELECT id FROM house_rules WHERE id = ?');
            $check->bind_param('i', $id); $check->execute();
            $exists = (bool)$check->get_result()->fetch_assoc(); $check->close();
            if (!$exists) { http_response_code(404); echo json_encode(['success' => false, 'message' => 'Rule not found.']); exit(); }
        }
        $stmt->close();
        echo json_encode(['success' => true]);
        exit();
    }

    header('Allow: GET, POST, PUT, DELETE, OPTIONS');
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
} catch (Throwable $e) {
    error_log('[AMS] house_rules.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to process house rules. Apply the house rules migration if this is a new installation.']);
}