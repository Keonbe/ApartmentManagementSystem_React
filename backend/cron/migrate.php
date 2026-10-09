<?php
/**
 * Apply pending, date-prefixed SQL migrations in backend/api/migrations.
 *
 * Only YYYY_MM_*.sql files are migrations. This intentionally excludes utility
 * scripts such as SetupDB.sql and seed/reset scripts, which may be destructive.
 *
 * Each file is split into statements and run one at a time. A statement that
 * fails because its change is already there (duplicate column/key/table, or a
 * missing column/key to drop) is skipped and the rest of the file still runs.
 * Running the whole file through multi_query() used to stop the server at that
 * first error while the runner still recorded the file as applied, which left
 * prod missing 15 columns (see 2026_10_prod_schema_repair.sql).
 */

require_once __DIR__ . '/../config.php';

// Errors that mean "this change is already applied": duplicate column (1060),
// duplicate key name (1061), table exists (1050), can't drop missing key/column (1091).
const MIGRATION_BENIGN_ERRORS = [1060, 1061, 1050, 1091];

/** Emit one migration log line and return it for the web response. */
function migration_log(&$output, $status, $message)
{
    $line = '[' . $status . '] ' . $message;
    $output[] = $line;
    echo $line . PHP_EOL;
}

/** Return true when SQL is empty or has only whitespace and SQL comments. */
function migration_is_comment_only($sql)
{
    // Remove block comments, MySQL # comments, and -- comments (which require
    // whitespace/control after the second dash as specified by MySQL).
    $withoutComments = preg_replace('~/\*[\s\S]*?\*/|^[\t ]*\#[^\r\n]*|^[\t ]*--(?=[\t \r\n]|$)[^\r\n]*~m', '', $sql);
    return trim($withoutComments ?? $sql) === '';
}

/**
 * Split a SQL file into statements on `;`, ignoring semicolons inside quoted
 * strings/identifiers and comments. Comment-only chunks are dropped. Files with
 * DELIMITER blocks (procedures, triggers) are not supported.
 */
function migration_split_statements($sql)
{
    $statements = [];
    $current = '';
    $len = strlen($sql);
    $i = 0;

    while ($i < $len) {
        $ch = $sql[$i];
        $next = $i + 1 < $len ? $sql[$i + 1] : '';

        // Line comments: -- (followed by whitespace or end) and #.
        if (($ch === '-' && $next === '-' && ($i + 2 >= $len || ctype_space($sql[$i + 2]))) || $ch === '#') {
            $end = strpos($sql, "\n", $i);
            $end = $end === false ? $len : $end;
            $current .= substr($sql, $i, $end - $i);
            $i = $end;
            continue;
        }
        // Block comments.
        if ($ch === '/' && $next === '*') {
            $end = strpos($sql, '*/', $i + 2);
            $end = $end === false ? $len : $end + 2;
            $current .= substr($sql, $i, $end - $i);
            $i = $end;
            continue;
        }
        // Quoted strings and identifiers: '...', "...", `...`.
        if ($ch === "'" || $ch === '"' || $ch === '`') {
            $quote = $ch;
            $current .= $ch;
            $i++;
            while ($i < $len) {
                $c = $sql[$i];
                if ($c === '\\' && $quote !== '`' && $i + 1 < $len) {
                    $current .= $c . $sql[$i + 1];
                    $i += 2;
                    continue;
                }
                $current .= $c;
                $i++;
                if ($c === $quote) {
                    // A doubled quote is an escaped quote, not the end.
                    if ($i < $len && $sql[$i] === $quote) {
                        $current .= $sql[$i];
                        $i++;
                        continue;
                    }
                    break;
                }
            }
            continue;
        }
        if ($ch === ';') {
            if (!migration_is_comment_only($current)) {
                $statements[] = trim($current);
            }
            $current = '';
            $i++;
            continue;
        }
        $current .= $ch;
        $i++;
    }

    if (!migration_is_comment_only($current)) {
        $statements[] = trim($current);
    }
    return $statements;
}

/**
 * Run one statement. Returns 0 on success or the MySQL error code. Works whether
 * mysqli reports errors by returning false (PHP 8.0 default) or by throwing.
 */
function migration_run_statement($conn, $statement, &$error)
{
    $error = '';
    try {
        $result = $conn->query($statement);
        if ($result === false) {
            $error = $conn->error;
            return (int) $conn->errno ?: -1;
        }
        if ($result instanceof mysqli_result) {
            $result->free();
        }
        return 0;
    } catch (mysqli_sql_exception $e) {
        $error = $e->getMessage();
        return (int) $e->getCode() ?: -1;
    }
}

/**
 * Run pending migrations. Returns success, applied names, output lines, and
 * skipped non-migration SQL filenames. $migrationDir defaults to
 * backend/api/migrations; tests can point it at a scratch folder.
 */
