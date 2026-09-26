# Backend input validation — plan (Deferred, not started)

> **Status: Deferred — not started (2026-09-25).** Frontend validation was done first on `feature/frontend-validation`, and its limits mirror the schema, so this plan can land without breaking the UI. Most of Phase 4 below is already done: `maxLength`/`min`/`max` from `utils/validation.js` `LIMITS`, Registration 8-character minimum, `type=email`, the PayBills proof fix (L8), and upload checks via `utils/fileLimits.js`. Pages changed on that branch read errors through `utils/apiError.js`, which handles both a 200 `{success:false}` and a 4xx body. So when an endpoint moves to 422, only check callers that still branch on `res.data.success` without a `catch` that reads the message. Findings come from a read-only sweep of all 104 endpoints on 2026-09-25; re-check line numbers before starting.

## Context
There is no shared validation layer. Each of the 104 `backend/api/*.php` endpoints does its own checks, from careful (`manage_expenses`, `save_utility_reading`, `check_in_visitor`) to almost none (`update_room` writes 11 raw client fields). MariaDB runs **non-strict** (`my.ini:157`), so bad input is not rejected: too-long strings are truncated, out-of-range decimals are capped and invalid dates become `0000-00-00`, all without an error. Validation failures come back as 200, 400, 409 or 422 depending on the endpoint.

Goal: one set of validation helpers, every write endpoint validated against the real column types, one error contract (422), frontend limits that match, then strict mode as a safety net.

User decisions:
- Backend plus key frontend forms, with no new library.
- Normalize validation failures to 422 and fix each affected page.
- Enable strict mode as the last phase.

Big change → branch `feature/input-validation`, merge to `main` once verified.

Already ruled out: no raw SQL built from request input (every interpolation is cast, whitelisted or internal). The chat HTTP endpoints do **not** trust a forged `X-User-Id`, because `config.php:2281` overwrites it with the session id. Chat socket issues stay under CH-1…CH-5 in security_audit §6e, out of scope here.

## Phase 0 — Audit record
- New `docs/audits/input_validation_audit_2026-09-25.md`, in the same format as `ams_security_workflow_audit_2026-09-16.md`:
  - A summary table by severity (ID | Module | Finding | File), then `#### IV-NN — Title` blocks with **Gap.** and **Fix.** paragraphs.
  - Findings come from the sweep, grouped: JSON body, money, dates, enum-like fields, lengths, email/phone, IDs/existence, uploads, passwords, error contract, internal error leakage, strict mode.
  - Cross-reference existing IDs instead of duplicating them: M7 (rent application), L1 (raw errors), L8 (PayBills), L9, consolidated_todo line 104 (min/max limits).
- Add an "Input validation" block to `docs/consolidated_todo.md` pointing to the IV IDs. Close items there as phases land.

## Phase 1 — Shared helpers (`backend/config.php`, new "Input validation" section)
Every helper sends a 422 `{"success":false,"message":...,"field":...}` and exits on failure, so endpoints read top to bottom.
- `read_json_body()`: decode `php://input` and require an array.
- `validation_fail($message, $field = null)`: replaces the 11 local `fail()` copies.
- `v_str($in, $key, $max, $required = true)`: checks `is_scalar`, trims, caps with `mb_strlen`. `$max` comes from the column size in SetupDB.sql.
- `v_id($in, $key)`: `ctype_digit`/int check, > 0.
- `v_amount($in, $key, $min = 0, $max = 99999999.99)`: `is_numeric` plus range. The default max fits `decimal(10,2)`.
- `v_int_range($in, $key, $min, $max)`.
- `v_date($in, $key, $fmt = 'Y-m-d')`: `createFromFormat` with a round-trip check. Returns the normalized string, which is what gets stored.
- `v_enum($in, $key, array $allowed)`.
- `v_email($in, $key, $max = 150)`: `FILTER_VALIDATE_EMAIL` plus a length cap.
- `v_ph_mobile($in, $key)`: reuses `normalize_ph_mobile()` (config.php:1534). **Done 2026-09-26 in place:** every contact-number save path (profile, manage_users, household_members, rent_application, submit_inquiry, check_in_visitor, create_reservation) now calls `normalize_ph_mobile()` directly and stores `+639XXXXXXXXX`; a helper would only fold those calls together.
- `v_password($pw)`: `PASSWORD_MIN_LENGTH` (config.php:1287) plus a **72-byte max**, which bcrypt otherwise silently truncates.
- `validate_upload($file, array $ext_to_mime, $max_bytes)`: upload error code, size, extension and finfo checks. Code is lifted from `store_maintenance_attachment()` (config.php:1139); that helper and `store_room_image()` are refactored onto it.
- `server_error($e_or_msg)`: `error_log`s the detail and returns a generic 500. Fixes L1 for the `$stmt->error` / `$e->getMessage()` leaks.

## Phase 2 — High-risk write endpoints (one module per commit, verify each)
1. **Billing / payments:**
   - `record_payment_admin`: numeric amount, method whitelist, reference length.
   - `pay_bill`: method whitelist, reference length.
   - `upload_payment_proof`: **require the file**, sender length.
   - `create_invoice`, `adjust_invoice`: amount upper bound, `invoiceNumber` length.
   - `reject_payment_proof`: reason ≤ 255.
