import fs from 'node:fs';
import path from 'node:path';
import { EDITABLE_TEXT_FILE_RE, EXTRA_ALLOWED_ROOTS, PROJECT_ROOT } from '../config.mjs';
import { getTransactionById, writeProjectFileWithProtection } from './safeEdit.mjs';

const ALLOWED_ROOTS = [PROJECT_ROOT, ...EXTRA_ALLOWED_ROOTS].map(root => path.resolve(root));

function isWithinAllowedRoots(targetPath) {
  const resolved = path.resolve(targetPath);
  return ALLOWED_ROOTS.some(root => resolved === root || resolved.startsWith(root + path.sep));
}

export function safeProjectPath(relPath = '.') {
  const raw = typeof relPath === 'string' && relPath.trim() ? relPath.trim() : '.';
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(PROJECT_ROOT, raw);
  if (!isWithinAllowedRoots(resolved)) {
    throw new Error('path escapes allowed roots');
  }
  return resolved;
}

export function shouldShowProjectFile(relPath) {
  const blocked = ['.git', '__pycache__', '.ipynb_checkpoints'];
  if (blocked.some(part => relPath.split(path.sep).includes(part))) {return false;}
  return true;
}

export function listProjectFiles(relDir = '.') {
  const baseDir = safeProjectPath(relDir);
  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(entry => shouldShowProjectFile(path.join(relDir === '.' ? '' : relDir, entry.name)))
    .toSorted((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map(entry => ({
      path: path.join(relDir === '.' ? '' : relDir, entry.name),
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file',
    }));
  const parent = relDir === '.' ? null : path.dirname(relDir);
  return {
    root: PROJECT_ROOT,
    currentDir: relDir,
    parentDir: parent === '' ? '.' : parent,
    entries,
  };
}

export function readProjectFile(relPath) {
  const abs = safeProjectPath(relPath);
  const stat = fs.statSync(abs);
  if (!stat.isFile()) {throw new Error('not a file');}
  const content = fs.readFileSync(abs, 'utf8');
  return { path: relPath, content };
}

export function writeProjectFile(relPath, content) {
  if (!EDITABLE_TEXT_FILE_RE.test(relPath || '')) {
    throw new Error('editing is limited to known text/code file types');
  }
  const result = writeProjectFileWithProtection(relPath, content);
  const transaction = result?.transactionId ? getTransactionById(result.transactionId) : null;
  return {
    ...result,
    safeEdit: transaction ? {
      id: transaction.id,
      status: transaction.status,
      strategy: transaction.strategy,
      phases: transaction.phases,
      checks: transaction.checks,
      finalized: transaction.finalized,
      committed: transaction.committed,
      failed: transaction.failed,
      recovered: transaction.recovered,
      abandoned: transaction.abandoned,
      target: transaction.targets?.[0] || null,
    } : null,
  };
}
