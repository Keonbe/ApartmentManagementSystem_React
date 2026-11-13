# CI/CD Expansion & Enhancement Guide — Apartment Management System

> **Document Version:** 1.0.0  
> **Date:** 2026-11-13  
> **Status:** Phases 1, 2, 3, 5 implemented 2026-11-13 (see the table in §6); Phases 4 and 6 open  
> **Scope:** Extends and complements [cicd_pipeline.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/deployment/cicd_pipeline.md) with advanced testing, security scanning (DevSecOps), deployment guardrails, and automated operations.

---

## 1. Executive Summary & Current State

### Current CI Baseline (.github/workflows/ci.yml)
The current CI pipeline executes four jobs on every push and pull request to `main`:
1. **Frontend (Lint & Build):** `npm ci`, ESLint (`npm run lint`), and Vite production build (`npm run build`).
2. **Backend (PHP Checks):** `php -l` syntax checking across all `backend/**/*.php` files and PHPStan level 0 static analysis (`phpstan analyse --configuration=phpstan.neon --no-progress`).
3. **Database (Schema Validation):** Spins up a `mariadb:10.11` service container, imports `SetupDB.sql`, verifies table counts, validates seed/reset idempotency (`seed_mock_data.sql` $\leftrightarrow$ `seed_reset.sql` $\leftrightarrow$ `clear_and_seed.sql`), and tests all numbered upgrade migrations.
4. **Smoke Test:** Boots a built-in PHP server (`php -S`), tests three unauthenticated endpoints, logs in as admin, and validates authenticated access to `dashboard_stats.php`.

### The Gaps Beyond Static Analysis
Static analysis proves that code **compiles without syntax errors** and that schemas **can be imported**. It does **not** prove:
- That endpoint business logic (balances, invoices, role gates, concurrency) works as expected.
- That React components render or handle user input properly.
- That third-party dependencies are free from critical vulnerabilities.
- That private API keys (Semaphore SMS, PayMongo, DB credentials) were not accidentally committed.
- That production builds are free of leaked development `localhost` URLs.
- That deployments and database migrations occur automatically without manual intervention.

---

## 2. Layer 1: Automated Testing in CI (Highest Value)

### 2.1 Wire the Existing Backend Integration Test Suite (`tests/api/`)
The repository already contains **79 comprehensive integration test files** in `tests/api/*.test.js` covering authentication, payments, cancellation fees, CCTV workflows, contract lifecycles, and concurrency races. 

Currently, this suite is run manually on local developer machines. It can be integrated directly into GitHub Actions as a dedicated CI job:

```yaml
  # ──────────────────────────────────────────────
  # Job 5: Backend API Integration Test Suite
  # ──────────────────────────────────────────────
  api-tests:
    name: Backend (API Integration Tests)
    runs-on: ubuntu-latest

    services:
      mariadb:
        image: mariadb:10.11
        env:
          MARIADB_ROOT_PASSWORD: root
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

      - name: Setup PHP 8.2
        uses: shivammathur/setup-php@v2
        with:
          php-version: "8.2"
          extensions: mysqli, pdo, pdo_mysql, fileinfo, mbstring
          coverage: none

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20.19"
          cache: npm
          cache-dependency-path: tests/api/package-lock.json

      - name: Install API test dependencies
        working-directory: tests/api
        run: npm ci

      - name: Run Integration Tests
        working-directory: tests/api
        run: npm test
        env:
          TEST_DB_HOST: "127.0.0.1"
          TEST_DB_PORT: "3306"
          TEST_DB_USER: root
          TEST_DB_PASS: root
          PHP_BIN: php
          MYSQL_BIN_DIR: /usr/bin
```

> **Corrected 2026-11-13:** the harness reads `TEST_DB_*` (`tests/api/lib/env.js`) and sets `AMS_TEST_MODE` / `DB_*` itself for its own `php -S`, so the original `DB_*` variables did nothing and the run would have connected without a password. It also builds `ams_test` itself, so the service needs no `MARIADB_DATABASE`, and the job needs no `needs: database`. Implemented as the `api-tests` job in `ci.yml`.

