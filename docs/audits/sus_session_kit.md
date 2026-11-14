# SUS Session Kit (usability test with real users)

**Date prepared:** 2026-11-13
**Purpose:** everything needed to run one usability session and report it in Chapter 4. It turns [2026-11-10_real_world_test_guide.md](2026-11-10_real_world_test_guide.md) §1 and §9 into sheets you can print. The audit gap this closes is RD-01: no real-user evidence exists yet (SPRINT 148).
**What it produces:** task success and time per task, wrong clicks, the top problems, and a SUS (System Usability Scale) score with the number of respondents.
**Status:** the kit is ready; **no session has been run yet.** Do not cite numbers until one has.

---

## 1. Plan

| Item | Decision |
|---|---|
| Who | 5 tenants and 5 admin or office staff who have **not** used AMS before and are not the developers. If only a few people are available, run what you can and report the real n (3 per role is still evidence, with the limitation stated). |
| Length | About 35 minutes each: 5 min briefing, 20 min tasks, 5 min SUS, 5 min open questions. |
| Where | A test copy of the system, never production. Use the dev database with a snapshot taken first (see §2). |
| Devices | Tenants on their own phone or a laptop; admins on a laptop. Note the device and browser. |
| Observer | One person per session who reads the tasks, times them and writes things down. They do **not** help. |
| Recording | Notes on the observer sheet (§4). Screen recording only if the participant agrees. |

## 2. Before each day of sessions

1. Snapshot the dev database so every participant starts from the same data:
   ```bash
   bash .claude/skills/db-snapshot/snapshot.sh save before-sus
   ```
   After each participant, or at least each day:
   ```bash
   bash .claude/skills/db-snapshot/snapshot.sh restore
   ```
   (Log in again after a restore; old session tokens are gone.)
2. Start XAMPP (Apache and MySQL), open the built site (`npm run build:local` was run), and check it loads on the participant's device.
3. Accounts (all demo data, `@demo.example`):

   | Role | Login | Password |
   |---|---|---|
   | Tenant (paid up) | `maria.santos@demo.example` | `tenant123` |
   | Tenant (has an overdue bill) | `jose.reyes@demo.example` | `tenant123` |
   | Admin | `admin@gmail.com` | `admin123` |

   Give each participant one account of their role. Check that the tenant account has a bill that can be paid before the session starts.
4. Print §3 (briefing), §4 (observer sheet) and §5 (SUS) for each participant. Have the CSV from §7 open.

## 3. Briefing (read aloud) and consent

> "Thank you for helping. We are testing the system, **not you**. If something is confusing, that is a problem with the system and it helps us to know. Please say out loud what you are thinking. I will not be able to help you during the tasks, but you can stop at any time. What you do is recorded only as notes, without your name, and used for a school research study. Do you agree to take part?"

Record on the sheet: *Consent given: yes / no.* Without a yes, stop.

## 4. Task cards and observer sheet

Read **one task at a time**. Start the timer when they begin; stop it when they say they are done or give up (stop after 3 minutes). Mark: **Y** done alone, **H** done with a hint (say what you hinted), **N** not done.

### Tenant tasks

| # | Task (read aloud) | Success is |
|---|---|---|
| T1 | "You have just logged in. Find your next bill and pay it by uploading proof of payment." | Proof submitted |
| T2 | "Something in your unit is broken. Send a maintenance request with a photo." | Request visible in My Requests |
| T3 | "A friend is visiting next Saturday. Register them as a visitor." | Visitor in the list |
| T4 | "Book a cleaning service." | Booking confirmed |

### Admin tasks

| # | Task (read aloud) | Success is |
|---|---|---|
| A1 | "A new rent application came in. Approve it and create the contract." | Contract exists |
| A2 | "A tenant paid cash at the office. Record that payment." | Invoice marked Paid |
| A3 | "Take a maintenance request from new to Done." | Status Done, tenant notified |
| A4 | "Get this month's report and export it as CSV." | File opens in Excel |
| A5 | "Enter a wrong value on purpose (a bad date or a duplicate), then recover." | Error understood and fixed without help |

### Observer sheet (one per participant)

| Field | |
|---|---|
| Participant ID (T1..T5 / A1..A5) | |
| Role / device / browser | |
| Date / observer | |
| Consent given | yes / no |

