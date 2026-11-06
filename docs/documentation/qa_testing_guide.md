# AMS QA Testing Guide

How to test each module with the QA reference manual's method, and which checks are already automated. It sits beside [module_verification_guide.md](module_verification_guide.md) (curl and SQL runs per module) and [api_testing.md](api_testing.md) (the Vitest suite). It does not repeat their tables. It adds the input and security checks the manual calls for, and says for each row whether a test file covers it.

Gaps behind this guide: [qa_gap_audit.md](qa_gap_audit.md).

**Automated column.** A file name means `tests/api/<file>` asserts the row. `Planned` means the file is on the build list but does not exist yet. `Manual` means a person must run it, usually because it needs a browser. A row is marked with a file only when the test is known to cover it. Anything unconfirmed stays `Planned`.

---

## Part A: Method

| Manual term | In AMS |
|---|---|
| Smoke | Admin login, `dashboard_stats.php`, `get_rooms.php`, tenant login, one invoice view. `npm test` includes the CI smoke set |
| Sanity | After a fix, run the one changed scenario, then its test file |
| Retest | Re-run the exact failing steps and the new test that pins them |
| Regression | `cd tests/api && npm test` after every backend change |
| Positive / negative | Each row below has a Happy or Negative type |
| Equivalence + boundary | One value per class, plus both sides of each limit (for example amount 0, 0.01, balance, balance + 0.01) |
| DB truth | After every write, query the row. A "Saved" toast proves nothing |
| 8 scenarios per endpoint | valid, missing field, wrong type, no token (401), wrong role (403), unknown id (404), conflict (409 or stale state), oversize |
| Server never trusts client | Test through `api()` or curl with the UI bypassed |
| Safe testing | Only the scratch `ams_test` database or a restored `ams_db` snapshot (`/db-snapshot`). Seed emails stay `@demo.example` |

**Row types:** Happy, Boundary, Negative, Sec (a failure is a vulnerability), Conc (concurrency).

---

## Part B: Shared input matrix (INP)

Apply to every text, number, date and file field in any module. Run through `api()` so the client is bypassed.

| ID | Input | Value to send | Expected | Automated |
|---|---|---|---|---|
| INP-01 | Required, missing | field omitted | 4xx naming the field, nothing saved | input_validation.test.js (several endpoints) |
| INP-02 | Required, blank | `""`, `"   "`, tab, newline | rejected, same as missing | input_validation.test.js |
| INP-03 | Required, null | `null` | rejected, no 500 | unicode_and_markup.test.js |
| INP-04 | Length | min-1, min, max, max+1 | max+1 rejected, never truncated | settings.test.js, application_requirements.test.js |
| INP-05 | Money, zero and negative | `0`, `-1` | rejected unless the rule allows it | partial_payments, invoice_adjustments, deposit_deductions |
| INP-06 | Money, precision | `10.005`, `0.1 + 0.2` style sums | cents only, documented rounding, same in UI, API, DB | invoice_refund.test.js |
| INP-07 | Number, overflow and type | `2147483648`, `abc`, `1e3`, `2.5` in an integer field | rejected, no wraparound | utility_bill, settings |
| INP-08 | Date | `2024-02-29`, `2023-02-29`, `2024-13-01`, one day outside the allowed range | valid accepted, invalid rejected | contract_lifecycle.test.js |
| INP-09 | Unicode | `Zoë 李 😀`, `مرحبا` | stored and shown identically (utf8mb4) | unicode_and_markup.test.js |
| INP-10 | Special characters | `O'Brien`, `a\b`, `100%` | stored exactly, no query break | unicode_and_markup.test.js |
| INP-11 | Control characters | newline or NUL in a single-line field | rejected or stripped | unicode_and_markup.test.js |
| INP-12 | SQL fragment | `' OR '1'='1` | treated as data, no DB error shown | visitors (search), settings |
| INP-13 | Markup | `<img src=x onerror=alert(1)>` | stored as text, escaped on output | announcements, appearance_settings; unicode_and_markup.test.js |
| INP-14 | Email | `a+b@x.co.uk` ok; `a@`, `a b@x.com` rejected; `User@X.com` vs `user@x.com` | one account per address regardless of case | auth.test.js (format); users_admin.test.js (case) |
| INP-15 | File upload | wrong type, renamed `.exe`, empty, max+1 | rejected by content, not only extension | cctv_footage, announcements, profile_avatar, room_gallery, public_file |
| INP-16 | Double submit | same POST twice, fast | one effect | webhook, announcements; concurrency_races.test.js |
| INP-17 | Wrong method | GET on a write endpoint, POST on a read endpoint | error, no side effect | role_matrix.test.js |
| INP-18 | Oversize body | very large JSON | rejected, service stays up | Manual |

