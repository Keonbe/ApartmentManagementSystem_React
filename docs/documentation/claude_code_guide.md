# Claude Code in this repo

How Claude Code is set up for AMS and how to use it. Everything described here is in `.claude/` and `CLAUDE.md`, so it applies to anyone who opens the repo with Claude Code.

After pulling changes to `.claude/`, restart your Claude Code session. Settings, hooks and skills load at session start.

## What is set up

| Piece | File | What it does |
|---|---|---|
| Project instructions | `CLAUDE.md` | Stack, run commands, backend conventions, workflow rules. Loaded every session. |
| Permissions | `.claude/settings.json` | Which commands run without asking, which always ask, which files cannot be read. |
| PHP syntax hook | `.claude/hooks/php-lint.js` | Runs `php -l` after every PHP edit. |
| Database guard hook | `.claude/hooks/guard-db.js` | Asks before a command that can wipe a database. |
| Snapshot skill | `.claude/skills/db-snapshot/` | Saves and restores the dev database. |
| Sweep agent | `.claude/agents/repo-sweep.md` | Read-only search across many files, returns a summary. |
| Task notes | `TASK.md`, `TASK.archive.md` | Current work and history. Local only, not in git. |

## Database snapshots (`/db-snapshot`)

Use this before any test that writes to the dev database, so the data can be put back afterwards. It works on the local XAMPP database only. Never use it on prod.

You can type the command in Claude Code, or run the script yourself from the repo root in Git Bash:

```bash
bash .claude/skills/db-snapshot/snapshot.sh <action>
```

| Action | What it does |
|---|---|
| `save <label>` | Dumps `ams_db` to `.db-snapshots/<date>_<time>_<label>.sql` |
| `restore` | Rebuilds `ams_db` from the newest snapshot |
| `restore <file>` | Rebuilds `ams_db` from the snapshot you name |
| `list` | Shows all snapshots, newest first |
| `scratch <name>` | Builds a throwaway database from `SetupDB.sql` |
| `scratch <name> --seed` | Same, and loads `seed_mock_data.sql` into it |
| `drop-scratch <name>` | Deletes that throwaway database |

### Typical use

Testing an endpoint that changes data:

```bash
bash .claude/skills/db-snapshot/snapshot.sh save before-payment-test
# ... run the curl checks ...
bash .claude/skills/db-snapshot/snapshot.sh restore
```

Testing a migration or `SetupDB.sql` without touching dev:

```bash
bash .claude/skills/db-snapshot/snapshot.sh scratch ams_scratch --seed
# ... run the migration against ams_scratch ...
bash .claude/skills/db-snapshot/snapshot.sh drop-scratch ams_scratch
```

### Things to know

- **Restore has a safety net.** Before rebuilding, `restore` saves the current state as `<date>_<time>_pre-restore.sql`. If you restored the wrong snapshot, restore that file by name.
- **`restore` with no file skips `pre-restore` files** and picks the newest snapshot you saved yourself. If you ran several tests since your last `save`, name the file.
- **Log in again after a restore.** Sessions come from the snapshot, so a token from during the test may stop working.
- **Never import `SetupDB.sql` or `seed_mock_data.sql` by hand into another database name.** Both contain `USE ams_db` and will overwrite dev whatever name you give on the command line. This wiped the dev database on 2026-10-07. `scratch` rewrites the name for you.
- **`scratch` and `drop-scratch` refuse the name `ams_db`.**
- **Snapshots are not cleaned up.** Delete old files in `.db-snapshots/` when the folder grows. The folder is gitignored.
- **Credentials** default to `root` with no password. If yours differ, set `DB_USER` and `DB_PASS` before running. If MySQL is not in `C:\xampp\mysql\bin`, set `MYSQL_BIN_DIR`.

## Hooks

Hooks are scripts Claude Code runs by itself. You do not call them.

**PHP syntax check.** After Claude edits or creates a `.php` file, `php -l` runs on it. A syntax error goes straight back to Claude, which fixes it in the same turn. Valid files produce no output. If PHP is not installed at `C:\xampp\php\php.exe`, set `PHP_BIN` to its path; without PHP the hook does nothing.

**Database guard.** Before Claude runs a shell command, the hook checks it. You get a confirmation prompt with the reason when the command:

- contains `DROP DATABASE` or `DROP SCHEMA`
- pipes `SetupDB.sql` into mysql
- pipes a seed or reset script into mysql (`seed_mock_data`, `clear_and_seed`, `seed_reset`, `seed_prod_demo`)

It only asks. You can still approve. It does not see commands you type in your own terminal.

## Permissions

| Rule | Commands or files |
|---|---|
| Runs without asking | git read-only commands, `php -l`, `npm run build`, `npm run build:local`, `npm run lint` |
| Always asks, in every mode | `git commit`, `git push`, `git reset --hard`, `git checkout --`, `git clean`, edits to `backend/config.env.php` |
| Claude cannot read | `deploy/env/*.env`, `ams-react/.env.selfhosted`, any `.sql` in the repo root, `seed_prod_demo*.sql` |

The "always asks" rules back the team rule that Claude never commits by itself: you test first, then tell it to commit.

The read block covers Claude's file reader. A shell command such as `cat` can still open those files, so treat it as protection against accidents, not as security.

Personal changes go in `.claude/settings.local.json`, which is not committed. Do not loosen the shared file for one person's convenience.

## Task notes

- `TASK.md` holds the workstream in progress and a list of open items. Claude reads it at the start of every session, so keep it short.
- `TASK.archive.md` holds finished workstreams. Claude searches it by topic when history is needed.
- When a workstream is committed, its section moves from `TASK.md` to the archive, and anything unfinished goes under "Open items".

Both files are local and gitignored. Each teammate has their own.

## Built-in commands worth using

| Command | When |
|---|---|
| `/code-review` | Before committing, to check the current changes for bugs |
| `/security-review` | Before committing changes to auth, payments, uploads or SQL |
| `/clear` | When starting an unrelated task, so old context does not carry over |
| `/usage` | To see how much of the plan limit is left |
| `/hooks` | To see which hooks are loaded |

## Troubleshooting

| Problem | Fix |
|---|---|
| Hook or skill does not seem to run | Restart the session. Then check `/hooks`. |
| `mysql.exe: No such file` | MySQL is not at `C:\xampp\mysql\bin`. Set `MYSQL_BIN_DIR`. |
| `Can't connect to MySQL server` | Start MySQL: `C:\xampp\mysql_start.bat` |
| `Access denied for user 'root'` | Your root has a password. Set `DB_PASS`. |
| `Snapshot not found` | Run `list` and pass the exact file name. |
| Claude asks before every commit | Intended. Approve it once you have tested. |
