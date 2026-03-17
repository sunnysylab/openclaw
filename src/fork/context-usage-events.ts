/**
 * Fork-local: DiagnosticUsageEvent context usage monitor.
 *
 * Subscribes to in-process diagnostic events emitted by the running gateway
 * and invokes callbacks when context usage data is available or exceeds a
 * configurable threshold.
 *
 * IMPORTANT — in-process only
 * ────────────────────────────
 * DiagnosticUsageEvent is dispatched via globalThis state inside the gateway
 * process. This module must be imported and started inside the same process
 * (e.g. from a gateway plugin or a local fork hook). It cannot receive events
 * from an external script — use scripts/monitor-context.ts for that instead.
 *
 * Prerequisites
 * ─────────────
 *   diagnostics.enabled must be true in ~/.openclaw/config.json:
 *     openclaw config set diagnostics.enabled true
 *
 * Example — minimal inline usage:
 *
 *   import { startContextUsageMonitor } from "../../src/fork/context-usage-events.js";
 *
 *   const stop = startContextUsageMonitor({
 *     threshold: 80,
 *     onThreshold: (stats) => {
 *       console.warn(
 *         `[context-monitor] ${stats.sessionKey} at ${stats.pct.toFixed(1)}% — consider /compact`,
 *       );
 *     },
 *   });
 *
 *   // Call stop() to unsubscribe.
 */

import { onDiagnosticEvent } from "../infra/diagnostic-events.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ContextUsageStats = {
  /** sessionKey from the usage event, if available. */
  sessionKey?: string;
  /** model identifier reported by the event. */
  model?: string;
  /** provider reported by the event. */
  provider?: string;
  /** Tokens used in the current context window. */
  used: number;
  /** Maximum tokens for this session's context window. */
  limit: number;
  /** Percentage of context window consumed (0–100). */
  pct: number;
};

export type ContextUsageMonitorOptions = {
  /**
   * Percentage threshold (0–100) at which onThreshold is invoked.
   * Default: 80
   */
  threshold?: number;
  /**
   * Called on every model.usage event that contains context data.
   * Fires regardless of the threshold — useful for live dashboards.
   */
  onStats?: (stats: ContextUsageStats) => void;
  /**
   * Called when context usage >= threshold.
   * Note: fires on every qualifying event, not just the first crossing.
   * De-duplicate in your handler if you only want a single alert.
   */
  onThreshold?: (stats: ContextUsageStats) => void;
};

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------

/**
 * Start monitoring context usage via in-process DiagnosticUsageEvent.
 *
 * Returns an unsubscribe function. Call it to stop monitoring.
 */
export function startContextUsageMonitor(opts: ContextUsageMonitorOptions = {}): () => void {
  const threshold = opts.threshold ?? 80;

  return onDiagnosticEvent((event) => {
    // Only care about model usage events that include context window data.
    if (event.type !== "model.usage") return;

    const used = event.context?.used;
    const limit = event.context?.limit;

    // Events fired before the first LLM call may not have context data yet.
    if (!used || !limit || limit <= 0) return;

    const pct = (used / limit) * 100;

    const stats: ContextUsageStats = {
      sessionKey: event.sessionKey,
      model: event.model,
      provider: event.provider,
      used,
      limit,
      pct,
    };

    opts.onStats?.(stats);

    if (pct >= threshold) {
      opts.onThreshold?.(stats);
    }
  });
}

// ---------------------------------------------------------------------------
// Convenience: log-to-stderr default monitor
// ---------------------------------------------------------------------------

/**
 * Start a monitor that logs to stderr when usage >= threshold.
 * Useful for quick debugging without wiring up custom callbacks.
 *
 *   import { startDefaultContextLogger } from "../../src/fork/context-usage-events.js";
 *   startDefaultContextLogger(); // logs warnings to stderr at 80%
 */
export function startDefaultContextLogger(threshold = 80): () => void {
  return startContextUsageMonitor({
    threshold,
    onStats: (s) => {
      process.stderr.write(
        `[context-monitor] ${s.sessionKey ?? "(unknown)"} ${s.pct.toFixed(1)}% (${s.used}/${s.limit})\n`,
      );
    },
    onThreshold: (s) => {
      process.stderr.write(
        `[context-monitor] ⚠  THRESHOLD (${threshold}%) exceeded for ${s.sessionKey ?? "(unknown)"}: ` +
          `${s.pct.toFixed(1)}% — consider sending /compact\n`,
      );
    },
  });
}
