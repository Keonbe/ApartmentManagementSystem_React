#!/bin/sh
# Example .git/hooks/post-merge hook. Install in the repository's .git/hooks/
# directory and make executable (`chmod +x .git/hooks/post-merge`).
# Run git pull from the repository root so relative paths resolve correctly.

REPO_ROOT="$(git rev-parse --show-toplevel)" || exit 1
cd "$REPO_ROOT" || exit 1

echo "Running database migrations after merge..."
php backend/cron/migrate.php
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
    echo "Database migration runner failed (exit $STATUS). Check the migration logs." >&2
    exit "$STATUS"
fi

echo "Database migrations finished."