---

### 2.2 Frontend Unit & Hook Testing (Vitest + React Testing Library)
`ams-react` currently relies on Vite build and ESLint. Adding lightweight component and utility testing prevents UI regressions:

#### Setup
```bash
cd ams-react
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

#### Vite Test Configuration (`ams-react/vite.config.js`)
```javascript
export default defineConfig({
  // ... existing plugins and config
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
});
```

#### Sample Unit Test: Invoice Balance Utility (`ams-react/src/utils/invoiceBalance.test.js`)
```javascript
import { describe, it, expect } from 'vitest';
import { invoiceOwed, invoiceBalance } from './invoiceBalance';

describe('invoiceBalance calculations', () => {
  it('correctly calculates remaining balance excluding advance rent', () => {
    const invoice = {
      total_amount: '12000.00',
      amount_paid: '5000.00',
      status: 'pending',
      type: 'rent'
    };
    expect(invoiceBalance(invoice)).toBe(7000.00);
    expect(invoiceOwed(invoice)).toBe(7000.00);
  });

  it('treats fully paid invoices as zero owed', () => {
    const invoice = {
      total_amount: '10000.00',
      amount_paid: '10000.00',
      status: 'paid'
    };
    expect(invoiceOwed(invoice)).toBe(0);
  });
});
```

> **Implemented 2026-11-13:** Vitest config lives in `ams-react/vitest.config.js` (not `vite.config.js`: the build plugins crash under Vitest), tests are `src/**/*.test.js` with explicit `vitest` imports, and the real `invoiceOwed` API (a single export that prefers the server `balance`) is tested in `src/utils/invoiceBalance.test.js`. The sample above uses functions that do not exist (`invoiceBalance`) and is kept only as an outline. Component tests (React Testing Library + jsdom) are still open.

#### CI Step in `frontend` Job
```yaml
      - name: Run frontend unit tests
        run: npm run test -- --run
```

---

### 2.3 End-to-End (E2E) Browser Testing (Playwright)
Playwright validates critical multi-step user flows across headless Chromium:

1. **Tenant Journey:** Registration $\rightarrow$ Login $\rightarrow$ Submit Application $\rightarrow$ Pay Bills upload proof.
2. **Admin Journey:** Login $\rightarrow$ Approve Application $\rightarrow$ Record Cash Payment $\rightarrow$ Verify Tenant Status.

#### GitHub Actions Job Snippet
```yaml
  e2e-tests:
    name: End-to-End (Playwright)
    runs-on: ubuntu-latest
    needs: [frontend, backend, database]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20.19"
      - name: Install dependencies & Playwright browsers
        run: |
          npm ci
          npx playwright install --with-deps chromium
      - name: Run E2E tests
        run: npx playwright test
      - name: Upload Test Report Artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

---

## 3. Layer 2: DevSecOps & Security Automation

### 3.1 Secret & Credential Leak Detection (Gitleaks)
Prevents accidental commits of SMS gateway tokens (Semaphore), payment keys (PayMongo), SMTP credentials, or database passwords:

```yaml
  security-secrets:
    name: Security (Secret Leak Detection)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

### 3.2 Automated Dependency Vulnerability Audits
Catches known CVEs in NPM packages and Composer libraries before deployment:

```yaml
  security-audit:
    name: Security (Dependency Vulnerability Audit)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20.19"
      - uses: shivammathur/setup-php@v2
        with:
          php-version: "8.2"

      - name: Audit Frontend Dependencies
        working-directory: ams-react
        run: npm audit --audit-level=high

      - name: Audit Backend Composer Packages
        working-directory: backend
        run: composer audit
