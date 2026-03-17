import fs from 'node:fs';
import path from 'node:path';
import { ACTIVE_CAMERA_PROVIDER, GESTURE_RUN_ONCE_SCRIPT, GESTURE_STATE_PATH, GESTURE_WORKER_SCRIPT, VIO_CAM_CAPTURE_SCRIPT, VIO_CAM_DIR } from '../config.mjs';
import { runScript } from './scripts.mjs';
import { sendEvent } from '../sidecarClient.mjs';

const gestureRuntime = {
  watcherEnabled: false,
  watcherBusy: false,
  watcherIntervalMs: 2500,
  lastAction: 'none',
  lastGesture: 'none',
  lastTriggerAt: 0,
  lastResult: null,
  timer: null,
};

function readJsonFile(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {return fallback;}
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export function runCameraCapture() {
  return runScript(VIO_CAM_CAPTURE_SCRIPT, 'capture script missing').then(result => ({
    path: result.lines[0] || '',
    logPath: result.lines[1] || '',
    candidateFrames: (result.lines[2] || '').split(',').map(s => s.trim()).filter(Boolean),
    selectedFrame: result.lines[3] || '',
    stderr: result.stderr,
  }));
}

export function runGesturePipeline() {
  return runScript(GESTURE_RUN_ONCE_SCRIPT, 'gesture pipeline missing').then(result => {
    const lastLine = [...result.lines].toReversed().find(line => line.startsWith('{'));
    if (!lastLine) {throw new Error('gesture pipeline produced no JSON result');}
    return JSON.parse(lastLine);
  });
}

export function runGestureRecognition(sampleCount = 3, frameNames = []) {
  const args = [String(sampleCount)];
  if (frameNames.length) {args.push(`--frames=${frameNames.join(',')}`);}
  return runScript(GESTURE_WORKER_SCRIPT, 'gesture worker missing', args).then(result => {
    const statePath = result.lines[0] || GESTURE_STATE_PATH;
    return {
      statePath,
      state: readJsonFile(statePath, {}),
      stderr: result.stderr,
    };
  });
}

export function readGestureState() {
  try {
    if (!fs.existsSync(GESTURE_STATE_PATH)) {return { label: 'none', gesture: 'none' };}
    const raw = JSON.parse(fs.readFileSync(GESTURE_STATE_PATH, 'utf8'));
    return {
      label: raw?.vision || 'none',
      gesture: raw?.gesture || 'none',
      enabled: !!raw?.enabled,
      updatedAt: raw?.updatedAt || null,
      source: raw?.source || 'gesture_v1',
      stable: typeof raw?.stable === 'boolean' ? raw.stable : null,
      sampleCount: raw?.sampleCount || null,
      detectedCount: raw?.detectedCount || null,
      frame: raw?.frame || null,
    };
  } catch {
    return { label: 'error', gesture: 'none', enabled: false, updatedAt: null, source: 'gesture_v1' };
  }
}

export function getGestureRuntimeState() {
  return {
    watcherEnabled: gestureRuntime.watcherEnabled,
    watcherBusy: gestureRuntime.watcherBusy,
    watcherIntervalMs: gestureRuntime.watcherIntervalMs,
    lastAction: gestureRuntime.lastAction,
    lastGesture: gestureRuntime.lastGesture,
    lastTriggerAt: gestureRuntime.lastTriggerAt || null,
    provider: {
      id: ACTIVE_CAMERA_PROVIDER.id,
      label: ACTIVE_CAMERA_PROVIDER.label,
    },
    lastResult: gestureRuntime.lastResult,
  };
}

export async function applyGestureAction(gestureState = {}) {
  const gesture = gestureState?.gesture || 'none';
  const stable = gestureState?.stable;
  const now = Date.now();
  if (!gesture || gesture === 'none') {return { action: 'none', reason: 'no-gesture' };}
  if (stable === false) {return { action: 'none', reason: 'unstable' };}
  if (gestureRuntime.lastGesture === gesture && now - gestureRuntime.lastTriggerAt < 5000) {
    return { action: 'none', reason: 'cooldown' };
  }

  let action = 'none';
  if (gesture === 'open_palm') {
    await sendEvent('task-start').catch(() => null);
    action = 'wake-confirm';
  } else if (gesture === 'fist') {
    await sendEvent('assistant-idle').catch(() => null);
    action = 'cancel-idle';
  }

  gestureRuntime.lastGesture = gesture;
  gestureRuntime.lastTriggerAt = now;
  gestureRuntime.lastAction = action;
  return { action, reason: action === 'none' ? 'unmapped' : 'applied' };
}

export async function runGestureCycle(sampleCount = 3, frameNames = []) {
  const gesture = await runGestureRecognition(sampleCount, frameNames);
  const action = await applyGestureAction(gesture.state || {});
  gestureRuntime.lastResult = { ...gesture.state, action };
  return { gesture, action };
}

export async function tickGestureWatcher() {
  if (!gestureRuntime.watcherEnabled || gestureRuntime.watcherBusy) {return;}
  gestureRuntime.watcherBusy = true;
  try {
    const capture = await runCameraCapture();
    const { gesture, action } = await runGestureCycle(Math.max(3, capture.candidateFrames?.length || 3), capture.candidateFrames || []);
    gestureRuntime.lastResult = {
      capture: {
        path: capture.path,
        selectedFrame: capture.selectedFrame,
        candidateFrames: capture.candidateFrames,
      },
      ...gesture.state,
      action,
    };
  } catch (error) {
    gestureRuntime.lastResult = { error: error?.message || String(error) };
  } finally {
    gestureRuntime.watcherBusy = false;
  }
}

export function restartGestureWatcher() {
  if (gestureRuntime.timer) {clearInterval(gestureRuntime.timer);}
  gestureRuntime.timer = null;
  if (gestureRuntime.watcherEnabled) {
    gestureRuntime.timer = setInterval(() => {
      tickGestureWatcher().catch(() => null);
    }, gestureRuntime.watcherIntervalMs);
  }
}

export function updateGestureWatcher(payload = {}) {
  if (typeof payload.enabled === 'boolean') {gestureRuntime.watcherEnabled = payload.enabled;}
  if (Number.isFinite(payload.intervalMs)) {gestureRuntime.watcherIntervalMs = Math.max(1000, Number(payload.intervalMs));}
  restartGestureWatcher();
  if (gestureRuntime.watcherEnabled) {tickGestureWatcher().catch(() => null);}
  return getGestureRuntimeState();
}

export function getCameraTelemetry() {
  try {
    const entries = fs.readdirSync(VIO_CAM_DIR, { withFileTypes: true })
      .filter(entry => entry.isFile() && /\.(jpg|jpeg|png)$/i.test(entry.name))
      .map(entry => {
        const abs = path.join(VIO_CAM_DIR, entry.name);
        const stat = fs.statSync(abs);
        return { name: entry.name, mtimeMs: stat.mtimeMs, size: stat.size };
      })
      .toSorted((a, b) => b.mtimeMs - a.mtimeMs);
    const logDir = path.join(VIO_CAM_DIR, 'logs');
    const logs = fs.existsSync(logDir)
      ? fs.readdirSync(logDir, { withFileTypes: true })
          .filter(entry => entry.isFile() && /\.log$/i.test(entry.name))
          .map(entry => {
            const abs = path.join(logDir, entry.name);
            const stat = fs.statSync(abs);
            return { name: entry.name, mtimeMs: stat.mtimeMs, size: stat.size, abs };
          })
          .toSorted((a, b) => b.mtimeMs - a.mtimeMs)
      : [];
    const latest = entries[0] || null;
    const latestLog = logs[0] || null;
    const latestLogTail = latestLog ? fs.readFileSync(latestLog.abs, 'utf8').split('\n').slice(-12).join('\n') : null;
    return {
      enabled: fs.existsSync(path.join(VIO_CAM_DIR, 'capture-warmup.sh')),
      latestCapture: latest ? { ...latest, url: `/vio_cam/${encodeURIComponent(latest.name)}` } : null,
      latestLog: latestLog ? { name: latestLog.name, size: latestLog.size, tail: latestLogTail } : null,
      vision: readGestureState(),
      gestureRuntime: getGestureRuntimeState(),
      provider: {
        id: ACTIVE_CAMERA_PROVIDER.id,
        label: ACTIVE_CAMERA_PROVIDER.label,
      },
      count: entries.length,
    };
  } catch {
    return {
      enabled: false,
      latestCapture: null,
      latestLog: null,
      count: 0,
    };
  }
}
