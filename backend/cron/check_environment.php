<?php
// Deployment environment check (local / saas / selfhosted). Command line only.
//
//   php backend/cron/check_environment.php           report, exit 1 on any error
//   php backend/cron/check_environment.php --claim   also stamp DEPLOYMENT_ID into
//                                                    this database and uploads folder
//
// XAMPP:   C:\xampp\php\php.exe backend\cron\check_environment.php
// Docker:  php /var/www/html/cron/check_environment.php   (also run at container start)
//
// The identity stamp is how a deployment notices it is wired to someone else's
// data: the database (system_settings.deployment_id) and the uploads folder
// (uploads/.ams-deployment) each remember the DEPLOYMENT_ID that claimed them,
// and any other DEPLOYMENT_ID pointed at them is reported as an error.
// See docs/deployment/dual-deployment-environment-plan.md §13.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "Forbidden";
    exit;
}

const AMS_TARGETS = ['local', 'saas', 'selfhosted'];
const AMS_MARKER = '.ams-deployment';

$claim = in_array('--claim', $argv, true);
$errors = [];
$warnings = [];
$db_done = false;

$report = function ($is_error, $message) use (&$errors, &$warnings) {
    if ($is_error) $errors[] = $message; else $warnings[] = $message;
};
$is_local_url = fn($url) => (bool) preg_match('#^(https?://)?(localhost|127\.0\.0\.1|0\.0\.0\.0)([:/]|$)#i', trim($url));

$finish = function () use (&$errors, &$warnings, &$db_done) {
    if (!$db_done) $errors[] = 'Could not finish the database checks (connection failed — see the message above).';
    foreach ($warnings as $w) echo "WARN  $w\n";
    foreach ($errors as $e) echo "ERROR $e\n";
    echo $errors ? "\nFAILED: " . count($errors) . " error(s), " . count($warnings) . " warning(s)\n"
                 : "\nOK: 0 errors, " . count($warnings) . " warning(s)\n";
    exit($errors ? 1 : 0);
};
register_shutdown_function($finish);

// config.php connects to the database on load; everything it defines is
// available after this line. A failed connection ends the script here and the
// shutdown handler reports it.
require_once __DIR__ . '/../config.php';

$env = APP_ENV;
$target = DEPLOYMENT_TARGET;
$prod = $env === 'production';
$origins = array_values(array_filter(array_map(
    fn($o) => rtrim(trim($o), '/'),
    explode(',', defined('ALLOWED_ORIGINS') ? (string) ALLOWED_ORIGINS : (string) ams_env('ALLOWED_ORIGINS', ''))
)));

echo "AMS environment check\n";
echo "  target=$target env=$env id=" . (DEPLOYMENT_ID ?: '(unset)') . "\n";
echo "  db=" . DB_USER . '@' . DB_HOST . ':' . DB_PORT . '/' . DB_NAME . "\n";
echo "  app_url=" . (APP_URL ?: '(unset)') . "\n";
echo "  allowed_origins=" . ($origins ? implode(',', $origins) : '(unset)') . "\n";
echo "  uploads=" . UPLOADS_DIR . "\n";
echo "  timezone=" . date_default_timezone_get() . " (" . date('P') . ")\n";
echo "  config.env.php=" . (file_exists(__DIR__ . '/../config.env.php') ? 'present' : 'absent') . "\n\n";

// --- Static settings -------------------------------------------------------
if (!in_array($env, ['development', 'production'], true)) {
    $errors[] = "APP_ENV must be 'development' or 'production', got '$env'.";
}
if (!in_array($target, AMS_TARGETS, true)) {
    $errors[] = "DEPLOYMENT_TARGET must be one of " . implode(', ', AMS_TARGETS) . ", got '$target'.";
}
if ($prod && $target === 'local') {
    $errors[] = 'APP_ENV=production with DEPLOYMENT_TARGET=local — set DEPLOYMENT_TARGET to saas or selfhosted.';
}
if (!$prod && $target !== 'local') {
    $warnings[] = "DEPLOYMENT_TARGET=$target is running with APP_ENV=development (error details are shown to clients).";
}
if ($prod && DEPLOYMENT_ID === '') {
    $errors[] = 'DEPLOYMENT_ID is not set. Give every deployment its own name (e.g. saas-prod, acme-selfhosted).';
}
if (in_array('*', $origins, true)) {
    $errors[] = 'ALLOWED_ORIGINS contains "*". List exact frontend origins (cors.php ignores the wildcard).';
}

if ($prod) {
    if (APP_URL === '') {
        $errors[] = 'APP_URL is not set; payment return links cannot be validated.';
    } elseif ($is_local_url(APP_URL)) {
        $report($target === 'saas', 'APP_URL points at localhost in production.');
    } elseif ($target === 'saas' && !str_starts_with(APP_URL, 'https://')) {
        $errors[] = 'SaaS APP_URL must be https://.';
    }
    if (!$origins) {
        $warnings[] = 'ALLOWED_ORIGINS is unset: only a frontend on the same origin as the API can call it.';
    }
    foreach ($origins as $o) {
        if ($is_local_url($o)) {
            $report($target === 'saas', "ALLOWED_ORIGINS includes a local origin ($o) in production.");
        }
    }
    if (DB_PASS === '') $errors[] = 'DB_PASS is empty in production.';
    if (DB_USER === 'root') $warnings[] = 'DB_USER is root in production; use a dedicated account.';
    if ($target === 'saas' && file_exists(__DIR__ . '/../config.env.php')) {
        $warnings[] = 'config.env.php exists on a SaaS host; its constants override the environment variables.';
    }
}
if ($target === 'selfhosted' && preg_match('/railway\.(app|internal)|rlwy\.net/i', DB_HOST . ' ' . APP_URL)) {
    $errors[] = 'Self-hosted deployment points at a Railway host (DB_HOST or APP_URL) — that is the SaaS infrastructure.';
}

