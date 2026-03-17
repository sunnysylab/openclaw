/**
 * Context usage monitor — sessions.list polling approach.
 *
 * Connects to the running local gateway via WebSocket RPC, polls sessions.list
 * at a configurable interval, and prints a live context-usage table. Prints an
 * alert line and exits non-zero when any session exceeds the threshold.
 *
 * Usage:
 *   bun scripts/monitor-context.ts [options]
 *
 * Options:
 *   --interval <ms>       Poll interval in ms (default: 5000)
 *   --threshold <pct>     Alert threshold 0–100 (default: 80)
 *   --session-key <key>   Monitor only this session key (default: all)
 *   --url <ws-url>        Gateway WebSocket URL (default: auto from config)
 *   --once                Poll once and exit (useful for scripting)
 *
 * Exit codes:
 *   0  normal exit (--once, no session over threshold)
 *   1  at least one session exceeded the threshold (--once mode)
 *   2  gateway connection error
 */

import { callGateway } from "../src/gateway/call.js";
import type { SessionsListResult } from "../src/gateway/session-utils.types.js";

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);

function parseFlag<T>(flag: string, parser: (v: string) => T, fallback: T): T {
  const idx = argv.indexOf(flag);
  if (idx === -1 || !argv[idx + 1]) return fallback;
  return parser(argv[idx + 1]);
}

const intervalMs = parseFlag("--interval", Number, 5000);
const threshold = parseFlag("--threshold", Number, 80);
const filterKey = parseFlag("--session-key", String, "");
const gatewayUrl = parseFlag("--url", String, "");
const onceMode = argv.includes("--once");

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
const BAR_WIDTH = 24;

function pctBar(used: number, limit: number): string {
  const filled = Math.min(BAR_WIDTH, Math.round((used / limit) * BAR_WIDTH));
  return "[" + "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled) + "]";
}

function fmtTokens(n: number): string {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}k`
      : String(n);
}

// ---------------------------------------------------------------------------
// Poll
// ---------------------------------------------------------------------------
async function poll(): Promise<{ overThreshold: boolean }> {
  const result = await callGateway<SessionsListResult>({
    method: "sessions.list",
    params: { includeGlobal: false, includeUnknown: false },
    url: gatewayUrl || undefined,
  });

  const rows = result.sessions.filter((s) => {
    if (filterKey && s.key !== filterKey) return false;
    // Only show sessions that have actual context data.
    return s.totalTokens != null && s.contextTokens != null;
  });

  if (rows.length === 0) {
    const hint = filterKey ? ` matching key "${filterKey}"` : "";
    console.log(`[${new Date().toISOString()}] No sessions with token data${hint}.`);
    return { overThreshold: false };
  }

  if (!onceMode) process.stdout.write("\x1b[2J\x1b[H"); // clear screen

  console.log(
    `Context Monitor  ${new Date().toLocaleTimeString()}  threshold=${threshold}%  interval=${intervalMs}ms`,
  );
  console.log("─".repeat(72));

  let anyOver = false;

  for (const s of rows) {
    const used = s.totalTokens!;
    const limit = s.contextTokens!;
    const pct = (used / limit) * 100;
    const over = pct >= threshold;
    if (over) anyOver = true;

    const bar = pctBar(used, limit);
    const label = over ? " ⚠  OVER THRESHOLD" : "";
    const modelPart = s.model ? `  model=${s.modelProvider ?? "?"}/${s.model}` : "";
    const fresh = s.totalTokensFresh === false ? " (stale)" : "";

    console.log(`session: ${s.key}`);
    console.log(
      `  ${bar} ${pct.toFixed(1)}%  ${fmtTokens(used)} / ${fmtTokens(limit)}${fresh}${label}${modelPart}`,
    );
    console.log();
  }

  return { overThreshold: anyOver };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (onceMode) {
    try {
      const { overThreshold } = await poll();
      process.exit(overThreshold ? 1 : 0);
    } catch (err) {
      console.error(`[monitor] gateway error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    }
  }

  console.log(`Starting context monitor  interval=${intervalMs}ms  threshold=${threshold}%`);
  if (filterKey) console.log(`Filtering to session key: ${filterKey}`);

  for (;;) {
    try {
      await poll();
    } catch (err) {
      console.error(`[monitor] error: ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }
}

await main();