---

## Part C: Per module

Risk order for test effort: Billing, Security and access, Contracts, Tenants, then the rest. The smoke line says what to open first after a deploy.

### C1. Security and access (Module 11), risk: very high
Smoke: admin login, tenant login, tenant calls an admin endpoint and is refused.

| ID | Type | Scenario | Expected | Automated |
|---|---|---|---|---|
| Q11-01 | Happy | Login with a correct password | session token returned | auth.test.js |
| Q11-02 | Negative | Wrong password, unknown email | same generic response for both, no enumeration | auth.test.js (wrong password); auth_password_lifecycle.test.js (unknown email) |
| Q11-03 | Sec | Forged `X-User-Id` / `X-Admin-Id` | ignored, identity from the session | auth.test.js |
| Q11-04 | Sec | Archived account's old token | refused | auth.test.js |
| Q11-05 | Sec | No token, malformed token | 401, no data | auth.test.js, role_matrix.test.js |
| Q11-06 | Sec | Role matrix: none, tenant, admin against each admin-only and tenant-only endpoint | 401 or 403, no side effect | role_matrix.test.js |
| Q11-07 | Negative | Unverified email | no session until verified; link works once | auth_security.test.js |
| Q11-08 | Negative | New device login | code sent, no session; 3 wrong codes lock it | auth_security.test.js |
| Q11-09 | Happy | `forgot_password` for a known email | email sent, reset row created | auth_password_lifecycle.test.js |
| Q11-10 | Sec | `forgot_password` for an unknown email | identical response to Q11-09 | auth_password_lifecycle.test.js |
| Q11-11 | Sec | Reset token used twice, expired, wrong | second use, expired and wrong all refused | auth_password_lifecycle.test.js |
| Q11-12 | Negative | Reset with weak or mismatched password | 4xx, token stays valid, password unchanged | auth_password_lifecycle.test.js |
| Q11-13 | Sec | Reset success | all existing sessions signed out | auth_password_lifecycle.test.js |
| Q11-14 | Sec | `change_password` with wrong old password | refused | auth_password_lifecycle.test.js |
| Q11-15 | Sec | `logout`, then reuse the token | token rejected | auth_password_lifecycle.test.js |
| Q11-16 | Sec | `manage_users`: role change, self-demotion, archive | allowed only for admin; cannot remove the last admin | users_admin.test.js |
| Q11-17 | Sec | Password login brute force (own test account) | throttled or locked per policy | login_bruteforce.test.js (device-code lockout: auth_security.test.js) |

### C2. Billing and payments (Module 3), risk: very high
Smoke: tenant opens invoices, admin opens the billing list.

