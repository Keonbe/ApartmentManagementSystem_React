<?php
// CORS origin policy for every API endpoint. Endpoints include this before
// their OPTIONS early-exit, so it must not touch the database. config.php also
// includes it (require_once makes the second include a no-op).
//
// Credentialed requests are allowed only from these exact frontend origins.
// API requests can also carry the HttpOnly trusted-device cookie. Credentialed
// CORS requires an explicit allowed origin; never combine it with wildcard ACAO.

// The origins allowed to call the API with credentials (SPRINT 175, panel S-10).
// ALLOWED_ORIGINS (config.env.php constant or environment variable, comma
// separated) is used exactly as given; "*" is ignored and a trailing slash is
// dropped. When it is unset, the built-in list applies: the deployed hosts always,
// and the local dev origins only outside production, so a production host never
// answers a page served from localhost. Declared before the CLI return so
// cron/check_environment.php can show the same list.
function ams_cors_origins() {
    $configured = defined('ALLOWED_ORIGINS') ? (string) ALLOWED_ORIGINS : (string) getenv('ALLOWED_ORIGINS');
    $list = array_values(array_filter(array_map(
        fn($o) => rtrim(trim($o), '/'),
        explode(',', $configured)
    ), fn($o) => $o !== '' && $o !== '*'));
    if ($list) return $list;

    $list = ['https://angcanan-ams.com', 'https://www.angcanan-ams.com', 'http://168.107.72.9'];
    $env = defined('APP_ENV') ? APP_ENV : ((string) getenv('APP_ENV') ?: 'production');
    if ($env !== 'production') {
        array_push($list, 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:8080');
    }
    return $list;
}

if (PHP_SAPI === 'cli') return;

// Endpoints include this file before config.php, so read config.env.php here too
// (the same file, once). The test suite skips it, as config.php does.
if (getenv('AMS_TEST_MODE') !== '1' && file_exists(__DIR__ . '/config.env.php')) {
    require_once __DIR__ . '/config.env.php';
}

// Security headers on every API response (SPRINT 169, security_audit C-1/C-4/E-2).
// No X-Frame-Options here on purpose: the app previews files from download_file.php
// inside an <iframe>. The SPA itself is protected in ams-react/public/.htaccess.
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
// HSTS tells browsers to use HTTPS for this host for a year. It is sent only over
// HTTPS (browsers ignore it on HTTP) and never for a local host, so a dev machine
// with a self-made certificate is not pinned to HTTPS. config.php is not loaded yet.
$ams_https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
$ams_host = strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? ''));
if ($ams_https && $ams_host !== '' && !in_array($ams_host, ['localhost', '127.0.0.1', '::1'], true) && !str_ends_with($ams_host, '.local')) {
    header('Strict-Transport-Security: max-age=31536000');
}

// Keep preflight headers centralized so authenticated API requests are allowed.
header_remove('Access-Control-Allow-Headers');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Guest-Token, X-User-Id, X-Admin-Id');

// Let the browser reuse a preflight answer. Without this every cross-origin API
// call (the Authorization header forces one) costs an extra OPTIONS round-trip.
$ams_cors_list = ams_cors_origins();
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
