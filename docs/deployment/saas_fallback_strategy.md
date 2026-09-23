# AMS — Deployment Architecture: Self-Hosted vs. SaaS Fallback

> ⚠️ **Dropped (2026-09-20):** the SaaS fallback stack (Railway/Vercel) is no longer part of the plan. The project is deployed locally (self-hosted XAMPP) only, and this comparison is kept for historical reference. CI/CD is unaffected — see `cicd_pipeline.md`.

> **Document:** Infrastructure Options & Service Comparison
> **Project:** Apartment Management System (AMS)
> **Stack:** React 19 + Vite 8 → PHP 8 → MySQL/MariaDB (XAMPP)
> **Last Updated:** September 2026
> **Status:** Planning & Decision Reference
> **Step-by-step setup & deployment:** see [saas_deployment_guide.md](saas_deployment_guide.md)
>
> ⚠️ **Verified against the repo (Sept 2026):** this document's §2 architecture diagram bundled Supabase (PostgreSQL) as the SaaS database, but §3.1's own warning, §6's migration runbook, and §7's recommended stack all correctly steer *away* from Supabase-as-database toward Railway MySQL/PlanetScale to avoid a Postgres dialect rewrite. §2 has been corrected below to match the document's own conclusion — Supabase remains a valid choice for *file storage only* (§3.7), never as the database.

---

## Purpose

This document addresses a critical contingency: **what happens if the home server (XAMPP on-premise deployment) fails or becomes unavailable?**

It maps every external service dependency in the AMS architecture to its SaaS replacement, then compares both deployment strategies across cost, reliability, complexity, and maintenance burden. Use this as the decision guide before or during a production deployment.

---

## 1. Current Architecture (Self-Hosted / XAMPP Home Server)

The planned production deployment hosts everything on a single local machine running XAMPP:

```
Tenant / Admin Browser
        │
        ▼
 Home Server (XAMPP)
 ├── Apache HTTP Server     ← serves React SPA static build
 ├── PHP 8 (backend API)    ← all business logic
 ├── MySQL / MariaDB        ← all data
 └── Local File System      ← uploaded documents, photos, proofs
        │
        ├─── PHPMailer → Gmail SMTP    (external — email)
        └─── cURL → Semaphore API      (external — SMS)
```

**Services that are already external** (even on home server):

| Service | Provider | Why External |
|---|---|---|
| Email delivery | Gmail SMTP / PHPMailer | XAMPP cannot send email directly |
| SMS delivery | Semaphore (PH) | Requires mobile carrier network access |
| Payment gateway | PayMongo (sandbox) | Online API; cannot be self-hosted |
| React build CDN fonts | Google Fonts | Optional; can be self-hosted |

---

## 2. Full SaaS Fallback Architecture

If the home server becomes unreachable, unavailable, or insufficient, the system moves to a fully cloud-hosted model:

```
Tenant / Admin Browser
        │
        ▼
 Vercel / Netlify (React SPA)
        │
        ▼
 Railway / Render (PHP API)
        │
 ├── Railway MySQL / PlanetScale (Database — MySQL-compatible, no dialect rewrite)
 ├── Supabase Storage / Cloudinary (File Storage only — NOT Supabase's Postgres DB)
 ├── Resend / Mailgun (email)
 ├── Semaphore / Vonage (SMS)
 └── PayMongo (payment gateway — unchanged)
```

---

## 3. Service Mapping: Self-Hosted → SaaS Replacement

### 3.1 Database — MySQL / MariaDB

| Attribute | Self-Hosted (XAMPP MySQL) | SaaS (Railway MySQL / PlanetScale) |
|---|---|---|
| **Provider** | MariaDB 10.x on localhost | Railway MySQL plugin or PlanetScale (MySQL-compatible) |
| **Schema changes** | Direct SQL migration scripts | Same migration scripts via the platform's SQL console |
| **Connection** | `$conn = new mysqli('localhost', ...)` | Same `mysqli` driver — only host/credentials change |
| **Auth headers** | No change | No change |
| **File storage** | Local `/uploads/` directory | See §3.7 — Supabase Storage or Cloudinary (storage only, not the database) |
| **Cost (Free tier)** | Free (own hardware) | Railway: included in $5/mo hobby plan · PlanetScale: free up to 5 GB |
| **Backup** | Manual | Railway: daily snapshots · PlanetScale: automatic |
| **Migration effort** | None | **Low** — export with `mysqldump`, import to Railway MySQL. No dialect change needed |