| ID | Type | Scenario | Expected | Automated |
|---|---|---|---|---|
| Q3-01 | Happy | Pay a bill online, webhook settles it | paid once, balance 0 | online_payments, webhook |
| Q3-02 | Sec | Webhook replay, bad signature | no second effect; bad signature refused | webhook.test.js |
| Q3-03 | Boundary | Partial payment: 0, 0.01, balance, balance + 0.01 | exact balances in cents; overpay refused | partial_payments, split_payment |
| Q3-04 | Negative | Reference reused | refused | reference_reuse.test.js |
| Q3-05 | Sec | Pay another tenant's invoice | 403 or 404, no change | pay_bill_methods, partial_payments |
| Q3-06 | Boundary | Adjustments and deposit deductions | amounts validated, balances correct | invoice_adjustments, deposit_deductions, balance_rules |
| Q3-07 | Negative | `create_invoice`: missing tenant, bad amount, duplicate period | 422 or conflict, nothing created | invoice_refund.test.js |
| Q3-08 | Boundary | `advance_payment` amounts and months | validated; advance rent excluded from "owed" | invoice_refund.test.js |
| Q3-09 | State | Refund request, respond approve, respond reject, respond twice | one decision only; second call refused | invoice_refund.test.js |
| Q3-10 | Sec | Refund on another tenant's payment | refused | invoice_refund.test.js |
| Q3-11 | Conc | Two admins record the same payment at once | exactly one payment row | concurrency_races.test.js |
| Q3-12 | Happy | Charges post to invoices once (service, maintenance, parking) | claim-first, reversal backs out | charge_posting.test.js |

### C3. Contracts (Module 9), risk: high
Smoke: admin opens the contracts list.

| ID | Type | Scenario | Expected | Automated |
|---|---|---|---|---|
| Q9-01 | Happy | Contract end and checkout release | tenancy ends, unit released | contract_end, release_checkout |
| Q9-02 | Happy | Rent extension; conflicts with a reservation | blocked when conflicting | extension, extension_conflicts |
| Q9-03 | Happy | `create_contract` for an approved application | one contract per application | contract_lifecycle.test.js |
| Q9-04 | Negative | `create_contract` twice, or for a non-approved application | second and invalid refused | contract_lifecycle.test.js |
| Q9-05 | State | `update_contract_status` each valid and forbidden transition | forbidden ones refused, state unchanged | contract_lifecycle.test.js |
| Q9-06 | Boundary | Start or end date invalid, end before start | rejected | contract_lifecycle.test.js |
| Q9-07 | Happy | `record_move_out` | tenancy ended, parking released, deposit step reachable | contract_lifecycle.test.js |
| Q9-08 | Sec | Tenant calls an admin contract endpoint | 403 | role_matrix.test.js |

### C4. Tenant management and applications (Module 1), risk: high
Smoke: admin opens the tenant list; a guest submits an application.

| ID | Type | Scenario | Expected | Automated |
|---|---|---|---|---|
| Q1-01 | State | Application transitions, archive, restore, cancel releases holds | only allowed transitions | application_lifecycle.test.js |
| Q1-02 | Negative | Requirements missing or too long | rejected | application_requirements.test.js |
| Q1-03 | Boundary | Move-in date limits; child floor rule | rejected outside rules | move_in_date, child_floor_rule |
| Q1-04 | Boundary | `update_occupants` count above or below the unit limit | rejected | users_admin.test.js |
| Q1-05 | Sec | Tenant edits another tenant's occupants | refused | users_admin.test.js |
| Q1-06 | Happy | Avatar upload and file serving | valid image only | profile_avatar, public_file |
| Q1-07 | Boundary | Name with apostrophe, accents, emoji | stored and shown identically | unicode_and_markup.test.js |

### C5. Unit management (Module 2) and parking (Module 10), risk: medium
Smoke: public room list loads.

| ID | Type | Scenario | Expected | Automated |
|---|---|---|---|---|
| Q2-01 | Happy | Room summary and gallery | correct counts and images | room_summary, room_gallery |
| Q2-02 | Negative | `create_room` / `update_room` with bad rent, duplicate number | rejected | rooms_parking_admin.test.js |
| Q2-03 | Sec | Tenant calls `archive_room` | 403 | role_matrix.test.js |
| Q10-01 | Happy | Parking slot release on move-out and archive | slot freed, no orphan | parking_guards_orphan_cleanup |
| Q10-02 | Conc | Two tenants reserve the last slot | one wins | rooms_parking_admin.test.js (serialized, see concurrency_races.test.js header); true overlap is Manual |

### C6. Maintenance (Module 4) and Services (Module 5), risk: medium
Smoke: tenant submits a request; admin sees it.

