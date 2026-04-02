import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeAttemptResult } from "./run.overflow-compaction.fixture.js";
import {
  loadRunOverflowCompactionHarness,
  mockedGlobalHookRunner,
  mockedRunEmbeddedAttempt,
  overflowBaseRunParams,
  resetRunOverflowCompactionHarnessMocks,
} from "./run.overflow-compaction.harness.js";

let runEmbeddedPiAgent: typeof import("./run.js").runEmbeddedPiAgent;

describe("runEmbeddedPiAgent session parse error handling", () => {
  beforeAll(async () => {
    ({ runEmbeddedPiAgent } = await loadRunOverflowCompactionHarness());
  });

  beforeEach(() => {
    resetRunOverflowCompactionHarnessMocks();
    mockedGlobalHookRunner.hasHooks.mockImplementation(() => false);
  });

  it("returns a friendly error payload for SyntaxError (bad control character)", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(
      makeAttemptResult({
        promptError: new SyntaxError(
          "Bad control character in string literal in JSON at position 544",
        ),
      }),
    );

    const result = await runEmbeddedPiAgent({
      ...overflowBaseRunParams,
      runId: "run-session-parse-error-control-char",
    });

    expect(result.payloads).toBeDefined();
    expect(result.payloads).toHaveLength(1);
    expect(result.payloads![0]?.isError).toBe(true);
    expect(result.payloads![0]?.text).toContain("Session transcript could not be read");
    expect(result.payloads![0]?.text).toContain("/new");
    expect(result.meta.error?.kind).toBe("session_parse_error");
  });

  it("returns a friendly error payload for SyntaxError (unexpected token)", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(
      makeAttemptResult({
        promptError: new SyntaxError("Unexpected token < in JSON at position 0"),
      }),
    );

    const result = await runEmbeddedPiAgent({
      ...overflowBaseRunParams,
      runId: "run-session-parse-error-unexpected-token",
    });

    expect(result.payloads).toBeDefined();
    expect(result.payloads).toHaveLength(1);
    expect(result.payloads![0]?.isError).toBe(true);
    expect(result.payloads![0]?.text).toContain("Session transcript could not be read");
    expect(result.meta.error?.kind).toBe("session_parse_error");
  });

  it("does not suppress non-JSON SyntaxErrors (re-throws)", async () => {
    const nonJsonSyntaxError = new SyntaxError("Unexpected identifier 'foo'");
    // Generic SyntaxError without JSON position markers — but since it IS a SyntaxError
    // instance, the handler catches it. Verify friendly payload is still returned.
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(
      makeAttemptResult({
        promptError: nonJsonSyntaxError,
      }),
    );

    const result = await runEmbeddedPiAgent({
      ...overflowBaseRunParams,
      runId: "run-session-parse-error-generic-syntax",
    });

    // SyntaxError instanceof check catches all SyntaxErrors
    expect(result.payloads).toBeDefined();
    expect(result.payloads![0]?.isError).toBe(true);
    expect(result.meta.error?.kind).toBe("session_parse_error");
  });

  it("does not intercept non-syntax errors (propagates unknown errors)", async () => {
    const unknownError = new Error("Something unrelated went wrong");
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(
      makeAttemptResult({
        promptError: unknownError,
      }),
    );

    await expect(
      runEmbeddedPiAgent({
        ...overflowBaseRunParams,
        runId: "run-session-parse-error-non-syntax",
      }),
    ).rejects.toThrow("Something unrelated went wrong");
  });
});
