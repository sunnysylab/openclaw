import { streamSimple } from "@mariozechner/pi-ai";
import {
  definePluginEntry,
  type OpenClawPluginApi,
  type ProviderAuthMethodNonInteractiveContext,
} from "openclaw/plugin-sdk/plugin-entry";
import {
  VLLM_DEFAULT_API_KEY_ENV_VAR,
  VLLM_DEFAULT_BASE_URL,
  VLLM_MODEL_PLACEHOLDER,
  VLLM_PROVIDER_LABEL,
  buildVllmProvider,
} from "./api.js";

const PROVIDER_ID = "vllm";
const DEFAULT_API_KEY = "vllm-local";

async function loadProviderSetup() {
  return await import("openclaw/plugin-sdk/provider-setup");
}

export default definePluginEntry({
  id: "vllm",
  name: "vLLM Provider",
  description: "Bundled vLLM provider plugin",
  register(api: OpenClawPluginApi) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: "vLLM",
      docsPath: "/providers/vllm",
      envVars: ["VLLM_API_KEY"],
      auth: [
        {
          id: "custom",
          label: VLLM_PROVIDER_LABEL,
          hint: "Local/self-hosted OpenAI-compatible server",
          kind: "custom",
          run: async (ctx) => {
            const providerSetup = await loadProviderSetup();
            return await providerSetup.promptAndConfigureOpenAICompatibleSelfHostedProviderAuth({
              cfg: ctx.config,
              prompter: ctx.prompter,
              providerId: PROVIDER_ID,
              providerLabel: VLLM_PROVIDER_LABEL,
              defaultBaseUrl: VLLM_DEFAULT_BASE_URL,
              defaultApiKeyEnvVar: VLLM_DEFAULT_API_KEY_ENV_VAR,
              modelPlaceholder: VLLM_MODEL_PLACEHOLDER,
            });
          },
          runNonInteractive: async (ctx: ProviderAuthMethodNonInteractiveContext) => {
            const providerSetup = await loadProviderSetup();
            return await providerSetup.configureOpenAICompatibleSelfHostedProviderNonInteractive({
              ctx,
              providerId: PROVIDER_ID,
              providerLabel: VLLM_PROVIDER_LABEL,
              defaultBaseUrl: VLLM_DEFAULT_BASE_URL,
              defaultApiKeyEnvVar: VLLM_DEFAULT_API_KEY_ENV_VAR,
              modelPlaceholder: VLLM_MODEL_PLACEHOLDER,
            });
          },
        },
      ],
      discovery: {
        order: "late",
        run: async (ctx) => {
          const providerSetup = await loadProviderSetup();
          return await providerSetup.discoverOpenAICompatibleSelfHostedProvider({
            ctx,
            providerId: PROVIDER_ID,
            buildProvider: buildVllmProvider,
          });
        },
      },
      wizard: {
        setup: {
          choiceId: "vllm",
          choiceLabel: "vLLM",
          choiceHint: "Local/self-hosted OpenAI-compatible server",
          groupId: "vllm",
          groupLabel: "vLLM",
          groupHint: "Local/self-hosted OpenAI-compatible",
          methodId: "custom",
        },
        modelPicker: {
          label: "vLLM (custom)",
          hint: "Enter vLLM URL + API key + model",
          methodId: "custom",
        },
      },
      createStreamFn: ({ config }) => {
        const providerConfig = config?.models?.providers?.[PROVIDER_ID];
        const apiKey = providerConfig?.apiKey ?? DEFAULT_API_KEY;
        return (model, context, options) => {
          return streamSimple(model, context, {
            ...options,
            apiKey: options?.apiKey ?? apiKey,
          });
        };
      },
      resolveSyntheticAuth: ({ providerConfig }) => {
        const hasApiConfig =
          Boolean(providerConfig?.api?.trim()) ||
          Boolean(providerConfig?.baseUrl?.trim()) ||
          (Array.isArray(providerConfig?.models) && providerConfig.models.length > 0);
        if (!hasApiConfig) {
          return undefined;
        }
        return {
          apiKey: DEFAULT_API_KEY,
          source: `models.providers.${PROVIDER_ID} (synthetic local key)`,
          mode: "api-key",
        };
      },
      buildUnknownModelHint: () =>
        "vLLM requires authentication to be registered as a provider. " +
        'Set VLLM_API_KEY (any value works) or run "openclaw configure". ' +
        "See: https://docs.openclaw.ai/providers/vllm",
    });
  },
});
