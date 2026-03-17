// Read-only setup state evaluator for the VioDashboard setup wizard.
// Evaluates six first-version setup steps and returns a structured
// status report aligned with the contract in docs/setup-wizard.md.
//
// This module is intentionally free of side effects: it only reads
// filesystem state and receives runtime state via parameters.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  HAS_LOCAL_CONFIG,
  LOCAL_CONFIG_PATH,
  PROJECT_ROOT,
  OPENCLAW_REPO_ROOT,
  DEFAULT_CLAUDE_CWD,
  CONFIG_PATH,
  CLAUDE_BIN,
  DASHBOARD_LAUNCHD_ROOT,
  LAUNCH_AGENTS_DIR,
  LAUNCHD_PLIST_NAME,
  APP_BASE_URL,
} from '../config.mjs';

// ---------------------------------------------------------------------------
// Small filesystem helpers
// ---------------------------------------------------------------------------

function pathExists(p) {
  if (!p) { return false; }
  try { return fs.existsSync(p); } catch { return false; }
}

function dirWritable(p) {
  if (!p) { return false; }
  try { fs.accessSync(p, fs.constants.W_OK); return true; } catch { return false; }
}

// Try to resolve a bare binary name via `which`.
function resolveWhich(bin) {
  if (!bin) { return null; }
  try {
    const result = execFileSync('which', [bin], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    return result || null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Step 1: Local machine config
// ---------------------------------------------------------------------------

function evaluateLocalConfig() {
  const hasLocalConfig = HAS_LOCAL_CONFIG;
  const localConfigPath = LOCAL_CONFIG_PATH;

  if (!hasLocalConfig || !pathExists(localConfigPath)) {
    return {
      id: 'local-config',
      title: 'Local machine config',
      status: 'missing',
      blocking: true,
      message: 'config/local.mjs is missing. Generate it with the bootstrap script.',
      evidence: { hasLocalConfig, localConfigPath },
      recommendedActions: [
        {
          id: 'bootstrap-generate',
          label: 'Generate local config',
          kind: 'command',
          command: 'node scripts/bootstrap-local-config.mjs',
        },
        {
          id: 'bootstrap-preview',
          label: 'Preview detected values (dry run)',
          kind: 'command',
          command: 'node scripts/bootstrap-local-config.mjs --print --yes',
        },
      ],
    };
  }

  return {
    id: 'local-config',
    title: 'Local machine config',
    status: 'complete',
    blocking: true,
    message: 'config/local.mjs exists and was loaded at startup.',
    evidence: { hasLocalConfig, localConfigPath },
    recommendedActions: [
      {
        id: 'bootstrap-preview',
        label: 'Preview current detected values',
        kind: 'command',
        command: 'node scripts/bootstrap-local-config.mjs --print --yes',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Step 2: Core path sanity
// ---------------------------------------------------------------------------

function evaluateCorePathSanity() {
  const evidence = {
    projectRoot: PROJECT_ROOT || null,
    projectRootExists: pathExists(PROJECT_ROOT),
    openclawRepoRoot: OPENCLAW_REPO_ROOT || null,
    openclawRepoRootExists: pathExists(OPENCLAW_REPO_ROOT),
    defaultClaudeCwd: DEFAULT_CLAUDE_CWD || null,
    defaultClaudeCwdExists: pathExists(DEFAULT_CLAUDE_CWD),
    configPath: CONFIG_PATH || null,
    configPathExists: pathExists(CONFIG_PATH),
    claudeBin: CLAUDE_BIN || null,
  };

  const missing = [];
  if (!evidence.projectRoot || !evidence.projectRootExists) { missing.push('projectRoot'); }
  if (!evidence.openclawRepoRoot || !evidence.openclawRepoRootExists) { missing.push('openclawRepoRoot'); }
  if (!evidence.defaultClaudeCwd || !evidence.defaultClaudeCwdExists) { missing.push('defaultClaudeCwd'); }
  if (!evidence.claudeBin) { missing.push('claudeBin'); }

  if (missing.length > 0) {
    return {
      id: 'core-path-sanity',
      title: 'Core path sanity',
      status: 'missing',
      blocking: true,
      message: `Missing or unresolved paths: ${missing.join(', ')}. Review config/local.mjs.`,
      evidence,
      recommendedActions: [
        {
          id: 'review-config',
          label: 'Preview detected values',
          kind: 'command',
          command: 'node scripts/bootstrap-local-config.mjs --print --yes',
        },
        {
          id: 'rerun-bootstrap',
          label: 'Regenerate local config',
          kind: 'command',
          command: 'node scripts/bootstrap-local-config.mjs',
        },
      ],
    };
  }

  if (!evidence.configPathExists) {
    return {
      id: 'core-path-sanity',
      title: 'Core path sanity',
      status: 'warning',
      blocking: true,
      message: 'Key paths resolve, but the OpenClaw config file was not found at the configured path.',
      evidence,
      recommendedActions: [
        {
          id: 'setup-openclaw-config',
          label: 'Initialize OpenClaw config',
          kind: 'note',
          command: 'Run: openclaw login  (or set VIO_WRAPPER_CONFIG_PATH in config/local.mjs)',
        },
      ],
    };
  }

  return {
    id: 'core-path-sanity',
    title: 'Core path sanity',
    status: 'complete',
    blocking: true,
    message: 'All key paths resolve and exist on disk.',
    evidence,
    recommendedActions: [],
  };
}

// ---------------------------------------------------------------------------
// Step 3: Dependency checks
// ---------------------------------------------------------------------------

function evaluateDependencyChecks() {
  const claudeBin = CLAUDE_BIN;
  const claudeBinIsAbsolute = claudeBin && path.isAbsolute(claudeBin);
  const claudeBinExists = claudeBinIsAbsolute ? pathExists(claudeBin) : false;

  // For a bare name, try `which` to confirm it is on PATH.
  let claudeResolved = claudeBinIsAbsolute ? claudeBin : resolveWhich(claudeBin);
  const claudeExecutable = claudeBinExists || !!claudeResolved;

  const configPathExists = pathExists(CONFIG_PATH);

  const evidence = {
    claudeBin: claudeBin || null,
    claudeResolved: claudeResolved || null,
    claudeExecutable,
    configPath: CONFIG_PATH || null,
    configPathExists,
  };

  if (!claudeExecutable) {
    return {
      id: 'dependency-checks',
      title: 'Dependency checks',
      status: 'missing',
      blocking: true,
      message: 'Claude CLI not found. Install it or fix the claudeBin path in config/local.mjs.',
      evidence,
      recommendedActions: [
        {
          id: 'install-claude',
          label: 'Install Claude CLI',
          kind: 'note',
          command: 'npm install -g @anthropic-ai/claude-code  (or set claudeBin in config/local.mjs)',
        },
        {
          id: 'fix-local-config',
          label: 'Preview and fix local config',
          kind: 'command',
          command: 'node scripts/bootstrap-local-config.mjs --print --yes',
        },
      ],
    };
  }

  if (!configPathExists) {
    return {
      id: 'dependency-checks',
      title: 'Dependency checks',
      status: 'warning',
      blocking: true,
      message: 'Claude CLI found, but the OpenClaw config file is missing.',
      evidence,
      recommendedActions: [
        {
          id: 'setup-openclaw',
          label: 'Initialize OpenClaw config',
          kind: 'note',
          command: 'Run: openclaw login',
        },
      ],
    };
  }

  return {
    id: 'dependency-checks',
    title: 'Dependency checks',
    status: 'complete',
    blocking: true,
    message: 'Claude CLI found and OpenClaw config file is present.',
    evidence,
    recommendedActions: [],
  };
}

// ---------------------------------------------------------------------------
// Step 4: Launch / install readiness
// ---------------------------------------------------------------------------

function evaluateLaunchReadiness() {
  const launchdRoot = DASHBOARD_LAUNCHD_ROOT;
  const installScript = path.join(launchdRoot, 'install.sh');
  const plistTemplatePath = path.join(launchdRoot, LAUNCHD_PLIST_NAME);
  const launchAgentsDir = LAUNCH_AGENTS_DIR;

  const installScriptExists = pathExists(installScript);
  const plistExists = pathExists(plistTemplatePath);
  const launchAgentsDirExists = pathExists(launchAgentsDir);
  const launchAgentsDirWritable = launchAgentsDirExists && dirWritable(launchAgentsDir);

  const evidence = {
    launchdRoot,
    installScript,
    installScriptExists,
    plistTemplatePath,
    plistExists,
    launchAgentsDir,
    launchAgentsDirExists,
    launchAgentsDirWritable,
  };

  const missing = [];
  if (!installScriptExists) { missing.push('install.sh'); }
  if (!plistExists) { missing.push('plist template'); }

  if (missing.length > 0) {
    return {
      id: 'launch-readiness',
      title: 'Launch / install readiness',
      status: 'missing',
      blocking: true,
      message: `Missing launchd scripts: ${missing.join(', ')}.`,
      evidence,
      recommendedActions: [
        {
          id: 'check-launchd-dir',
          label: 'Check launchd directory',
          kind: 'note',
          command: `ls ${launchdRoot}`,
        },
      ],
    };
  }

  if (!launchAgentsDirWritable) {
    return {
      id: 'launch-readiness',
      title: 'Launch / install readiness',
      status: 'warning',
      blocking: true,
      message: 'Launchd scripts present but LaunchAgents directory is not writable. Install may fail.',
      evidence,
      recommendedActions: [
        {
          id: 'fix-perms',
          label: 'Check LaunchAgents directory permissions',
          kind: 'note',
          command: `ls -la ${path.dirname(launchAgentsDir)}`,
        },
      ],
    };
  }

  return {
    id: 'launch-readiness',
    title: 'Launch / install readiness',
    status: 'complete',
    blocking: true,
    message: 'Launchd scripts present and LaunchAgents directory is writable.',
    evidence,
    recommendedActions: [
      {
        id: 'install-source',
        label: 'Install in source mode',
        kind: 'command',
        command: `bash ${installScript} source`,
      },
      {
        id: 'install-runtime',
        label: 'Install in runtime mode',
        kind: 'command',
        command: `bash ${installScript} runtime`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Step 5: Runtime activation
// ---------------------------------------------------------------------------

function evaluateRuntimeActivation() {
  // Since this code runs inside the server handling a live request,
  // runtime activation is inherently confirmed. We surface the base URL
  // and note how to reload if needed.
  const baseUrl = APP_BASE_URL;
  return {
    id: 'runtime-activation',
    title: 'Runtime activation',
    status: 'complete',
    blocking: true,
    message: `Service is running and responding at ${baseUrl}.`,
    evidence: {
      baseUrl,
      serverRunning: true,
      note: 'This endpoint was reached successfully, confirming the service is up.',
    },
    recommendedActions: [
      {
        id: 'reload-wrapper',
        label: 'Reload / restart wrapper',
        kind: 'note',
        command: 'bash launchd/reload.sh  (or use launchctl kickstart from the launchd scripts)',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Step 6: Functional verification
// ---------------------------------------------------------------------------

function evaluateFunctionalVerification({ bridgeConnected, claudeState }) {
  const gatewayConnected = !!bridgeConnected;
  const claudeStatus = claudeState?.status || 'unknown';
  const claudeRunning = claudeState?.running === true;
  const claudeCwd = claudeState?.cwd || null;

  const evidence = {
    gatewayConnected,
    claudeStatus,
    claudeRunning,
    claudeCwd,
  };

  const issues = [];
  if (!gatewayConnected) { issues.push('Gateway WebSocket not connected'); }
  if (claudeStatus === 'error') { issues.push('Claude session in error state'); }

  if (issues.length > 0) {
    return {
      id: 'functional-verification',
      title: 'Functional verification',
      status: gatewayConnected ? 'warning' : 'blocked',
      blocking: true,
      message: issues.join('; ') + '.',
      evidence,
      recommendedActions: [
        {
          id: 'restart-gateway',
          label: 'Restart OpenClaw gateway',
          kind: 'note',
          command: 'Restart the OpenClaw gateway via the OpenClaw Mac app or launchd scripts.',
        },
        {
          id: 'inspect-logs',
          label: 'Inspect wrapper logs',
          kind: 'note',
          command: 'Check the wrapper log file (~/Library/Logs/VioDashboard/) for errors.',
        },
      ],
    };
  }

  return {
    id: 'functional-verification',
    title: 'Functional verification',
    status: 'complete',
    blocking: true,
    message: 'Gateway connected and Claude session state is healthy.',
    evidence,
    recommendedActions: [],
  };
}

// ---------------------------------------------------------------------------
// Top-level aggregator
// ---------------------------------------------------------------------------

/**
 * Evaluate all six first-version setup steps.
 *
 * @param {{ bridgeConnected: boolean, claudeState: object }} opts
 * @returns Setup state response matching the contract in docs/setup-wizard.md
 */
export function evaluateSetupState({ bridgeConnected, claudeState }) {
  const steps = [
    evaluateLocalConfig(),
    evaluateCorePathSanity(),
    evaluateDependencyChecks(),
    evaluateLaunchReadiness(),
    evaluateRuntimeActivation(),
    evaluateFunctionalVerification({ bridgeConnected, claudeState }),
  ];

  const total = steps.length;
  const completed = steps.filter(s => s.status === 'complete').length;
  const blockingIncomplete = steps.filter(s => s.blocking && s.status !== 'complete').length;

  let summaryStatus;
  if (steps.some(s => s.status === 'error')) {
    summaryStatus = 'error';
  } else if (steps.some(s => s.status === 'blocked')) {
    summaryStatus = 'blocked';
  } else if (blockingIncomplete > 0) {
    summaryStatus = 'incomplete';
  } else if (completed === total) {
    summaryStatus = 'ready';
  } else {
    summaryStatus = 'incomplete';
  }

  return {
    ok: true,
    summary: {
      status: summaryStatus,
      completed,
      total,
      blocking: blockingIncomplete,
    },
    steps,
  };
}
