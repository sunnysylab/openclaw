import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, PUBLIC_DIR, APP_DIR_NAME, SAFE_EDIT_ROOT, appRel } from '../config.mjs';
import { safeProjectPath } from './filesystem.mjs';

const SAFE_EDIT_DIR = path.join(ROOT, 'data', 'safe-edit');
const STAGING_DIR = path.join(SAFE_EDIT_DIR, 'staging');
const BACKUPS_DIR = path.join(SAFE_EDIT_DIR, 'backups');
const TRANSACTIONS_PATH = path.join(SAFE_EDIT_DIR, 'transactions.json');
const APP_PUBLIC_APP = appRel('public', 'app.js');
const APP_PUBLIC_STYLES = appRel('public', 'styles.css');
const APP_PUBLIC_INDEX = appRel('public', 'index.html');
const APP_SERVER_ENTRY = appRel('src', 'server.mjs');

const CRITICAL_EDIT_PATHS = new Set([
  APP_PUBLIC_APP,
  APP_PUBLIC_STYLES,
  APP_PUBLIC_INDEX,
  APP_SERVER_ENTRY,
]);

function ensureSafeEditDirs() {
  fs.mkdirSync(STAGING_DIR, { recursive: true });
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function loadTransactions() {
  ensureSafeEditDirs();
  try {
    if (!fs.existsSync(TRANSACTIONS_PATH)) {return [];}
    const raw = JSON.parse(fs.readFileSync(TRANSACTIONS_PATH, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveTransactions(items) {
  ensureSafeEditDirs();
  fs.writeFileSync(TRANSACTIONS_PATH, JSON.stringify(items.slice(0, 100), null, 2), 'utf8');
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sanitizePathForFilename(relPath) {
  return String(relPath || '').replace(/[\\/]+/g, '__');
}

function relFromRoot(absPath) {
  return path.relative(ROOT, absPath).replace(/\\/g, '/');
}

function isCriticalEditPath(relPath = '') {
  const normalized = String(relPath || '').replace(/\\/g, '/');
  if (CRITICAL_EDIT_PATHS.has(normalized)) {return true;}
  const prefix = `${APP_DIR_NAME}/src/server/`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${prefix}.+\\.mjs$`, 'i').test(normalized);
}

function guessValidation(relPath) {
  const normalized = String(relPath || '').toLowerCase();
  if (normalized.endsWith('.js') || normalized.endsWith('.mjs') || normalized.endsWith('.cjs')) {return 'node-check';}
  if (normalized.endsWith('.html')) {return 'html';}
  if (normalized.endsWith('.css')) {return 'css';}
  return 'none';
}

function validateStagedFile(relPath, stagedAbsPath) {
  const validation = guessValidation(relPath);
  if (validation === 'node-check') {
    execFileSync(process.execPath, ['--check', stagedAbsPath], { stdio: 'pipe' });
    return { validation, ok: true };
  }
  if (validation === 'html') {
    const text = fs.readFileSync(stagedAbsPath, 'utf8');
    if (!/<!doctype html/i.test(text)) {throw new Error('html validation failed: missing doctype');}
    if (!/<html[\s>]/i.test(text)) {throw new Error('html validation failed: missing <html>');}
    if (!/<head[\s>]/i.test(text)) {throw new Error('html validation failed: missing <head>');}
    if (!/<body[\s>]/i.test(text)) {throw new Error('html validation failed: missing <body>');}
    const divOpens = (text.match(/<div(?=\s|>)/gi) || []).length;
    const divCloses = (text.match(/<\/div>/gi) || []).length;
    const spanOpens = (text.match(/<span(?=\s|>)/gi) || []).length;
    const spanCloses = (text.match(/<\/span>/gi) || []).length;
    if (divOpens !== divCloses) {throw new Error('html validation failed: unmatched <div> tags');}
    if (spanOpens !== spanCloses) {throw new Error('html validation failed: unmatched <span> tags');}
    return { validation, ok: true, divOpens, divCloses, spanOpens, spanCloses };
  }
  if (validation === 'css') {
    const text = fs.readFileSync(stagedAbsPath, 'utf8');
    if (!text.trim()) {throw new Error('css validation failed: empty content');}
    const opens = (text.match(/{/g) || []).length;
    const closes = (text.match(/}/g) || []).length;
    if (opens !== closes) {throw new Error('css validation failed: unmatched braces');}
    return { validation, ok: true };
  }
  return { validation, ok: true };
}

function createTransaction(relPath, content) {
  ensureSafeEditDirs();
  const txId = `tx-${stamp()}-${Math.random().toString(36).slice(2, 8)}`;
  const abs = safeProjectPath(relPath);
  const backupPath = path.join(BACKUPS_DIR, `${sanitizePathForFilename(relPath)}.${stamp()}.bak`);
  const ext = path.extname(relPath || '') || '.txt';
  const stagedPath = path.join(STAGING_DIR, `${sanitizePathForFilename(relPath)}.${txId}${ext}`);
  const tx = {
    id: txId,
    status: 'created',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    strategy: relPath === APP_PUBLIC_APP ? 'mvp-1-app-js-strict' : 'safe-edit-generic',
    targets: [{
      path: relPath,
      livePath: relFromRoot(abs),
      backupPath: relFromRoot(backupPath),
      stagedPath: relFromRoot(stagedPath),
    }],
    phases: {
      backup: 'pending',
      stage: 'pending',
      validate: 'pending',
      commit: 'pending',
      finalize: 'pending',
    },
    checks: { validation: 'pending', smoke: 'pending' },
    committed: false,
    finalized: false,
    recovered: false,
    abandoned: false,
    failed: false,
    notes: [],
    contentBytes: Buffer.byteLength(String(content || ''), 'utf8'),
  };
  return { tx, abs, backupPath, stagedPath };
}

function archiveStaleTransactions(transactions = []) {
  let changed = false;
  const next = transactions.map(tx => {
    if (!tx || tx.archived) {return tx;}
    if (tx.status === 'abandoned' || (tx.failed && tx.finalized === false)) {
      return {
        ...tx,
        archived: true,
        archivedAt: new Date().toISOString(),
      };
    }
    return tx;
  });
  for (let i = 0; i < transactions.length; i += 1) {
    if (JSON.stringify(transactions[i]) !== JSON.stringify(next[i])) {
      changed = true;
      break;
    }
  }
  if (changed) {saveTransactions(next);}
  return next;
}

export function getSafeEditState() {
  const transactions = archiveStaleTransactions(loadTransactions());
  const activeTransactions = transactions.filter(tx => !tx?.archived);
  return {
    dir: relFromRoot(SAFE_EDIT_DIR),
    transactionsPath: relFromRoot(TRANSACTIONS_PATH),
    transactions: activeTransactions,
    archivedCount: transactions.length - activeTransactions.length,
  };
}

export function getTransactionById(transactionId) {
  if (!transactionId) {return null;}
  const transactions = loadTransactions();
  return transactions.find(item => item?.id === transactionId) || null;
}

export function writeProjectFileWithProtection(relPath, content) {
  const abs = safeProjectPath(relPath);
  const stat = fs.statSync(abs);
  if (!stat.isFile()) {throw new Error('not a file');}
  if (!isCriticalEditPath(relPath)) {
    fs.writeFileSync(abs, content, 'utf8');
    return { ok: true, path: relPath, protection: 'direct' };
  }

  const transactions = loadTransactions();
  const { tx, backupPath, stagedPath } = createTransaction(relPath, content);
  transactions.unshift(tx);
  saveTransactions(transactions);

  try {
    fs.copyFileSync(abs, backupPath);
    tx.status = 'backup-created';
    tx.phases.backup = 'done';
    tx.notes.push('backup-created');
    tx.updatedAt = new Date().toISOString();
    saveTransactions(transactions);

    fs.writeFileSync(stagedPath, content, 'utf8');
    tx.status = 'staged';
    tx.phases.stage = 'done';
    tx.notes.push('stage-written');
    tx.updatedAt = new Date().toISOString();
    saveTransactions(transactions);

    tx.checks.validation = validateStagedFile(relPath, stagedPath);
    tx.status = 'validated';
    tx.phases.validate = 'done';
    tx.notes.push('validation-passed');
    tx.updatedAt = new Date().toISOString();
    saveTransactions(transactions);

    fs.renameSync(stagedPath, abs);
    tx.committed = true;
    tx.status = 'committed';
    tx.phases.commit = 'done';
    tx.notes.push('live-file-replaced-atomically');
    tx.updatedAt = new Date().toISOString();
    saveTransactions(transactions);

    tx.finalized = true;
    tx.status = 'finalized';
    tx.phases.finalize = 'done';
    tx.checks.smoke = runMinimalSmokeCheck(relPath);
    tx.notes.push(tx.checks.smoke?.ok ? 'smoke-check-passed' : 'smoke-check-warning');
    tx.notes.push('transaction-finalized');
    tx.updatedAt = new Date().toISOString();
    saveTransactions(transactions);

    return { ok: true, path: relPath, protection: 'safe-edit', transactionId: tx.id, strategy: tx.strategy };
  } catch (error) {
    tx.status = 'failed';
    tx.failed = true;
    tx.finalized = false;
    tx.phases.finalize = 'failed';
    if (tx.phases.commit === 'pending') {tx.phases.commit = 'skipped';}
    if (tx.phases.validate === 'pending') {tx.phases.validate = 'failed';}
    if (tx.phases.stage === 'pending') {tx.phases.stage = 'failed';}
    if (tx.phases.backup === 'pending') {tx.phases.backup = 'failed';}
    tx.updatedAt = new Date().toISOString();
    tx.error = error?.message || String(error);
    tx.notes.push('transaction-failed');
    saveTransactions(transactions);
    throw error;
  }
}

export function performStartupRecovery() {
  const transactions = loadTransactions().filter(tx => !tx?.archived);
  const recovered = [];
  const warnings = [];
  const abandoned = [];
  let changed = false;

  for (const tx of transactions) {
    const target = tx?.targets?.[0];
    if (!target?.path || tx?.finalized) {continue;}
    const liveAbs = safeProjectPath(target.path);
    const backupAbs = path.join(ROOT, target.backupPath || '');
    try {
      validateStagedFile(target.path, liveAbs);
      tx.abandoned = true;
      tx.status = 'abandoned';
      tx.updatedAt = new Date().toISOString();
      tx.notes = [...(tx.notes || []), 'startup-marked-abandoned'];
      warnings.push(`abandoned unfinished transaction ${tx.id} for ${target.path}; live file still validates`);
      abandoned.push({ transactionId: tx.id, path: target.path });
      changed = true;
      continue;
    } catch (error) {
      if (backupAbs && fs.existsSync(backupAbs)) {
        fs.copyFileSync(backupAbs, liveAbs);
        tx.recovered = true;
        tx.finalized = true;
        tx.status = 'recovered';
        tx.phases = {
          ...tx.phases,
          finalize: 'done',
        };
        tx.updatedAt = new Date().toISOString();
        tx.notes = [...(tx.notes || []), 'startup-recovered-from-backup'];
        recovered.push({ transactionId: tx.id, path: target.path, backupPath: target.backupPath });
        changed = true;
      } else {
        tx.status = 'failed';
        tx.failed = true;
        tx.updatedAt = new Date().toISOString();
        tx.notes = [...(tx.notes || []), 'startup-recovery-failed-no-backup'];
        warnings.push(`critical file ${target.path} failed validation and no backup was available`);
        changed = true;
      }
    }
  }

  if (changed) {saveTransactions(transactions);}
  return { recovered, abandoned, warnings, transactions: transactions.slice(0, 20) };
}

function runMinimalSmokeCheck(relPath) {
  const checks = [];
  const appJsPath = path.join(PUBLIC_DIR, 'app.js');
  const indexHtmlPath = path.join(PUBLIC_DIR, 'index.html');
  const stylesPath = path.join(PUBLIC_DIR, 'styles.css');
  const serverPath = safeProjectPath(APP_SERVER_ENTRY);

  checks.push({ name: 'public-app-exists', ok: fs.existsSync(appJsPath), checked: relFromRoot(appJsPath) });

  if (relPath === APP_PUBLIC_APP) {
    try {
      execFileSync(process.execPath, ['--check', appJsPath], { stdio: 'pipe' });
      checks.push({ name: 'public-app-node-check', ok: true, checked: relFromRoot(appJsPath) });
    } catch (error) {
      checks.push({ name: 'public-app-node-check', ok: false, checked: relFromRoot(appJsPath), error: error?.message || String(error) });
    }
  }

  if (relPath === APP_PUBLIC_INDEX) {
    checks.push({ name: 'public-index-exists', ok: fs.existsSync(indexHtmlPath), checked: relFromRoot(indexHtmlPath) });
  }

  if (relPath === APP_PUBLIC_STYLES) {
    checks.push({ name: 'public-styles-exists', ok: fs.existsSync(stylesPath), checked: relFromRoot(stylesPath) });
  }

  if (relPath === APP_SERVER_ENTRY) {
    try {
      execFileSync(process.execPath, ['--check', serverPath], { stdio: 'pipe' });
      checks.push({ name: 'server-node-check', ok: true, checked: relFromRoot(serverPath) });
    } catch (error) {
      checks.push({ name: 'server-node-check', ok: false, checked: relFromRoot(serverPath), error: error?.message || String(error) });
    }
  }

  return {
    ok: checks.every(item => item.ok),
    checks,
  };
}

export function runSafeEditSmokeSummary() {
  return runMinimalSmokeCheck(APP_PUBLIC_APP);
}
