# CI/CD Pipeline — Apartment Management System

> Continuous Integration & Continuous Deployment strategy for the AMS project.
> Stack: **React 19 + Vite 8** frontend, **PHP 8 REST API** backend, **MySQL/MariaDB** database.

> ⚠️ **Verified against the repo (Sept 2026) before adopting this as-is:**
> - `npm run lint` is clean (0 errors) as of the September 2026 lint-backlog cleanup. `.github/workflows/ci.yml`'s lint step is a real, blocking check — `continue-on-error` was removed once the backlog was cleared. See [Known Gaps & Fixes](#known-gaps--fixes-before-adopting-this-as-is) below.
> - Local dev (XAMPP) and `backend/api/migrations/SetupDB.sql` are **MariaDB**, not MySQL — the Database Job below has been updated to use `mariadb:10.11` instead of `mysql:8.0` for this reason (the file uses `ADD COLUMN IF NOT EXISTS`, a MariaDB-only extension that real MySQL rejects). This job, plus a live-endpoint smoke-test job and PHPStan in the backend job, are wired up in `.github/workflows/ci.yml`.
> - This project has **20 commits, 100% pushed directly to `main`, no PRs opened, no other branch ever created**. The "Git Branching Strategy" section below is a genuine workflow change, not just a config change — read it with that in mind before flipping on branch protection.
>
> Everything else in this document — the 80-endpoint PHP syntax check, the stack versions, the deployment target guidance — was verified accurate against the current codebase.