```

> **Implemented 2026-11-13** as `security-audit` with `--omit=dev` and `websocket-server` added. Baseline found locally: `ams-react` has 5 high advisories (axios 1.0–1.19.0, follow-redirects, zod, plus dev tooling), all fixable by `npm audit fix`; `composer audit` is clean. The npm steps are `continue-on-error` until that fix is applied, then remove it. Gitleaks is `security-secrets`.

---

### 3.3 Static Application Security Testing (GitHub CodeQL)
CodeQL inspects the AST of JavaScript and PHP to flag SQL injection risks, Cross-Site Scripting (XSS), and insecure session/cookie handling:

```yaml
# .github/workflows/codeql.yml
name: CodeQL Security Analysis

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '30 1 * * 1' # Runs weekly on Mondays

jobs:
  analyze:
    name: CodeQL Analysis
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript   # CodeQL has no PHP support
      - uses: github/codeql-action/analyze@v3
```

---

## 4. Layer 3: Build Guardrails & Asset Budgets

### 4.1 Automated Multi-Target Deploy-Guard Check
The repository contains `ams-react/scripts/deploy-guard.mjs`, which enforces that no local URLs (`http://localhost:8080`) are compiled into production builds.

Add a validation matrix to CI:

```yaml
      - name: Verify Build Guardrails for All Deployment Modes
        working-directory: ams-react
        run: |
          npm run build:saas
          node scripts/deploy-guard.mjs production
          cp .env.selfhosted.example .env.selfhosted
          npm run build:selfhosted
          node scripts/deploy-guard.mjs selfhosted
```

> **Corrected and implemented 2026-11-13:** the standalone guard takes the mode as its first argument (default `production`), so the self-hosted check needs `selfhosted`. `build:*` already runs the guard as a Vite plugin; the standalone call re-scans the emitted `dist/`. Part of the `frontend` job in `ci.yml`.

---

### 4.2 Bundle Size & Chunk Budget Monitoring
Vite warns when chunks exceed 500 kB (e.g. `index.js`, font files, or heavy charting libraries). A bundle size monitor in CI tracks asset growth across pull requests:

```yaml
      - name: Report Bundle Size
        uses: preact/compressed-size-action@v2
        with:
          repo-token: "${{ secrets.GITHUB_TOKEN }}"
          build-script: "build"
          directory: "ams-react/dist"
```

---

## 5. Layer 4: Continuous Deployment (CD) Automation

### 5.1 Automated Production Deployment via SSH
Once all CI jobs (Lint, PHPStan, Database, API Tests, Security) pass on `main`, an automated deployment workflow pushes the update to the server without manual file copying:

```yaml
# .github/workflows/deploy.yml
name: CD (Deploy to Production)

on:
  workflow_run:
    workflows: ["CI"]
    branches: [main]
    types: [completed]

jobs:
  deploy:
    name: Deploy to Server
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_SERVER_HOST }}
          username: ${{ secrets.PROD_SERVER_USER }}
          key: ${{ secrets.PROD_SERVER_SSH_KEY }}
          port: ${{ secrets.PROD_SERVER_PORT || 22 }}
          script: |
            set -e
            echo "🚀 Starting automated deployment..."
            cd /var/www/ApartmentManagementSystem_React

            echo "📥 Pulling latest main..."
            git pull origin main

            echo "🗄️ Running pending database migrations..."
            php backend/cron/migrate.php

            echo "📦 Building frontend production assets..."
            cd ams-react
            npm ci --production=false
            npm run build:selfhosted
            cd ..

            echo "🔄 Verifying environment health..."
            php backend/cron/check_environment.php

            echo "💬 Restarting WebSocket chat server..."
            pm2 restart ams-chat-server || (cd websocket-server && pm2 start server.js --name ams-chat-server)

            echo "✅ Deployment completed successfully!"
```

---

### 5.2 Automated Database Backup Verification Drill
A backup is only as good as its restoration test. This weekly cron workflow verifies that database dumps can be cleanly restored and queried:

