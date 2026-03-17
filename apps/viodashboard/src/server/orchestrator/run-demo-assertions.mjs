import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scripts = [
  'assert-demo-success.mjs',
  'assert-demo-revise.mjs',
  'assert-demo-retry.mjs',
  'assert-demo-retry-code-target.mjs',
];

function runScript(scriptName) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: path.resolve(__dirname, '../../../..'),
    encoding: 'utf8',
  });

  return {
    scriptName,
    scriptPath,
    status: result.status,
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function main() {
  const results = scripts.map(runScript);
  const passed = results.filter(result => result.ok);
  const failed = results.filter(result => !result.ok);

  printSection('DEMO ASSERTION RUNNER');
  console.log(`total: ${results.length}`);
  console.log(`passed: ${passed.length}`);
  console.log(`failed: ${failed.length}`);

  for (const result of results) {
    printSection(`${result.ok ? 'PASS' : 'FAIL'} ${result.scriptName}`);
    const out = (result.stdout || '').trim();
    const err = (result.stderr || '').trim();
    if (out) {console.log(out);}
    if (err) {console.error(err);}
  }

  if (failed.length > 0) {
    printSection('OVERALL RESULT');
    console.log('ASSERTION_SUITE_FAIL');
    process.exit(1);
  }

  printSection('OVERALL RESULT');
  console.log('ASSERTION_SUITE_PASS');
}

main();