2. **Tenancy / rooms / contracts:**
   - `update_room`: every field typed (status/condition/furnishing enums, rent amount, occupants range, dates).
   - `create_room`: type whitelist, lengths.
   - `update_tenant_status`: deductions ≥ 0, strict date, id cast.
   - `record_move_out`, `create_contract`, `update_contract_status`: round-trip dates, deposit amount.
   - `archive_tenant`, `restore_tenant`, `extend_lease`, `update_occupants`.
3. **Public / applicant:**
   - `rent_application` (M7): email, phone, lengths, gender, `monthsOfRent`. **Look up the room server-side and take the rent from the DB.**
   - `create_reservation`: email, phone, lengths, fee.
   - `submit_inquiry`: real date, phone.
   - `update_inquiry_status`: `viewing_date`, lengths.
   - `update_reservation_status`.
4. **Accounts:**
   - `registration`: name caps 30/50/20 to match `users` columns, `v_password`.
   - `profile`: lengths, gender, avatar size limit and error-code check.
   - `manage_users`, `change_password`, `reset_password`, `forgot_password`.
5. **Maintenance / services:**
   - `update_maintenance_status`: `assigned_to` ≤ 100, `rejection_reason` ≤ 255.
   - `service_request`: time-slot whitelist, **file size limit**, notes length.
   - `manage_service_catalog`: lengths; existence check on toggle/delete.
   - `create_maintenance_request_admin`: title ≤ 150.
   - `upload_lease_document`: admin-path existence check.
6. **Settings:** `update_system_settings`: type and range for every known key, value length cap.

## Phase 3 — Remaining endpoints
A mechanical pass over the rest, applying these rules:
- Use `read_json_body()` in place of unchecked `json_decode` (about 19 files have no check at all).
- Use `validation_fail()` and 422 in place of 200/400/409 for validation errors.
- Use `v_str` caps in place of unbounded text.
- Use `v_id` in place of uncast ids.
- Use `server_error` in place of leaked errors.

Keep a checklist of all 104 files in the audit doc and mark each as done. Read-only `get_*` endpoints only need the `$_GET` id/enum casts.

## Phase 4 — Frontend (`ams-react/src`)
- **422 handling:** for every page that calls an endpoint whose failure code changed from 200, make sure the `catch` shows `err.response?.data?.message`. Find them by grepping the page for the endpoint name. Known pages: PayBills, ServiceBooking, RentApplication, InquiryForm, AdminReports, admin catalog/inquiry/reservation pages, ResetPassword.
- **Limits:** add `maxLength`/`min`/`max` that match the backend caps on the forms listed in the sweep (Registration, ProfileSettings, AdminAnnouncements, AdminTenants deductions `min=0`, reservation and inquiry fields). This closes consolidated_todo line 104.
- **Other form fixes:**
  - `Registration.jsx`: password minimum 6 → 8.
  - `ProfileSettings` email: `type=email`.
  - `PayBills.jsx`: stop calling `pay_bill` when the proof upload fails (L8).
- **Client file-size checks** where missing: PaymentUpload, PayBills, ProfileSettings avatar, MaintenanceRequest, ServiceBooking, Visitors, AdminUnits, AdminMaintainance. Put the check in one small shared `src/utils/fileLimits.js`.
- `npm run build:local`.

## Phase 5 — Strict mode
- Before enabling it, sweep every `INSERT` for NOT NULL columns without a default that the statement omits, and every place that writes `''` into an INT/DATE/DECIMAL column. Fix those first.
- In `config.php`, next to the `time_zone` set (~L114), add `SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'`. This covers the cron jobs too. `my.ini` stays unchanged, so other apps on XAMPP are unaffected.
- `check_environment.php`: warn if the session is not strict.
- Update `database_schema.md` / `system_design.md`, which still say strict mode is off.

## Verification
- `php -l` on every changed PHP file.
- `php backend/cron/notification_selftest.php` stays 21/21.
- `php backend/cron/check_environment.php`.
- For each Phase 2 module, live curl with Bearer tokens (seed accounts, verification guide §1.4/§3.2):
  - one happy path;
  - negative cases, each expecting a 422 with the field named: negative/huge/non-numeric amount, `2026-02-31`, over-long string, bad enum, bad email/phone, non-array JSON body, missing file (`upload_payment_proof`), oversized upload;
  - one check that nothing was written.
- Record them as `IV-T-NN` rows in the audit doc.
- Frontend: `npm run build:local`, then trigger one 422 on each fixed page and confirm the message shows.
- Phase 5: after enabling strict mode, re-run every happy-path curl above plus the main flows (register, apply, invoice, pay, maintenance, announcement), because strict mode surfaces hidden bad writes as errors.
- Reset the DB afterwards: drop/recreate `ams_db`, then import `SetupDB.sql` and `seed_mock_data.sql`.

## Docs touched
- New audit doc; consolidated_todo; security_audit §6 (F-rows); module_verification_guide contract notes for any endpoint whose error codes changed.
- Update `TASK.md` per phase. Draft commit messages grouped Backend / Frontend / Docs.
