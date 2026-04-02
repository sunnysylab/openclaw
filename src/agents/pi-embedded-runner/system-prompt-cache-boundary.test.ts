import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { Context } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { applyExtraParamsToAgent } from "./extra-params.js";

const DELIMITER = "\n<!-- OPENCLAW_CACHE_BOUNDARY -->\n";
type TestModel = Parameters<StreamFn>[0];

function createMockStream(): ReturnType<StreamFn> {
  return {
    push() {},
    async result() {
      return undefined;
    },
    async *[Symbol.asyncIterator]() {},
  } as unknown as ReturnType<StreamFn>;
}

function runPayloadCase(params: {
  cfg?: Parameters<typeof applyExtraParamsToAgent>[1];
  model: TestModel;
  payload: Record<string, unknown>;
}) {
  const baseStreamFn: StreamFn = (model, _context, options) => {
    options?.onPayload?.(params.payload, model);
    return createMockStream();
  };
  const agent = { streamFn: baseStreamFn };
  applyExtraParamsToAgent(
    agent,
    params.cfg,
    params.model.provider,
    params.model.id,
    undefined,
    undefined,
    undefined,
    undefined,
    params.model as Parameters<typeof applyExtraParamsToAgent>[8],
  );

  const context: Context = { messages: [] };
  void agent.streamFn?.(params.model, context, {});
}

describe("system prompt cache boundary", () => {
  it("splits Anthropic system blocks into cached static and uncached dynamic blocks", () => {
    const payload = {
      system: [
        {
          type: "text",
          text: `Static prefix${DELIMITER}Dynamic suffix`,
          cache_control: { type: "ephemeral" },
        },
      ],
    };

    runPayloadCase({
      cfg: {
        agents: {
          defaults: {
            models: {
              "anthropic/claude-sonnet-4-6": {
                params: {
                  cacheRetention: "long",
                },
              },
            },
          },
        },
      },
      model: {
        api: "anthropic-messages",
        provider: "anthropic",
        id: "claude-sonnet-4-6",
      } as TestModel,
      payload,
    });

    expect(payload.system).toEqual([
      { type: "text", text: "Static prefix", cache_control: { type: "ephemeral" } },
      { type: "text", text: "Dynamic suffix" },
    ]);
  });

  it("strips the boundary marker for non-Anthropic providers without splitting", () => {
    const payload = {
      system: `Static prefix${DELIMITER}Dynamic suffix`,
    };

    runPayloadCase({
      model: {
        api: "openai-completions",
        provider: "openai",
        id: "gpt-5.4",
      } as TestModel,
      payload,
    });

    expect(payload.system).toBe("Static prefix\nDynamic suffix");
  });
});
