<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header('Access-Control-Allow-Methods: POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
require_once __DIR__ . '/../config.php';
$input = read_json_input();
$token = trim((string)($input['token'] ?? $_GET['token'] ?? ''));
if (!preg_match('/^[a-f0-9]{64}$/i', $token)) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Invalid or expired verification link.']); exit; }
$stmt = $conn->prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()), verification_token = NULL WHERE verification_token = ?');
$stmt->bind_param('s', $token); $stmt->execute(); $ok = $stmt->affected_rows === 1; $stmt->close();
echo json_encode(['success'=>$ok,'message'=>$ok ? 'Email verified. You can now sign in.' : 'Invalid or expired verification link.']);
$conn->close();