# Local load and volume check

Measures how the main admin list endpoints behave as the data grows.

```bash
# from the repo root; MySQL must be running (Apache is not needed)
node tests/load/run.mjs > load-result.md
```

What it does:

1. Builds a scratch database `ams_load_test` from `SetupDB.sql` and `seeds/seed_mock_data.sql` (never `ams_db`; the name must end in `_test`, which `config.php` also enforces when `AMS_TEST_MODE=1`).
2. Starts `php -S` on its own port (8093), so it can run next to the API test suite (8091, `ams_test`).
3. Logs in as the admin, measures each endpoint on the seed data, adds volume, and measures again.
4. Prints a markdown table (rows, response size, median and p95 latency, queries per call) and drops the database.

It runs about two minutes. Options (environment variables): `LOAD_RUNS` (15), `LOAD_USERS` (100), `LOAD_INVOICES` (2000), `LOAD_MAINTENANCE` (1000), `LOAD_MESSAGES` (5000), `LOAD_LOGS` (10000), `LOAD_PORT` (8093), `KEEP_LOAD_DB=1` to keep the database, `MYSQL_BIN_DIR`, `PHP_BIN`.

Reading the numbers:

- It is **not** a concurrency test: `php -S` is single-threaded and requests run one at a time. It shows cost per request as data grows. For simultaneous users use k6 on a real Apache server (see [`docs/audits/2026-11-10_real_world_test_guide.md`](../../docs/audits/2026-11-10_real_world_test_guide.md) §2).
- Queries per call come from MySQL's server-wide `Questions` counter. Stop other things using the same MySQL server while it runs, or the counts rise.
- Compare runs on the same machine. The latest result and its reading are in [`docs/audits/2026-11-13_load_check.md`](../../docs/audits/2026-11-13_load_check.md).
- It needs MariaDB's Sequence engine (`seq_1_to_N`), which XAMPP's MariaDB has. MySQL 8 does not; there, replace the `seq_1_to_N` tables in `seedVolume()` with a recursive CTE.
