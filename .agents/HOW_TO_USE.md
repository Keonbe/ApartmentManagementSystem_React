# How to Use AGENTS.md + Ponytail on This Project

## What AGENTS.md Does

The `.agents/AGENTS.md` file is automatically loaded by the AI agent at the start of every conversation on this workspace. It gives the agent:

- The full stack and folder layout so it doesn't have to rediscover the codebase
- Database rules (join patterns, naming, migration policy)
- PHP and React code templates it should follow
- A map of what's done vs. what still needs wiring (Priorities B–E)
- Guard rails (files that shouldn't be touched without a discussion)

You don't need to do anything for it to activate — it loads automatically.

---

## Ponytail Commands — Quick Reference

Type these in chat at any time:

```
ponytail lite      → quick mode: ship the minimum, no extras
ponytail full      → default: YAGNI + no invented abstractions
ponytail ultra     → aggressive: challenge every line's right to exist
ponytail off       → disable: for complex animation/UI scaffolding work
ponytail-review    → review the current changes for what can be cut
ponytail-audit     → sweep the whole repo for dead weight
ponytail-help      → show all levels and what they do
ponytail-gain      → show measured impact (lines removed, etc.)
```

---

## Recommended Workflows

### 1 — Starting a new feature
```
ponytail full
"implement Priority B: wire AdminReports to get_report_data.php"
```
The agent will use the stack knowledge from AGENTS.md and cut any over-engineering via ponytail.

### 2 — Before committing
```
ponytail-review
```
Paste your diff or name the files. The agent will tell you exactly what lines to delete before pushing.

### 3 — General maintenance / bug fix
```
ponytail lite
"fix the CCTV request table not showing tenant names"
```
Lite mode is fast — it solves the bug without restructuring anything.

### 4 — Periodic cleanup
```
ponytail-audit
```
Run this every few weeks. The agent scans the repo and lists dead code, duplicate logic, and one-implementation abstractions.

### 5 — Checking what's left to build
```
"what's Priority C and how do I implement it?"
```
The agent will read `docs/todo.md` and `docs/system_design.md` (both in AGENTS.md's context) and give you a concrete plan.

---

## Keeping AGENTS.md Fresh

Update `.agents/AGENTS.md` whenever:

| Event | What to update |
|---|---|
| New table added | Add a row to the Key Tables section |
| New API endpoint pattern established | Note it in PHP Endpoint Template |
| Priority A–E item completed | Move it to the "Done" section or remove it |
| New "do not touch" file identified | Add it to the bottom guard rail list |

To ask the agent to update it for you:
```
"update .agents/AGENTS.md to reflect that Priority B is done"
```

---

## Tips

- **Be specific with ponytail level.** `ultra` before shipping, `lite` for hotfixes.
- **Combine with `/goal`** for long overnight tasks:
  ```
  ponytail full
  /goal implement Priority D (move-out request) end to end
  ```
- **After a big session**, ask:
  ```
  ponytail-review
  "review everything changed in this session"
  ```
- The `// ponytail: <ceiling>` comment pattern is your friend — it marks known shortcuts without hiding them.
