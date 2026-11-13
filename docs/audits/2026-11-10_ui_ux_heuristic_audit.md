# AMS UI/UX Heuristic Audit (AI-assisted)

**Date:** 2026-11-10
**Method:** Static review of `ams-react/src` by Claude Code (AI), using Nielsen's 10 usability heuristics and the ISO/IEC 25010 usability sub-characteristics.
**Not done:** no real users were observed and no Lighthouse, axe or screen-reader run was made. Sections 1-5 are from code. A later browser pass (23 admin and 16 tenant pages, scratch data) is in section 6 and in [2026-11-10_iso25010_evidence_map.md](2026-11-10_iso25010_evidence_map.md) §3.3.

> **Disclosure.** This is a tool-assisted code audit, not an independent human expert evaluation and not survey data. It does not replace the ISO/IEC 25010 questionnaire answered by real evaluators. If cited in the thesis, cite it as an AI-assisted audit. Counts are from grep and are approximate.

## 1. Executive summary

**Scope:** admin and tenant roles; login and OTP, navigation, dashboards, data tables, forms and modals, notifications and settings.

**Verdict:** the foundation is stronger than most capstone systems: shared dialog, validation and load-error building blocks exist, accessibility landmarks are present, and there are three tenant themes plus admin dark mode. The weaknesses are that those building blocks are applied unevenly. The older admin pages still use native `alert()` and `window.confirm()`, form modals lose unsaved input, and tenant pages can show a fetch failure as "no data".

## 2. Short critique

**Overall.** The layout is organised by role, with a skip link, `aria-current` navigation and a mobile drawer on both sides. Type sizes, radii and shadows come from a Tailwind `@theme` block (`index.css:32-59`). The dashboard's four KPI cards (collected, still owed, occupancy, open maintenance) tell an admin what matters within seconds.

**Strengths**
1. **Reusable safety components.** `ConfirmDialog` focuses Cancel first so Enter can't confirm by accident; `Modal` locks while a save is running (`busy`); `useFieldErrors` validates on blur and maps server errors onto fields; `useLoadState` + `LoadError` give a retry button.
2. **Honest failure copy.** A failed dashboard load says it is "not an all-clear" (`AdminDashboard.jsx:80`), rather than showing zeros.
3. **Accessible sign-in.** The OTP step has labelled single-digit boxes with paste, arrow-key and backspace handling (`Login.jsx:145-171`).

**Friction points**
1. A stray backdrop click or Escape discards a half-filled form modal.
2. Feedback is a mix of blocking `alert()`, custom toasts and nothing, so users can't predict how success or failure will appear.
3. Several irreversible actions are guarded by a browser `confirm()` or by nothing.

## 3. Heuristic matrix

Ratings are the auditor's judgement from code evidence. They are not Likert scores and not respondent data.

| ISO 25010 sub-characteristic | Rating | Evidence |
|---|---|---|
| Appropriateness recognizability | Strong | Focused KPI cards and attention list; role-specific home (`AdminDashboard.jsx:89-130`, `MyRoom.jsx`). |
| Learnability | Adequate | Predictable sidebar groups and a tenant top bar, but no breadcrumbs, no onboarding, and no progress indicator in the rent application. |
| Operability | Adequate | Good dialog and keyboard handling; weak on tables (no sort, little pagination), no shortcuts, inconsistent confirmation. |
| User error protection | Needs work | Strong inline validation, undermined by lost modal input, unconfirmed eviction flag and `window.confirm` on refunds. |
| UI aesthetics | Adequate | Consistent tokens in the shell; 64 hardcoded hex colours, 162 arbitrary 9-11px text sizes, page-by-page status colours. |
| Accessibility | Adequate | Landmarks, skip link, 44px targets on tenant pages, 136 `focus-visible` uses; gaps in focus rings, live regions and contrast. |
| Responsiveness | Adequate | Cards on mobile for Tenants and Applications; Maintenance, Contracts and Inquiries only scroll sideways. |

## 4. Detailed findings

Severity follows Nielsen's 0-4 scale (4 = usability catastrophe).

