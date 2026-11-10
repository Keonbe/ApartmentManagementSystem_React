#!/usr/bin/env bash
# Dev database snapshots for AMS (XAMPP MariaDB). Local dev only, never prod.
#   snapshot.sh save [label]        dump ams_db to .db-snapshots/
#   snapshot.sh list                show snapshots, newest first
#   snapshot.sh restore [file]      rebuild ams_db from a snapshot (default: newest non-safety one)
#   snapshot.sh scratch <name> [--seed]   build a throwaway DB from SetupDB.sql (name rewritten)
#   snapshot.sh drop-scratch <name> drop a scratch DB
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DIR="$ROOT/.db-snapshots"
BIN="${MYSQL_BIN_DIR:-/c/xampp/mysql/bin}"
DB="ams_db"
USER_ARGS=(-u "${DB_USER:-root}")
[ -n "${DB_PASS:-}" ] && USER_ARGS+=("-p$DB_PASS")

# utf8mb4 on every call: the Windows client default mangles non-ASCII text on import (the peso sign came out as "Ôé▒").
mysql() { "$BIN/mysql.exe" "${USER_ARGS[@]}" --default-character-set=utf8mb4 "$@"; }
dump() { "$BIN/mysqldump.exe" "${USER_ARGS[@]}" --default-character-set=utf8mb4 --single-transaction --routines --triggers "$@"; }

save() {
  mkdir -p "$DIR"
  local label="${1:-manual}"
  label="${label//[^A-Za-z0-9_-]/_}"
  local out="$DIR/$(date +%Y%m%d_%H%M%S)_${label}.sql"
  dump "$DB" > "$out"
  [ -s "$out" ] || { echo "Dump is empty: $out" >&2; exit 1; }
  echo "$out"
}

check_scratch_name() {
  [[ "$1" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Bad database name: $1" >&2; exit 1; }
  [ "$1" != "$DB" ] || { echo "Refusing: $DB is the dev database, not a scratch one." >&2; exit 1; }
}

case "${1:-}" in
  save)
    save "${2:-}"
    ;;
  list)
    ls -lt "$DIR"/*.sql 2>/dev/null || echo "No snapshots in $DIR"
    ;;
  restore)
    file="${2:-}"
    if [ -z "$file" ]; then
      file="$(ls -t "$DIR"/*.sql 2>/dev/null | grep -v '_pre-restore\.sql$' | head -1 || true)"
    elif [ ! -f "$file" ]; then
      file="$DIR/$file"
    fi
    [ -n "$file" ] && [ -f "$file" ] || { echo "Snapshot not found. Run: snapshot.sh list" >&2; exit 1; }
    safety="$(save pre-restore)"
    collation="$(mysql -N -e "SELECT DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$DB'")"
    collation="${collation:-utf8mb4_general_ci}"
    mysql -e "DROP DATABASE IF EXISTS $DB; CREATE DATABASE $DB CHARACTER SET ${collation%%_*} COLLATE $collation;"
    mysql "$DB" < "$file"
    echo "Restored $DB from $file"
    echo "State before the restore was saved to $safety"
    mysql -N -e "SELECT CONCAT(COUNT(*), ' tables') FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB'"
    ;;
  scratch)
    name="${2:-}"
    check_scratch_name "$name"
    mysql -e "DROP DATABASE IF EXISTS $name;"
    # SetupDB.sql and the seed hardcode `ams_db`; rewrite the name or they hit dev.
    sed "s/\b$DB\b/$name/g" "$ROOT/backend/api/migrations/SetupDB.sql" | mysql
    if [ "${3:-}" = "--seed" ]; then
      sed "s/\b$DB\b/$name/g" "$ROOT/backend/api/migrations/seeds/seed_mock_data.sql" | mysql
    fi
    echo "Built scratch database $name"
    mysql -N -e "SELECT CONCAT(COUNT(*), ' tables') FROM information_schema.TABLES WHERE TABLE_SCHEMA='$name'"
    ;;
  drop-scratch)
    name="${2:-}"
    check_scratch_name "$name"
    mysql -e "DROP DATABASE IF EXISTS $name;"
    echo "Dropped $name"
    ;;
  *)
    sed -n '2,8p' "${BASH_SOURCE[0]}"
    exit 1
    ;;
esac