// --- Upload limits ---------------------------------------------------------
// php.ini decides these; ini_set() cannot. The largest upload any endpoint
// accepts is a 25 MB chat video (send_message.php), and most are 10 MB. This
// reads the CLI's php.ini, which on some hosts differs from the web server's.
$ini_bytes = function ($name) {
    $raw = trim((string) ini_get($name));
    $n = (float) $raw;
    switch (strtoupper(substr($raw, -1))) {
        case 'G': $n *= 1024;
        case 'M': $n *= 1024;
        case 'K': $n *= 1024;
    }
    return $n;
};
foreach (['upload_max_filesize' => 25, 'post_max_size' => 26] as $name => $need_mb) {
    $have = $ini_bytes($name);
    if ($have > 0 && $have < $need_mb * 1048576) {
        $report($have < 10 * 1048576, "$name is " . ini_get($name) . "; uploads up to 25 MB need at least {$need_mb}M in php.ini.");
    }
}

// --- Clock -----------------------------------------------------------------
// config.php pins PHP and the DB session to APP_TIMEZONE; quiet hours read the
// DB clock and due/overdue reads PHP's, so a drift between them is an error.
$db_now = $conn->query("SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i') AS t");
$db_now = $db_now ? $db_now->fetch_assoc()['t'] : null;
if ($db_now === null) {
    $errors[] = 'Could not read the database clock: ' . $conn->error;
} elseif (abs(strtotime($db_now) - strtotime(date('Y-m-d H:i'))) > 120) {
    $errors[] = "PHP clock (" . date('Y-m-d H:i') . ") and database clock ($db_now) disagree; check APP_TIMEZONE.";
}

// --- Payment settings ------------------------------------------------------
$settings = [];
$res = $conn->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('paymongo_secret_key','paymongo_webhook_secret','deployment_id')");
if (!$res) {
    $errors[] = 'system_settings is not readable: ' . $conn->error;
} else {
    while ($row = $res->fetch_assoc()) $settings[$row['setting_key']] = $row['setting_value'];
}
foreach (['paymongo_secret_key', 'paymongo_webhook_secret'] as $key) {
    $from_env = ams_env_setting($key);
    $value = $from_env ?? ($settings[$key] ?? '');
    $source = $from_env !== null ? 'environment' : 'database';
    if ($value === '') {
        $warnings[] = "$key is not configured (online payments disabled).";
    } elseif ($prod && $key === 'paymongo_secret_key' && str_starts_with($value, 'sk_test_')) {
        $warnings[] = "PayMongo is in test mode in production ($source).";
    } elseif (!$prod && str_starts_with($value, 'sk_live_')) {
        $errors[] = "A live PayMongo key is configured on a development deployment ($source).";
    }
}

// --- Database identity -----------------------------------------------------
$db_id = $settings['deployment_id'] ?? '';
if (DEPLOYMENT_ID !== '') {
    if ($db_id === '') {
        if ($claim) {
            $stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES ('deployment_id', ?)");
            $id = DEPLOYMENT_ID;
            $stmt->bind_param('s', $id);
            if ($stmt->execute()) echo "Claimed database " . DB_NAME . " for " . DEPLOYMENT_ID . "\n";
            else $errors[] = 'Could not claim the database: ' . $stmt->error;
        } else {
            $report($prod, 'The database is not claimed by any deployment yet; run with --claim.');
        }
    } elseif ($db_id !== DEPLOYMENT_ID) {
        $errors[] = "Database " . DB_NAME . " belongs to deployment '$db_id', not '" . DEPLOYMENT_ID . "'. Wrong DB credentials?";
    }
} elseif ($db_id !== '') {
    $warnings[] = "The database is claimed by '$db_id' but this deployment has no DEPLOYMENT_ID.";
}

// --- Uploads ---------------------------------------------------------------
$marker = UPLOADS_DIR . '/' . AMS_MARKER;
if (!is_dir(UPLOADS_DIR)) {
    $errors[] = 'Uploads folder is missing: ' . UPLOADS_DIR;
} else {
    if (!is_writable(UPLOADS_DIR)) {
        $errors[] = 'Uploads folder is not writable by this user: ' . UPLOADS_DIR;
    }
    $uploads_id = is_file($marker) ? trim((string) file_get_contents($marker)) : '';
    if (DEPLOYMENT_ID !== '') {
        if ($uploads_id === '') {
            if ($claim) {
                if (file_put_contents($marker, DEPLOYMENT_ID . "\n") !== false) echo "Claimed uploads folder for " . DEPLOYMENT_ID . "\n";
                else $errors[] = 'Could not write ' . $marker;
            } else {
                $report($prod, 'The uploads folder is not claimed yet; run with --claim.');
            }
        } elseif ($uploads_id !== DEPLOYMENT_ID) {
            $errors[] = "Uploads folder belongs to deployment '$uploads_id', not '" . DEPLOYMENT_ID . "'. Shared volume?";
        }
    }
    if ($db_id !== '' && $uploads_id !== '' && $db_id !== $uploads_id) {
        $errors[] = "Database ('$db_id') and uploads ('$uploads_id') were claimed by different deployments.";
    }
}

$db_done = true;