### 4.1 Consistency and standards
| Sev | Finding | Evidence |
|---|---|---|
| 2 | Status colours are defined per page rather than through the shared `badge(tone)` helper (used in about 4 files). Some break the written colour meaning (refund "Approved" is indigo, contract "Draft" is amber). | `Components/admin/ui/styles.js`; `utils/refundFormat.js:6`; `AdminContracts.jsx:53`; `UserPaymentHistory.jsx:20` |
| 2 | No shared toast system; `AdminUsers.jsx:74` and `AdminPaymentOptions.jsx:61` build their own. | `AdminUsers.jsx:74,408` |
| 1 | 64 hardcoded 6-digit hex colours in JSX, leftover Vite starter variables, direct `indigo-*` utilities instead of a semantic token. | `index.css:8-23, 62-71` |
| 1 | The admin side is largely English-only while the tenant side has English/Filipino; OTP step text is untranslated. | `Login.jsx:285, 306-307` |

### 4.2 Visibility of system status
| Sev | Finding | Evidence |
|---|---|---|
| 3 | Tenant fetch failures look like empty data: "No room to show" with no retry, and invoice load errors only logged, then marked loaded. | `MyRoom.jsx:152-154, 376-384`; `hooks/useInvoiceWatch.js:64-67` |
| 2 | About 100 native `alert()` calls report success and failure, blocking the screen (22 in `AdminContracts.jsx`). | `AdminContracts.jsx:284-531` |
| 2 | `aria-live` is used about 4 times, so most status changes aren't announced. The main login error has no `role="alert"`. | `Login.jsx:371-374` |
| 2 | No React error boundary; a render error blanks the page. | n/a |
| (+) | Skeletons in about 69 files; about 145 buttons disabled while requests run; `busy` lock on large modals. | `Components/admin/Modal.jsx:25` |

### 4.3 Error prevention and recovery
| Sev | Finding | Evidence |
|---|---|---|
| 3 | Form modals close on backdrop click or Escape with no unsaved-changes check. `closeOnBackdrop` defaults to true and no caller passes false. Affects Create Contract, Utility Bill, Move-Out Inspection, Adjust Invoice. | `Components/admin/Modal.jsx:23`; `AdminContracts.jsx:738`; `AdminTenants.jsx:1170` |
| 3 | Flag-for-eviction runs immediately: no confirmation, no busy state, so it can be double-submitted. | `AdminContracts.jsx:507-519` |
| 3 | About 15 destructive actions use `window.confirm` instead of `ConfirmDialog`, including the irreversible PayMongo refund. | `AdminRefunds.jsx:90`; `AdminPayments.jsx:734`; `AdminUnits.jsx:119` |
| 2 | Terminating a contract asks twice (modal, then native confirm). | `AdminContracts.jsx:544` |
| 2 | Unsaved-changes warning (`beforeunload`) exists only on two settings pages; no `useBlocker` for in-app navigation. | `AdminPaymentOptions.jsx:49-59` |
| 2 | Rent application draft is saved to `sessionStorage` but excludes uploaded documents; inquiry, parking and move-in forms have no draft or progress display. | `RentApplication.jsx:43-48` |
| (+) | Inline validation, payment confirm that re-checks the bill, Cancel-first dialogs. | `hooks/useFieldErrors.js`; `AdminPayments.jsx:683` |

### 4.4 Accessibility and responsiveness
| Sev | Finding | Evidence |
|---|---|---|
| 2 | About 43 `outline-none` class strings with no `focus:` replacement; the admin hamburger and login submit have no visible focus ring. | `AdminDashboardHeader.jsx:213`; `Login.jsx:377` |
| 2 | Tables: no sortable headers or `aria-sort`; pagination only in Payments history; search text and sort lost on refresh or Back. | `AdminTenants.jsx:61,64`; `AdminPayments.jsx:402` |
| 2 | Maintenance, Contracts and Inquiries only scroll sideways on mobile. | `AdminMaintainance.jsx:1151`; `AdminContracts.jsx:686` |
| 1 | Contrast risk: `text-amber-500` on white/amber-50, and 167 uses of `text-slate-300/400`. | `UserNotifications.jsx:27`; `UserMyRequests.jsx:466` |
| 1 | Only about 45% of buttons carry an `aria-label` (many are text buttons; icon-only coverage needs a manual check). Sidebar mode switch is about 32px. | `AdminSidebar.jsx:271` |
| 1 | 18px root font with px-based tokens works against user text scaling. | `index.css:79` |
| 1 | No breadcrumbs, no global keyboard shortcuts, no table density control. | n/a |
| (+) | Skip link, `aria-current`, Escape-to-close menus, 44px tap targets on tenant pages, Light/Dark/Glass themes. | `AdminSidebar.jsx:460`; `TopBar.jsx:365` |

