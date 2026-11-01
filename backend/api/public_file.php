<?php
// Serves the deliberately public images: unit photos (room_images/), payment
// QR codes (qr_codes/) and the Glass theme photos (site_assets/). They used to
// be linked as static files next to the API, but a server that exposes only
// the api/ folder (the deployed one maps /api/ to backend/api/) returned the
// app's index.html for those URLs instead. Every deployment serves api/, so
// the images go through here. No session: guests see room photos and the Home
// backdrop. Private uploads stay behind download_file.php.
//
// Deliberately does not load config.php: no database connection per image.

const PUBLIC_FILE_DIRS = ['room_images', 'qr_codes', 'site_assets'];
const PUBLIC_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function public_file_fail($status) {
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo $status === 404 ? 'Not found' : 'Bad request';
    exit;
}

if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) public_file_fail(400);

// Stored paths look like "room_images/<file>"; older ones may carry "../".
$path = preg_replace('#^(\.\./)+#', '', (string)($_GET['path'] ?? ''));
if (!preg_match('#^([a-z_]+)/([A-Za-z0-9][A-Za-z0-9_.-]{0,200}\.(?:jpe?g|png|gif|webp))$#i', $path, $m)
    || !in_array($m[1], PUBLIC_FILE_DIRS, true)) {
    public_file_fail(400);
}

$base = realpath(__DIR__ . '/../' . $m[1]);
$file = realpath(__DIR__ . '/../' . $path);
if ($base === false || $file === false || strpos($file, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($file)) {
    public_file_fail(404);
}

// The content decides the type; anything that is not an image is not served.
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file);
finfo_close($finfo);
if (!in_array($mime, PUBLIC_FILE_TYPES, true)) public_file_fail(404);

// Every upload gets a new generated name, so a URL's content never changes.
$mtime = filemtime($file);
$etag = '"' . md5($path . '|' . $mtime . '|' . filesize($file)) . '"';
header('Cache-Control: public, max-age=2592000, immutable');
header('ETag: ' . $etag);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');
header('X-Content-Type-Options: nosniff');
// Shown on other origins (the SPA may run on its own host), never framed or run.
header('Cross-Origin-Resource-Policy: cross-origin');
header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");

if (trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
    http_response_code(304);
    exit;
}

header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($file));
header('Content-Disposition: inline; filename="' . basename($file) . '"');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') exit;
readfile($file);
