<?php
// AMS Environment Configuration Template (local XAMPP)
// Copy this file to `config.env.php` and adjust credentials for your environment.
//
// On Railway there is no config.env.php: the same names are read from the
// service's environment variables (DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME,
// APP_ENV, APP_URL, ALLOWED_ORIGINS). A constant defined here wins over the
// environment, so leave out anything you want the environment to control.

define('DB_HOST', 'localhost');
define('DB_PORT', 3306);
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'ams_db');
define('APP_ENV', 'development'); // 'development' | 'production'

// Public origin of the frontend, no trailing slash.
// define('APP_URL', 'http://localhost:5173');

// Comma-separated origins allowed to call the API (see cors.php). When unset,
// development allows everything and production allows no cross-origin calls.
// define('ALLOWED_ORIGINS', 'http://localhost:5173,http://localhost:8080');
// Production (Railway variable), once the frontend exists:
//   ALLOWED_ORIGINS=https://<frontend-domain>
