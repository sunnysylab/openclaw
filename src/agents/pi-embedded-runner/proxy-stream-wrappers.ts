import type { StreamFn } from "@mariozechner/pi-agent-core";
import { streamSimple } from "@mariozechner/pi-ai";
import type { ThinkLevel } from "../../auto-reply/thinking.js";
import { resolveProviderAttributionHeaders } from "../provider-attribution.js";
import { streamWithPayloadPatch } from "./stream-payload-utils.js";
const KILOCODE_FEATURE_HEADER = "X-KILOCODE-FEATURE";
const KILOCODE_FEATURE_DEFAULT = "openclaw";
const KILOCODE_FEATURE_ENV_VAR = "KILOCODE_FEATURE";

function resolveKilocodeAppHeaders(): Record<string, string> {
  const feature = process.env[KILOCODE_FEATURE_ENV_VAR]?.trim() || KILOCODE_FEATURE_DEFAULT;
  return { [KILOCODE_FEATURE_HEADER]: feature };
}

function isOpenRouterAnthropicModel(provider: string, modelId: string): boolean {
  return provider.toLowerCase() === "openrouter" && modelId.toLowerCase().startsWith("anthropic/");
}

const EPHEMERAL_CACHE_CONTROL = { type: "ephemeral" } as const;

function applyCacheControl(msg: { content?: unknown }): void {
  if (typeof msg.content === "string") {
    msg.content = [{ type: "text", text: msg.content, cache_control: EPHEMERAL_CACHE_CONTROL }];
  } else if (Array.isArray(msg.content) && msg.content.length > 0) {
    const last = msg.content[msg.content.length - 1];
    if (last && typeof last === "object") {
      (last as Record<string, unknown>).cache_control = EPHEMERAL_CACHE_CONTROL;
    }
  }
}

function mapThinkingLevelToOpenRouterReasoningEffort(
  thinkingLevel: ThinkLevel,
): "none" | "minimal" | "low" | "medium" | "high" | "xhigh" {
  if (thinkingLevel === "off") {
    return "none";
  }
  if (thinkingLevel === "adaptive") {
    return "medium";
  }
  return thinkingLevel;
}

function normalizeProxyReasoningPayload(payload: unknown, thinkingLevel?: ThinkLevel): void {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const payloadObj = payload as Record<string, unknown>;
  delete payloadObj.reasoning_effort;
  if (!thinkingLevel || thinkingLevel === "off") {
    return;
  }

  const existingReasoning = payloadObj.reasoning;
  if (
    existingReasoning &&
    typeof existingReasoning === "object" &&
    !Array.isArray(existingReasoning)
  ) {
    const reasoningObj = existingReasoning as Record<string, unknown>;
    if (!("max_tokens" in reasoningObj) && !("effort" in reasoningObj)) {
      reasoningObj.effort = mapThinkingLevelToOpenRouterReasoningEffort(thinkingLevel);
    }
  } else if (!existingReasoning) {
    payloadObj.reasoning = {
      effort: mapThinkingLevelToOpenRouterReasoningEffort(thinkingLevel),
    };
  }
}

export function createOpenRouterSystemCacheWrapper(baseStreamFn: StreamFn | undefined): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    if (
      typeof model.provider !== "string" ||
      typeof model.id !== "string" ||
      !isOpenRouterAnthropicModel(model.provider, model.id)
    ) {
      return underlying(model, context, options);
    }

    return streamWithPayloadPatch(underlying, model, context, options, (payloadObj) => {
      const messages = payloadObj.messages;
      if (!Array.isArray(messages)) {
        return;
      }
      const typedMessages = messages as Array<{ role?: string; content?: unknown }>;
      // Anthropic allows max 4 explicit cache_control breakpoints per request.
      // We use at most 2: one on the last system/developer message (caches the
      // stable instruction prefix) and one on the last user message (caches
      // conversation history). Marking only the *last* system message is
      // sufficient because caching is a prefix match — everything before the
      // breakpoint is cached together.
      let lastSystemMsg: { role?: string; content?: unknown } | undefined;
      for (const msg of typedMessages) {
        if (msg.role === "system" || msg.role === "developer") {
          lastSystemMsg = msg;
        }
      }
      if (lastSystemMsg) {
        applyCacheControl(lastSystemMsg);
      }
      const lastMsg = typedMessages[typedMessages.length - 1];
      if (lastMsg?.role === "user") {
        applyCacheControl(lastMsg);
      }
    });
  };
}

export function createOpenRouterWrapper(
  baseStreamFn: StreamFn | undefined,
  thinkingLevel?: ThinkLevel,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    const attributionHeaders = resolveProviderAttributionHeaders("openrouter");
    return streamWithPayloadPatch(
      underlying,
      model,
      context,
      {
        ...options,
        headers: {
          ...attributionHeaders,
          ...options?.headers,
        },
      },
      (payload) => {
        normalizeProxyReasoningPayload(payload, thinkingLevel);
      },
    );
  };
}

export function isProxyReasoningUnsupported(modelId: string): boolean {
  return modelId.toLowerCase().startsWith("x-ai/");
}

export function createKilocodeWrapper(
  baseStreamFn: StreamFn | undefined,
  thinkingLevel?: ThinkLevel,
): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) => {
    return streamWithPayloadPatch(
      underlying,
      model,
      context,
      {
        ...options,
        headers: {
          ...options?.headers,
          ...resolveKilocodeAppHeaders(),
        },
      },
      (payload) => {
        normalizeProxyReasoningPayload(payload, thinkingLevel);
      },
    );
  };
}