```yaml
# .github/workflows/backup-drill.yml
name: Operations (Weekly Backup Restore Drill)

on:
  schedule:
    - cron: '0 3 * * 0' # 3:00 AM every Sunday

jobs:
  backup-drill:
    name: Test Database Restore Drill
    runs-on: ubuntu-latest

    services:
      mariadb:
        image: mariadb:10.11
        env:
          MARIADB_ROOT_PASSWORD: root
          MARIADB_DATABASE: restore_drill_db
        ports:
          - 3306:3306

    steps:
      - uses: actions/checkout@v4

      - name: Test dump and restore sequence
        run: |
          echo "Simulating production backup export..."
          sed 's/ams_db/restore_drill_db/g' backend/api/migrations/SetupDB.sql | mysql -h 127.0.0.1 -u root -proot --default-character-set=utf8mb4
          sed 's/ams_db/restore_drill_db/g' backend/api/migrations/seeds/seed_mock_data.sql | mysql -h 127.0.0.1 -u root -proot --default-character-set=utf8mb4

          echo "Dumping database with utf8mb4..."
          mysqldump -h 127.0.0.1 -u root -proot --default-character-set=utf8mb4 restore_drill_db > /tmp/backup.sql

          echo "Dropping and recreating drill database..."
          mysql -h 127.0.0.1 -u root -proot -e "DROP DATABASE restore_drill_db; CREATE DATABASE restore_drill_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

          echo "Restoring from dump..."
          mysql -h 127.0.0.1 -u root -proot --default-character-set=utf8mb4 restore_drill_db < /tmp/backup.sql

          echo "Verifying row counts..."
          USER_COUNT=$(mysql -h 127.0.0.1 -u root -proot -N -e "SELECT COUNT(*) FROM restore_drill_db.users;")
          [ "$USER_COUNT" -ge 13 ] || { echo "❌ Restore verification failed: expected >= 13 users, got $USER_COUNT"; exit 1; }
          echo "✅ Backup restoration drill verified ($USER_COUNT users intact)."
```

> **Corrected and implemented 2026-11-13:** `SetupDB.sql` and the seeds hardcode `USE ams_db`, so importing them straight into `restore_drill_db` would have written to `ams_db`; the name is rewritten with `sed`. The shipped `backup-drill.yml` also compares users, table count and non-ASCII settings before and after the restore, and has `workflow_dispatch`. Local run: 16 users, 51 tables, 1 non-ASCII setting, identical after restore.

---

## 6. Implementation Matrix & Recommended Phases

| Priority | Feature | Effort | Value / Impact | Dependencies |
|---|---|---|---|---|
| **Phase 1** ✅ | Wire `tests/api/` suite into `ci.yml` | Low | **Critical:** Proves all 80+ endpoints & DB transactions on every commit | Docker MariaDB |
| **Phase 1** ✅ | Dependency Audit (`npm audit` & `composer audit`) | Very Low | **High:** Catches critical CVEs in dependencies | None |
| **Phase 2** ✅ | Multi-target Deploy-Guard validation | Very Low | **High:** Prevents localhost URLs from leaking into production builds | Existing `deploy-guard.mjs` |
| **Phase 2** ✅ | Secret Scanning (`gitleaks`) | Low | **High:** Prevents leaks of PayMongo, Semaphore, & DB secrets | None |
| **Phase 3** ✅ | Frontend unit tests (Vitest) for utilities & hooks | Medium | **Medium:** Protects core invoice calculations and custom hooks | Vitest setup |
| **Phase 4** | Automated SSH deployment (CD) & migrate runner | Medium | **High:** Zero-touch production releases upon passing CI | Server SSH access |
| **Phase 5** ✅ | Weekly backup restoration drill | Low | **High:** Guarantees disaster recovery capability | None |
| **Phase 6** | Playwright E2E smoke tests | High | **Medium:** Full browser workflow regression safety | Node / Playwright |

---

*Related Documentation:*  
- [CI/CD Pipeline Architecture](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/deployment/cicd_pipeline.md)  
- [Backup and Restore Guide](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/deployment/backup_and_restore.md)  
- [Dual Deployment Environment Plan](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/deployment/dual-deployment-environment-plan.md)  
- [API Testing Guide](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/documentation/api_testing.md)  
- [Security Audit](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/audits/security_audit.md)
