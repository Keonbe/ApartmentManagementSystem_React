<?php
// AMS backend configuration template for the local XAMPP target, or for a
// self-hosted Apache/XAMPP server. Copy to `config.env.php` (gitignored).
//
// Resolution order (config.php): a constant defined here wins, then the
// process environment (DB_HOST, ... — how Railway/Docker is configured), then
// the local default. On the SaaS host there is no config.env.php at all; use
// deploy/env/saas.env.example as the list of service variables instead.
// PHP reads this at runtime on every request, so edits apply without a rebuild.
// Check the result with: php backend/cron/check_environment.php

define('DB_HOST', 'localhost');
define('DB_PORT', 3306);
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'ams_db');
define('APP_ENV', 'development'); // 'development' | 'production'

// Which deployment this is: 'local' | 'saas' | 'selfhosted', and a name that
// no other deployment uses (stamped into the DB/uploads by `--claim`).
define('DEPLOYMENT_TARGET', 'local');
// define('DEPLOYMENT_ID', 'local-yourname');

// Public URL of this deployment's frontend, no trailing slash. Payment return
// links must start with it once it is set.
// define('APP_URL', 'http://localhost:8080/ApartmentManagementSystem_React/ams-react/dist/index.html');

// Comma-separated origins allowed to call the API (see cors.php). When unset,
// development allows everything and production allows no cross-origin calls.
// "*" is ignored.
// define('ALLOWED_ORIGINS', 'http://localhost:5173,http://localhost:8080');

// Optional: PayMongo keys from here instead of Admin > Settings (database).
// Never commit real values.
// define('PAYMONGO_SECRET_KEY', 'sk_test_...');
// define('PAYMONGO_WEBHOOK_SECRET', 'whsk_...');

// --- Self-hosted production example --------------------------------------
// define('DB_USER', 'ams_app');            // not root
// define('DB_PASS', '<strong password>');
// define('DB_NAME', 'ams_selfhosted');
// define('APP_ENV', 'production');
// define('DEPLOYMENT_TARGET', 'selfhosted');
// define('DEPLOYMENT_ID', '<org>-selfhosted');
// define('APP_URL', 'https://ams.example.org/ApartmentManagementSystem_React/ams-react/dist/index.html');
// define('ALLOWED_ORIGINS', 'https://ams.example.org');
