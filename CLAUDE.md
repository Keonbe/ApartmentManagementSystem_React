# AMS — Claude Code guide

@AGENTS.md

The shared guide above (stack, run/verify, backend conventions, documentation update rules, commit workflow) applies to Claude too. Claude-only additions:

## Session start
1. Read `TASK.md` (local, gitignored: current workstream + open items) in addition to `SPRINT.md`. Finished work is in `TASK.archive.md`: grep by topic, never read whole.
2. Then follow the shared Session start steps.

## Claude-specific rules
- Use `/db-snapshot` for snapshots, restores and scratch DBs. Hooks and permissions: `docs/documentation/claude_code_guide.md`.
- Work directly. Subagent only for broad read-only sweeps whose raw output the main thread doesn't need (prefer `repo-sweep`, Sonnet), or when the user asks for one.
- Prefer Edit over full-file Write. Write heredocs fail on tricky quoting: use the Write tool for message/script files.
- Before stopping: update `TASK.md`; once committed, move the section to `TASK.archive.md`, keeping only unfinished points under "Open items". Also update `SPRINT.md` and the docs per the shared "Documentation update rules".