### 4.5 Other observation
Route guards read the role from browser storage and `JSON.parse` it without try/catch (`App.jsx:85-99, 109, 203`). The server enforces real access, so this is a UX/robustness issue (a corrupted storage value crashes the app), not an access-control hole. Not re-verified against the API.

## 5. Recommendation roadmap

**High (quick wins)**
1. Add a dirty-state guard to `Modal` (confirm before closing, or `closeOnBackdrop={false}` on form modals).
2. Put eviction flag behind `ConfirmDialog` with a busy state; swap `window.confirm` for `ConfirmDialog`, starting with `AdminRefunds.jsx:90`.
3. Add `role="alert"` to the login error; give `outline-none` controls a `focus-visible` ring.
4. Add an error state and retry to `MyRoom` and `useInvoiceWatch`; add a top-level error boundary.
5. Wrap the `JSON.parse` in the route guards with try/catch.

**Medium (workflow)**
1. One shared toast (with `aria-live`) to replace `alert()`.
2. Move per-page status maps onto `badge(tone)` and fix the off-meaning colours.
3. Keep search text and sort order in the URL via `useUrlFilter`; link KPI cards to filtered lists.
4. Card layout on mobile for Maintenance, Contracts, Inquiries; sortable headers with `aria-sort`; pagination for long tables.
5. Progress indicator and draft saving for the rent application, inquiry and move-in forms.

**Low (long-term)**
1. Breadcrumbs, keyboard shortcuts, table density control, CSV export.
2. Retire hardcoded hex and Vite leftovers; move to rem-based tokens.
3. Chart legend and a table alternative for `IncomePanel`; extend Filipino to the admin side if wanted.

## 6. Observed in the browser (added after the code review)

Scratch backend with seed data; Playwright at 1366 px and phone width. Full table in the evidence map §3.3.

**Confirmed from the code audit**
- The login error ("email or password incorrect") was **not** announced to screen readers (no `role="alert"`/`aria-live`), and focus fell to `<body>` after the failed submit. **Fixed 2026-11-10** (`role="alert"` plus focus back on the password field; verified in the browser).
- Small touch targets are widespread: admin Users 66 controls under 32 px, Units 33, Tenants 29, Contracts 25; tenant pages 3-6 under 44 px each, Notifications 17.
- `view-contract` has no `<h1>`; Reports and Other Settings have two.

**New**
- **Payment Options showed the browser's "leave page?" warning on a fresh load with no edits (fixed 2026-11-10).** The cause was the password manager autofilling the admin's saved login into the PayMongo secret key and a QR slot's account number; saving would have stored them. Password fields now use `autoComplete="new-password"` (see evidence map §3.6).
- **Dev login returns 500** (schema drift: migration `2026_11_workstream.sql` not applied to dev). Not a UI bug, but the first thing an evaluator on that setup would see.

**Better than the code review suggested**
- 39 pages, **0 console errors, 0 failed requests, 0 unnamed buttons, 0 images without `alt`**, one unlabeled field (Other Settings).
- **No page-level horizontal overflow at 375/390 px on any page.** The earlier remark that Maintenance, Contracts and Inquiries "only scroll sideways" means the tables scroll inside their own container, which is acceptable but not a card layout; I did not measure the container scroll.
- Tenant keyboard focus: every control tabbed on My Room and Pay Bills had a visible indicator.
- DOM ready 51-157 ms; network idle 0.85-1.7 s (small seed data, local server).

## 7. Limits and what to do next
- Run axe or Lighthouse and a keyboard-only pass on the main flows to confirm the accessibility items; this audit only read code.
- Counts (`aria-label`, `alert(`, hex colours) are grep estimates.
- Use the findings to prepare for the real evaluators' Usability items (ease of learning, ease of use, error-prevention prompts): the High list above covers the likeliest deductions.
