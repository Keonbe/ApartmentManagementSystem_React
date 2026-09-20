# Railway Setup Runbook: API + MariaDB

> ⚠️ **Dropped (2026-09-20):** Railway is no longer a deployment target. The project runs locally (self-hosted XAMPP) only. This runbook is kept for historical reference only.

> **Changed:** 2026-09-17 · **For:** a first-time Railway user bringing the AMS API up · **Related:** [environment_config.md](environment_config.md), [saas_deployment_guide.md](saas_deployment_guide.md), [consolidated_todo.md](../consolidated_todo.md)

Follow the steps in order. Each step says what you should see when it worked. You only need to come back to Claude for the final check (§9) or if the troubleshooting table (§10) doesn't cover your problem.

---

## 0. What you'll end up with

```
Railway project
├── API service      (this GitHub repo, built from the root Dockerfile)
│      │  private network: mariadb.railway.internal:3306
│      ▼
└── mariadb service  (Docker image mariadb:10.11 + volume at /var/lib/mysql)
```

**Why not Railway's "MySQL" database?** It runs MySQL 9.4, not MariaDB. `SetupDB.sql` uses MariaDB-only syntax (`... AS (...) PERSISTENT` generated columns), so the import fails there. This app is built for MariaDB, and CI already tests against `mariadb:10.11`. Railway has no MariaDB template, so you deploy the official image yourself.

---

## 1. Clean up

1. Open the project and click the **MySQL** service.
2. **Settings** → scroll to the bottom → **Delete Service** and confirm.

Its password was shared in a chat, so deleting the service also retires that credential. It held no data.

**Worked when:** only the API service is left.

---

## 2. Create the MariaDB service

1. **+ New** (or **Create**) → **Empty Service**.
2. Click the new service → **Settings** → **Source** → **Connect Image**.
3. In the box "Enter a Docker image from a supported registry", type:
   ```
   mariadb:10.11
   ```
4. Press **Enter** or click **Connect**.
   > A link to `hub.docker.com/_/mariadb` appears. It only confirms that the image was found. **Don't click it.**
5. Rename the service to `mariadb`: click its name at the top of the panel, or use **Settings** → **Service Name**. The variable references in §8 rely on this exact name.

**Worked when:** the service card shows the Docker logo and `mariadb:10.11`.

---

## 3. MariaDB variables

Go to the `mariadb` service → **Variables** → **New Variable**, and add these two:

| Name | Value |
|---|---|
| `MARIADB_ROOT_PASSWORD` | A long random password. Use Railway's **Generate** option if you see it, or run `openssl rand -hex 24` in Git Bash. |
| `MARIADB_DATABASE` | `ams_db` |

On its first start, the image creates the `ams_db` database automatically.

> [!IMPORTANT]
> Don't paste this password into chats, docs or commits. §8 references it, so you never need to copy it anywhere else in Railway.

---

## 4. Volume (keeps the data)

1. Right-click the `mariadb` service card (or open the command palette with **Ctrl+K**) → **Attach Volume**.
2. Set the mount path to:
   ```
   /var/lib/mysql
   ```

Without a volume, **every redeploy wipes the database.**

**Worked when:** a volume icon is attached to the service card.

---

## 5. Networking

1. **Private address:** Railway provides this automatically. The API reaches the database at `mariadb.railway.internal`, port `3306`. You don't need to change anything.
2. **Public address (only for the import in §7):** **Settings** → **Networking** → **TCP Proxy** → enter port `3306` and confirm.
   - Railway shows an address like `something.proxy.rlwy.net:12345`. Write down the **host** and **port**; §7 uses both.

---

## 6. Deploy and confirm it's running

1. Click **Deploy** (or **Apply changes**) at the top of the canvas.
2. Open the `mariadb` service → **Deployments** → latest → **View logs**.

**Worked when:** the log contains `mariadbd: ready for connections`.

---

## 7. Import the schema from your PC

Run these in Git Bash from the repo root, replacing `<host>` and `<port>` with the TCP proxy values from §5. Each command asks for the password; enter `MARIADB_ROOT_PASSWORD`.

```bash
cd /c/xampp/htdocs/ApartmentManagementSystem_React

# 1. Import the schema, default settings, admin account and rooms
/c/xampp/mysql/bin/mysql.exe -h <host> -P <port> -u root -p ams_db < backend/api/migrations/SetupDB.sql

# 2. Check that the tables exist
/c/xampp/mysql/bin/mysql.exe -h <host> -P <port> -u root -p -e "USE ams_db; SHOW TABLES;"
```

