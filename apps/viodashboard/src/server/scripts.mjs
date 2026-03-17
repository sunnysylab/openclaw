import fs from 'node:fs';
import { spawn } from 'node:child_process';

export function runScript(scriptPath, missingMessage, args = []) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(missingMessage));
      return;
    }
    const child = spawn(scriptPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${missingMessage} failed with code ${code}`));
        return;
      }
      const lines = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      resolve({ lines, stderr: stderr.trim() });
    });
  });
}
