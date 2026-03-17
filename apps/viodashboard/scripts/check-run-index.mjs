#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { DEBUG_DIR, appRel } from '../src/config.mjs';

const baseDir = DEBUG_DIR;
const indexPath = path.join(baseDir, 'run-index.json');
const runId = process.argv[2];

if (!runId) {
  console.log(JSON.stringify({ ok: false, error: 'missing runId', usage: `node ${appRel('scripts', 'check-run-index.mjs')} <runId>` }, null, 2));
  process.exit(1);
}

if (!fs.existsSync(indexPath)) {
  console.log(JSON.stringify({ ok: false, runId, error: 'run-index.json missing' }, null, 2));
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const row = Array.isArray(rows) ? rows.find(item => item?.runId === runId) : null;
if (!row) {
  console.log(JSON.stringify({ ok: false, runId, error: 'runId not found' }, null, 2));
  process.exit(1);
}

const requiredAlways = ['status', 'beforeLogPath', 'afterLogPath', 'diffSummaryLogPath', 'artifactsComplete'];
const requiredOnComplete = ['completedAt'];
const missing = [];
for (const key of requiredAlways) {
  if (row[key] === undefined || row[key] === null || row[key] === '') {missing.push(key);}
}
if (['final', 'error', 'aborted'].includes(String(row.status || ''))) {
  for (const key of requiredOnComplete) {
    if (row[key] === undefined || row[key] === null || row[key] === '') {missing.push(key);}
  }
}

const fileChecks = {};
for (const key of ['beforeLogPath', 'afterLogPath', 'diffSummaryLogPath']) {
  const p = row[key];
  fileChecks[key] = !!(p && fs.existsSync(p));
  if (p && !fs.existsSync(p)) {missing.push(`${key}:file-missing`);}
}
if (row.artifactsComplete !== true) {missing.push('artifactsComplete:not-true');}

const result = {
  ok: missing.length === 0,
  verdict: missing.length === 0 ? 'PASS' : 'MISSING_FIELDS',
  runId,
  status: row.status || null,
  fileChecks,
  missing,
};

console.log(JSON.stringify(result, null, 2));
process.exit(missing.length === 0 ? 0 : 2);
