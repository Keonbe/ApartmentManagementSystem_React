// PreToolUse hook (Bash|PowerShell): ask for confirmation before a shell
// command that can wipe a database. It never blocks outright.
const fs = require('fs');

let input = {};
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const cmd = (input.tool_input && input.tool_input.command) || '';
const usesMysql = /\bmysql(\.exe)?\b/i.test(cmd);
let reason = '';

if (/\bdrop\s+(database|schema)\b/i.test(cmd)) {
  reason = 'This command drops a database. Check the name is not the dev ams_db (or that a dump exists).';
} else if (usesMysql && /SetupDB\.sql/i.test(cmd)) {
  reason =
    'SetupDB.sql hardcodes `USE ams_db`: importing it into any database name still rebuilds dev ams_db ' +
    '(this wiped dev on 2026-10-07). For a scratch DB, sed the name first.';
} else if (usesMysql && /(seed_mock_data|clear_and_seed|seed_reset|seed_prod_demo(_reset)?)\.sql/i.test(cmd)) {
  reason = 'This seed/reset script overwrites data and also targets ams_db. Never run seed_mock_data.sql on prod.';
}

if (reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: reason,
      },
    })
  );
}
