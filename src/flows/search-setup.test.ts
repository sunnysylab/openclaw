import { describe, expect, it, vi } from "vitest";
import { createWizardPrompter } from "../../test/helpers/wizard-prompter.js";
import { createNonExitingRuntime } from "../runtime.js";
import { runSearchSetupFlow } from "./search-setup.js";

const grokProvider = vi.hoisted(() => ({
  id: "grok",
  pluginId: "xai",
  label: "Grok",
  hint: "XAI search",
  onboardingScopes: ["text-inference"],
  envVars: ["XAI_API_KEY"],
  placeholder: "xai-...",
  signupUrl: "https://x.ai/api",
  credentialPath: "plugins.entries.xai.config.webSearch.apiKey",
  getCredentialValue: () => undefined,
  setCredentialValue: () => {},
  getConfiguredCredentialValue: (config?: {
    plugins?: { entries?: { xai?: { config?: { webSearch?: { apiKey?: unknown } } } } };
  }) => config?.plugins?.entries?.xai?.config?.webSearch?.apiKey,
  setConfiguredCredentialValue: (
    config: {
      plugins?: { entries?: Record<string, { config?: Record<string, unknown> }> };
    },
    value: unknown,
  ) => {
    const entries = ((config.plugins ??= {}).entries ??= {});
    const pluginEntry = (entries.xai ??= {});
    const pluginConfig = (pluginEntry.config ??= {});
    const webSearch = (pluginConfig.webSearch ??= {}) as { apiKey?: unknown };
    webSearch.apiKey = value;
  },
  createTool: () => null,
  runSetup: async (params: {
    config: Record<string, unknown>;
    prompter: { select: (options: unknown) => Promise<string> };
  }) => {
    const enableXSearch = await params.prompter.select({
      message: "Enable x_search",
      options: [],
    });
    if (enableXSearch !== "yes") {
      return params.config;
    }
    const model = await params.prompter.select({
      message: "Choose x_search model",
      options: [],
    });
    const tools =
      typeof params.config.tools === "object" && params.config.tools !== null
        ? (params.config.tools as Record<string, unknown>)
        : undefined;
    const web =
      typeof tools?.web === "object" && tools.web !== null
        ? (tools.web as Record<string, unknown>)
        : undefined;
    return {
      ...params.config,
      tools: {
        ...tools,
        web: {
          ...web,
          x_search: {
            enabled: true,
            model,
          },
        },
      },
    };
  },
}));

vi.mock("../plugins/web-search-providers.runtime.js", () => ({
  resolvePluginWebSearchProviders: (params?: { config?: { plugins?: { allow?: string[] } } }) => {
    if (!params?.config?.plugins?.allow?.includes("xai")) {
      return [];
    }
    return [grokProvider];
  },
}));

describe("runSearchSetupFlow", () => {
  it("runs provider-owned setup after selecting Grok web search", async () => {
    const select = vi
      .fn()
      .mockResolvedValueOnce("grok")
      .mockResolvedValueOnce("yes")
      .mockResolvedValueOnce("grok-4-1-fast");
    const text = vi.fn().mockResolvedValue("xai-test-key");
    const prompter = createWizardPrompter({
      select: select as never,
      text: text as never,
    });

    const next = await runSearchSetupFlow(
      { plugins: { allow: ["xai"] } },
      createNonExitingRuntime(),
      prompter,
    );

    expect(next.plugins?.entries?.xai?.config?.webSearch).toMatchObject({
      apiKey: "xai-test-key",
    });
    expect(next.tools?.web?.search).toMatchObject({
      provider: "grok",
      enabled: true,
    });
    expect(next.tools?.web?.x_search).toMatchObject({
      enabled: true,
      model: "grok-4-1-fast",
    });
  });

  it("preserves disabled web_search state while still allowing provider-owned x_search setup", async () => {
    const select = vi
      .fn()
      .mockResolvedValueOnce("grok")
      .mockResolvedValueOnce("yes")
      .mockResolvedValueOnce("grok-4-1-fast");
    const prompter = createWizardPrompter({
      select: select as never,
    });

    const next = await runSearchSetupFlow(
      {
        plugins: {
          allow: ["xai"],
          entries: {
            xai: {
              enabled: true,
              config: {
                webSearch: {
                  apiKey: "xai-test-key",
                },
              },
            },
          },
        },
        tools: {
          web: {
            search: {
              provider: "grok",
              enabled: false,
            },
          },
        },
      },
      createNonExitingRuntime(),
      prompter,
    );

    expect(next.tools?.web?.search).toMatchObject({
      provider: "grok",
      enabled: false,
    });
    expect(next.tools?.web?.x_search).toMatchObject({
      enabled: true,
      model: "grok-4-1-fast",
    });
  });
});