> [!WARNING]
> **Do not use Supabase as the database.** Supabase's DB is PostgreSQL, not MySQL, and this codebase's `mysqli` driver + hand-written SQL would need a rewrite. Key differences that would break existing PHP queries if you went this route anyway:
> - `AUTO_INCREMENT` → `SERIAL` or `GENERATED ALWAYS AS IDENTITY`
> - `TINYINT(1)` for booleans → native `BOOLEAN`
> - String concatenation: `CONCAT()` → `||` operator
> - `DATE_FORMAT()` → `TO_CHAR()`
> - JSON validation: `CHECK (json_valid(...))` → `jsonb` type
>
> Use **Railway MySQL** or **PlanetScale** instead — both are MySQL-compatible and need zero query changes. Supabase is still a fine choice for *file storage* (§3.7); just don't route the database through it.

---

### 3.2 PHP API Backend

| Attribute | Self-Hosted (XAMPP Apache) | SaaS (Railway / Render) |
|---|---|---|
| **Provider** | Apache 2.4 + PHP 8 on localhost | Railway (PHP via Nixpacks) or Render (Docker) |
| **Deployment** | Copy files to `/htdocs/` | Push to GitHub → auto-deploy |
| **Config** | `.env` or `config.php` hardcoded | Environment variables in platform dashboard |
| **File uploads** | `move_uploaded_file()` to local disk | Must redirect to external storage (Supabase Storage or Cloudinary) |
| **Cost (Free tier)** | Free (own hardware) | Railway: $5/mo credit (hobby). Render: free tier with cold starts |
| **Cold starts** | None | Render free tier sleeps after 15 min inactivity — 30–60s wakeup delay |
| **Custom domain** | Requires router port-forwarding | Built-in custom domain support |

> [!IMPORTANT]
> File upload paths hardcoded as `/backend/uploads/...` will break in cloud environments. Before migrating, abstract all file storage behind a PHP function so the storage target (local vs. cloud) can be swapped via a single config flag.

---

### 3.3 React SPA (Frontend)

