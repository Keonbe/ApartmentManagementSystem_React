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
    // Scopes: 'house' (general rules, the default), 'parking' (shown before a parking
    // reservation) and 'minors' (children and pets, shown on inquiry, application and contract).
    $scopes = ['house', 'parking', 'minors'];
    if ($method === 'GET') {
        $scope = $_GET['scope'] ?? 'house';
        // 'all' returns every scope in one call: house, then children and pets, then parking.
        if ($scope !== 'all' && !in_array($scope, $scopes, true)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Unknown rule scope.']);
            exit();
        }
        $cols = 'id, category, title, title_fil, description, description_fil, is_highlight, is_active, sort_order, scope';
        if ($scope === 'all') {
            $stmt = $conn->prepare("SELECT $cols FROM house_rules WHERE is_active = 1 ORDER BY FIELD(scope, 'house', 'minors', 'parking'), sort_order ASC, id ASC");
        } else {
            $stmt = $conn->prepare("SELECT $cols FROM house_rules WHERE is_active = 1 AND scope = ? ORDER BY sort_order ASC, id ASC");
            $stmt->bind_param('s', $scope);
        }
        $stmt->execute();
        $result = $stmt->get_result();
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
        $titleFil = trim((string)($input['title_fil'] ?? ''));
        $description = trim((string)($input['description'] ?? ''));
        $descriptionFil = trim((string)($input['description_fil'] ?? ''));
        $titleFil = $titleFil === '' ? null : $titleFil;
        $descriptionFil = $descriptionFil === '' ? null : $descriptionFil;
        $highlight = !empty($input['is_highlight']) ? 1 : 0;
        $active = array_key_exists('is_active', $input) ? (!empty($input['is_active']) ? 1 : 0) : 1;
        $sortOrder = (int)($input['sort_order'] ?? 0);
        $scope = $input['scope'] ?? 'house';
        if (!in_array($scope, $scopes, true)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Unknown rule scope.']);
            exit();
        }
        if ($category === '') $category = 'General';
        if (mb_strlen($category) > 100 || $title === '' || mb_strlen($title) > 255 || ($titleFil !== null && mb_strlen($titleFil) > 255) || $description === '') {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Title and description are required; title must fit its length limit.']);
            exit();
        }
        if ($method === 'POST') {
            $stmt = $conn->prepare('INSERT INTO house_rules (category, title, title_fil, description, description_fil, is_highlight, is_active, sort_order, scope) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->bind_param('sssssiiis', $category, $title, $titleFil, $description, $descriptionFil, $highlight, $active, $sortOrder, $scope);
        } else {
            if ($id < 1) { http_response_code(422); echo json_encode(['success' => false, 'message' => 'A valid rule ID is required.']); exit(); }
            $stmt = $conn->prepare('UPDATE house_rules SET category = ?, title = ?, title_fil = ?, description = ?, description_fil = ?, is_highlight = ?, is_active = ?, sort_order = ? WHERE id = ?');
            $stmt->bind_param('sssssiiii', $category, $title, $titleFil, $description, $descriptionFil, $highlight, $active, $sortOrder, $id);
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