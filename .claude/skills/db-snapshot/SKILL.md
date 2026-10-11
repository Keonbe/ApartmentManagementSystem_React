---
name: db-snapshot
description: Save, restore or list snapshots of the dev ams_db, or build a scratch database from SetupDB.sql. Use before any live API test that writes data, when asked to restore or back up the dev database, or when a migration or seed needs testing on a throwaway database.
argument-hint: "save [label] | restore [file] | list | scratch <name> [--seed] | drop-scratch <name>"
---

# Dev database snapshots

Local XAMPP MariaDB only. Never point this at prod.

All actions go through one script. Run it from the repo root with the Bash tool:

```bash
bash .claude/skills/db-snapshot/snapshot.sh $ARGUMENTS
```

With no arguments, pick the action from the task:

| Situation | Command |
|---|---|
| About to run live curl checks that write data | `save <short-label>` first, e.g. `save before-m9-tests` |
| Live checks finished | `restore` (newest snapshot) and say so in the summary |
| User asks what backups exist | `list` |
| Testing SetupDB.sql, a migration or the mock seed | `scratch ams_scratch` (add `--seed` for mock data), then `drop-scratch ams_scratch` |

## Rules

- Snapshots live in `.db-snapshots/` (gitignored), named `YYYYMMDD_HHMMSS_<label>.sql`.
- `restore` drops and rebuilds `ams_db`. It first saves the current state as `*_pre-restore.sql`, so a wrong restore can be undone by restoring that file by name.
- `restore` with no file uses the newest snapshot that is not a `pre-restore` one. If more than one test run happened since the last `save`, name the file.
- Never import `SetupDB.sql` or `seed_mock_data.sql` by hand into another database name: both hardcode `USE ams_db` and will overwrite dev. `scratch` rewrites the name.
- After `restore`, logged-in sessions come from the snapshot, so a Bearer token obtained during the test may stop working. Log in again.
- Old snapshots are not cleaned up automatically. Mention it if `list` shows more than about ten.
- Credentials default to `root` with no password. Override with `DB_USER` / `DB_PASS`, and the MySQL folder with `MYSQL_BIN_DIR`.
