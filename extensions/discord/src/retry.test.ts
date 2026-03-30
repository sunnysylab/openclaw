import { RateLimitError } from "@buape/carbon";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDiscordRetryRunner,
  createDiscordSendRetryRunner,
  DISCORD_TRANSIENT_RE,
} from "./retry.js";

const ZERO_DELAY_RETRY = { attempts: 3, minDelayMs: 0, maxDelayMs: 0, jitter: 0 };

// Suppress unhandled rejection noise from retry internals during tests.
// The retry runner propagates rejections through timer callbacks which
// Vitest's fakeTimers surface as unhandled before our await catches them.
const suppressUnhandled = () => {};
beforeEach(() => {
  process.on("unhandledRejection", suppressUnhandled);
});
afterEach(() => {
  process.off("unhandledRejection", suppressUnhandled);
});

function createMockRateLimitError(retryAfter = 0.001): RateLimitError {
  // Use Object.create to avoid constructor signature variance across @buape/carbon versions.
  const err = Object.create(RateLimitError.prototype) as RateLimitError;
  Object.assign(err, {
    message: "rate limited",
    retryAfter,
    scope: "user",
    bucket: "test-bucket",
    status: 429,
    name: "RateLimitError",
  });
  return err;
}

describe("createDiscordRetryRunner", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries on RateLimitError", async () => {
    vi.useFakeTimers();
    const runner = createDiscordRetryRunner({ retry: { ...ZERO_DELAY_RETRY, attempts: 2 } });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(createMockRateLimitError())
      .mockResolvedValueOnce("ok");

    const promise = runner(fn, "test");
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it.each([
    "502 Bad Gateway",
    "503 Service Unavailable",
    "fetch failed",
    "read ECONNRESET",
    "connection timeout",
    "ETIMEDOUT",
    "ENOTFOUND",
    "socket hang up",
    "service temporarily unavailable",
  ])("retries transient error: %s", async (message) => {
    vi.useFakeTimers();
    const runner = createDiscordRetryRunner({ retry: { ...ZERO_DELAY_RETRY, attempts: 2 } });
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls++;
      return calls === 1 ? Promise.reject(new Error(message)) : Promise.resolve("ok");
    });

    const promise = runner(fn, "test");
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it.each(["Invalid Form Body", "Unknown Channel", "Missing Permissions"])(
    "does not retry permanent error: %s",
    async (message) => {
      vi.useFakeTimers();
      const runner = createDiscordRetryRunner({ retry: { ...ZERO_DELAY_RETRY, attempts: 3 } });
      const fn = vi.fn().mockImplementation(() => Promise.reject(new Error(message)));

      const promise = runner(fn, "test");
      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(message);
      expect(fn).toHaveBeenCalledTimes(1);
    },
  );

  it("exhausts all attempts on repeated transient errors", async () => {
    vi.useFakeTimers();
    const runner = createDiscordRetryRunner({ retry: ZERO_DELAY_RETRY });
    const fn = vi.fn().mockImplementation(() => Promise.reject(new Error("503 Service Unavailable")));

    const promise = runner(fn, "test");
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("503 Service Unavailable");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("createDiscordSendRetryRunner", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries on RateLimitError", async () => {
    vi.useFakeTimers();
    const runner = createDiscordSendRetryRunner({ retry: { ...ZERO_DELAY_RETRY, attempts: 2 } });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(createMockRateLimitError())
      .mockResolvedValueOnce("ok");

    const promise = runner(fn, "test");
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry transient transport errors", async () => {
    vi.useFakeTimers();
    const runner = createDiscordSendRetryRunner({ retry: { ...ZERO_DELAY_RETRY, attempts: 3 } });
    const fn = vi.fn().mockImplementation(() => Promise.reject(new Error("503 Service Unavailable")));

    const promise = runner(fn, "test");
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("503 Service Unavailable");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each(["fetch failed", "read ECONNRESET", "socket hang up", "connection timeout"])(
    "does not retry transient error for sends: %s",
    async (message) => {
      vi.useFakeTimers();
      const runner = createDiscordSendRetryRunner({ retry: { ...ZERO_DELAY_RETRY, attempts: 3 } });
      const fn = vi.fn().mockImplementation(() => Promise.reject(new Error(message)));

      const promise = runner(fn, "test");
      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow(message);
      expect(fn).toHaveBeenCalledTimes(1);
    },
  );
});

describe("DISCORD_TRANSIENT_RE", () => {
  it.each([
    "502",
    "503",
    "timeout",
    "timed out",
    "connect",
    "reset",
    "closed",
    "unavailable",
    "temporarily",
    "fetch failed",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "socket hang up",
  ])("matches transient pattern: %s", (pattern) => {
    expect(DISCORD_TRANSIENT_RE.test(pattern)).toBe(true);
  });

  it.each([
    "Invalid Form Body",
    "Unknown Channel",
    "Missing Permissions",
    "bad request",
    "forbidden",
  ])("does not match permanent error: %s", (pattern) => {
    expect(DISCORD_TRANSIENT_RE.test(pattern)).toBe(false);
  });
});
