import { RateLimitError } from "@buape/carbon";
import {
  createRateLimitRetryRunner,
  type RetryConfig,
  type RetryRunner,
} from "openclaw/plugin-sdk/retry-runtime";
import { formatErrorMessage } from "openclaw/plugin-sdk/ssrf-runtime";

export const DISCORD_RETRY_DEFAULTS = {
  attempts: 3,
  minDelayMs: 500,
  maxDelayMs: 30_000,
  jitter: 0.1,
} satisfies RetryConfig;

export const DISCORD_TRANSIENT_RE =
  /502|503|timeout|timed?.?out|connect|reset|closed|unavailable|temporarily|fetch.failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket.hang.up/i;

/**
 * General retry runner for idempotent Discord operations (edits, fetches,
 * channel resolution, etc.). Retries both rate limits and transient errors.
 */
export function createDiscordRetryRunner(params: {
  retry?: RetryConfig;
  configRetry?: RetryConfig;
  verbose?: boolean;
}): RetryRunner {
  return createRateLimitRetryRunner({
    ...params,
    defaults: DISCORD_RETRY_DEFAULTS,
    logLabel: "discord",
    shouldRetry: (err) =>
      err instanceof RateLimitError || DISCORD_TRANSIENT_RE.test(formatErrorMessage(err)),
    retryAfterMs: (err) => (err instanceof RateLimitError ? err.retryAfter * 1000 : undefined),
  });
}

/**
 * Send-safe retry runner for non-idempotent Discord operations (message
 * creation, forum thread creation, component sends). Only retries rate
 * limits — transient transport errors (timeout, connection reset) are NOT
 * retried because the server may have already processed the request,
 * which would produce duplicate visible messages.
 */
export function createDiscordSendRetryRunner(params: {
  retry?: RetryConfig;
  configRetry?: RetryConfig;
  verbose?: boolean;
}): RetryRunner {
  return createRateLimitRetryRunner({
    ...params,
    defaults: DISCORD_RETRY_DEFAULTS,
    logLabel: "discord-send",
    shouldRetry: (err) => err instanceof RateLimitError,
    retryAfterMs: (err) => (err instanceof RateLimitError ? err.retryAfter * 1000 : undefined),
  });
}
