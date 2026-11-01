# Next session prompt: per-field input validation

Paste everything below the line into a new Claude Code session. Item 6 of the defense-gaps pass was deliberately not implemented there; this is its hand-off.

---

Add per-field server validation errors to the AMS endpoints that still lack them. Follow CLAUDE.md. Start from TASK.md, `git status` and `git log --oneline -5`, then grep before reading files. Do not commit; leave changes uncommitted and draft one commit message per feature or task at the end (Backend / Frontend / Docs sections inside the body, per CLAUDE.md). Open your plan with a short TL;DR.

## Goal
Every write endpoint in scope returns **all** invalid fields at once, so the form can mark each field. Today only `record_payment_admin.php` (L35, L127), `create_announcement.php` and, from the defense-gaps pass, `update_system_settings.php` (`payment_window_days`), `update_tenant_status.php` (rejection reason) and `update_service_status.php` (reason) return `errors{}`.

## Read first
- `docs/audits/input_validation_backend_plan.md` (phases, helper list). Its response shape says a single `field`; the frontend reads `errors{}`, so emit both (see below).
- `ams-react/src/utils/apiError.js` (`apiFieldErrors`, `apiErrorMessage`) and `ams-react/src/hooks/useFieldErrors.js` (`applyServerErrors`).
- `backend/api/record_payment_admin.php` around L35 and L127 as the reference `errors{}` shape.

## Backend helper (new "Input validation" section in `backend/config.php`)
- `validation_fail(array $errors, int $status = 422)`: sends `{"success":false,"message":<first error>,"errors":{"field":"msg"},"field":<first field>}` and exits.
- Collector style: build `$errors[field] = msg`, call `validation_fail($errors)` once if non-empty.
- Small checkers returning an error string or `''`: `v_str` (trim, min/max length), `v_amount` (numeric, range, `allowZero`), `v_int_range`, `v_date` (round-trip `Y-m-d`), `v_enum`, `v_id`. Reuse `normalize_ph_mobile()` and `password_policy_error()`.
- Field keys must match the frontend form field names (camelCase or snake_case as the form uses), so `applyServerErrors` lands on the right input.

## Endpoints, in priority order (one module per commit-sized step)
1. Payments: `pay_bill`, `upload_payment_proof`, `reject_payment_proof`, `schedule_payment`, remaining spots in `record_payment_admin` (some errors still lack a field, L28 and L48).
2. Applications: `rent_application`, `cancel_application`, `schedule_move_in`, `resubmit_date`.
3. Visitors: `check_in_visitor`, `update_visitor_status`.
4. Utilities: `save_utility_reading` (including the new `entry_mode='total'` / `total_amount` path), `manage_utility_types`, `upload_utility_bill`.
5. Settings: `update_system_settings`. Make it atomic: validate every key first, then save, so a rejected key never leaves earlier keys saved (known bug). Include `payment_window_days` (1-30).
6. New in the defense-gaps pass: `monitor_followups.php` POST, the reason checks in `update_tenant_status.php` / `update_service_status.php` (already `errors{}`, keep them consistent).

## Frontend
For each paired form, confirm it calls `applyServerErrors` (most do: AdminPayments, AdminVisitors, AdminUtilities, PayBills, PaymentUpload, RentApplication, UserVisitors). Fix any that fall back to `alert`. `AdminServicePage.jsx` uses `window.prompt` for the reason and shows `alert`; leave it unless trivial.

## Rules
Prepared statements, identity from the session only, frontend calls only through `axiosConfig.js`. Do not turn on strict SQL mode (Phase 5 of the plan stays out of scope). Keep success responses unchanged.

## Verify
- `php -l` on each changed file; `php backend/cron/notification_selftest.php` stays 26/26; `php backend/cron/check_environment.php`.
- `/db-snapshot save` first. For each module curl 2-3 negative cases with several bad fields at once and confirm `errors{}` lists all of them; one positive case still succeeds. Restore the DB afterwards.
- `cd ams-react && npm run build:local`.
- Update `docs/audits/input_validation_backend_plan.md` status and the "Deferred work" line in `TASK.md`; add the tests to `docs/documentation/module_verification_guide.md`.
