import { describe, expect, it, vi } from "vitest";
import { createHookRunnerWithRegistry } from "./hooks.test-helpers.js";

const hookCtx = {
  agentId: "main",
  sessionId: "session-1",
};

async function expectLlmHookCall(params: {
  hookName: "llm_input" | "llm_output";
  event: Record<string, unknown>;
  expectedEvent: Record<string, unknown>;
}) {
  const handler = vi.fn();
  const { runner } = createHookRunnerWithRegistry([{ hookName: params.hookName, handler }]);

  if (params.hookName === "llm_input") {
    await runner.runLlmInput(
      {
        ...params.event,
        historyMessages: [...((params.event.historyMessages as unknown[] | undefined) ?? [])],
      } as Parameters<typeof runner.runLlmInput>[0],
      hookCtx,
    );
  } else {
    await runner.runLlmOutput(
      {
        ...params.event,
        assistantTexts: [...((params.event.assistantTexts as string[] | undefined) ?? [])],
      } as Parameters<typeof runner.runLlmOutput>[0],
      hookCtx,
    );
  }

  expect(handler).toHaveBeenCalledWith(
    expect.objectContaining(params.expectedEvent),
    expect.objectContaining({ sessionId: "session-1" }),
  );
}

describe("llm hook runner methods", () => {
  it.each([
    {
      name: "runLlmInput invokes registered llm_input hooks",
      hookName: "llm_input" as const,
      methodName: "runLlmInput" as const,
      event: {
        runId: "run-1",
        sessionId: "session-1",
        provider: "openai",
        model: "gpt-5",
        systemPrompt: "be helpful",
        prompt: "hello",
        historyMessages: [],
        imagesCount: 0,
      },
      expectedEvent: { runId: "run-1", prompt: "hello" },
    },
    {
      name: "runLlmOutput invokes registered llm_output hooks",
      hookName: "llm_output" as const,
      methodName: "runLlmOutput" as const,
      event: {
        runId: "run-1",
        sessionId: "session-1",
        provider: "openai",
        model: "gpt-5",
        assistantTexts: ["hi"],
        lastAssistant: { role: "assistant", content: "hi" },
        usage: {
          input: 10,
          output: 20,
          total: 30,
        },
      },
      expectedEvent: { runId: "run-1", assistantTexts: ["hi"] },
    },
  ] as const)("$name", async ({ hookName, expectedEvent, event }) => {
    await expectLlmHookCall({ hookName, event, expectedEvent });
  });

  it("hasHooks returns true for registered llm hooks", () => {
    const { runner } = createHookRunnerWithRegistry([{ hookName: "llm_input", handler: vi.fn() }]);

    expect(runner.hasHooks("llm_input")).toBe(true);
    expect(runner.hasHooks("llm_output")).toBe(false);
  });

  it("runLlmInput returns modified prompt from hook", async () => {
    const handler = vi.fn().mockResolvedValue({ prompt: "redacted prompt" });
    const registry = createMockPluginRegistry([{ hookName: "llm_input", handler }]);
    const runner = createHookRunner(registry);

    const result = await runner.runLlmInput(
      {
        runId: "run-1",
        sessionId: "session-1",
        provider: "openai",
        model: "gpt-5",
        systemPrompt: "be helpful",
        prompt: "original prompt",
        historyMessages: [],
        imagesCount: 0,
      },
      { agentId: "main", sessionId: "session-1" },
    );

    expect(result).toEqual(expect.objectContaining({ prompt: "redacted prompt" }));
  });

  it("runLlmInput returns undefined when hook returns void (backward compat)", async () => {
    const handler = vi.fn(); // returns undefined
    const registry = createMockPluginRegistry([{ hookName: "llm_input", handler }]);
    const runner = createHookRunner(registry);

    const result = await runner.runLlmInput(
      {
        runId: "run-1",
        sessionId: "session-1",
        provider: "openai",
        model: "gpt-5",
        prompt: "hello",
        historyMessages: [],
        imagesCount: 0,
      },
      { agentId: "main", sessionId: "session-1" },
    );

    expect(result).toBeUndefined();
  });

  it("runLlmOutput returns modified assistantTexts from hook", async () => {
    const handler = vi.fn().mockResolvedValue({ assistantTexts: ["rehydrated response"] });
    const registry = createMockPluginRegistry([{ hookName: "llm_output", handler }]);
    const runner = createHookRunner(registry);

    const result = await runner.runLlmOutput(
      {
        runId: "run-1",
        sessionId: "session-1",
        provider: "openai",
        model: "gpt-5",
        assistantTexts: ["raw «PERSON_001» response"],
        lastAssistant: { role: "assistant", content: "raw" },
        usage: { input: 10, output: 20, total: 30 },
      },
      { agentId: "main", sessionId: "session-1" },
    );

    expect(result).toEqual(expect.objectContaining({ assistantTexts: ["rehydrated response"] }));
  });

  it("runLlmOutput returns undefined when hook returns void (backward compat)", async () => {
    const handler = vi.fn(); // returns undefined
    const registry = createMockPluginRegistry([{ hookName: "llm_output", handler }]);
    const runner = createHookRunner(registry);

    const result = await runner.runLlmOutput(
      {
        runId: "run-1",
        sessionId: "session-1",
        provider: "openai",
        model: "gpt-5",
        assistantTexts: ["hi"],
        usage: { input: 10, output: 20, total: 30 },
      },
      { agentId: "main", sessionId: "session-1" },
    );

    expect(result).toBeUndefined();
  });
});
