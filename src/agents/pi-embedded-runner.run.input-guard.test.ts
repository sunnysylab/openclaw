import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuardModelConfig } from "./guard-model.js";
import { applyEmbeddedInputGuardForAttempt } from "./pi-embedded-runner/run/input-guard.js";

const applyGuardToInputMock = vi.fn();

vi.mock("./guard-model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./guard-model.js")>();
  return {
    ...actual,
    applyGuardToInput: (...args: unknown[]) => applyGuardToInputMock(...args),
  };
});

const guardConfig: GuardModelConfig = {
  provider: "openai",
  modelId: "guard-1",
  modelRef: "openai/guard-1",
  action: "redact",
  onError: "allow",
};

const runtimeConfig = {
  models: {
    providers: {
      openai: {
        api: "openai-responses",
        apiKey: "sk-test",
        baseUrl: "https://example.com",
        models: [],
      },
    },
  },
};

beforeEach(() => {
  applyGuardToInputMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyEmbeddedInputGuardForAttempt", () => {
  it("re-runs the input guard from the original prompt on each retry attempt", async () => {
    const originalPrompt = "unsafe secret";
    applyGuardToInputMock
      .mockResolvedValueOnce({
        blocked: false,
        rewrittenText: "safe replacement",
        payloads: [],
      })
      .mockResolvedValueOnce({
        blocked: true,
        payloads: [{ text: "blocked", isError: true }],
      });

    const firstAttempt = await applyEmbeddedInputGuardForAttempt({
      prompt: originalPrompt,
      inputGuardConfig: guardConfig,
      cfg: runtimeConfig,
    });
    const secondAttempt = await applyEmbeddedInputGuardForAttempt({
      prompt: originalPrompt,
      inputGuardConfig: guardConfig,
      cfg: runtimeConfig,
    });

    expect(applyGuardToInputMock).toHaveBeenCalledTimes(2);
    expect(applyGuardToInputMock).toHaveBeenNthCalledWith(1, originalPrompt, guardConfig, {
      cfg: runtimeConfig,
      agentDir: undefined,
    });
    expect(applyGuardToInputMock).toHaveBeenNthCalledWith(2, originalPrompt, guardConfig, {
      cfg: runtimeConfig,
      agentDir: undefined,
    });
    expect(firstAttempt).toEqual({
      blocked: false,
      prompt: "safe replacement",
    });
    expect(secondAttempt).toEqual({
      blocked: true,
      payloads: [{ text: "blocked", isError: true }],
    });
  });
});
