<?php
/**
 * Apply pending, date-prefixed SQL migrations in backend/api/migrations.
 *
 * Only YYYY_MM_*.sql files are migrations. This intentionally excludes utility
 * scripts such as SetupDB.sql and seed/reset scripts, which may be destructive.
 */

require_once __DIR__ . '/../config.php';

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
 * Run pending migrations. Returns success, applied names, output lines, and
 * skipped non-migration SQL filenames.
 */
function run_migrations($conn)
{
    $output = [];
    $applied = [];
    $skipped = [];
    $success = true;
    $migrationDir = __DIR__ . '/../api/migrations';

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
            if (migration_is_comment_only($sql)) {
                try {
                    $insert->bind_param('s', $name);
                    $insert->execute();
                    $applied[] = $name;
                    migration_log($output, 'SKIPPED', $name . ' (empty or comment-only)');
                } catch (Throwable $e) {
                    error_log('[AMS migration] ' . $name . ': ' . $e->getMessage());
                    migration_log($output, 'FAILED', $name . ' (could not record skipped migration)');
                    $success = false;
                    break;
                }
                continue;
            }

            try {
                // Some MySQL versions reject IF NOT EXISTS in ALTER TABLE ADD.
                // Normalize that syntax before submitting the migration batch.
                $sql = preg_replace('/ADD\s+(COLUMN\s+)?IF\s+NOT\s+EXISTS/i', 'ADD $1', $sql);
                if (!$conn->multi_query($sql)) {
                    throw new RuntimeException($conn->error);
                }
                do {
                    if ($result = $conn->store_result()) {
                        $result->free();
                    }
                    if (!$conn->more_results()) {
                        break;
                    }
                    if (!$conn->next_result()) {
                        throw new RuntimeException($conn->error ?: 'Could not advance to the next SQL result');
                    }
                } while (true);

                $insert->bind_param('s', $name);
                $insert->execute();
                $applied[] = $name;
                migration_log($output, 'SUCCESS', $name);
            } catch (Throwable $e) {
                // Drain pending results so this connection is usable for error handling.
                try {
                    while ($conn->more_results()) {
                        if (!$conn->next_result()) break;
                        if ($result = $conn->store_result()) $result->free();
                    }
                } catch (Throwable $ignored) {
                    // Keep the original migration error.
                }
                error_log('[AMS migration] ' . $name . ': ' . $e->getMessage());
                migration_log($output, 'FAILED', $name . ' (see server log for details)');
                $success = false;
                break;
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

if (PHP_SAPI === 'cli') {
    $result = run_migrations($conn);
    $conn->close();
    exit($result['success'] ? 0 : 1);
}