| Task | Y / H / N | Seconds | Wrong clicks | Hint given | Quote or confusion |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 (tenant) or 4-5 (admin) | | | | | |
| 5 | | | | | |

After the tasks ask: *What was the most confusing part? What did you like? Anything missing?* Write the answers down in the participant's words.

## 5. SUS questionnaire

Give the form after the tasks, before any discussion. Ask them to answer quickly, by instinct, 1 = strongly disagree, 5 = strongly agree.

| # | English | Filipino |
|---|---|---|
| 1 | I think that I would like to use this system frequently. | Sa tingin ko, gusto kong gamitin ang sistemang ito nang madalas. |
| 2 | I found the system unnecessarily complex. | Nakita kong hindi kailangang maging kumplikado ang sistema. |
| 3 | I thought the system was easy to use. | Sa tingin ko, madaling gamitin ang sistema. |
| 4 | I think that I would need the support of a technical person to be able to use this system. | Sa tingin ko, kakailanganin ko ang tulong ng taong may teknikal na kaalaman para magamit ang sistemang ito. |
| 5 | I found the various functions in this system were well integrated. | Nakita kong maayos na magkakaugnay ang iba't ibang tungkulin ng sistema. |
| 6 | I thought there was too much inconsistency in this system. | Sa tingin ko, may sobrang hindi pagkakapare-pareho sa sistemang ito. |
| 7 | I would imagine that most people would learn to use this system very quickly. | Sa tingin ko, mabilis matututuhan ng karamihan ng tao ang sistemang ito. |
| 8 | I found the system very cumbersome to use. | Nakita kong napakahirap gamitin ang sistema. |
| 9 | I felt very confident using the system. | Nakadama ako ng tiwala sa paggamit ng sistema. |
| 10 | I needed to learn a lot of things before I could get going with this system. | Kailangan kong matuto ng maraming bagay bago ako makapagsimula sa sistemang ito. |

The English items are the standard SUS wording. The Filipino wording is a working translation: have your adviser or a Filipino-speaking reader check it before you use it, and say in the thesis which version each participant used.

Each row: ☐1 ☐2 ☐3 ☐4 ☐5

## 6. Scoring

For each participant:
- odd items (1, 3, 5, 7, 9): answer − 1;
- even items (2, 4, 6, 8, 10): 5 − answer;
- add the ten values and multiply by 2.5. The score is 0 to 100.

Worked example, answers 4 2 5 1 4 2 5 1 4 2: odd items give 3+4+3+4+3 = 17, even items give 3+4+3+4+3 = 17, so (17+17) × 2.5 = **85**.

Report the **mean and the range** per role and overall, with n. A mean of about 68 is average, 80 or more is good. SUS is a single score for overall usability, not a diagnosis: use the observer sheets for the reasons.

## 7. Entering the results

Use [sus_scoring_template.csv](sus_scoring_template.csv): paste each participant's ten answers in the row with their ID, and the score fills in once all ten are entered. Delete the `EXAMPLE` row before reporting.

## 8. Results template (copy into the thesis or the audit)

**Session summary.** Date(s): ____. Participants: __ tenants, __ admins (n = __). Devices: ____. Build or commit tested: ____.

| Role | n | Mean SUS | Lowest–highest |
|---|---|---|---|
| Tenant | | | |
| Admin | | | |
| All | | | |

| Task | Done alone | Done with a hint | Not done | Median seconds | Wrong clicks (total) |
|---|---|---|---|---|---|
| T1 / A1 | | | | | |
| T2 / A2 | | | | | |
| T3 / A3 | | | | | |
| T4 / A4 | | | | | |
| A5 | | | | | |

**Top 5 problems** (what happened, how many people, severity 1–3, which page):

1.
2.
3.
4.
5.

**Compare with the heuristic audit** ([2026-11-10_ui_ux_heuristic_audit.md](2026-11-10_ui_ux_heuristic_audit.md)): which of its High findings did participants actually hit, and which new ones appeared?

**Limitations to state:** small n; participants known to the researchers; test data, not a live property; Filipino SUS wording not formally validated.

**Then:** update SPRINT row 148 (n, mean SUS, date), the ISO 25010 evidence map items 9–11, and audit row RD-01.
