import * as http from "http";
import crypto from "node:crypto";
import * as Lark from "@larksuiteoapi/node-sdk";
import { computeBackoff, sleepWithAbort } from "openclaw/plugin-sdk/infra-runtime";
import {
  applyBasicWebhookRequestGuards,
  isRequestBodyLimitError,
  type RuntimeEnv,
  installRequestBodyLimitGuard,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "../runtime-api.js";
import { createFeishuWSClient } from "./client.js";
import {
  botNames,
  botOpenIds,
  FEISHU_WEBHOOK_BODY_TIMEOUT_MS,
  FEISHU_WEBHOOK_MAX_BODY_BYTES,
  feishuWebhookRateLimiter,
  httpServers,
  recordWebhookStatus,
  wsClients,
} from "./monitor.state.js";
import type { ResolvedFeishuAccount } from "./types.js";

export type MonitorTransportParams = {
  account: ResolvedFeishuAccount;
  accountId: string;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  eventDispatcher: Lark.EventDispatcher;
};

function isFeishuWebhookPayload(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function buildFeishuWebhookEnvelope(
  req: http.IncomingMessage,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return Object.assign(Object.create({ headers: req.headers }), payload) as Record<string, unknown>;
}

function parseFeishuWebhookPayload(rawBody: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return isFeishuWebhookPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isFeishuWebhookSignatureValid(params: {
  headers: http.IncomingHttpHeaders;
  rawBody: string;
  encryptKey?: string;
}): boolean {
  const encryptKey = params.encryptKey?.trim();
  if (!encryptKey) {
    return true;
  }

  const timestampHeader = params.headers["x-lark-request-timestamp"];
  const nonceHeader = params.headers["x-lark-request-nonce"];
  const signatureHeader = params.headers["x-lark-signature"];
  const timestamp = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;
  const nonce = Array.isArray(nonceHeader) ? nonceHeader[0] : nonceHeader;
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!timestamp || !nonce || !signature) {
    return false;
  }

  const computedSignature = crypto
    .createHash("sha256")
    .update(timestamp + nonce + encryptKey + params.rawBody)
    .digest("hex");
  return timingSafeEqualString(computedSignature, signature);
}

function respondText(res: http.ServerResponse, statusCode: number, body: string): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(body);
}

/**
 * Backoff policy for the OpenClaw-level supervisor loop.
 *
 * Each cycle represents the Lark SDK exhausting its own server-configured
 * reconnect budget (typically 7 attempts). We apply exponential backoff before
 * starting a fresh WSClient, aligned with the Slack/Telegram channel patterns.
 */
const FEISHU_WS_SUPERVISOR_RECONNECT_POLICY = {
  initialMs: 5_000,
  maxMs: 60_000,
  factor: 2,
  jitter: 0.25,
} as const;

/**
 * How often we poll the SDK's reconnect-info to detect stalls.
 */
const FEISHU_WS_STALL_POLL_MS = 10_000;

/**
 * How long the SDK's `lastConnectTime` can remain unchanged (i.e. no new
 * connect attempt recorded) before we declare the connection dead and restart
 * the supervisor cycle.
 *
 * The stall clock only starts after we see the first non-zero `lastConnectTime`
 * (meaning the SDK has actually attempted a connect), so a healthy long-lived
 * connection that has never needed to reconnect does NOT trigger a false stall.
 *
 * Must be significantly longer than the SDK's own reconnect interval (server-
 * configured, typically 10-30 s) to avoid false positives during normal SDK
 * reconnection.
 */
const FEISHU_WS_STALL_DETECT_MS = 90_000;

/**
 * Patterns that indicate the WSClient cannot recover regardless of retries
 * (e.g. bad credentials, app disabled). These are matched against the full
 * error message string. We keep the patterns narrow and literal to avoid
 * accidentally suppressing recoverable errors.
 */
const NON_RECOVERABLE_FEISHU_PATTERNS: readonly RegExp[] = [
  /credentials not configured/i,
  /invalid app_id\b/i,
  /app has been disabled/i,
  /app not exist/i,
];

function isNonRecoverableFeishuError(err: unknown): boolean {
  const msg = String(err);
  return NON_RECOVERABLE_FEISHU_PATTERNS.some((re) => re.test(msg));
}

/**
 * Start a Lark `WSClient` and return a Promise that resolves once either:
 *   (a) the abort signal fires, or
 *   (b) the SDK's internal retry budget appears exhausted (stall detected).
 *
 * ## Why this is needed
 *
 * `WSClient.start()` is fire-and-forget: it kicks off an async reconnect loop
 * inside the SDK but returns immediately. When the server-configured
 * `reconnectCount` retries are exhausted the SDK stops silently — no error
 * thrown, no event emitted, no promise rejected. The only observable signal is
 * that `getReconnectInfo().lastConnectTime` stops advancing.
 *
 * We poll that value every `FEISHU_WS_STALL_POLL_MS`. Once it has been
 * unchanged for `FEISHU_WS_STALL_DETECT_MS` we consider the SDK dead and
 * resolve so the supervisor loop can create a fresh client.
 */
function runFeishuWSClientUntilDead(params: {
  wsClient: Lark.WSClient;
  eventDispatcher: Lark.EventDispatcher;
  accountId: string;
  log: (msg: string) => void;
  abortSignal?: AbortSignal;
  /** Called once when the SDK records its first successful connect attempt. */
  onFirstConnect?: () => void;
}): Promise<"aborted" | "stalled"> {
  const { wsClient, eventDispatcher, accountId, log, abortSignal, onFirstConnect } = params;

  return new Promise<"aborted" | "stalled">((resolve) => {
    if (abortSignal?.aborted) {
      resolve("aborted");
      return;
    }

    wsClient.start({ eventDispatcher });
    log(`feishu[${accountId}]: WebSocket client started`);

    // Track lastConnectTime. We only start the stall clock once we see a
    // non-zero value (i.e. the SDK has made its first connect attempt).
    let lastSeenConnectTime = 0;
    let staleSinceMs: number | null = null; // null = waiting for first connect attempt

    const handleAbort = () => {
      clearInterval(stallPoller);
      resolve("aborted");
    };
    abortSignal?.addEventListener("abort", handleAbort, { once: true });

    const stallPoller = setInterval(() => {
      if (abortSignal?.aborted) {
        clearInterval(stallPoller);
        return;
      }

      const { lastConnectTime } = wsClient.getReconnectInfo();

      if (lastConnectTime !== lastSeenConnectTime) {
        // SDK recorded a new connect attempt — reset stall clock.
        const isFirstConnect = lastSeenConnectTime === 0 && lastConnectTime > 0;
        lastSeenConnectTime = lastConnectTime;
        staleSinceMs = Date.now();
        if (isFirstConnect) {
          onFirstConnect?.();
        }
        return;
      }

      // Still waiting for the SDK to make its first attempt: don't start
      // the stall clock yet to avoid false positives on slow-start scenarios.
      if (staleSinceMs === null) {
        return;
      }

      const idleMs = Date.now() - staleSinceMs;
      if (idleMs >= FEISHU_WS_STALL_DETECT_MS) {
        log(
          `feishu[${accountId}]: WebSocket stall detected ` +
            `(no SDK connect activity for ${Math.round(idleMs / 1000)}s); ` +
            `will restart supervisor cycle`,
        );
        clearInterval(stallPoller);
        abortSignal?.removeEventListener("abort", handleAbort);
        resolve("stalled");
      }
    }, FEISHU_WS_STALL_POLL_MS);
    stallPoller.unref?.();
  });
}

export async function monitorWebSocket({
  account,
  accountId,
  runtime,
  abortSignal,
  eventDispatcher,
}: MonitorTransportParams): Promise<void> {
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  if (abortSignal?.aborted) {
    return;
  }

  /**
   * Supervisor loop: each iteration creates a fresh WSClient and runs it until
   * either (a) the abort signal fires or (b) the SDK silently exhausts its
   * internal retry budget (stall detected). On stall we close the dead client,
   * wait with exponential backoff, then start a fresh cycle.
   *
   * Backoff attempt counter is incremented only when the SDK stalled; a
   * successful connection resets it so transient disruptions do not accumulate
   * against the backoff schedule.
   */
  /**
   * `supervisorAttempt` counts consecutive boot-time failures (cycle stalled
   * before any successful connect). It resets to 0 whenever the SDK records a
   * successful connection, so a healthy network disruption that causes a stall
   * later does not keep accumulating the backoff schedule.
   */
  let supervisorAttempt = 0;

  try {
    while (!abortSignal?.aborted) {
      log(
        `feishu[${accountId}]: starting WebSocket connection... ` +
          `(supervisor cycle ${supervisorAttempt + 1})`,
      );

      let wsClient: Lark.WSClient;
      try {
        wsClient = createFeishuWSClient(account);
      } catch (err) {
        // Non-recoverable config error (missing credentials etc.) — bail out.
        throw err;
      }

      wsClients.set(accountId, wsClient);

      let cycleOutcome: "aborted" | "stalled" | "error" = "aborted";
      let hadSuccessfulConnect = false;

      try {
        const result = await runFeishuWSClientUntilDead({
          wsClient,
          eventDispatcher,
          accountId,
          log,
          abortSignal,
          onFirstConnect: () => {
            hadSuccessfulConnect = true;
          },
        });
        cycleOutcome = result;
      } catch (err) {
        cycleOutcome = "error";
        if (isNonRecoverableFeishuError(err)) {
          error(`feishu[${accountId}]: non-recoverable error, stopping supervisor: ${String(err)}`);
          throw err;
        }
        error(`feishu[${accountId}]: WebSocket error during cycle: ${String(err)}`);
      } finally {
        // Always close the stale client before the next iteration or exit.
        // NOTE: WSClient.close() may leak internal setTimeout handles from the
        // SDK (larksuite/node-sdk#177 / openclaw#40451). This is an upstream
        // issue; remove this comment once upstream provides a clean teardown.
        try {
          wsClient.close({ force: true });
        } catch {
          // Ignore — the new client in the next cycle will start clean.
        }
        wsClients.delete(accountId);
        botOpenIds.delete(accountId);
        botNames.delete(accountId);
      }

      if (abortSignal?.aborted || cycleOutcome === "aborted") {
        break;
      }

      // The cycle ended with a stall or error — apply supervisor backoff.
      if (hadSuccessfulConnect) {
        // The SDK connected at least once before going silent: this is a
        // network disruption, not a boot-time failure. Reset the backoff
        // counter so recovery is fast once the network returns.
        supervisorAttempt = 0;
      } else {
        supervisorAttempt += 1;
      }

      const delayMs = computeBackoff(FEISHU_WS_SUPERVISOR_RECONNECT_POLICY, supervisorAttempt);
      error(
        `feishu[${accountId}]: WebSocket supervisor cycle ended (${cycleOutcome}); ` +
          `attempt ${supervisorAttempt}, retrying in ${Math.round(delayMs / 1000)}s`,
      );

      try {
        await sleepWithAbort(delayMs, abortSignal);
      } catch {
        // abortSignal fired during sleep — exit loop.
        break;
      }
    }
  } finally {
    // Belt-and-suspenders: ensure state maps are cleared even if an unexpected
    // synchronous throw bypasses the per-cycle finally block above.
    wsClients.delete(accountId);
    botOpenIds.delete(accountId);
    botNames.delete(accountId);
  }

  log(`feishu[${accountId}]: WebSocket monitor stopped`);
}

export async function monitorWebhook({
  account,
  accountId,
  runtime,
  abortSignal,
  eventDispatcher,
}: MonitorTransportParams): Promise<void> {
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  const port = account.config.webhookPort ?? 3000;
  const path = account.config.webhookPath ?? "/feishu/events";
  const host = account.config.webhookHost ?? "127.0.0.1";

  log(`feishu[${accountId}]: starting Webhook server on ${host}:${port}, path ${path}...`);

  const server = http.createServer();

  server.on("request", (req, res) => {
    res.on("finish", () => {
      recordWebhookStatus(runtime, accountId, path, res.statusCode);
    });

    const rateLimitKey = `${accountId}:${path}:${req.socket.remoteAddress ?? "unknown"}`;
    if (
      !applyBasicWebhookRequestGuards({
        req,
        res,
        rateLimiter: feishuWebhookRateLimiter,
        rateLimitKey,
        nowMs: Date.now(),
        requireJsonContentType: true,
      })
    ) {
      return;
    }

    const guard = installRequestBodyLimitGuard(req, res, {
      maxBytes: FEISHU_WEBHOOK_MAX_BODY_BYTES,
      timeoutMs: FEISHU_WEBHOOK_BODY_TIMEOUT_MS,
      responseFormat: "text",
    });
    if (guard.isTripped()) {
      return;
    }

    void (async () => {
      try {
        const rawBody = await readRequestBodyWithLimit(req, {
          maxBytes: FEISHU_WEBHOOK_MAX_BODY_BYTES,
          timeoutMs: FEISHU_WEBHOOK_BODY_TIMEOUT_MS,
        });
        if (guard.isTripped() || res.writableEnded) {
          return;
        }

        // Reject invalid signatures before any JSON parsing to keep the auth boundary strict.
        if (
          !isFeishuWebhookSignatureValid({
            headers: req.headers,
            rawBody,
            encryptKey: account.encryptKey,
          })
        ) {
          respondText(res, 401, "Invalid signature");
          return;
        }

        const payload = parseFeishuWebhookPayload(rawBody);
        if (!payload) {
          respondText(res, 400, "Invalid JSON");
          return;
        }

        const { isChallenge, challenge } = Lark.generateChallenge(payload, {
          encryptKey: account.encryptKey ?? "",
        });
        if (isChallenge) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(challenge));
          return;
        }

        const value = await eventDispatcher.invoke(buildFeishuWebhookEnvelope(req, payload), {
          needCheck: false,
        });
        if (!res.headersSent) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(value));
        }
      } catch (err) {
        if (isRequestBodyLimitError(err)) {
          if (!res.headersSent) {
            respondText(res, err.statusCode, requestBodyErrorToText(err.code));
          }
          return;
        }
        if (!guard.isTripped()) {
          error(`feishu[${accountId}]: webhook handler error: ${String(err)}`);
          if (!res.headersSent) {
            respondText(res, 500, "Internal Server Error");
          }
        }
      } finally {
        guard.dispose();
      }
    })();
  });

  httpServers.set(accountId, server);

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.close();
      httpServers.delete(accountId);
      botOpenIds.delete(accountId);
      botNames.delete(accountId);
    };

    const handleAbort = () => {
      log(`feishu[${accountId}]: abort signal received, stopping Webhook server`);
      cleanup();
      resolve();
    };

    if (abortSignal?.aborted) {
      cleanup();
      resolve();
      return;
    }

    abortSignal?.addEventListener("abort", handleAbort, { once: true });

    server.listen(port, host, () => {
      log(`feishu[${accountId}]: Webhook server listening on ${host}:${port}`);
    });

    server.on("error", (err) => {
      error(`feishu[${accountId}]: Webhook server error: ${err}`);
      abortSignal?.removeEventListener("abort", handleAbort);
      reject(err);
    });
  });
}