> ⚠️ **Dropped (2026-09-20):** the Railway/SaaS deployment target is no longer part of the plan — the project is deployed locally (self-hosted XAMPP) only. [Phase 2](#phase-2--continuous-deployment-cd)'s SaaS deployment target and all of [Phase 3](#phase-3--dual-target-deployment-self-hosted-production--saas-parallel-fallback) (dual-target/SaaS-parallel-fallback CD) are historical and should not be followed. [Phase 1](#phase-1--continuous-integration-ci) (CI: lint, build, PHP syntax/PHPStan, the mariadb-based DB job) remains accurate and in effect via `.github/workflows/ci.yml`.
>
> 🔗 **Deployment architecture context (historical):** this document originally assumed the dual-environment strategy defined in [`saas_fallback_strategy.md`](saas_fallback_strategy.md) (self-hosted XAMPP home server as production, SaaS stack as fallback) and the per-service self-hosted/SaaS mapping in [`external_services.md`](../documentation/external_services.md). [Phase 3](#phase-3--dual-target-deployment-self-hosted-production--saas-parallel-fallback) wired those two documents' recommendations into a CD workflow that deployed to **both** targets in parallel — dropped along with the SaaS stack.

---

## Table of Contents

- [Why CI/CD for This Project](#why-cicd-for-this-project)
- [Known Gaps & Fixes Before Adopting This As-Is](#known-gaps--fixes-before-adopting-this-as-is)
- [Pipeline Overview](#pipeline-overview)
- [Git Branching Strategy](#git-branching-strategy)
- [Phase 1 — Continuous Integration (CI)](#phase-1--continuous-integration-ci)
  - [CI Workflow File](#ci-workflow-file)
  - [What Each Job Does](#what-each-job-does)
- [Phase 2 — Continuous Deployment (CD)](#phase-2--continuous-deployment-cd)
  - [CD Workflow File](#cd-workflow-file)
  - [Deployment Targets](#deployment-targets)
- [Phase 3 — Dual-Target Deployment: Self-Hosted Production + SaaS Parallel Fallback](#phase-3--dual-target-deployment-self-hosted-production--saas-parallel-fallback)
  - [Reaching the Home Server From GitHub Actions](#31-reaching-the-home-server-from-github-actions-without-opening-inbound-ports)
  - [The Dual-Target Workflow File](#32-the-dual-target-workflow-file)
  - [External Services Are Shared Dependencies — Configure Per Environment](#33-external-services-are-shared-dependencies-not-infrastructure--configure-per-environment)
  - [GitHub Secrets Required](#34-github-secrets-required)
  - [Keeping Data in Sync (Optional Stretch)](#35-keeping-data-in-sync-optional-stretch)
  - [When to Cut Over for Real](#36-when-to-cut-over-for-real)
- [Local Development vs CI Environment](#local-development-vs-ci-environment)
- [Adding Tests](#adding-tests)
- [GitHub Actions Cheat Sheet](#github-actions-cheat-sheet)
- [Adoption Roadmap](#adoption-roadmap)

---

## Why CI/CD for This Project

The goal is **not** to automate everything for the sake of buzzwords. The goal is to solve a real development problem:

> *"Every time we push changes, GitHub automatically verifies that the React frontend and PHP backend still work before we merge."*

For a capstone with 80+ PHP endpoints and 30+ React pages, a broken import or a PHP syntax error can easily slip through. CI catches those **before** they reach the `main` branch.

| Without CI | With CI |
|---|---|
| "It works on my machine" | Build verified on a clean environment |
| Broken code merged to `main` | Merge blocked until all checks pass |
| Manual testing only | Automated lint, build, and syntax checks on every push |
| No visibility into code quality | Status badges and check results on every PR |

---

## Known Gaps & Fixes Before Adopting This As-Is

This section documents three things that were checked against the live repo and don't match what the rest of this document originally assumed. Read this before running the Week 1 checklist.

### 1. Lint backlog cleared — the lint step is now a required, blocking check

`npm run lint` used to report 191 problems (178 errors), mostly a repo-wide `'React' is defined but never used` pattern (leftover default imports under the new JSX transform) plus ~40 React Compiler ESLint rule violations (`react-hooks/immutability`: a fetch function used in a `useEffect` above the point it was declared; `react-hooks/set-state-in-effect`: state set synchronously in an effect body before the first `await`). Those were cleared in September 2026:

- Unused `React` and icon imports were removed (the new JSX transform doesn't need the default `React` import).
- Effects that call a `fetch*` helper declared later in the component were reordered so the helper is declared first, or the fetch was wrapped in an inline `async` function inside the effect.
- Effects that set state synchronously before their first `await` (loading flags, filter-derived resets) were rewritten to derive that state from render-time values instead, or to set it in the event handler that triggers the fetch rather than in the effect.
- Two small dead-code cleanups fell out of this pass: `AdminPayments.jsx`'s unused ad-hoc payment-history editor (`showEditHistoryModal`/`handleSaveHistory`, dead since nothing wired it to a save endpoint — tracked separately as `M10`) and an unused `pendingReviewCount` in `AdminTenants.jsx`.

`.github/workflows/ci.yml`'s lint step no longer has `continue-on-error` — a red lint run now fails the `frontend` job.

One bug that was worth fixing regardless of CI has already been fixed: `ams-react/src/config/i18n.js` defined `'payBills.heading'` and `'payBills.subtext'` twice in the same object. In a JS object literal the second definition silently wins — the first pair ("Payment Processing Portal" / "instant validation" copy) was dead code that could never render. `no-dupe-keys` flagged this exact case; the dead pair has been deleted, which is reflected in the lower problem count above.

### 2. The Database Job's proposed image (`mysql:8.0`) doesn't match the project's actual database engine

`backend/api/migrations/SetupDB.sql` is a **MariaDB** dump (its own header says `-- MariaDB dump 10.19 ... Server version 10.4.32-MariaDB`), and local XAMPP confirms the same — `mysql --version` reports `Distrib 10.4.32-MariaDB`, not MySQL. The file relies on a MariaDB-only extension:

```sql
ALTER TABLE `notifications` ADD COLUMN IF NOT EXISTS `status` varchar(20) DEFAULT 'Pending';
ALTER TABLE `notifications` ADD COLUMN IF NOT EXISTS `metadata_value` varchar(255) DEFAULT NULL;
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `services` decimal(10,2) NOT NULL DEFAULT 0.00 AFTER `parking`;
```

`ADD COLUMN IF NOT EXISTS` is **not valid syntax in real MySQL** (including the `mysql:8.0` Docker image the original plan proposed) — only MariaDB supports it. Importing this file against a genuine MySQL service container throws a SQL syntax error on those three lines, so the Database Job would fail on its very first run — not because the schema is broken, but because it's being validated against the wrong engine.

**Fix:** use a MariaDB service image instead, matching local dev exactly:

```yaml
services:
  mariadb:
    image: mariadb:10.11
    env:
      MARIADB_ROOT_PASSWORD: root
      MARIADB_DATABASE: ams_db
    ports:
      - 3306:3306
    options: >-
      --health-cmd="healthcheck.sh --connect --innodb_initialized"
      --health-interval=10s
      --health-timeout=5s
      --health-retries=5
```

The full corrected job is in the [CI Workflow File](#ci-workflow-file) below — the `mysql` service block there has already been swapped for `mariadb`.

### 3. Pin the Node version precisely

`ams-react`'s installed `vite` (`^8.1.1`) and `eslint` (`^10.6.0`) both declare a minimum engine of `^20.19.0 || >=22.12.0` / `^20.19.0 || ^22.13.0 || >=24`. A bare `node-version: 20` in `actions/setup-node` will most likely resolve high enough today, but it isn't pinned to guarantee it — prefer an explicit `20.19` (or jump straight to `22`) so a future minor-version resolution can't silently drop below the floor these packages require. Already applied in the workflow below.

### What's already correct and safe to adopt today

Everything else here was verified against the repo and holds up:
- Stack versions (React `^19.2.7`, Vite `^8.1.1`, PHP 8) are accurate.
- **All 80 files** in `backend/api/` pass `php -l` right now — the Backend Job is ready to adopt unchanged.
- `DB_NAME` in `backend/config.php` defaults to `ams_db`, matching the Database Job's env var.
- `ams-react/package-lock.json` exists, so the `cache-dependency-path` in the workflow is correct.
- No test suite exists anywhere in the repo yet, so the [Adding Tests](#adding-tests) section is correctly scoped as "build from scratch," not "fix broken tests."
- The [Deployment Targets](#deployment-targets) table is honest about Vercel/GitHub Pages being frontend-only (❌ for backend/DB) — you cannot run PHP or MySQL on either.

---

## Pipeline Overview

### CI Pipeline (runs on every push & pull request)

```
Developer pushes code
         ↓
    GitHub Actions
         │
         ├── 🟦 Frontend Job
         │   ├── npm ci
         │   ├── ESLint (lint)
         │   ├── Vite build
         │   └── Unit tests (when added)
         │
         ├── 🟩 Backend Job
         │   ├── PHP syntax check (all 80+ endpoints)
         │   ├── PHPStan static analysis (optional)
         │   └── PHPUnit tests (when added)
         │
         └── 🟨 Database Job (stretch goal)
             ├── Start MySQL service
             ├── Import SetupDB.sql
             └── Validate schema
```

### CD Pipeline (runs only on merge to `main`, after CI passes)

```
main branch updated
        ↓
   CI passes ✅
        ↓
   Build production assets
        ↓
        ├── 🏠 Deploy to self-hosted home server (production, source of truth for tenant data)
        │
        └── ☁️  Deploy to SaaS parallel stack (Vercel + Railway — warm fallback / public demo mirror)
```

> This two-target branch is the [Phase 3](#phase-3--dual-target-deployment-self-hosted-production--saas-parallel-fallback) model. If you haven't set up the SaaS side yet, the single-target [Phase 2](#phase-2--continuous-deployment-cd) workflow below is still a complete, valid CD pipeline on its own — Phase 3 is additive.

---

## Git Branching Strategy

> [!IMPORTANT]
> **Adopted rule (decided 2026-09-16) — this overrides the "never push directly to `main`" rule below.** This is a personal private repo, so:
> - **Bug fixes and routine work** are committed and pushed straight to `main`.
> - **Big implementations** (e.g. the chat module, SaaS/deployment integration, a new module) are built on a `feature/<name>` branch and merged into `main` once verified.
> - CI stays a safety net: its results are visible on every push, but `main` has **no** "require a pull request" or "require status checks" protection, because either would block direct pushes.
>
> The rest of this section describes the full PR model, kept for reference in case the team grows.

> **Note:** this is a behavior change, not just a config change. `git log` on this repo shows 20 commits, all pushed directly to `main`, no pull requests ever opened, and no branch other than `main` created. Adopting the model below means changing how you actually work day-to-day — it's not something the CI workflow file enables by itself. If you'd rather keep pushing straight to `main` and use CI purely as a safety net, that's a legitimate choice too (see the Week 2 note in the [Adoption Roadmap](#adoption-roadmap)); just don't enable "require a pull request before merging" if so, since that setting would block your own pushes.

Adopt a simple feature-branch workflow:

```
main (protected — requires PR + passing CI)
  │
  ├── feature/payment-upload
  ├── feature/visitor-qr-code
  ├── fix/dashboard-stats-query
  └── fix/login-session-handling
```

### Rules

1. **Never push directly to `main`.** All changes go through a pull request.
2. **Branch names use prefixes:** `feature/`, `fix/`, `docs/`, `refactor/`.
3. **CI must pass before merging.** Enable branch protection rules on `main`:
   - ✅ Require status checks to pass before merging
   - ✅ Require pull request reviews (optional for solo work)
4. **Delete branches after merge** to keep the repository clean.

### Workflow Example

```
1.  git checkout -b feature/parking-reservation
2.  # ... make changes ...
3.  git add . && git commit -m "feat: add parking slot reservation"
4.  git push origin feature/parking-reservation
5.  # Open Pull Request on GitHub
6.  # GitHub Actions runs CI ← automatic
7.  # All checks pass ✅ → merge to main
```

---

## Phase 1 — Continuous Integration (CI)

Start here. This is the highest-value, lowest-effort step.

### CI Workflow File

Create this file at `.github/workflows/ci.yml` in your repository:

```yaml
# .github/workflows/ci.yml
# Continuous Integration for AMS — React + PHP + MySQL

name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  # ──────────────────────────────────────────────
  # Job 1: Frontend — React 19 + Vite 8
  # ──────────────────────────────────────────────
  frontend:
    name: Frontend (Lint & Build)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ams-react

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20.19"   # matches Vite 8 / ESLint 10's declared engine floor — don't loosen to a bare "20"
          cache: npm
          cache-dependency-path: ams-react/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint
        # De-risk this while the existing 216-error backlog is being cleared (see
        # "Known Gaps & Fixes" above). Remove this line once `npm run lint` exits
        # clean locally — that's the signal this check is safe to make required.
        continue-on-error: true

      - name: Build production bundle
        run: npm run build

      # Uncomment when you add tests:
      # - name: Run tests
      #   run: npm test

  # ──────────────────────────────────────────────
  # Job 2: Backend — PHP 8 Syntax & Analysis
  # ──────────────────────────────────────────────
  backend:
    name: Backend (PHP Checks)
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: "8.2"
          extensions: mysqli, pdo, pdo_mysql, fileinfo, mbstring
          coverage: none

      - name: PHP syntax check (all files)
        run: |
          echo "Checking PHP syntax across all backend files..."
          error_count=0
          while IFS= read -r file; do
            if ! php -l "$file" > /dev/null 2>&1; then
              php -l "$file"
              error_count=$((error_count + 1))
            fi
          done < <(find backend/ -name "*.php" -type f)

          if [ $error_count -gt 0 ]; then
            echo "❌ Found $error_count file(s) with syntax errors."
            exit 1
          else
            echo "✅ All PHP files passed syntax check."
          fi

      # Optional: Static analysis with PHPStan
      # Uncomment after installing PHPStan (composer require --dev phpstan/phpstan)
      # - name: Run PHPStan
      #   run: vendor/bin/phpstan analyse backend/ --level=5

  # ──────────────────────────────────────────────
  # Job 3: Database — Schema Validation
  # (Stretch goal — validates that SQL migrations
  #  can be imported cleanly into a fresh database)
  #
  # NOTE: uses a MariaDB service, not MySQL. SetupDB.sql is a MariaDB dump
  # (confirmed via its own header and local XAMPP's `mysql --version`) and
  # relies on `ADD COLUMN IF NOT EXISTS`, a MariaDB-only extension that real
  # MySQL — including the mysql:8.0 image — rejects with a syntax error.
  # Using mariadb:10.11 here matches local dev exactly.
  # ──────────────────────────────────────────────
  database:
    name: Database (Schema Validation)
    runs-on: ubuntu-latest

    services:
      mariadb:
        image: mariadb:10.11
        env:
          MARIADB_ROOT_PASSWORD: root
          MARIADB_DATABASE: ams_db
        ports:
          - 3306:3306
        options: >-
          --health-cmd="healthcheck.sh --connect --innodb_initialized"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Wait for MariaDB to be ready
        run: |
          until mysqladmin ping -h 127.0.0.1 -u root -proot --silent; do
            echo "Waiting for MariaDB..."
            sleep 2
          done

      - name: Import schema (SetupDB.sql)
        run: |
          mysql -h 127.0.0.1 -u root -proot ams_db < backend/api/migrations/SetupDB.sql
          echo "✅ Schema imported successfully."

      - name: Validate table count
        run: |
          TABLE_COUNT=$(mysql -h 127.0.0.1 -u root -proot -N -e \
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'ams_db';")
          echo "📊 Tables created: $TABLE_COUNT"
          if [ "$TABLE_COUNT" -lt 5 ]; then
            echo "❌ Expected at least 5 tables, got $TABLE_COUNT"
            exit 1
          fi
          echo "✅ Schema validation passed."
```

### What Each Job Does

#### 🟦 Frontend Job

| Step | Purpose |
|---|---|
| `npm ci` | Clean install from lockfile — guarantees reproducible builds |
| `npm run lint` | Runs your existing ESLint config (`eslint.config.js`) to catch unused variables, missing imports, React hook violations |
| `npm run build` | Vite production build — catches JSX syntax errors, broken imports, missing modules |

If any step fails, the entire job fails, and the PR is blocked from merging.

#### 🟩 Backend Job

| Step | Purpose |
|---|---|
| `php -l` on all files | Catches syntax errors (missing semicolons, unclosed brackets, invalid PHP) across all 80+ endpoint files |
| PHPStan (`phpstan.neon`, level 0) | Static analysis — finds type errors, undefined variables, dead code. Pinned to `phpVersion: 80000` to match production PHP 8.0 rather than the CI image's 8.2; a `phpstan-baseline.neon` ignores 7 pre-existing findings caused by this codebase's endpoint-local `function fail(...)` name reuse (see Week 3 above) |

This is particularly valuable because PHP doesn't have a "compile" step. A syntax error in `get_report_data.php` won't surface until someone actually hits that endpoint — CI catches it immediately.

#### 🟨 Database Job

| Step | Purpose |
|---|---|
| Start MariaDB 10.11 service | Spins up a real MariaDB instance inside the GitHub Actions runner — matches local XAMPP and `SetupDB.sql`'s own dialect (see [Known Gaps & Fixes](#known-gaps--fixes-before-adopting-this-as-is)) |
| Import `SetupDB.sql` | Verifies the schema SQL is valid and can create all tables from scratch |
| Validate table count | Sanity check that the expected tables were created |
| Import `seed_mock_data.sql`, then `seed_reset.sql`, then re-import | Proves the demo seed and its reset script stay in sync with each other and can round-trip |
| Import `clear_and_seed.sql` | Proves it restores exactly the `SetupDB.sql` defaults (1 admin, 14 rooms, service catalog, settings) without dropping any table |
| Apply every `2026_09_*.sql` upgrade migration | Proves the idempotent upgrade migrations still apply cleanly on top of a fresh schema |

This catches issues like:
- Broken foreign key references
- SQL syntax errors in migration files
- Missing table definitions
- The seed and reset scripts drifting out of sync with each other (the exact failure mode that caused `clear_and_seed.sql`/`seed_reset.sql` to go stale before their September 2026 rewrite — see `database_schema.md`)

#### 🟪 Smoke-Test Job

| Step | Purpose |
|---|---|
| Seed schema + demo data, boot `php -S` | Runs the real backend against a real database, the same way XAMPP does, instead of just checking syntax |
| Hit unauthenticated `get_*.php` endpoints | Catches a bad `JOIN` or wrong bind-param type that only surfaces at request time, not at `php -l` |
| Log in as the seeded admin, hit an authenticated endpoint with the returned Bearer token | Exercises the session/auth path (`require_admin`, `config.php`'s session lookup) end to end |

---

## Phase 2 — Continuous Deployment (CD)

> **Important:** Only implement this after CI is stable and green.

### CD Workflow File

Create `.github/workflows/deploy.yml`:

```yaml
# .github/workflows/deploy.yml
# Continuous Deployment — only runs after CI passes on main

name: Deploy

on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20.19"
          cache: npm
          cache-dependency-path: ams-react/package-lock.json

      - name: Install & build frontend
        working-directory: ams-react
        run: |
          npm ci
          npm run build

      # ── Option A: Deploy to a VPS via SSH ──
      # Uncomment and configure for your server:
      #
      # - name: Deploy via SSH
      #   uses: appleboy/ssh-action@v1
      #   with:
      #     host: ${{ secrets.SERVER_HOST }}
      #     username: ${{ secrets.SERVER_USER }}
      #     key: ${{ secrets.SERVER_SSH_KEY }}
      #     script: |
      #       cd /var/www/ams
      #       git pull origin main
      #       cd ams-react && npm ci && npm run build

      # ── Option B: Deploy frontend to GitHub Pages ──
      # Good for demo purposes — only deploys the static React build.
      #
      # - name: Deploy to GitHub Pages
      #   uses: peaceiris/actions-gh-pages@v3
      #   with:
      #     github_token: ${{ secrets.GITHUB_TOKEN }}
      #     publish_dir: ams-react/dist

      # ── Option C: Deploy to Vercel (frontend only) ──
      # Free tier works well for capstone demos.
      #
      # - name: Deploy to Vercel
      #   uses: amondnet/vercel-action@v25
      #   with:
      #     vercel-token: ${{ secrets.VERCEL_TOKEN }}
      #     vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
      #     vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
      #     working-directory: ams-react

      - name: Deployment placeholder
        run: echo "✅ Build succeeded. Configure a deployment target above."
```

### Deployment Targets

| Target | Best For | Frontend | Backend | Database | Cost |
|---|---|---|---|---|---|
| **GitHub Pages** | Demo/presentation | ✅ | ❌ | ❌ | Free |
| **Vercel** | Frontend demo | ✅ | ❌ | ❌ | Free tier |
| **Shared hosting (cPanel)** | Full stack | ✅ | ✅ | ✅ | ~$3–10/mo |
| **VPS (DigitalOcean, etc.)** | Full stack + control | ✅ | ✅ | ✅ | ~$5–12/mo |
| **Railway / Render** | Full stack, managed | ✅ | ✅ | ✅ | Free tier available |

> **Recommendation for capstone:** Deploy the React frontend to **Vercel** (free, instant) and the PHP backend + MySQL to a **shared hosting** or **Railway**. This gives you a real production URL to demo without server management overhead.

---

## Phase 3 — Dual-Target Deployment: Self-Hosted Production + SaaS Parallel Fallback

> Only take this on after Phase 1 (CI) is green and Phase 2 (single-target CD) works. This phase is additive, not a replacement.

`saas_fallback_strategy.md` treats the SaaS stack as a **break-glass procedure** — something you migrate to manually, over a few days, only after the home server has already failed. That's a reasonable minimum, but it means the fallback path is untested until the day you actually need it under pressure.

This phase turns it into a **parallel deployment**: every push to `main` that passes CI deploys to the self-hosted home server (still the authoritative production environment) **and** to the SaaS stack from `saas_fallback_strategy.md` §7 / `external_services.md` §5 (Vercel + Railway) at the same time. The fallback is now a live, continuously-deployed environment instead of a runbook you hope works.

```
                              CI passes on main
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                  ▼
       🏠 deploy-self-hosted                 ☁️  deploy-saas-parallel
       (self-hosted GitHub Actions           (Vercel frontend +
        runner on the home server)            Railway API + Railway MySQL)
                    │                                  │
          Production traffic,                 Public demo URL / warm
          authoritative tenant data            standby with its OWN
                                                 independent database
```

**What "parallel" does *not* mean here:** the two environments do not share a live database. They are independent deployments of the same codebase against two different MariaDB/MySQL instances. Data entered through the self-hosted portal will not appear on the SaaS mirror unless you deliberately sync it (§3.5). For a capstone, that's usually fine — the SaaS mirror exists to (a) give panelists/evaluators a URL that doesn't depend on your home network being up, and (b) prove the fallback actually deploys cleanly, continuously, rather than only being tested once during a real outage.

### 3.1 Reaching the Home Server From GitHub Actions (without opening inbound ports)

`saas_fallback_strategy.md`'s own risk table flags this exact problem: *"Router/firewall blocks port"* and *"ISP changes public IP"* are both listed as likely risks for the self-hosted side. A GitHub-hosted runner pushing over SSH (the commented-out "Option A" in the Phase 2 workflow above) needs the home server to accept **inbound** SSH from the internet — that means port-forwarding SSH (22) on your router and keeping a dynamic DNS record current, which is both a security exposure and a single point of failure that mirrors the exact fragility this whole document is trying to route around.

**Use a self-hosted GitHub Actions runner instead.** It flips the connection direction: the runner lives on the home server and polls GitHub over an *outbound* HTTPS connection — no inbound port ever needs to open.

```
GitHub Settings → Actions → Runners → New self-hosted runner
# follow the generated commands, e.g. on the home server:

# Linux / macOS
./config.sh --url https://github.com/<you>/ApartmentManagementSystem_React --token <REGISTRATION_TOKEN>
sudo ./svc.sh install && sudo ./svc.sh start

# Windows (this repo's dev machine is Windows — likely also the home server's OS)
.\config.cmd --url https://github.com/<you>/ApartmentManagementSystem_React --token <REGISTRATION_TOKEN>
.\svc.cmd install
.\svc.cmd start
```

Once registered, `runs-on: self-hosted` in a workflow job runs **on the home server itself** — `git pull` + `npm run build` + restarting Apache all happen locally, with no port-forwarding required.

> [!NOTE]
> A lighter-weight alternative that avoids installing the Actions runner at all: a cron job or scheduled task on the home server that periodically does `git fetch && git reset --hard origin/main` and rebuilds if there's a new commit. Simpler to set up, but deploys land on a polling interval rather than instantly on push. Fine for a capstone; the self-hosted runner is the more "real" pattern if you want to demonstrate it.

### 3.2 The Dual-Target Workflow File

Extend `.github/workflows/deploy.yml` from Phase 2 with a second job. Both jobs run from the same triggering CI success, in parallel:

```yaml
# .github/workflows/deploy.yml
# Continuous Deployment — dual target: self-hosted production + SaaS parallel fallback

name: Deploy

on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]

jobs:
  # ──────────────────────────────────────────────
  # Target 1: Self-hosted home server (production, authoritative DB)
  # ──────────────────────────────────────────────
  deploy-self-hosted:
    name: Deploy (Self-Hosted Production)
    runs-on: self-hosted   # the runner registered on the home server itself — see §3.1
    if: ${{ github.event.workflow_run.conclusion == 'success' }}

    steps:
      - name: Pull latest main
        run: |
          cd /path/to/htdocs/ApartmentManagementSystem_React
          git fetch origin main
          git reset --hard origin/main

      - name: Build frontend
        working-directory: ams-react
        run: |
          npm ci
          npm run build

      # backend/api/**.php needs no build step — Apache serves it directly.
      # Only run this if a migration actually changed since the last deploy;
      # SetupDB.sql is additive-only (per .agents/CLAUDE.md), so re-running
      # ADD COLUMN IF NOT EXISTS statements is safe, but don't blindly DROP/reload.
      - name: Apply any new additive migrations
        run: |
          mysql -u root ams_db < backend/api/migrations/SetupDB.sql

      - name: Restart Apache (if config changed)
        run: |
          # Windows: net stop/start via XAMPP control, or a scheduled restart script.
          # Linux: sudo systemctl restart apache2
          echo "Restart Apache here if httpd.conf or vhost config changed."

  # ──────────────────────────────────────────────
  # Target 2: SaaS parallel stack (warm fallback / public demo mirror)
  # Provider stack matches saas_fallback_strategy.md §7 and external_services.md §5
  # ──────────────────────────────────────────────
  deploy-saas-parallel:
    name: Deploy (SaaS Parallel Fallback)
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20.19"
          cache: npm
          cache-dependency-path: ams-react/package-lock.json

      - name: Build frontend (Vite)
        working-directory: ams-react
        run: |
          npm ci
          npm run build
        env:
          # axiosConfig.js base URL for the SaaS mirror points at Railway,
          # NOT the self-hosted API — see external_services.md §2.8
          VITE_API_BASE_URL: ${{ secrets.SAAS_API_BASE_URL }}

      - name: Deploy frontend to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: ams-react
          vercel-args: '--prod'

      - name: Deploy PHP API to Railway
        uses: bervProject/railway-deploy@main
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: ams-api

      - name: Apply schema to Railway MySQL (idempotent — additive migration only)
        run: |
          mysql -h ${{ secrets.RAILWAY_MYSQL_HOST }} \
                -u ${{ secrets.RAILWAY_MYSQL_USER }} \
                -p${{ secrets.RAILWAY_MYSQL_PASSWORD }} \
                ${{ secrets.RAILWAY_MYSQL_DATABASE }} \
                < backend/api/migrations/SetupDB.sql
```

> Railway's own GitHub integration can also auto-deploy on push without any Actions step at all (connect the repo in the Railway dashboard). The explicit `railway-deploy` step above is shown for symmetry with the Vercel step and so both targets are visible in one workflow run — use whichever fits how much you want to see in the Actions log versus configure once in a dashboard.

### 3.3 External Services Are Shared Dependencies, Not Infrastructure — Configure Per Environment

PayMongo, Semaphore, and (once implemented) Resend/Gmail SMTP are **already external** on both deployment targets — self-hosted and SaaS alike make the same outbound API calls (`external_services.md` §1.1 note). Deploying in parallel doesn't change *that* code path at all. What it does change is that **you now have two independent environments that each need their own provider configuration**, because these credentials live in `ams_db.system_settings` (a DB row per environment), not in a shared `.env` (`external_services.md` §3):

| Service | Why it needs separate config per environment | Where |
|---|---|---|
| **PayMongo webhook** | Each webhook URL you register in the PayMongo dashboard gets its **own** `whsk_...` secret. The self-hosted target's webhook URL (via ngrok/DDNS) and the Railway target's webhook URL (`https://ams-api.railway.app/paymongo_webhook.php`) are different URLs → two different secrets, each stored in that environment's own `system_settings.paymongo_webhook_secret`. Registering only one webhook means the *other* environment's payments never confirm. | `AdminAccountSettings.jsx` → Payment Gateway Integration, once per environment |
| **PayMongo sandbox vs live keys** | Decide deliberately whether the SaaS mirror runs in sandbox mode permanently (safer for a public demo URL panelists might poke at) even after self-hosted production goes live. | Same panel, `system_settings.paymongo_secret_key` / `paymongo_public_key` |
| **Semaphore / Resend API keys** | Not yet implemented in the codebase (`external_services.md` §2.3/2.4 — UI built, backend stubbed), but when they land, the same per-environment-DB-row rule applies: two databases, two independent credential rows. | *(planned)* `system_settings.semaphore_api_key`, `smtp_host`/`smtp_user`/`smtp_pass` |
| **Frontend API base URL** | `ams-react/src/api/axiosConfig.js` is currently hardcoded to `http://localhost:8080/...`. Before either target's frontend can point at its own backend, this needs to become an env-driven value (`VITE_API_BASE_URL`, as used in the workflow above) rather than a single hardcoded string. | `axiosConfig.js` (needs a one-time code change to support multiple deploy targets) |

> [!IMPORTANT]
> None of this is something CI should try to automate by writing rows into `system_settings` on every deploy — these are one-time-per-environment business configuration steps, done once by an admin through `AdminAccountSettings.jsx` on each environment, same as `external_services.md` §2.1's manual PayMongo sandbox setup walkthrough. CI's job is to get the *code* to both places reliably; provider credentials are configured, not deployed.

### 3.4 GitHub Secrets Required

Add these under **Settings → Secrets and variables → Actions** for the `deploy-saas-parallel` job (the `deploy-self-hosted` job needs no GitHub secrets at all, since it runs on the home server directly and reads local `backend/config.env.php`):

| Secret | Used for |
|---|---|
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Frontend deploy to Vercel |
| `RAILWAY_TOKEN` | PHP API deploy to Railway |
| `RAILWAY_MYSQL_HOST`, `RAILWAY_MYSQL_USER`, `RAILWAY_MYSQL_PASSWORD`, `RAILWAY_MYSQL_DATABASE` | Applying `SetupDB.sql` to the Railway database |
| `SAAS_API_BASE_URL` | Baked into the Vercel build as `VITE_API_BASE_URL` so the SaaS frontend calls the SaaS backend, not the home server |

None of these overlap with the self-hosted target's credentials (`backend/config.env.php`, gitignored, lives only on the home server) — that separation is the point: a leaked SaaS secret can't touch production data, and vice versa.

### 3.5 Keeping Data in Sync (Optional Stretch)

By default the two environments have independent data — a tenant who registers on the SaaS mirror doesn't exist on the self-hosted production DB. For a capstone demo this is usually the right call (don't let panelists accidentally create real-looking data in two places). If you do want the SaaS mirror to mirror real production data (e.g., so a cutover during an actual outage doesn't lose recent activity), add a **one-directional, scheduled** sync — never bidirectional, to avoid write conflicts:

```yaml
sync-saas-mirror:
  name: Sync SaaS mirror from production (one-way)
  runs-on: self-hosted   # reads from the authoritative self-hosted DB
  # Run on a schedule, not on every push — this is a data job, not a deploy job.
  # (Move this to its own workflow with `on: schedule: - cron: "0 */6 * * *"`.)
  steps:
    - name: Dump production DB
      run: mysqldump -u root ams_db > /tmp/ams_sync.sql

    - name: Push dump into Railway MySQL (production → mirror, one direction only)
      run: |
        mysql -h ${{ secrets.RAILWAY_MYSQL_HOST }} -u ${{ secrets.RAILWAY_MYSQL_USER }} \
              -p${{ secrets.RAILWAY_MYSQL_PASSWORD }} ${{ secrets.RAILWAY_MYSQL_DATABASE }} \
              < /tmp/ams_sync.sql
```

> [!CAUTION]
> This overwrites the SaaS mirror's database wholesale on every run — including the separate `paymongo_webhook_secret` and other per-environment `system_settings` rows described in §3.3. If you adopt this, either exclude the `system_settings` table from the dump (`mysqldump --ignore-table=ams_db.system_settings`) or re-apply the SaaS-specific config rows after each sync.

### 3.6 When to Cut Over for Real

With Phase 3 running, `saas_fallback_strategy.md` §6's "Recommended Migration Path" gets much shorter, because Phases 1–3 of that runbook (database provisioning, PHP API deploy, React SPA deploy) are **already done and continuously kept current** by this pipeline. If the home server actually goes down, what's left is just:

1. Point your DNS / the URL you give tenants at the Vercel/Railway URLs instead of the home server.
2. If §3.5's sync job wasn't running, restore the most recent `mysqldump` backup into the Railway database so it has current data.
3. Re-verify the PayMongo webhook for the Railway environment is still the one registered as **live** (not just present, but the *active* one tenants' payments will actually hit) — see §3.3.

That's the entire value of this phase: turning a multi-day manual migration runbook into a DNS change and a data restore.

---

## Local Development vs CI Environment

This is a common point of confusion. Here's how the two environments relate:

```
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│     YOUR DEVELOPMENT PC         │    │     GITHUB ACTIONS RUNNER       │
│                                 │    │                                 │
│  XAMPP                          │    │  Ubuntu VM (ephemeral)          │
│  ├── Apache (port 8080)         │    │  ├── Node.js 20.19              │
│  ├── PHP 8.x                    │    │  ├── PHP 8.2                   │
│  └── MariaDB 10.4               │    │  ├── MariaDB 10.11 (service)   │
│                                 │    │  └── npm                       │
│  React Dev Server               │    │                                │
│  └── Vite (port 5173)           │    │  Runs: lint, build, syntax     │
│                                 │    │  checks, schema validation     │
│  You write and test code here   │    │  Automated checks happen here  │
└─────────────────────────────────┘    └─────────────────────────────────┘
         │                                          │
         │         git push                         │
         └──────────────────────────────────────────►│
                                           CI triggered
```

**Key point:** GitHub Actions does **not** deploy to your XAMPP. It runs checks on a temporary cloud VM. Your XAMPP stays as your local development environment — nothing changes there.

---

## Adding Tests

The CI pipeline is ready for tests. Here's how to add them to each layer:

### Frontend — Vitest (Recommended)

Vitest is the natural test runner for Vite projects. Install it:

```bash
cd ams-react
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add to `package.json` scripts:

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Add to `vite.config.js`:

```js
export default defineConfig({
  // ... existing config
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

Example test (`ams-react/src/__tests__/App.test.jsx`):

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'

describe('App', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
  })
})
```

Then uncomment the test step in `ci.yml`:

```yaml
- name: Run tests
  run: npm test
```

### Backend — PHPUnit

For more advanced PHP testing, install PHPUnit:

```bash
# From the project root
composer require --dev phpunit/phpunit
```

This is a stretch goal. The PHP syntax check alone catches the most common class of errors in a PHP API project.

---

## GitHub Actions Cheat Sheet

### Setting Up Branch Protection

1. Go to **Settings → Branches → Add rule**
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
   - Select: `Frontend (Lint & Build)`, `Backend (PHP Checks)`

### Adding a Status Badge to README

Add this to the top of your `README.md`:

```markdown
![CI](https://github.com/YOUR_USERNAME/ApartmentManagementSystem_React/actions/workflows/ci.yml/badge.svg)
```

This shows a live green/red badge indicating whether `main` is passing CI.

### Useful Workflow Syntax

```yaml
# Run on specific file changes only
on:
  push:
    paths:
      - 'ams-react/**'     # Only run frontend job when frontend files change
      - 'backend/**'        # Only run backend job when backend files change

# Set environment variables
env:
  NODE_ENV: production

# Use secrets (configured in Settings → Secrets)
${{ secrets.MY_SECRET }}

# Cache dependencies for faster runs
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
```

### Debugging a Failed Workflow

1. Go to the **Actions** tab in your GitHub repository
2. Click the failed workflow run
3. Expand the failed step to see the error log
4. Fix the issue locally, push, and CI will re-run automatically

---

## Adoption Roadmap

Implement CI/CD incrementally. Don't try to do everything at once.

> **Resequenced from the original plan:** branch protection now lands in Week 2, once `npm run lint` is actually clean — not Week 1. Given this repo's history is 100% direct-to-`main` pushes with no PRs, turning on "require status checks" while the frontend job is still red would lock out your own workflow immediately. Get CI green first, *then* gate on it.

### 🟢 Week 1 — Foundation (get CI green)

- [x] Create `.github/workflows/ci.yml` with the frontend and backend jobs — pinned Node `20.19`, `continue-on-error` on lint (Option A)
- [x] Push to GitHub and verify the workflow runs
- [x] Fix the two-line `payBills.heading`/`payBills.subtext` duplicate-key bug in `i18n.js` (a real, tool-confirmed defect, independent of CI)
- [x] Start burning down the remaining 178 lint errors — even a handful of commits knocking out the repeated `'React' is defined but never used` pattern gets you most of the way there
- [x] Once `npm run lint` exits clean locally, remove `continue-on-error` from the lint step so it becomes a real, blocking check

### 🟡 Week 2 — Refine (now gate on it)

- [x] Add the database schema validation job (MariaDB service, per the correction above) — plus steps that round-trip `seed_mock_data.sql` → `seed_reset.sql` → re-seed → `clear_and_seed.sql` and apply every `2026_09_*.sql` upgrade migration, so the seed/reset scripts and the idempotent migrations are proven on every push, not just the schema
- [ ] Add the CI status badge to `README.md`
- [ ] ~~**Now** enable branch protection on `main`~~ — not adopted (see the decision below). Instead, keep CI results visible on every push and act on red runs.
- [x] Decide deliberately whether to adopt the feature-branch/PR workflow described above, or keep pushing to `main` directly with CI purely as a safety net — **decided 2026-09-16:** push routine work and bug fixes straight to `main`; use a `feature/` branch for big implementations; no required-PR protection (see [Git Branching Strategy](#git-branching-strategy))

### 🟠 Week 3 — Test (Stretch)

- [ ] Install Vitest and write 3–5 basic component tests
- [ ] Uncomment the test step in CI
- [x] Consider adding PHPStan for static PHP analysis — added at level 0 with `phpVersion: 80000` (matching production PHP 8.0, not the CI image's 8.2) in the `backend` job. A `phpstan-baseline.neon` ignores 7 `arguments.count` findings that are a PHPStan artifact of this codebase's pattern of standalone endpoint files each declaring their own local `function fail(...)` with different signatures — safe at runtime since the files never run in the same request, but PHPStan analyses all of `backend/` as one shared global namespace and cross-checks calls against whichever declaration it saw. Not a real bug; a baseline is the right tool rather than renaming working, endpoint-local helpers.
- [x] **Coverage gap worth closing:** none of the jobs above ever run PHP against a live database — syntax-checking and schema-import don't catch a bad `JOIN` or wrong bind-param type in one of the 80 endpoints. The `smoke-test` job in `.github/workflows/ci.yml` does this: it seeds the schema and demo data, boots PHP's built-in server, hits three unauthenticated read-only endpoints (`get_system_settings.php`, `get_rooms.php`, `get_service_catalog.php` — `get_announcements.php` turned out to always require `require_user`/`require_admin`, so it doesn't fit an unauthenticated smoke test), then logs in as the seeded admin and hits an authenticated one (`dashboard_stats.php`) with the returned Bearer token.

  The tracked `backend/config.env.php` hardcodes `DB_HOST=localhost` for XAMPP, which makes mysqli use a Unix socket rather than TCP — the job overwrites that file with the CI MariaDB's `127.0.0.1` host before booting the server, since the checked-in file always wins over environment variables (see `config.php`'s load order).

### 🔴 Week 4 — Deploy, Single Target (Optional)

- [ ] Create `.github/workflows/deploy.yml` (Phase 2 — single target)
- [ ] Choose a deployment target and configure secrets
- [ ] Test the full push → CI → CD → live pipeline

### 🟣 Week 5+ — Deploy, Dual Target (Optional, Stretch)

- [ ] Register a self-hosted GitHub Actions runner on the home server ([§3.1](#31-reaching-the-home-server-from-github-actions-without-opening-inbound-ports))
- [ ] Extend `deploy.yml` with the `deploy-self-hosted` and `deploy-saas-parallel` jobs ([§3.2](#32-the-dual-target-workflow-file))
- [ ] Make `ams-react/src/api/axiosConfig.js`'s base URL env-driven so the two targets can point at different backends
- [ ] Configure PayMongo (and later Semaphore/Resend) credentials **separately** on each environment's `AdminAccountSettings.jsx` — including registering a second PayMongo webhook for the Railway URL ([§3.3](#33-external-services-are-shared-dependencies-not-infrastructure--configure-per-environment))
- [ ] Decide whether to add the one-way data sync job, or accept the two environments as independently-seeded ([§3.5](#35-keeping-data-in-sync-optional-stretch))

---

## Summary

| Component | What CI Checks | Value |
|---|---|---|
| **React frontend** | ESLint rules, Vite production build | Catches broken imports, unused variables, JSX errors |
| **PHP backend** | Syntax validation on 80+ endpoint files | Catches missing semicolons, unclosed brackets, typos |
| **MariaDB database** | Schema import on a fresh database | Catches broken migrations, invalid SQL, missing tables |
| **Git workflow** | Protected `main`, required PR reviews | Prevents broken code from reaching production |
| **Dual-target CD** (Phase 3) | Deploys the same passing build to self-hosted production *and* the SaaS fallback stack | Fallback is continuously proven to deploy, not just documented — see [Phase 3](#phase-3--dual-target-deployment-self-hosted-production--saas-parallel-fallback) |

The philosophy is straightforward:

> **If it breaks, CI tells you before your users do.**

---

*Last updated: September 2026 — verified against the live repo (lint status, DB engine, endpoint count) before the corrections above were applied; Phase 3 integrates the dual-environment strategy from `saas_fallback_strategy.md` and `external_services.md`.*
*Related: [Deployment Guide](localhost_to_production.md) · [SaaS Fallback Strategy](saas_fallback_strategy.md) · [External Services Matrix](../documentation/external_services.md) · [Security Audit](../security_audit.md) · [Development Backlog](../todo.md)*