| Attribute | Self-Hosted (Apache serves `/dist`) | SaaS (Vercel / Netlify) |
|---|---|---|
| **Provider** | Apache static file serving | Vercel or Netlify CDN |
| **Deploy method** | Copy `/dist` to `/htdocs/ApartmentManagementSystem_React/ams-react/dist/` | `npm run build` → `vercel --prod` or GitHub auto-deploy |
| **HTTPS** | Manual (Let's Encrypt or self-signed) | Automatic (free TLS) |
| **Global CDN** | None — single home IP | Yes — edge nodes worldwide |
| **Downtime risk** | High (home internet, power, router) | Very low (99.99% SLA) |
| **Cost** | Free (own hardware) | Free (Vercel Hobby / Netlify Free) |
| **`axiosConfig.js` base URL** | `http://homeserver.local/ApartmentManagementSystem_React/backend/api/` | `https://ams-api.railway.app/` |

---

### 3.4 Email Notifications — PHPMailer + Gmail SMTP

| Attribute | Self-Hosted (PHPMailer + Gmail SMTP) | SaaS (Resend / Mailgun) |
|---|---|---|
| **Provider** | Gmail SMTP relay | Resend.com or Mailgun |
| **Free tier** | 500 emails/day (Gmail limit) | Resend: 3,000/mo free. Mailgun: 100/day free |
| **Setup** | Gmail app password + Less Secure App toggle | API key only; no SMTP config |
| **Code change** | None on self-hosted | Swap PHPMailer transport to API call (or PHPMailer still works via Resend SMTP) |
| **Deliverability** | Low — Gmail SMTP from home IP often spam-flagged | High — dedicated sending domain + SPF/DKIM |
| **Reliability** | Depends on home internet uptime | 99.9% SLA |
| **Sender domain** | `gmail.com` (looks personal) | Custom domain (`noreply@yourapartment.com`) |
| **Cost at scale** | Free but limited and unreliable | Resend: $20/mo for 50k emails |

> [!TIP]
> **Recommendation:** Use Resend.com even on the self-hosted setup. PHPMailer supports Resend's SMTP relay. This removes Gmail's 500/day cap and spam risk without requiring a new deployment.

---

### 3.5 SMS Notifications — Semaphore API

| Attribute | Self-Hosted (Semaphore PH) | SaaS Alternative (Vonage / Twilio) |
|---|---|---|
| **Provider** | Semaphore (Philippines) | Vonage (global) or Twilio (global) |
| **Target market** | PH local numbers — best delivery rates | Global, but PH delivery rates vary |
| **Free credits** | ₱50 trial credits | $10 trial credits (Twilio) |
| **Cost per SMS** | ₱0.50–₱1.00 per message | ~$0.05 USD (~₱2.80) per message |
| **Integration** | `cURL POST` to `https://api.semaphore.co/api/v4/messages` | `cURL POST` to Vonage/Twilio API (different URL + auth) |
| **Code change** | None — already external | Endpoint + auth header change only |
| **Uptime dependency** | Semaphore API (external) | Vonage/Twilio (external) |

> [!NOTE]
> SMS is already an external API call on both deployment models. **This service does not change** between self-hosted and full SaaS. Semaphore is the better choice for a Philippine-based apartment system due to local carrier relationships and pricing.

---

### 3.6 Payment Gateway — PayMongo

| Attribute | Self-Hosted | SaaS |
|---|---|---|
| **Provider** | PayMongo (test mode) | PayMongo (production mode) |
| **Code change** | None | None |
| **Webhook endpoint** | Requires public IP or ngrok tunnel | Public URL available immediately |
| **Production mode** | Requires PayMongo business verification | Same |
| **Cost** | 2.9% + ₱15 per transaction (production) | Same |

> [!IMPORTANT]
> PayMongo **webhooks require a publicly accessible URL**. On the home server, this means setting up port forwarding (port 80/443) on the router and a dynamic DNS service (e.g., No-IP or DuckDNS). On SaaS hosting, the API URL is already public with no router configuration required. This is one of the most compelling reasons to use cloud hosting for production payment processing.

---

### 3.7 File Storage (Uploads: IDs, Payment Proofs, Photos)

| Attribute | Self-Hosted (Local Disk) | SaaS (Supabase Storage / Cloudinary) |
|---|---|---|
| **Storage path** | `backend/uploads/` directories | Supabase Storage bucket or Cloudinary cloud |
| **Access URL** | `http://server-ip/ApartmentManagementSystem_React/backend/uploads/filename.jpg` | `https://xxxx.supabase.co/storage/v1/object/public/uploads/filename.jpg` |
| **Backup** | Manual | Automatic (Supabase) |
| **Max size** | Limited by hard drive | Supabase: 1 GB free. Cloudinary: 25 GB free |
| **CDN delivery** | None | Yes (Cloudinary has global CDN) |
| **Code change** | None | `move_uploaded_file()` → `supabase_upload()` wrapper |

---

## 4. Side-by-Side Comparison: Self-Hosted vs. Full SaaS

| Dimension | Self-Hosted (XAMPP Home Server) | Full SaaS Stack |
|---|---|---|
| **Uptime** | Depends on home power + internet. Typical: 95–98% | 99.9%+ (provider SLA) |
| **Cost** | Near zero (electricity only) | $0–$15/mo on free tiers; $30–$80/mo at production scale |
| **Setup complexity** | High — port forwarding, DDNS, SSL, Apache config | Low — GitHub push deploys, auto HTTPS |
| **PHP compatibility** | Full control (any PHP version, any extension) | Limited to provider-supported images (Railway is flexible) |
| **MySQL dialect** | Native | PlanetScale = native MySQL. Supabase = PostgreSQL (migration needed) |
| **File uploads** | Simple `move_uploaded_file()` | Requires storage SDK integration |
| **Webhooks (PayMongo)** | Requires port forwarding + public IP | Works out of the box |
| **Email deliverability** | Low (Gmail SMTP from home IP) | High (Resend / Mailgun with SPF/DKIM) |
| **SMS** | Unchanged (Semaphore API) | Unchanged (Semaphore API) |
| **HTTPS / TLS** | Manual (Certbot / Let's Encrypt) | Automatic |
| **DDoS protection** | None | Cloudflare / provider-level (Vercel, Render) |
| **Data sovereignty** | Full — data stays on your hardware | Data in provider data centers (may be overseas) |
| **Team access** | Must VPN into home network | Public URL — accessible anywhere |
| **Recovery time** | High — requires physical access | Minutes — redeploy from Git |
| **Maintenance burden** | High — OS updates, router config, power management | Low — managed infrastructure |
| **Scalability** | Capped by home hardware | On-demand (upgrade plan) |

---

## 5. Risk Assessment

### Self-Hosted Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Home internet outage | High | Full downtime | None without redundancy |
| Power failure | Medium | Full downtime | UPS battery backup |
| Router/firewall blocks port | Medium | Inaccessible externally | DDNS + consistent port config |
| ISP changes public IP | High | Breaks all external links | Dynamic DNS (No-IP, DuckDNS) |
| Hard drive failure | Low | Data loss | Scheduled off-site backups |
| Security breach (open port) | Medium | Data exposure | Firewall rules + regular updates |
| PayMongo webhook failure | High | Payments not confirmed | Requires ngrok tunnel in dev; proper port forward in prod |

### SaaS Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Free tier limits hit | Medium | Service degraded | Monitor usage; upgrade plan |
| Provider pricing change | Low | Cost increase | Export data; use open standards |
| Cold start latency (Render free) | High | Slow first request | Use Railway paid tier or always-on |
| PostgreSQL migration breaks queries | High | Broken API | Thorough testing; use PlanetScale instead |
| Data stored overseas | Certain | Compliance concern (if sensitive) | Review provider DPA |

---

## 6. Recommended Migration Path (If Home Server Fails)

If the home server goes down and a full SaaS migration is needed, execute in this order:

### Phase 1 — Database (Day 1)

1. Export MySQL dump: `mysqldump -u root ams_db > ams_backup.sql`
2. Provision a **Railway** instance with a MySQL plugin (avoids PostgreSQL migration).
3. Import dump: `mysql -u user -p ams_db < ams_backup.sql`
4. Update `config.php` DB credentials to point to Railway host.

### Phase 2 — PHP API (Day 1–2)

1. Push `backend/api/` to GitHub.
2. Deploy to Railway or Render with PHP build pack.
3. Set environment variables (DB credentials, API keys) in the platform dashboard.
4. Update `ams-react/src/api/axiosConfig.js` base URL to the new API URL.

### Phase 3 — React SPA (Day 2)

1. Run `npm run build` in `ams-react/`.
2. Deploy `/dist` to Vercel or Netlify.
3. Set `VITE_API_BASE_URL` environment variable in the Vercel dashboard.

### Phase 4 — File Storage (Day 2–3)

1. Provision a Supabase Storage bucket or Cloudinary account.
2. Upload existing files from the local `backend/uploads/` directory.
3. Wrap `move_uploaded_file()` calls behind a `store_file()` helper that routes to cloud storage.
4. Update any hardcoded file path references to use the new storage URL.

### Phase 5 — Email (Day 1 — Parallel)

1. Create a Resend.com account (free tier: 3,000 emails/mo).
2. Generate API key.
3. Update PHPMailer config to use Resend SMTP (`smtp.resend.com`, port 465).
4. No other code changes required.

### Phase 6 — Webhooks / PayMongo (Day 3)

1. Register the new public API URL as the PayMongo webhook endpoint.
2. Test a sandbox payment end-to-end.

---

## 7. Recommended Provider Stack

| Service | Recommended Provider | Tier | Est. Cost/Month |
|---|---|---|---|
| **Frontend (React)** | Vercel | Hobby (free) | ₱0 |
| **PHP API** | Railway | Hobby ($5 credit/mo) | ~₱0–₱280 |
| **Database** | Railway MySQL plugin | Included in plan | ₱0 |
| **File Storage** | Supabase Storage | Free (1 GB) | ₱0 |
| **Email** | Resend.com | Free (3,000/mo) | ₱0 |
| **SMS** | Semaphore | Pay-per-use | ₱0.50–₱1.00/msg |
| **Payment** | PayMongo | Per-transaction | 2.9% + ₱15/txn |
| **Total (light usage)** | — | — | **~₱0–₱560/mo** |

---

## 8. Decision Summary

| Scenario | Recommended Deployment |
|---|---|
| Demo / panelist presentation only | Self-hosted XAMPP (full control, zero cost, LAN accessible) |
| Production with home server available | Self-hosted + Resend email + Semaphore SMS (already external) |
| Home server fails or unreliable | Railway (API + DB) + Vercel (frontend) + Resend (email) |
| Long-term production (>50 tenants) | Dedicated VPS (DigitalOcean, Hetzner) with MySQL + Caddy |

> [!CAUTION]
> Do **not** use the Render.com free tier for production. Cold starts (30–60 second delays after inactivity) will make the system appear broken to tenants trying to log in after a period of no activity. Use Railway's always-on hobby plan instead.