**Worked when:** step 2 lists the tables, including `users`, `rooms`, `invoices` and `activity_logs`.

> [!WARNING]
> - **Never** import `seed_mock_data.sql` or `clear_and_seed.sql` into production. They add fake tenants and reset the admin password to the shared demo password.
> - `SetupDB.sql` creates the admin `admin@gmail.com` with the demo password `admin123`. **Change it right after your first login** in Account Settings (security item A-1).

Optional: once the import is done, turn the **TCP Proxy** off again (§5) so the database isn't reachable from the internet. Turn it back on if you need to run SQL from your PC later.

---

## 8. Connect the API service to the database

1. Open the **API service** (the one built from this repo) → **Variables** → **Raw Editor**.
2. Replace the contents with the block below and click **Update Variables**:
   ```
   DB_HOST=${{mariadb.RAILWAY_PRIVATE_DOMAIN}}
   DB_PORT=3306
   DB_USER=root
   DB_PASS=${{mariadb.MARIADB_ROOT_PASSWORD}}
   DB_NAME=ams_db
   APP_ENV=production
   ```
   The `${{...}}` values are references that Railway fills in. They only resolve if the database service is named exactly `mariadb` (§2 step 5).
3. Leave `ALLOWED_ORIGINS` and `APP_URL` **unset** until the frontend is deployed (see §11).

**Worked when:** the Variables list shows `DB_HOST` resolving to `mariadb.railway.internal`, and `DB_PASS` is masked.

> Later hardening (A-3): create a dedicated DB user with limited rights instead of `root`. That is blocked on removing request-time DDL (D-9 / L2).

---

## 9. Redeploy and check the API

1. Click **Deploy** on the API service. Variable changes normally trigger a deploy anyway.
2. Once it shows **Active**, run these in Git Bash:

```bash
API=https://apartmentmanagementsystemreact-production.up.railway.app/api

# a) The API is up and connected
curl -s "$API/get_invoices.php"
#    expect: {"success":false,"message":"Authentication required"}

# b) Login works (use the new password if you already changed it)
curl -s -X POST "$API/login.php" -H "Content-Type: application/json" \
  -d '{"email_address":"admin@gmail.com","password":"admin123"}'
#    expect: JSON with "success":true and a token

# c) CORS is closed to unknown sites
curl -s -i -X OPTIONS "$API/login.php" -H "Origin: https://evil.example" | grep -i allow-origin
#    expect: no output
```

When all three match, tell Claude "Railway is live". Claude will re-check, then mark C4 / D-7 and the Railway blocker as done in `consolidated_todo.md`.

---

## 10. Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| Blank page / HTTP 500 with an empty body | The API is running old code or has no variables | Check §8, then redeploy the API |
| `{"success":false,"message":"Database connection failed"}` | The API can't reach or log in to MariaDB | The service must be named exactly `mariadb`; `DB_PASS` must reference `MARIADB_ROOT_PASSWORD`; the `mariadb` service must be running (§6) |
| `Table 'ams_db.users' doesn't exist` | The schema was never imported | Do §7 |
| `Plugin caching_sha2_password could not be loaded` | You're connecting to Railway's **MySQL** service, not MariaDB | Do §1 and §2 |
| `You have an error in your SQL syntax ... PERSISTENT` | Same cause: the target is MySQL | Same fix |
| `ERROR 2003 Can't connect` from your PC | The TCP proxy is off, or you used the private host | Use the `*.proxy.rlwy.net` host and port from §5 |
| The browser opened Docker Hub | You clicked the preview link in §2 | Go back to Railway and click **Connect** |
| Data is gone after a redeploy | No volume is attached | Do §4, then §7 again |
| `forgot_password.php` returns a `dev_token` | `APP_ENV` isn't `production` | Set it (§8) and redeploy |

---

## 11. What's next

In order, as tracked in [consolidated_todo.md](../consolidated_todo.md#deployment):

1. Add `ams-react/vercel.json` with an SPA rewrite, then deploy the frontend to Vercel.
2. On the API service, set `ALLOWED_ORIGINS=https://<your-vercel-domain>` and `APP_URL=https://<your-vercel-domain>`.
3. Attach a volume to the API service at `/var/www/html/uploads`, so uploaded files survive redeploys.
4. Set up DB backups: Railway volume backups, or a periodic `mysqldump` through the TCP proxy.
