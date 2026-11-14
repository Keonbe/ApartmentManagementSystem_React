# QA gap audit: QA reference manual vs AMS tests

Audit date: 2026-11-06. Scope: the INP input matrix (§4), API checks (§3D), database checks (§3E) and security checks (§3F) of the QA Reference Manual, compared with `tests/api` as it was then (49 files, ~514 tests; 82 files and 1,826 tests on 2026-11-13, see [api_testing.md](api_testing.md)) and `module_verification_guide.md` (`M<module>-NN` IDs).

**Method and limits.** Status comes from grep and name matching, plus targeted reads. "Covered" means a test exists, not that it is exhaustive. Rows marked *unverified* still need a read of the test bodies before anyone relies on them. Gap rows were re-checked by grepping `tests/api` for the endpoint name.

## Progress

| Item | Status | Result |
|---|---|---|
| Auth lifecycle | Closed | `auth_password_lifecycle.test.js`, no endpoint bug found |
| Money (`create_invoice`, refund request and reply) | Closed | `invoice_refund.test.js`, no endpoint bug found. `advance_payment` is still untested |
| Users (`manage_users`, `update_occupants`) | Closed | `users_admin.test.js`, no endpoint bug found. `archive_tenant` / `restore_tenant` still untested |
| Contracts (`create_contract`, `update_contract_status`, `record_move_out`) | Closed | `contract_lifecycle.test.js`. **Bug found and fixed:** both `create_contract.php` and the edit action of `update_contract_status.php` accepted impossible dates such as 2026-02-30 (`createFromFormat` rolls them over); they now compare the round trip |
| Reservations, waitlist, inquiries | Closed | `reservations_waitlist.test.js`, no endpoint bug found. These endpoints still read the identity from the header rather than `require_admin()` (safe, config.php rewrites it from the session) |
| Role matrix | Closed | `role_matrix.test.js` (284 tests). Fixed a mojibake error message in `send_message.php`. Chat endpoints trust the session-rewritten header; the matrix proves a forged header gets nothing |
| Rooms and parking admin, notifications, chat, expenses and reports | Closed | `rooms_parking_admin`, `notifications_crud`, `chat_messages`, `expenses_reports`. **Bugs fixed:** `rooms.available_date` was missing from `SetupDB.sql` (13 other tests failed because of it, and dev `ams_db` lacked it); `send_message.php` wrote an attachment before checking the receiver and left an orphan file | 
| Unicode and markup, method and paging, races, brute force | Closed | `unicode_and_markup`, `method_and_paging`, `concurrency_races`, `login_bruteforce`. **Bugs fixed:** `login.php` returned 500 for a non-string email or password; about 17 endpoints returned 500 for wrong-typed JSON (the global handler now answers 400 for a TypeError); `create_notification.php` returned 500 for a message over the column size. Races run serialized on `php -S`, so row locking under true overlap is still Manual |
| Remaining date inputs, archive and restore tenant, lease documents | Closed | `date_validation`, `tenant_archive_restore`, `lease_documents`. **Bugs fixed:** `record_move_out`, `update_tenant_status` (admin move-out), `set_unit_maintenance`, `submit_inquiry` accepted a day that does not exist (rolled over or stored); `update_inquiry_status` stored free text as `0000-00-00`; `upload_lease_document` reported success for an admin upload to a contract that does not exist and kept the file. New helper `real_date()` in `config.php` |

## 1. Summary

| Area | Status |
|---|---|
| Input validation (blank, length, negative, zero, wrong type) | Strong: `input_validation`, `deposit_deductions`, `invoice_adjustments`, `partial_payments`, `utility_bill`, `settings` |
| Unicode, emoji, accented names (INP-029..031) | **Gap.** No test uses non-ASCII data |
| XSS output (INP-035) | Partial: `announcements`, `appearance_settings` only |
| SQL injection (INP-034) | Partial: `visitors` search, `settings` only |
| Authorization | Good per feature (tenant vs admin, cross-tenant). **No role-by-endpoint matrix** |
| Auth lifecycle (forgot, reset, change password, logout) | **Gap.** None of the four endpoints is referenced by any test |
| Idempotency | Good: webhook replay, double announcement send, second bill returns 409 |
| Rate limiting | Partial: wrong-code lockout (`auth_security`), guest-chat 4th request returns 429 (`guest_chat_links`) |
| Concurrency | Partial: parallel calls exist; *unverified* how many are true same-row races |
| State transitions | Good: application, maintenance, service, contract end |
| Uploads | Good: CCTV, announcements, avatar, gallery, payment proof |
| Endpoint coverage | About 60 top-level endpoints have no test (§3) |

## 2. Manual item to AMS mapping

