#!/usr/bin/env node
// Lightweight localhost smoke tests for the local wrapper app.
//
// Default mode is read-only and safe for an already-running local wrapper.
// Use --write-check to exercise /api/file POST against a temporary workspace file.
// Use --body-check to probe the VioBody proxy endpoint without failing the whole run
// when VioBody is intentionally offline.

import { APP_BASE_URL, APP_DIR_NAME, APP_SERVICE_NAME, appRel } from '../src/config.mjs';

const base = APP_BASE_URL;
const args = new Set(process.argv.slice(2));
const writeCheck = args.has('--write-check');
const bodyCheck = args.has('--body-check');

let passed = 0;
let failed = 0;
let skipped = 0;

function log(status, name, detail = '') {
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`${status} ${name}${suffix}`);
}

async function test(name, fn, { optional = false } = {}) {
  try {
    await fn();
    passed += 1;
    log('PASS', name);
  } catch (error) {
    if (optional) {
      skipped += 1;
      log('SKIP', name, error?.message || String(error));
      return;
    }
    failed += 1;
    log('FAIL', name, error?.message || String(error));
  }
}

async function fetchJson(path, options) {
  const res = await fetch(`${base}${path}`, options);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { res, text, json };
}

function assert(condition, message) {
  if (!condition) {throw new Error(message);}
}

await test('GET /api/health', async () => {
  const { res, json } = await fetchJson('/api/health');
  assert(res.ok, `expected 200, got ${res.status}`);
  assert(json?.ok === true, 'health ok missing');
  assert(json?.service === APP_SERVICE_NAME, 'service name mismatch');
  assert(typeof json?.startupRecovery?.recovered === 'number', 'startupRecovery.recovered missing');
});

await test('GET /api/safe-edit/state returns transaction envelope', async () => {
  const { res, json } = await fetchJson('/api/safe-edit/state');
  assert(res.ok, `expected 200, got ${res.status}`);
  assert(json?.ok === true, 'safe-edit ok missing');
  assert(Array.isArray(json?.transactions), 'transactions missing');
  assert(typeof json?.smoke?.ok === 'boolean', 'safe-edit smoke missing');
});

await test('GET /styles.css?v=smoke keeps cache-busted static path working', async () => {
  const res = await fetch(`${base}/styles.css?v=smoke`);
  const text = await res.text();
  assert(res.ok, `expected 200, got ${res.status}`);
  assert(/body|:root|\.app/i.test(text), 'styles.css content looks wrong');
});

await test('GET /api/files returns workspace listing', async () => {
  const { res, json } = await fetchJson(`/api/files?dir=${encodeURIComponent(APP_DIR_NAME)}`);
  assert(res.ok, `expected 200, got ${res.status}`);
  assert(Array.isArray(json?.entries), 'entries missing');
  assert(json.entries.some(entry => entry.name === 'src'), 'expected src directory in listing');
});

await test('GET /api/file reads app source file', async () => {
  const { res, json } = await fetchJson(`/api/file?path=${encodeURIComponent(appRel('src', 'server.mjs'))}`);
  assert(res.ok, `expected 200, got ${res.status}`);
  assert(typeof json?.content === 'string', 'file content missing');
  assert(json.content.includes('createServer(') || json.content.includes('import http from') || json.content.includes('GatewayBridge'), 'unexpected file content');
});

await test('GET /api/file rejects project-root escape', async () => {
  const { res, json } = await fetchJson('/api/file?path=../etc/passwd');
  assert(res.status >= 400, `expected error, got ${res.status}`);
  assert(/path escapes project root/i.test(json?.error || ''), 'missing root-escape guard message');
});

await test('GET /api/roadmap returns roadmap envelope', async () => {
  const { res, json } = await fetchJson('/api/roadmap');
  assert(res.ok, `expected 200, got ${res.status}`);
  assert(typeof json === 'object' && json !== null, 'roadmap payload missing');
  assert(json?.ok === true, 'roadmap ok missing');
});


await test('POST /api/roadmap/history/clear requires explicit confirm', async () => {
  const { res, json } = await fetchJson('/api/roadmap/history/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: false }),
  });
  assert(res.status >= 400, `expected error, got ${res.status}`);
  assert(/confirm=true/i.test(json?.error || ''), 'missing roadmap history confirm guard');
});

await test('POST /api/roadmap/history/clear accepts explicit confirm', async () => {
  const { res, json } = await fetchJson('/api/roadmap/history/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: true }),
  });
  assert(res.ok, `expected 200, got ${res.status}`);
  assert(json?.ok === true, 'roadmap clear ok missing');
  assert(json?.cleared === true, 'roadmap clear flag missing');
});

