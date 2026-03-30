import type { OpenClawConfig } from "openclaw/plugin-sdk/provider-onboard";
import { describe, expect, it } from "vitest";
import { withEnv } from "../../../test/helpers/plugins/env.js";
import { __testing } from "./kimi-web-search-provider.js";

const kimiApiKeyEnv = ["KIMI_API", "KEY"].join("_");

describe("kimi web search provider", () => {
  it("uses configured model and base url overrides with sane defaults", () => {
    expect(__testing.resolveKimiModel()).toBe("moonshot-v1-128k");
    expect(__testing.resolveKimiModel({ model: "kimi-k2" })).toBe("kimi-k2");
    expect(__testing.resolveKimiBaseUrl()).toBe("https://api.moonshot.ai/v1");
    expect(__testing.resolveKimiBaseUrl({ baseUrl: "https://kimi.example/v1" })).toBe(
      "https://kimi.example/v1",
    );
  });

  it("inherits native Moonshot chat baseUrl when kimi baseUrl is unset", () => {
    const cnOnly = {
      models: { providers: { moonshot: { baseUrl: "https://api.moonshot.cn/v1" } } },
    } as unknown as OpenClawConfig;
    expect(__testing.resolveKimiBaseUrl(undefined, cnOnly)).toBe("https://api.moonshot.cn/v1");
    const cnTrailing = {
      models: { providers: { moonshot: { baseUrl: "https://api.moonshot.cn/v1/" } } },
    } as unknown as OpenClawConfig;
    expect(__testing.resolveKimiBaseUrl(undefined, cnTrailing)).toBe("https://api.moonshot.cn/v1");
  });

  it("does not inherit non-native Moonshot baseUrl for web search", () => {
    const proxy = {
      models: { providers: { moonshot: { baseUrl: "https://proxy.example/v1" } } },
    } as unknown as OpenClawConfig;
    expect(__testing.resolveKimiBaseUrl(undefined, proxy)).toBe("https://api.moonshot.ai/v1");
  });

  it("keeps explicit kimi baseUrl over models.providers.moonshot.baseUrl", () => {
    const cfg = {
      models: { providers: { moonshot: { baseUrl: "https://api.moonshot.cn/v1" } } },
    } as unknown as OpenClawConfig;
    expect(__testing.resolveKimiBaseUrl({ baseUrl: "https://api.moonshot.ai/v1" }, cfg)).toBe(
      "https://api.moonshot.ai/v1",
    );
  });

  it("extracts unique citations from search results and tool call arguments", () => {
    expect(
      __testing.extractKimiCitations({
        search_results: [{ url: "https://a.test" }, { url: "https://b.test" }],
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    arguments: JSON.stringify({
                      url: "https://a.test",
                      search_results: [{ url: "https://c.test" }],
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
    ).toEqual(["https://a.test", "https://b.test", "https://c.test"]);
  });

  it("uses config apiKey when provided", () => {
    expect(__testing.resolveKimiApiKey({ apiKey: "kimi-test-key" })).toBe("kimi-test-key");
  });

  it("falls back to env apiKey", () => {
    withEnv({ [kimiApiKeyEnv]: "kimi-env-key" }, () => {
      expect(__testing.resolveKimiApiKey({})).toBe("kimi-env-key");
    });
  });
});