| Manual item | AMS status | Evidence or gap |
|---|---|---|
| INP-002..005 required, empty, null, whitespace | Covered | `input_validation`, the 422 `errors` shape |
| INP-007..009 length at/over/under | Covered | `application_requirements`, `settings` |
| INP-011..016 numeric zero, negative, decimal, overflow | Covered | `partial_payments`, `invoice_adjustments`, `deposit_deductions` |
| INP-017..018 currency rounding | Partial | `balance_rules`, `partial_payments`; no explicit 10.005 or 0.1+0.2 case (*unverified*) |
| INP-019..022 email format and case | Partial | Registration and login covered; case-variant duplicate account (INP-022) *unverified* |
| INP-025..028 dates, leap day, DST | Partial | Date-relative tests exist; no 2024-02-29 or invalid-date set |
| INP-029..031 unicode, emoji | **Gap** | MariaDB charset (utf8mb4) round-trip is untested |
| INP-032..033 special and control characters | **Gap** | Apostrophe names and newline-in-single-line fields |
| INP-034 SQL fragments | Partial | Two endpoints only; all prepared statements by convention (CLAUDE.md) |
| INP-035 XSS stored as text | Partial | Two endpoints; tenant names, maintenance and service text, and chat are not tested |
| 3D: 8 scenarios per endpoint | Partial | Valid, 401, 403 and 422 are common. Wrong-method (405) and oversize body are rare |
| 3D: pagination beyond last page | **Gap** | *unverified* |
| 3E: transaction rollback on mid-step failure | Partial | `charge_posting`, `release_checkout`; fault injection is absent |
| 3E: orphan rows after delete or archive | Partial | `parking_guards_orphan_cleanup` only |
| 3F: reset token single use and expiry | **Gap in tests** | Code does enforce `used=0` and `expires_at` (`reset_password.php:50`), but nothing asserts it |
| 3F: session dead after logout or password change | **Gap** | `logout` and `change_password` untested; `auth` covers archived-account session only |
| 3F: account enumeration (generic responses) | **Gap** | `forgot_password` and register duplicate untested |
| 3F: IDOR | Good, scattered | See the cross-tenant tests listed in §1 |
| 3F: role matrix | **Gap** | One file iterating role x endpoint is missing |
| 3F: brute force | Partial | OTP lockout covered; password-login throttling unverified |

## 3. Endpoints with no test, ranked

Priority follows the manual's risk-based rule: money and auth first.

**P1: money and auth**
- `create_invoice`, `advance_payment`, `create_refund_request`, `respond_refund_request`, `create_checkout_session` (indirect only)
- `forgot_password`, `reset_password`, `change_password`, `logout`
- `manage_users`, `update_occupants` (privilege and data scope)

**P2: contracts and move-out**
- `create_contract`, `update_contract_status`, `record_move_out`, `expire_contracts`, `upload_lease_document`
- `create_reservation`, `update_reservation_status`, `expire_reservations`

**P3: rooms and parking**
- `create_room`, `update_room`, `archive_room`, `set_unit_maintenance`, `apply_floor_rate`, `parking_reservation`, `update_parking_status`

**P4: notifications, messaging, reports**
- Notification CRUD and preferences, `send_message`, `save_message`, `get_chat_history`
- `get_activity_logs`, `get_inquiries`, `update_inquiry_status`, `manage_waitlist`, `manage_expenses`

**Not test candidates:** `apply_live_schema_fix`, `audit_live_schema`, `final_schema_patch`, `sync_live`. These look like one-off deploy scripts. Confirm they are admin-gated or not web-reachable, as a separate security check.

## 4. Proposed new tests (not built yet)

| Proposed file | Suggested IDs | Covers | Fixtures |
|---|---|---|---|
| `auth_password_lifecycle.test.js` | M3-xx | Reset token single use, expiry, reuse; generic response for unknown email; change_password needs the old password; logout kills the token; old sessions die after reset | tenant, `password_resets` rows via `lib/db.js` |
| `role_matrix.test.js` | M13-xx | Every role (none, tenant, admin, guard) x a list of endpoints, expecting 401 or 403 | seed accounts |
| `unicode_and_markup.test.js` | INP-029..035 | `Zoë 李 😀`, `O'Brien`, `<img onerror>` round trip on tenant name, maintenance, service and visitor text | tenant, request rows |
| `invoice_create_refund.test.js` | M6-xx | `create_invoice` validation; `advance_payment`; refund request create/respond, double respond, stale state | tenant, paid invoice |
| `contract_lifecycle.test.js` | M15-xx | `create_contract`, `update_contract_status` transitions (valid and forbidden), `record_move_out` | active rent, dates relative to today |
| `users_admin.test.js` | M3-xx | `manage_users` role change, self-demotion, archive; `update_occupants` bounds | two admins |
| `concurrency_races.test.js` | M-xx | Two parallel pay or approve calls on the same row; exactly one effect | one open invoice |
| `method_and_paging.test.js` | 3D | Wrong HTTP method returns 405 or an error with no side effect; page beyond last; oversize body | read endpoints |

Suggested order: password lifecycle, role matrix, invoice and refund, contracts, then the rest.

## 5. Not applicable or out of scope

- Performance, soak and load testing (§3G), accessibility (§3H) and browser compatibility (§3I). The suite is API-only and the frontend has no test runner, so these need separate tooling.
- Penetration testing and compliance work, which the manual itself marks as specialist.

## 6. Next steps

1. Read the bodies of the *unverified* rows first. This is cheap and may shrink the gap list.
2. Build the proposed tests in the order given, one commit per test file, with each new test registered in `module_verification_guide.md` and the count table in `api_testing.md`.
3. Wherever a new test fails, fix the endpoint in the same task, as CLAUDE.md requires.
