<?php
// CORS origin policy for every API endpoint. Endpoints include this before
// their OPTIONS early-exit, so it must not touch the database. config.php also
// includes it (require_once makes the second include a no-op).
//
// Credentialed requests are allowed only from these exact frontend origins.
// API requests can also carry the HttpOnly trusted-device cookie. Credentialed
// CORS requires an explicit allowed origin; never combine it with wildcard ACAO.

if (PHP_SAPI === 'cli') return;

// Keep preflight headers centralized so authenticated API requests are allowed.
header_remove('Access-Control-Allow-Headers');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Guest-Token, X-User-Id, X-Admin-Id');

// Let the browser reuse a preflight answer. Without this every cross-origin API
// call (the Authorization header forces one) costs an extra OPTIONS round-trip.
$ams_cors_list = [
    'https://angcanan-ams.com',
    'https://www.angcanan-ams.com',
    'http://localhost:5174',
    'http://localhost:5173',
    'http://168.107.72.9',
];
$ams_cors_origin = $_SERVER['HTTP_ORIGIN'] ?? '';

header_remove('Access-Control-Allow-Origin');
header('Vary: Origin', false);

if ($ams_cors_origin !== '' && in_array($ams_cors_origin, $ams_cors_list, true)) {
    header('Access-Control-Allow-Origin: ' . $ams_cors_origin);
    header('Access-Control-Allow-Credentials: true');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

unset($ams_cors_list, $ams_cors_origin);