function run_migrations($conn, $migrationDir = null)
{
    $output = [];
    $applied = [];
    $skipped = [];
    $success = true;
    $migrationDir = $migrationDir ?? __DIR__ . '/../api/migrations';

    try {
        $conn->query(
            'CREATE TABLE IF NOT EXISTS schema_migrations (' .
            'id INT AUTO_INCREMENT PRIMARY KEY, ' .
            'migration_name VARCHAR(255) NOT NULL UNIQUE, ' .
            'applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'
        );

        if (!is_dir($migrationDir)) {
            throw new RuntimeException('Migration directory not found');
        }

        $allFiles = glob($migrationDir . '/*.sql') ?: [];
        $files = [];
        foreach ($allFiles as $file) {
            $name = basename($file);
            if (preg_match('/^\d{4}_\d{2}_.+\.sql$/', $name)) {
                $files[] = $file;
            } else {
                $skipped[] = $name;
            }
        }
        usort($files, static function ($left, $right) {
            return strcmp(basename($left), basename($right));
        });

        foreach ($skipped as $name) {
            migration_log($output, 'SKIPPED', $name . ' (not a YYYY_MM_ migration)');
        }

        $check = $conn->prepare('SELECT 1 FROM schema_migrations WHERE migration_name = ? LIMIT 1');
        $insert = $conn->prepare('INSERT INTO schema_migrations (migration_name) VALUES (?)');
        if (!$check || !$insert) {
            throw new RuntimeException('Could not prepare migration tracking statements');
        }

        foreach ($files as $file) {
            $name = basename($file);
            $check->bind_param('s', $name);
            $check->execute();
            if ($check->get_result()->num_rows > 0) {
                migration_log($output, 'SKIPPED', $name . ' (already applied)');
                continue;
            }

            $sql = file_get_contents($file);
            if ($sql === false) {
                migration_log($output, 'FAILED', $name . ' (could not read file)');
                $success = false;
                break;
            }

            // Some MySQL versions reject IF NOT EXISTS in ALTER TABLE ADD and
            // CREATE INDEX. Strip those clauses; the duplicate error they were
            // guarding against is tolerated per statement below.
            $sql = preg_replace('/ADD\s+(COLUMN\s+)?IF\s+NOT\s+EXISTS/i', 'ADD $1', $sql);
            $sql = preg_replace('/ADD\s+(UNIQUE\s+)?(INDEX|KEY)\s+IF\s+NOT\s+EXISTS/i', 'ADD $1$2', $sql);
            $sql = preg_replace('/CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/i', 'CREATE $1INDEX', $sql);

            $statements = migration_split_statements($sql);
            $failed = false;
            $notices = 0;
            foreach ($statements as $index => $statement) {
                $error = '';
                $code = migration_run_statement($conn, $statement, $error);
                if ($code === 0) {
                    continue;
                }
                if (in_array($code, MIGRATION_BENIGN_ERRORS, true)) {
                    $notices++;
                    continue;
                }
                error_log('[AMS migration] ' . $name . ' statement ' . ($index + 1) . ' (MySQL ' . $code . '): ' . $error);
                migration_log($output, 'FAILED', $name . ' at statement ' . ($index + 1) . ' of ' . count($statements) . ' (see server log for details)');
                $failed = true;
                break;
            }
            if ($failed) {
                $success = false;
                break;
            }

            try {
                $insert->bind_param('s', $name);
                if (!$insert->execute()) {
                    throw new RuntimeException($insert->error);
                }
            } catch (Throwable $e) {
                error_log('[AMS migration] ' . $name . ': ' . $e->getMessage());
                migration_log($output, 'FAILED', $name . ' (could not record migration)');
                $success = false;
                break;
            }
            $applied[] = $name;
            if (count($statements) === 0) {
                migration_log($output, 'SKIPPED', $name . ' (empty or comment-only)');
            } elseif ($notices > 0) {
                migration_log($output, 'SUCCESS', $name . " ($notices statement(s) already applied, skipped)");
            } else {
                migration_log($output, 'SUCCESS', $name);
            }
        }

        $check->close();
        $insert->close();
    } catch (Throwable $e) {
        error_log('[AMS migration runner] ' . $e->getMessage());
        migration_log($output, 'FAILED', 'Migration runner error (see server log for details)');
        $success = false;
    }

    if ($success && count($applied) === 0) {
        migration_log($output, 'SUCCESS', 'No pending migrations');
    }

    return [
        'success' => $success,
        'applied' => $applied,
        'output' => $output,
        'skipped' => $skipped,
    ];
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === realpath(__FILE__)) {
    $result = run_migrations($conn);
    $conn->close();
    exit($result['success'] ? 0 : 1);
}
