// PostToolUse hook (Edit|Write): run `php -l` on an edited .php file.
// Exit 2 sends the syntax error back to Claude; anything else stays silent.
const fs = require('fs');
const { spawnSync } = require('child_process');

let input = {};
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const file = (input.tool_response && input.tool_response.filePath) || (input.tool_input && input.tool_input.file_path);
if (!file || !/\.php$/i.test(file) || !fs.existsSync(file)) process.exit(0);

const xampp = 'C:/xampp/php/php.exe';
const php = process.env.PHP_BIN || (fs.existsSync(xampp) ? xampp : 'php');
const res = spawnSync(php, ['-l', file], { encoding: 'utf8' });

// PHP not installed on this machine: don't block the edit.
if (res.error) process.exit(0);

if (res.status !== 0) {
  process.stderr.write(`php -l failed for ${file}\n${(res.stdout || '') + (res.stderr || '')}`.trim() + '\n');
  process.exit(2);
}
