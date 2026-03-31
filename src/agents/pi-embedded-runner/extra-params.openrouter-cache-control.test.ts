import type { Model } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { runExtraParamsCase } from "./extra-params.test-support.js";

type StreamPayload = {
  messages: Array<{
    role: string;
    content: unknown;
  }>;
};

function runOpenRouterPayload(payload: StreamPayload, modelId: string) {
  runExtraParamsCase({
    cfg: {
      plugins: {
        entries: {
          openrouter: {
            enabled: true,
          },
        },
      },
    },
    model: {
      api: "openai-completions",
      provider: "openrouter",
      id: modelId,
    } as Model<"openai-completions">,
    payload,
  });
}

describe("extra-params: OpenRouter Anthropic cache_control", () => {
  it("injects cache_control into system message and last user message for OpenRouter Anthropic models", () => {
    const payload = {
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
      ],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    expect(payload.messages[0].content).toEqual([
      { type: "text", text: "You are a helpful assistant.", cache_control: { type: "ephemeral" } },
    ]);
    expect(payload.messages[1].content).toEqual([
      { type: "text", text: "Hello", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("adds cache_control to last content block when system message is already array", () => {
    const payload = {
      messages: [
        {
          role: "system",
          content: [
            { type: "text", text: "Part 1" },
            { type: "text", text: "Part 2" },
          ],
        },
      ],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    const content = payload.messages[0].content as Array<Record<string, unknown>>;
    expect(content[0]).toEqual({ type: "text", text: "Part 1" });
    expect(content[1]).toEqual({
      type: "text",
      text: "Part 2",
      cache_control: { type: "ephemeral" },
    });
  });

  it("does not inject cache_control for OpenRouter non-Anthropic models", () => {
    const payload = {
      messages: [{ role: "system", content: "You are a helpful assistant." }],
    };

    runOpenRouterPayload(payload, "google/gemini-3-pro");

    expect(payload.messages[0].content).toBe("You are a helpful assistant.");
  });

  it("leaves payload unchanged when no system message exists", () => {
    const payload = {
      messages: [{ role: "user", content: "Hello" }],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    // Last user message still gets cache_control for conversation-history caching
    expect(payload.messages[0].content).toEqual([
      { type: "text", text: "Hello", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("adds cache_control to last user message for conversation-history caching", () => {
    const payload = {
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "What is 2+2?" },
      ],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    // System message gets cache_control
    expect(payload.messages[0].content).toEqual([
      { type: "text", text: "You are a helpful assistant.", cache_control: { type: "ephemeral" } },
    ]);
    // Earlier user message is untouched
    expect(payload.messages[1].content).toBe("Hello");
    // Last user message gets cache_control
    expect(payload.messages[3].content).toEqual([
      { type: "text", text: "What is 2+2?", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("adds cache_control to last block of array-content user message", () => {
    const payload = {
      messages: [
        { role: "system", content: "System prompt." },
        {
          role: "user",
          content: [
            { type: "text", text: "Part 1" },
            { type: "text", text: "Part 2" },
          ],
        },
      ],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    const userContent = payload.messages[1].content as Array<Record<string, unknown>>;
    expect(userContent[0]).toEqual({ type: "text", text: "Part 1" });
    expect(userContent[1]).toEqual({
      type: "text",
      text: "Part 2",
      cache_control: { type: "ephemeral" },
    });
  });

  it("does not add user-message cache_control when last message is assistant", () => {
    const payload = {
      messages: [
        { role: "system", content: "System prompt." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
      ],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    // System gets cache_control
    expect(payload.messages[0].content).toEqual([
      { type: "text", text: "System prompt.", cache_control: { type: "ephemeral" } },
    ]);
    // User message is NOT the last message, so no cache_control
    expect(payload.messages[1].content).toBe("Hello");
    // Assistant message is untouched
    expect(payload.messages[2].content).toBe("Hi!");
  });

  it("does not add user-message cache_control for non-Anthropic models", () => {
    const payload = {
      messages: [
        { role: "system", content: "System prompt." },
        { role: "user", content: "Hello" },
      ],
    };

    runOpenRouterPayload(payload, "google/gemini-3-pro");

    expect(payload.messages[0].content).toBe("System prompt.");
    expect(payload.messages[1].content).toBe("Hello");
  });

  it("walks back to nearest cacheable block when last block is not cacheable", () => {
    const payload = {
      messages: [
        { role: "system", content: "System prompt." },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this document" },
            { type: "document", source: { type: "base64", data: "abc" } },
          ],
        },
      ],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    const userContent = payload.messages[1].content as Array<Record<string, unknown>>;
    // text block: gets cache_control (nearest cacheable block walking backward)
    expect(userContent[0]).toEqual({
      type: "text",
      text: "Describe this document",
      cache_control: { type: "ephemeral" },
    });
    // document block: untouched
    expect(userContent[1]).toEqual({ type: "document", source: { type: "base64", data: "abc" } });
  });

  it("skips cache_control when no cacheable block exists in user message", () => {
    const payload = {
      messages: [
        { role: "system", content: "System prompt." },
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", data: "abc" } },
          ],
        },
      ],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    const userContent = payload.messages[1].content as Array<Record<string, unknown>>;
    expect(userContent[0]).toEqual({ type: "document", source: { type: "base64", data: "abc" } });
  });

  it("only marks the last system message when multiple system messages exist", () => {
    const payload = {
      messages: [
        { role: "system", content: "First system instruction." },
        { role: "system", content: "Second system instruction." },
        { role: "user", content: "Hello" },
      ],
    };

    runOpenRouterPayload(payload, "anthropic/claude-opus-4-6");

    // First system message: no cache_control (only the last gets it)
    expect(payload.messages[0].content).toBe("First system instruction.");
    // Last system message: gets cache_control
    expect(payload.messages[1].content).toEqual([
      {
        type: "text",
        text: "Second system instruction.",
        cache_control: { type: "ephemeral" },
      },
    ]);
    // Last user message: gets cache_control
    expect(payload.messages[2].content).toEqual([
      { type: "text", text: "Hello", cache_control: { type: "ephemeral" } },
    ]);
  });
});
