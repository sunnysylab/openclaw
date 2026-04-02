import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { SpeechProviderPlugin } from "../plugins/types.js";

const resolvePluginCapabilityProvidersMock = vi.fn();

vi.mock("../plugins/capability-provider-runtime.js", () => ({
  resolvePluginCapabilityProviders: (
    ...args: Parameters<typeof resolvePluginCapabilityProvidersMock>
  ) => resolvePluginCapabilityProvidersMock(...args),
}));

let getSpeechProvider: typeof import("./provider-registry.js").getSpeechProvider;
let listSpeechProviders: typeof import("./provider-registry.js").listSpeechProviders;
let canonicalizeSpeechProviderId: typeof import("./provider-registry.js").canonicalizeSpeechProviderId;
let normalizeSpeechProviderId: typeof import("./provider-registry.js").normalizeSpeechProviderId;

function createSpeechProvider(id: string, aliases?: string[]): SpeechProviderPlugin {
  return {
    id,
    label: id,
    ...(aliases ? { aliases } : {}),
    isConfigured: () => true,
    synthesize: async () => ({
      audioBuffer: Buffer.from("audio"),
      outputFormat: "mp3",
      voiceCompatible: false,
      fileExtension: ".mp3",
    }),
  };
}

describe("speech provider registry", () => {
  beforeEach(async () => {
    vi.resetModules();
    resolvePluginCapabilityProvidersMock.mockReset();
    resolvePluginCapabilityProvidersMock.mockReturnValue([]);
    ({
      getSpeechProvider,
      listSpeechProviders,
      canonicalizeSpeechProviderId,
      normalizeSpeechProviderId,
    } = await import("./provider-registry.js"));
  });

  it("uses active plugin speech providers without reloading plugins", () => {
    resolvePluginCapabilityProvidersMock.mockReturnValue([createSpeechProvider("openai")]);

    const providers = listSpeechProviders();

    expect(providers.map((provider) => provider.id)).toEqual(["openai"]);
    expect(resolvePluginCapabilityProvidersMock).toHaveBeenCalledWith({
      key: "speechProviders",
      cfg: undefined,
    });
  });

  it("reuses the active plugin registry when one is already loaded", () => {
    resolvePluginCapabilityProvidersMock.mockReturnValue([]);

    listSpeechProviders({ plugins: { enabled: true } } as never);

    expect(resolvePluginCapabilityProvidersMock).toHaveBeenCalledWith({
      key: "speechProviders",
      cfg: { plugins: { enabled: true } },
    });
  });

  it("loads speech providers from plugins when config is provided", () => {
    resolvePluginCapabilityProvidersMock.mockReturnValue([
      createSpeechProvider("microsoft", ["edge"]),
    ]);

    const cfg = {} as OpenClawConfig;

    expect(listSpeechProviders(cfg).map((provider) => provider.id)).toEqual(["microsoft"]);
    expect(getSpeechProvider("edge", cfg)?.id).toBe("microsoft");
    expect(resolvePluginCapabilityProvidersMock).toHaveBeenCalledWith({
      key: "speechProviders",
      cfg,
    });
  });

  it("returns no providers when neither plugins nor active registry provide speech support", () => {
    expect(listSpeechProviders()).toEqual([]);
    expect(getSpeechProvider("openai")).toBeUndefined();
  });

  it("canonicalizes the legacy edge alias to microsoft", () => {
    resolvePluginCapabilityProvidersMock.mockReturnValue([
      createSpeechProvider("microsoft", ["edge"]),
    ]);

    expect(normalizeSpeechProviderId("edge")).toBe("edge");
    expect(canonicalizeSpeechProviderId("edge")).toBe("microsoft");
  });
});
