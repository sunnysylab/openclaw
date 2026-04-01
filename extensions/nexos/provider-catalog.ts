import type { ModelProviderConfig } from "openclaw/plugin-sdk/provider-model-shared";
import { buildNexosModelDefinition, NEXOS_BASE_URL, NEXOS_MODEL_CATALOG } from "./api.js";

export function buildNexosProvider(): ModelProviderConfig {
  return {
    baseUrl: NEXOS_BASE_URL,
    api: "openai-completions",
    models: NEXOS_MODEL_CATALOG.map(buildNexosModelDefinition),
  };
}