| ID | Type | Scenario | Expected | Automated |
|---|---|---|---|---|
| Q4-01 | State | Visit scheduling, progress, cancel, not-fixed request | allowed transitions only | maintenance_workflow.test.js |
| Q4-02 | Sec | Tenant views another tenant's request | refused | maintenance_workflow.test.js |
| Q4-03 | Boundary | Description with markup, emoji, long text | stored as text | unicode_and_markup.test.js |
| Q5-01 | State | Confirmed visits, cancel rules, capacity, ratings | rules enforced | service_workflow.test.js |
| Q5-02 | Sec | Rate someone else's booking | refused | service_workflow.test.js |
| Q5-03 | Conc | Two bookings for the last capacity slot | one wins | concurrency_races.test.js |

### C7. Finance, utilities and reports (Module 8), risk: medium
Smoke: dashboard loads with a date range.

| ID | Type | Scenario | Expected | Automated |
|---|---|---|---|---|
| Q8-01 | Happy | Dashboard range and attention list | numbers match DB | dashboard_range, dashboard_attention |
| Q8-02 | Boundary | Utility reading: negative, zero, lower than previous | rejected | utility_bill.test.js |
| Q8-03 | Sec | Tenant opens an admin report | 403 | role_matrix.test.js |
| Q8-04 | Happy | Activity log written for each write | row with actor and category | expenses_reports.test.js (log reads); per-write logging checked in each feature file; module_verification_guide §11.5 |

### C8. Notifications (Module 6), risk: medium
Smoke: bell shows unread count.

| ID | Type | Scenario | Expected | Automated |
|---|---|---|---|---|
| Q6-01 | Happy | Registration and payment notifications created once | one row per event | registration_notifications, webhook |
| Q6-02 | Sec | Mark or delete another user's notification | refused | notifications_crud.test.js |
| Q6-03 | Happy | Preferences saved | stored per user | notifications_crud.test.js |
| Q6-04 | Happy | Email and SMS delivery | sent via mock in test mode | Manual (sms_email_mock_testing.md) |

### C9. Visitors (Module 12), announcements, CCTV, settings, risk: medium
Smoke: guard page loads.

| ID | Type | Scenario | Expected | Automated |
|---|---|---|---|---|
| Q12-01 | Happy | Visitor dated, overstay alert | alert once | visitors.test.js |
| Q12-02 | Sec | Tenant sees only their visitors | scoped | visitors.test.js |
| QA-01 | Happy | Announcement draft, schedule, pin, no double send | one send | announcements, announcement_schedule, announcement_pinning |
| QC-01 | Sec | CCTV consent, incident, footage access | gated by consent and role | cctv_* files |
| QS-01 | Boundary | Settings rules (types, ranges) | invalid rejected | settings, appearance_settings |

### C10. Chat (Module 7), risk: medium; not yet audited
Smoke: guest chat link opens. Only guest chat is automated (guest_chat, guest_chat_links, including the 429 on the 4th request). Admin and tenant chat (`send_message`, `save_message`, `get_chat_history`, `get_conversations`) are covered for session identity, scoping and attachments by chat_messages.test.js; recipient restrictions and rate limits (CH-3) are not tested because the app has none; see [security_audit.md](../security_audit.md) §6e.

---

## Part D: Release checklist

1. `cd tests/api && npm test` passes (note any file you could not run).
2. `cd ams-react && npm run lint && npm run build`.
3. `php -l` on every `backend/**/*.php`; `phpstan` if installed.
4. Schema import check on a scratch DB (CLAUDE.md "Schema" CI step).
5. Smoke lines of every module you touched, by hand.
6. For each manual write test: `/db-snapshot` first, restore after.
7. Look at `git diff` for: `0` treated as empty, two-tab races, work after `commit()`, queries in loops, other callers of changed shared functions.

## Part E: Adding to this guide

- A new automated test file adds its rows here and its count to `api_testing.md` in the same commit.
- Change `Planned` to the file name only once the test passes.
- Do not mark a row automated from a file name match. Read what the test asserts.
