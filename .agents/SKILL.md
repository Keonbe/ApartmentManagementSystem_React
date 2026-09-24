---
name: ams-rules
description: >-
  Always-on project rules for ApartmentManagementSystem_React. Covers stack
  overview, auth/identity, database constraints, PHP/React patterns, backlog
  priorities, and protected files. Load on every task in this repo.
trigger: always_on
---

# ApartmentManagementSystem — Agent Rules

## Project Snapshot

**Stack:** React 19 + Vite 8 SPA → PHP 8 API → MySQL (XAMPP/MariaDB 10)
**Dev URL:** `http://localhost:8080/ApartmentManagementSystem_React/`
**React dev server:** `npm run dev` inside `ams-react/` (port 5173)
**DB name:** `ams_db`

```
ApartmentManagementSystem_React/
├── ams-react/          # Vite React SPA
│   └── src/
│       ├── AdminPages/     # Admin-only views
│       ├── TenantPages/    # Tenant-only views
│       ├── Components/     # Shared UI components
│       ├── api/
│       │   └── axiosConfig.js  # Base URL + X-User-Id / X-Admin-Id headers
│       └── config/
│           └── systemSettings.js  # localStorage-backed settings
├── backend/
│   └── api/
│       ├── config.php          # $conn (mysqli), verify_admin(), log_activity()
│       └── migrations/         # One-time ALTER TABLE scripts
└── docs/
    ├── system_design.md    # Authoritative schema + API inventory
    └── todo.md             # Prioritised backlog (Priorities A–E)
```

---

## Auth & Identity

- **Session storage key:** `loggedInUser` → `{ id, role, first_name, ... }`
- Every axios request auto-injects:
  - `X-User-Id: <id>` for all users
  - `X-Admin-Id: <id>` for admin role
- PHP reads: `$_SERVER['HTTP_X_USER_ID']` / `$_SERVER['HTTP_X_ADMIN_ID']`
- Guard admin endpoints with `verify_admin($conn, $admin_id)` — it's already in `config.php`

---

## Database Rules

- **Never drop columns** — migrations are `ADD COLUMN IF NOT EXISTS` only.
- **`rooms.id` is VARCHAR** (e.g. `"A"`, `"B"`) — not an integer FK.
- **Tenant → Room link:** `rent_applications.room_name` (not enforced FK).
- **Tenant → User link:** `rent_applications.user_id` FK → `users.id`.
- Join pattern for "tenant name + room":
  ```sql
  LEFT JOIN users u ON u.id = t.user_id
  LEFT JOIN rent_applications ra ON ra.user_id = t.user_id AND ra.status = 'Approved'
  ```
- Log every write: `log_activity($conn, $admin_id, $type, $action, $detail)`.

### Key Tables

| Table | Notes |
|---|---|
| `users` | id, first_name, last_name, middle_name, email, role |
| `rent_applications` | user_id FK, room_name, status (Pending/Approved/Rejected) |
| `maintenance_requests` | user_id FK, issue_category, urgency, status, assigned_to, estimated_cost, work_notes, tenant_responsible |
| `cctv_requests` | user_id FK, status (Pending/Approved/Rejected) |
| `parking_reservations` | user_id FK, status (Pending/Assigned/Rejected) |
| `invoices` | user_id FK, status (Pending/Paid) |
| `announcements` | auto-creates rows in `notifications` for all tenants |
| `notifications` | user_id FK, is_read |
| `activity_logs` | admin audit trail |
| `lease_contracts` | separate from rent_applications — not yet wired in ViewContract |

---

## PHP Endpoint Template

```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// Admin-only guard (remove for tenant endpoints):
$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden"]);
    exit;
}

// ... logic ...
echo json_encode(["success" => true, "data" => $result]);
$conn->close();
?>
```

---

## React Patterns

- **API calls:** always use `import api from '../api/axiosConfig'` — never raw `fetch` or `axios`.
- **Mutations:** optimistic update first → call API → revert + alert on failure.
- **Loading state:** show inline spinner or skeleton — never block entire page.
- **No mock data in production components** — if it's hardcoded, it must move to the DB.
- **Admin pages** live in `AdminPages/`, tenant pages in `TenantPages/`.
- **Route guard:** admin routes check `loggedInUser.role === 'admin'` and redirect otherwise.

---

## Skill Helpers

This project uses the following on-demand skill helpers in `.agents/skills/`:

| Skill | Trigger | Purpose |
|---|---|---|
| `ponytail` | `ponytail [lite\|full\|ultra\|off]` | Lazy-senior-dev mode — kill over-engineering |
| `ponytail-review` | `ponytail-review` | Review code for what can be deleted |
| `ponytail-audit` | `ponytail-audit` | Sweep the whole repo for bloat |

> Skills are loaded on-demand. Type the command to activate.

---

## What Is NOT Done Yet (Priorities B–E)

See [`docs/todo.md`](../docs/todo.md) for full detail. Quick ref:

| Priority | Feature | Key files |
|---|---|---|
| **B** | Live Reports page | `AdminReports.jsx` → `get_report_data.php` |
| **C** | ViewContract wired to `lease_contracts` table | `ViewContract.jsx` |
| **D** | Tenant move-out self-service | New page + `move_out_requests` table |
| **E** | Payment proof upload + reference numbers | `invoices` table + upload endpoint |

---

## Do Not Touch Without Discussion

- `axiosConfig.js` — headers affect every API call across the app.
- `config.php` — shared DB connection and helper functions.
- `users` table schema — changing columns breaks login and auth.
- Any existing `status` column allowed values — frontend components have hardcoded badge logic tied to exact strings.