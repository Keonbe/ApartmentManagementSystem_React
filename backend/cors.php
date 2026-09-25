<?php
// CORS origin policy for every API endpoint. Endpoints include this before
// their OPTIONS early-exit, so it must not touch the database. config.php also
// includes it (require_once makes the second include a no-op).
//
// ALLOWED_ORIGINS: comma-separated exact origins, e.g.
//   https://ams.example.com,http://localhost:5173
// - Set: only a listed Origin is echoed back (any environment).
// - Unset in development: local dev origins are echoed, anything else gets "*".
// - Unset in production: no cross-origin access at all.
// Auth is a bearer token, not a cookie, so no Allow-Credentials is needed.

if (PHP_SAPI === 'cli') return;

// Keep preflight headers centralized so authenticated API requests are allowed.
header_remove('Access-Control-Allow-Headers');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id');

if (file_exists(__DIR__ . '/config.env.php')) {
    require_once __DIR__ . '/config.env.php';
}

$ams_cors_env = function ($key) {
    if (defined($key)) return (string) constant($key);
    foreach ([getenv($key), $_ENV[$key] ?? false, $_SERVER[$key] ?? false] as $value) {
        if ($value !== false && $value !== '') return (string) $value;
    }
    return '';
};

$ams_cors_production = ($ams_cors_env('APP_ENV') ?: 'development') === 'production';
$ams_cors_list = array_values(array_filter(array_map(
    fn($o) => rtrim(trim($o), '/'),
    explode(',', $ams_cors_env('ALLOWED_ORIGINS'))
)));
// A wildcard entry is never honoured: origins must be listed exactly.
if (in_array('*', $ams_cors_list, true)) {
    error_log('[AMS] ALLOWED_ORIGINS contains "*"; ignoring it. List exact origins instead.');
    $ams_cors_list = array_values(array_diff($ams_cors_list, ['*']));
}
$ams_cors_origin = $_SERVER['HTTP_ORIGIN'] ?? '';

header_remove('Access-Control-Allow-Origin');
header('Vary: Origin', false);

if ($ams_cors_list) {
    if ($ams_cors_origin !== '' && in_array($ams_cors_origin, $ams_cors_list, true)) {
        header('Access-Control-Allow-Origin: ' . $ams_cors_origin);
    }
} elseif (!$ams_cors_production) {
    $ams_cors_local = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:8080', 'http://127.0.0.1:8080'];
    header('Access-Control-Allow-Origin: ' . (in_array($ams_cors_origin, $ams_cors_local, true) ? $ams_cors_origin : '*'));
}

unset($ams_cors_env, $ams_cors_production, $ams_cors_list, $ams_cors_origin, $ams_cors_local);
