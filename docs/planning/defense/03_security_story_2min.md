# The 2-minute security story

Written for: the student presenting, to a mostly-IT panel. Source: `docs/audits/security_audit.md` (checked against the code on 2026-11-18). About 280 spoken words.

## The spoken version (about 2 minutes)

"We treated security as a written audit, not an afterthought. I'll cover what we audited, what we fixed, and what is still open.

**What we audited.** We went module by module and wrote findings with an ID, a severity, the file, and a fix: authentication, uploads, transport, server configuration, the React frontend, input validation, then billing, maintenance, roles and logging, and chat and notifications.

**What we found and fixed.** The most serious finding was broken access control. About forty endpoints trusted a user id that the browser sent. Anyone could read another tenant's invoices or attach a payment to someone else's bill. We fixed it at the root: identity now comes only from the server session, and any `X-User-Id` header a client sends is overwritten before the endpoint runs. We then fixed the others in order: an unauthenticated password change; sessions that survived a password change or a demotion, now revoked, with the role read live from the database; unsafe uploads, now checked for real file type, stored privately and served only to their owner; the chat socket, which accepted anyone and now requires a live session token; and readable server logs. Passwords need length, mixed characters and have a login throttle. Reset tokens are random and stored only as a hash. Every one of these has an automated test, and a scanner for leaked secrets and vulnerable packages runs in CI.

**What remains.** We list these ourselves. The seeded admin password is `admin123` and admins skip the device login code, so the first job at go-live is changing it. Session tokens are stored unhashed in the database and in the browser's storage. There are no HTTP security headers yet. Development uses a root database user. Some endpoints still return database error text. None of these is hidden: each has a written fix in the backlog, ordered by risk.

The point is that the system is not claimed to be secure. It is claimed to be audited, with the known defects closed and the open ones written down."

## Facts behind each sentence (have these ready)

| Claim | Evidence |
|---|---|
| ~40 endpoints trusted client ids | `security_audit.md` §1 (A-7) and §6d; resolved 2026-09-14 |
| Headers overwritten from the session | `config.php` (`require_admin`, `require_user`, `get_authenticated_user`) |
| Unauthenticated password change fixed | `change_password.php`, 2026-09-14, test IDs M11-17 to M11-19 |
| Sessions revoked, role read live | `revoke_user_sessions()`, `get_authenticated_user()` (A-8) |
| Uploads: real MIME check, private, owner-only download | `finfo_file()`, `backend/uploads/.htaccess` (deny all), `download_file.php` |
| Chat socket authenticated | `websocket-server/server.js` lines 80-92 (CH-1, 2026-11-13); `tests/api/chat_socket.test.js` |
| Logs not readable | `backend/logs/.htaccess` (L-1) |
| Reset tokens hashed | `forgot_password.php`, `reset_password.php` (`random_bytes(32)`, SHA-256, 30 minutes) |
| Login throttle | 5 failures per account, 20 per IP per 15 minutes |
| CI secret and dependency scans | gitleaks (`security-secrets`), `npm audit` and `composer audit` (`security-audit`) |
| Admin skips the device code | `login.php:139-140` |
| Raw session tokens | `config.php:1472` (L3) |
| No security headers | C-4, E-2, E-3, E-4 |
| Root DB user | A-3, blocked by request-time DDL (D-9) |
| DB error text returned | D-8, 34 files as of 2026-09-24 |

## Watch-outs (don't say these)

- Don't say "the system is secure" or "OWASP compliant". Say "audited, with listed open findings".
- Don't say all chat is safe because of the socket fix alone. Say both paths are authenticated, and chat is limited to tenant and admin, with a send limit (CH-3, fixed 2026-11-18).
- `websocket-server/.env` was tracked in git until 2026-10-31 (CH-2, resolved). It held only a root user with an empty password, no secret, but the old file is still in git history. Say so if asked. `docs/planning/todo.md` still lists it as open; the code and the audit say it is resolved.
- Don't claim penetration testing. What was done is code audit plus automated tests plus live checks.