await test('GET /api/camera returns telemetry shape', async () => {
  const { res, json } = await fetchJson('/api/camera');
  assert(res.ok, `expected 200, got ${res.status}`);
  assert(typeof json === 'object' && json !== null, 'camera payload missing');
  assert('enabled' in json, 'camera enabled flag missing');
  assert('provider' in json || json.enabled === false, 'camera provider missing');
});

await test('GET /api/gesture/state returns watcher state', async () => {
  const { res, json } = await fetchJson('/api/gesture/state');
  assert(res.ok, `expected 200, got ${res.status}`);
  assert(typeof json?.watcherEnabled === 'boolean', 'watcherEnabled missing');
  assert(typeof json?.watcherIntervalMs === 'number', 'watcherIntervalMs missing');
});

await test('POST /api/gesture/watcher clamps interval lower bound', async () => {
  const { res, json } = await fetchJson('/api/gesture/watcher', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: false, intervalMs: 10 }),
  });
  assert(res.ok, `expected 200, got ${res.status}`);
  assert(json?.gestureRuntime?.watcherEnabled === false, 'watcherEnabled should be false');
  assert(json?.gestureRuntime?.watcherIntervalMs >= 1000, 'interval clamp failed');
});

await test('POST /api/tasks/deploy accepts a task envelope', async () => {
  const { res, json } = await fetchJson('/api/tasks/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun: true, task: { title: 'Smoke deploy task', description: 'Verify deploy endpoint shape', priority: 'low', status: 'todo', source: 'smoke-test' } }),
  });
  assert(res.ok, `expected 200, got ${res.status}`);
  assert(json?.ok === true, 'deploy ok missing');
  assert(json?.dryRun === true, 'dryRun flag missing');
  assert(typeof json?.message === 'string' && json.message.includes('Smoke deploy task'), 'deploy message missing');
});


await test('POST /api/tasks/deploy-batch accepts multiple tasks and preserves separate task identities', async () => {
  const { res, json } = await fetchJson('/api/tasks/deploy-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dryRun: true,
      tasks: [
        { id: 'smoke-task-1', title: 'Smoke batch task one', description: 'First task in batch', priority: 'low', status: 'todo', source: 'smoke-test', roadmapItemId: 'roadmap-1' },
        { id: 'smoke-task-2', title: 'Smoke batch task two', description: 'Second task in batch', priority: 'normal', status: 'blocked', source: 'smoke-test', roadmapItemId: 'roadmap-2' },
      ],
    }),
  });
  assert(res.ok, `expected 200, got ${res.status}`);
  assert(json?.ok === true, 'batch deploy ok missing');
  assert(json?.dryRun === true, 'batch dryRun flag missing');
  assert(typeof json?.batchId === 'string' && json.batchId.startsWith('batch-'), 'batchId missing');
  assert(Array.isArray(json?.tasks) && json.tasks.length === 2, 'batch tasks missing');
  assert(typeof json?.message === 'string' && json.message.includes('Do not merge them'), 'batch deploy instruction missing');
  assert(json.message.includes('Smoke batch task one') && json.message.includes('Smoke batch task two'), 'batch deploy task titles missing');
});

if (writeCheck) {
  const tempPath = appRel('AUDIT_CHANGES_2026-03-12.md');
  let original = '';
  await test('POST /api/file writes a text file and restores it', async () => {
    const readBefore = await fetchJson(`/api/file?path=${encodeURIComponent(tempPath)}`);
    assert(readBefore.res.ok, `pre-read failed with ${readBefore.res.status}`);
    original = readBefore.json?.content || '';
    const marker = `${original}\n<!-- smoke-write-check -->\n`;
    const writeRes = await fetchJson('/api/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: tempPath, content: marker }),
    });
    assert(writeRes.res.ok, `write failed with ${writeRes.res.status}`);
    const readAfter = await fetchJson(`/api/file?path=${encodeURIComponent(tempPath)}`);
    assert(readAfter.json?.content?.includes('smoke-write-check'), 'marker not written');
    const restoreRes = await fetchJson('/api/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: tempPath, content: original }),
    });
    assert(restoreRes.res.ok, `restore failed with ${restoreRes.res.status}`);
  });
}

if (bodyCheck) {
  await test('GET /api/vio-body-state proxy', async () => {
    const { res, json, text } = await fetchJson('/api/vio-body-state');
    assert(res.ok, `proxy returned ${res.status}: ${text.slice(0, 120)}`);
    assert(typeof json === 'object' && json !== null, 'proxy payload missing');
  }, { optional: true });
}

console.log(`\nSummary: ${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed === 0 ? 0 : 1);
