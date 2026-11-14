# Load and Volume Check (local)

**Date:** 2026-11-13
**What this is:** a repeatable local measurement of how the main admin list endpoints behave as data grows (SPRINT 153; audit rows X-01 to X-05; ISO 25010 evidence-map items 4 to 6). The script is [tests/load/run.mjs](../../tests/load/run.mjs), described in [tests/load/README.md](../../tests/load/README.md).
**What it is not:** a concurrency or soak test. `php -S` serves one request at a time, so it shows **cost per request as data grows**, not how many users the system can serve. The real-user and soak parts stay in [2026-11-10_real_world_test_guide.md](2026-11-10_real_world_test_guide.md) §2 and §3.

## Method

- A scratch database `ams_load_test` is built from `SetupDB.sql` and the mock seed, and dropped afterwards. `ams_db` is never touched.
- Each endpoint is called as the admin: 1 warm-up, then 15 sequential calls. Latency is measured around the HTTP call only.
- Queries per call are the difference in MySQL's `Questions` counter around one call (minus the cost of reading it, measured once). Other activity on the same MySQL server can add to it; the median of the 15 runs is reported.
- The measurement is made twice: on the seed data, then after adding volume.

## Result

Data volume:

| Data | users | invoices | maintenance | messages | activity log |
|---|---|---|---|---|---|
| Seed | 16 | 105 | 7 | 0 | 18 |
| With volume | 116 | 2,107 | 1,007 | 5,000 | 10,019 |

Per endpoint (seed → with volume). Times are milliseconds on the developer machine.

| Endpoint | Rows | Response size | Median ms | p95 ms (volume) | Queries per call |
|---|---|---|---|---|---|
| get_invoices.php | 105 → 2,107 | 111 KB → 2,082 KB | 65 → 182 | 238 | 15 → 15 |
| get_tenants.php | 15 → 15 | 10 KB → 10 KB | 48 → 71 | 92 | 11 → 11 |
| get_users.php | 15 → 115 | 1 KB → 7 KB | 43 → 35 | 55 | 6 → 6 |
| get_applications.php | 15 → 15 | 10 KB → 10 KB | 40 → 43 | 64 | 8 → 8 |
| get_maintenance_requests.php | 7 → 1,007 | 4 KB → 550 KB | 41 → 72 | 97 | 6 → 6 |
| get_contracts.php | 12 → 12 | 10 KB → 10 KB | 55 → 65 | 85 | 13 → 13 |
| get_visitors.php | 4 → 4 | 3 KB → 3 KB | 34 → 40 | 61 | 10 → 10 |
| get_inquiries.php | 3 → 3 | 2 KB → 2 KB | 41 → 35 | 56 | 11 → 11 |
| get_rooms.php | 15 → 15 | 10 KB → 10 KB | 57 → 68 | 110 | 15 → 15 |
| get_notifications.php | 11 → 11 | 4 KB → 4 KB | 41 → 36 | 56 | 8 → 8 |
| **get_conversations.php** | 0 → 100 | 0 KB → 36 KB | **44 → 1,142** | **3,851** | 6 → 6 |
| dashboard_stats.php | 15 → 15 | 8 KB → 7 KB | 85 → 73 | 160 | 32 → 32 |
| get_report_data.php | 11 → 1,505 | 6 KB → 206 KB | 121 → 152 | 229 | 68 → 68 |
| get_activity_logs.php (page 1, 50 rows) | 19 → 50 | 6 KB → 12 KB | 40 → 42 | 57 | 8 → 8 |

## What it shows

1. **No N+1 queries.** The number of queries per call is identical at seed and at volume for every endpoint. This supports audit row X-02. (It also shows that some pages are chatty by design: the report runs 68 queries and the dashboard 32, regardless of data size.)
2. **Unpaged lists grow with the data.** `get_invoices.php` returns every invoice: 2,107 rows are a 2 MB response and 182 ms; `get_maintenance_requests.php` returns 550 KB at 1,007 rows. This is audit row X-01 measured. At the stated scale (15–100 units) a property accumulates roughly 12 bills per unit a year, so 2,000 invoices is about 1.5 years of a 100-unit property: the page still works, and gets heavier every year. The activity log, the one paged list, stays flat.
3. **A real hotspot: `get_conversations.php`.** With 100 conversations and 5,000 messages the median is **1.1 seconds and the slowest calls take almost 4 seconds**, against 44 ms on the seed data. The query runs about six correlated subqueries per conversation (last message, its time, sender, attachment, search match, unread count), each filtering messages with an `OR` across sender and receiver and sorting by time, and `messages` only has single-column indexes on `sender_id` and `receiver_id`. This is the audit's former "low" row X-03, now measured and **medium**. It is the first thing to fix if chat is used heavily. Likely fixes: a composite index on `(sender_id, receiver_id, created_at)` and computing the last message of every conversation once instead of per row.
4. **Everything else stays under 250 ms** at this volume on a developer machine. The whole sweep is on one machine with the database local; a hosted server will add network latency to each of the 6 to 68 queries a page makes.

## Limits of this check

- One client, one request at a time: nothing here shows behaviour under simultaneous users or what happens to PHP's single-threaded dev server or to Apache's worker limit.
- The volume is synthetic and evenly spread; real data is lumpier.
- Only admin endpoints were measured. Tenant pages (My Room, Pay Bills) are small per tenant and were not timed.
- Times depend on the machine. Compare runs on the same machine, not across machines.

## Still to check by hand (cannot be done from the repository)

| Check | How | Why it matters |
|---|---|---|
| Production PHP error log location | On the server: `php -i \| grep -E "^(error_log\|log_errors) "`, then confirm a deliberate error appears there | Locally `php.ini` points to a folder that does not exist, so `[AMS]` errors land in Apache's `error.log`; production may differ |
| Production database time zone | `SELECT @@global.time_zone, @@system_time_zone;` on the server | The chat server now sets the session zone itself (`DB_TIME_ZONE`, default +08:00); PHP sets its own. Check the two agree on the host |
| Is 12-month voluntary prepayment lawful under RA 9653? | Ask your adviser or a lawyer, with `MAX_RENT_AHEAD_MONTHS_CEILING` (12) and the Section 7 limits (1 month advance, 2 months deposit) in hand | The audit's reading is that the limit is on what an owner may demand, not what a tenant offers; that is an opinion, not a ruling |
| GitHub `ci.yml` result | Open the Actions tab on the repository and read the latest run on `main` | The same steps pass locally; SPRINT #81 can be closed once GitHub agrees |
| Concurrency | Run the k6 script in the real-world test guide §2 against a scratch Apache server | The only way to learn how many simultaneous users it holds |
