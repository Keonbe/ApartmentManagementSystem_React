<?php
/** Return only a frontend origin that belongs to this application. */
function validated_frontend_origin($candidate) {
    if (!is_string($candidate) || $candidate === '' || trim($candidate) !== $candidate) return null;
    $parts = parse_url($candidate);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) return null;
    if (isset($parts['user']) || isset($parts['pass']) || isset($parts['path']) || isset($parts['query']) || isset($parts['fragment'])) return null;

    $scheme = strtolower($parts['scheme']);
    $host = strtolower(rtrim($parts['host'], '.'));
    $isLocal = in_array($host, ['localhost', '127.0.0.1'], true);
    $isProduction = in_array($host, ['angcanan-ams.com', 'www.angcanan-ams.com'], true);
    if (!$isLocal && !$isProduction) return null;
    if ($isLocal && !in_array($scheme, ['http', 'https'], true)) return null;
    if ($isProduction && $scheme !== 'https') return null;

    $port = isset($parts['port']) ? ':' . (int)$parts['port'] : '';
    return $scheme . '://' . $host . $port;
}

function password_reset_frontend_origin($frontendUrl, $server) {
    $origin = validated_frontend_origin($frontendUrl);
    if ($origin !== null) return $origin;

    $origin = validated_frontend_origin($server['HTTP_ORIGIN'] ?? null);
    if ($origin !== null) return $origin;

    $httpHost = strtolower((string)($server['HTTP_HOST'] ?? ''));
    if (strpos($httpHost, 'localhost') !== false || strpos($httpHost, '127.0.0.1') !== false) {
        return 'http://localhost:5173';
    }
    return 'https://www.angcanan-ams.com';
}