import type { ModelDefinitionConfig } from "openclaw/plugin-sdk/provider-model-shared";

export const NEXOS_BASE_URL = "https://api.nexos.ai/v1";

// Nexos AI pricing is not publicly documented per-token.
// Set to 0 as a safe default.
const NEXOS_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

/**
 * Static catalog of Nexos AI models.
 * Nexos is an OpenAI-compatible gateway that proxies multiple providers
 * (Anthropic, OpenAI, Google, xAI) through a unified API.
 */
export const NEXOS_MODEL_CATALOG: ModelDefinitionConfig[] = [
  {
    id: "Claude Opus 4.6",
    name: "Claude Opus 4.6",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 200_000,
    maxTokens: 128_000,
    cost: NEXOS_DEFAULT_COST,
  },
  {
    id: "Claude Opus 4.5",
    name: "Claude Opus 4.5",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 200_000,
    maxTokens: 128_000,
    cost: NEXOS_DEFAULT_COST,
  },
  {
    id: "Claude Sonnet 4.6",
    name: "Claude Sonnet 4.6",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 200_000,
    maxTokens: 64_000,
    cost: NEXOS_DEFAULT_COST,
  },
  {
    id: "Claude Sonnet 4.5",
    name: "Claude Sonnet 4.5",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 200_000,
    maxTokens: 64_000,
    cost: NEXOS_DEFAULT_COST,
  },
  {
    id: "Claude Haiku 4.5",
    name: "Claude Haiku 4.5",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 200_000,
    maxTokens: 8_192,
    cost: NEXOS_DEFAULT_COST,
  },
  {
    id: "GPT 5.2",
    name: "GPT 5.2",
    reasoning: true,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 32_768,
    cost: NEXOS_DEFAULT_COST,
  },
  {
    id: "GPT 5",
    name: "GPT 5",
    reasoning: true,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 32_768,
    cost: NEXOS_DEFAULT_COST,
  },
  {
    id: "GPT 4.1",
    name: "GPT 4.1",
    reasoning: false,
    input: ["text"],
    contextWindow: 1_000_000,
    maxTokens: 32_768,
    cost: NEXOS_DEFAULT_COST,
  },
  {
    id: "Gemini 3 Flash Preview",
    name: "Gemini 3 Flash Preview",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    cost: NEXOS_DEFAULT_COST,
  },
  {
    id: "Gemini 2.5 Pro",
    name: "Gemini 2.5 Pro",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    cost: NEXOS_DEFAULT_COST,
  },
  {
    id: "Grok 4 Fast",
    name: "Grok 4 Fast",
    reasoning: true,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 32_768,
    cost: NEXOS_DEFAULT_COST,
  },
  {
    id: "Devstral 2",
    name: "Devstral 2",
    reasoning: false,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 32_768,
    cost: NEXOS_DEFAULT_COST,
  },
];

export function buildNexosModelDefinition(
  model: (typeof NEXOS_MODEL_CATALOG)[number],
): ModelDefinitionConfig {
  return {
    id: model.id,
    name: model.name,
    api: "openai-completions",
    reasoning: model.reasoning,
    input: model.input,
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
}
