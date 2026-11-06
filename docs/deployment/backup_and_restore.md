# AMS — Backup and Restore Runbook

> **Status: procedure only.** This page describes how a production AMS install should be backed up and restored. It does **not** mean a production backup is already running: nothing in this repository schedules one. The operator has to set up the schedule below on the production host, run the first restore drill, and fill in the "last tested" line in the [operator checklist](#7-operator-checklist).

Answers the manager interview's Q26 (data loss or access; see [manager_interview_comparison.md](../features/manager_interview_comparison.md)).

---

## 1. What to back up

| Item | Where it lives | Why it matters |
|---|---|---|
| **Database `ams_db`** | MySQL 8 / MariaDB on the production host | Every tenant, room, invoice, payment, contract, notification and setting. |
| **`backend/uploads/`** | Next to the API | User files the database only points to: valid IDs and application documents (`applications/`), contract PDFs and other rent documents (`documents/`), payment proofs (`payment_proofs/`, `payments/`), maintenance photos, service and utility bill attachments. A database restored without them leaves broken links. |
| **`backend/room_images/`** | Next to the API | Room photos and floor plans the admin uploaded. Only a sample image is tracked in git. |
| **`backend/site_assets/`** | Next to the API | The Glass theme background photos the admin uploaded (Other Settings → Glass Mode): the live one, named by `system_settings.glass_bg_image`, and up to five recent ones to switch back to. Only its `.htaccess` is tracked in git; without the live photo, tenants see the built-in one. |
| **`backend/config.env.php`** | Server only, gitignored | Database credentials, `APP_URL`, `ALLOWED_ORIGINS`, timezone. Store a copy **securely** (password manager or encrypted archive), never in git and never next to the plain dumps. |

Not needed: `node_modules/`, `vendor/`, `ams-react/dist/` and the code itself (rebuilt from git), `backend/logs/`.

## 2. How

### 2.1 Database dump

Use a dedicated read-only backup account so the job never holds the application's write credentials:

```sql
CREATE USER 'ams_backup'@'localhost' IDENTIFIED BY '<strong password>';
GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES ON ams_db.* TO 'ams_backup'@'localhost';
```

Keep the password in an option file readable only by the backup job's user (not on the command line, where `ps` shows it):

```ini
# /etc/ams/backup.cnf   (chmod 600)      — Windows: C:\ams_backup\backup.cnf
[mysqldump]
user=ams_backup
password=<strong password>
```

The dump command (InnoDB tables are copied from one consistent snapshot without locking the site; `--no-tablespaces` avoids MySQL 8's PROCESS-privilege error):

```bash
mysqldump --defaults-extra-file=/etc/ams/backup.cnf \
  --single-transaction --default-character-set=utf8mb4 --no-tablespaces \
  ams_db | gzip > /backups/ams/db/ams_db_$(date +%F).sql.gz
```

The dump has no `CREATE DATABASE` / `USE` line (no `--databases`), so it can be restored into any database name, which the restore drill relies on.

### 2.2 Schedule: nightly at 03:00

**Linux host (cron).** Put the steps in one script so the files copy only runs after a good dump:

```bash
#!/bin/bash
# /usr/local/bin/ams_backup.sh
set -eo pipefail   # stop if mysqldump fails, even inside the pipe to gzip
D=$(date +%F)
mysqldump --defaults-extra-file=/etc/ams/backup.cnf --single-transaction \
  --default-character-set=utf8mb4 --no-tablespaces ams_db | gzip > /backups/ams/db/ams_db_$D.sql.gz
rsync -a /var/www/html/backend/uploads/     /backups/ams/files/uploads/
rsync -a /var/www/html/backend/room_images/ /backups/ams/files/room_images/
```

```bash
# crontab -e   (as the backup user)
0 3 * * * /usr/local/bin/ams_backup.sh >> /var/log/ams_backup.log 2>&1
```

Check the log and the file size after the first runs: a dump of a few hundred bytes is an error message, not a backup.

**Windows / XAMPP host (Task Scheduler).** Save as `C:\ams_backup\ams_backup.ps1`:

```powershell
$ErrorActionPreference = 'Stop'
$d    = Get-Date -Format 'yyyy-MM-dd'
$dest = 'D:\ams_backups'
& 'C:\xampp\mysql\bin\mysqldump.exe' --defaults-extra-file=C:\ams_backup\backup.cnf `
    --single-transaction --default-character-set=utf8mb4 --no-tablespaces `
    --result-file="$dest\db\ams_db_$d.sql" ams_db
if ($LASTEXITCODE -ne 0) { throw "mysqldump failed ($LASTEXITCODE)" }
robocopy C:\xampp\htdocs\ApartmentManagementSystem_React\backend\uploads     "$dest\files\uploads"     /E /R:2 /W:5 /NP /LOG+:"$dest\robocopy.log"
robocopy C:\xampp\htdocs\ApartmentManagementSystem_React\backend\room_images "$dest\files\room_images" /E /R:2 /W:5 /NP /LOG+:"$dest\robocopy.log"
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }
```

Register it once, from an elevated PowerShell:

```powershell
schtasks /Create /TN "AMS nightly backup" /SC DAILY /ST 03:00 /RU SYSTEM /RL HIGHEST `
  /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\ams_backup\ams_backup.ps1"
```

`robocopy` exit codes below 8 mean success. `/E` copies new and changed files and never deletes from the backup, so a file removed by mistake on the server is still in the copy (`rsync -a` without `--delete` behaves the same).


The retention and restore-drill rules below apply to the mirror too.

## 3. Retention and naming

- **Names:** `ams_db_YYYY-MM-DD.sql` (or `.sql.gz`) for the database; the files mirror keeps the server's folder layout.
- **Keep 14 daily dumps and 3 monthly dumps** (the dump of the 1st of each month, copied to `monthly/` before the daily cleanup):

  ```bash
  # Linux, appended to ams_backup.sh
  [ "$(date +%d)" = "01" ] && cp /backups/ams/db/ams_db_$D.sql.gz /backups/ams/monthly/
  find /backups/ams/db      -name 'ams_db_*.sql*' -mtime +14 -delete
  ls -1t /backups/ams/monthly/ams_db_*.sql* | tail -n +4 | xargs -r rm --
  ```

  ```powershell
  # Windows, appended to ams_backup.ps1
  if ((Get-Date).Day -eq 1) { Copy-Item "$dest\db\ams_db_$d.sql" "$dest\monthly\" }
  Get-ChildItem "$dest\db\ams_db_*.sql" | Where-Object LastWriteTime -lt (Get-Date).AddDays(-14) | Remove-Item
  Get-ChildItem "$dest\monthly\ams_db_*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 3 | Remove-Item
  ```

- **Off-machine copy:** a backup on the same disk as the server is lost with it. Copy the newest dump and the files mirror to a second place at least weekly: an external drive kept elsewhere, another computer, or cloud storage (e.g. `rclone copy /backups/ams remote:ams-backups`). Dumps contain tenants' personal data and the files include government IDs: encrypt the off-machine copy (an encrypted drive, `7z -p`, or an rclone `crypt` remote).

> **Not a production backup:** the repository's `/db-snapshot` skill (`.claude/skills/db-snapshot/`, see [claude_code_guide.md](../documentation/claude_code_guide.md#database-snapshots-db-snapshot)) only saves and restores the **dev** `ams_db` on a developer's PC around tests. Do not rely on it for production.

## 4. Restore

Do this in a quiet window; tell the manager the site will be down for a few minutes.

### 4.1 Database

1. **Stop writes:** stop Apache (or put the API in maintenance) so nobody saves during the restore. Stop the daily sweep / cron jobs.
2. **Keep what is there now**, even if it looks broken: run the dump command from §2.1 once more to `ams_db_before_restore_<date>.sql`.
3. **Pick the dump:** the newest good one (check its size and that it ends with `-- Dump completed`).
4. **Restore into a fresh database:**

   ```bash
   mysql -u root -p -e "DROP DATABASE IF EXISTS ams_db; CREATE DATABASE ams_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
   gunzip -c /backups/ams/db/ams_db_2026-10-25.sql.gz | mysql -u root -p --default-character-set=utf8mb4 ams_db
   ```

   Windows: `C:\xampp\mysql\bin\mysql.exe -u root -p --default-character-set=utf8mb4 ams_db < D:\ams_backups\db\ams_db_2026-10-25.sql`

5. **Re-grant the application user** if the database was dropped on MySQL 8 and its grants were database-level (`GRANT SELECT, INSERT, UPDATE, DELETE ON ams_db.* TO 'ams_user'@'localhost'`; see [localhost_to_production.md Phase D](localhost_to_production.md#phase-d--database-migration)).
6. **Apply pending migrations:** if the code is newer than the dump, run `php backend/cron/migrate.php` (it applies only the files `schema_migrations` in the dump does not list).

### 4.2 Uploads and room images

Copy the files back into place, then give them back to the web server user:

```bash
rsync -a /backups/ams/files/uploads/     /var/www/html/backend/uploads/
rsync -a /backups/ams/files/room_images/ /var/www/html/backend/room_images/
chown -R www-data:www-data /var/www/html/backend/uploads /var/www/html/backend/room_images
```

Windows: `robocopy D:\ams_backups\files\uploads C:\xampp\htdocs\ApartmentManagementSystem_React\backend\uploads /E` (and the same for `room_images`). Keep `backend/uploads/.htaccess` from git: it blocks script execution in the uploads folder.

If `config.env.php` was lost too, restore it from the secure copy (§1) before starting Apache.

### 4.3 Checks after a restore

1. Start Apache; `php backend/cron/check_environment.php` reports no errors.
2. **Login:** `admin@gmail.com` is the seed account on dev only; on production log in with the real admin account and see the dashboard.
3. **Rooms:** `GET /api/get_rooms.php` returns 200 and the expected rooms.
4. **One file:** open Payments, pick a recent paid invoice and open its payment proof (and one tenant's valid ID). Both must load; a 404 means the files restore is missing or misplaced.
5. Compare the newest invoice / payment dates with what the manager remembers: anything after the dump time has to be re-entered from the tenants' screenshots.
6. Start the cron jobs again.

## 5. Monthly restore drill

A backup that has never been restored is not known to work. Once a month (first working day is easy to remember):

1. Restore the newest dump into a **scratch** database, never into `ams_db`:

   ```bash
   mysql -u root -p -e "DROP DATABASE IF EXISTS ams_restore_drill; CREATE DATABASE ams_restore_drill CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
   gunzip -c /backups/ams/db/ams_db_$(date +%F).sql.gz | mysql -u root -p --default-character-set=utf8mb4 ams_restore_drill
   ```

2. **Compare table counts** with the live database (exact `COUNT(*)`, not `information_schema.TABLE_ROWS`, which is only an estimate for InnoDB). The live numbers may be slightly higher because of activity since 03:00:

   ```sql
   SELECT 'users', (SELECT COUNT(*) FROM ams_db.users), (SELECT COUNT(*) FROM ams_restore_drill.users)
   UNION ALL SELECT 'rooms', (SELECT COUNT(*) FROM ams_db.rooms), (SELECT COUNT(*) FROM ams_restore_drill.rooms)
   UNION ALL SELECT 'invoices', (SELECT COUNT(*) FROM ams_db.invoices), (SELECT COUNT(*) FROM ams_restore_drill.invoices)
   UNION ALL SELECT 'payment_transactions', (SELECT COUNT(*) FROM ams_db.payment_transactions), (SELECT COUNT(*) FROM ams_restore_drill.payment_transactions)
   UNION ALL SELECT 'lease_contracts', (SELECT COUNT(*) FROM ams_db.lease_contracts), (SELECT COUNT(*) FROM ams_restore_drill.lease_contracts)
   UNION ALL SELECT 'tables', (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'ams_db'), (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'ams_restore_drill');
   ```

3. Pick two file paths from the restored DB (`SELECT proof_of_payment_path FROM ams_restore_drill.invoices WHERE proof_of_payment_path IS NOT NULL ORDER BY id DESC LIMIT 2`) and confirm they exist in the files backup.
4. Drop the scratch database: `DROP DATABASE ams_restore_drill;`
5. Write the date and result in the checklist below.

## 6. When something fails

- **Dump is tiny or empty:** read `/var/log/ams_backup.log` (Task Scheduler: the task's *Last Run Result* and history). Usual causes: wrong password in the option file, the backup user missing a grant, disk full.
- **Restore stops with an error:** do not keep going on a half-restored `ams_db`. Restore `ams_db_before_restore_<date>.sql` from step 4.1.2 and try the previous day's dump.
- **Character problems (`Ã±` instead of `ñ`):** the dump or the restore ran without `--default-character-set=utf8mb4`.

## 7. Operator checklist

- [ ] Backup user `ams_backup` created, option file stored with restricted permissions
- [ ] Nightly 03:00 job scheduled (cron or Task Scheduler) and its first log checked
- [ ] Retention steps added (14 daily, 3 monthly)
- [ ] Off-machine, encrypted copy set up (at least weekly)
- [ ] `config.env.php` stored securely
- [ ] Restore drill run (§5) and the result recorded

Last restore drill tested: ____________________ (date, by whom, result)

---

## Related documentation

- [localhost_to_production.md](localhost_to_production.md) — Phase D (database migration) and Phase F (monitoring & ops)
