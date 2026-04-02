import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageGenerationProviderPlugin } from "../plugins/types.js";

const { resolvePluginCapabilityProvidersMock } = vi.hoisted(() => ({
  resolvePluginCapabilityProvidersMock: vi.fn<
    (params?: unknown) => ImageGenerationProviderPlugin[]
  >(() => []),
}));

vi.mock("../plugins/capability-provider-runtime.js", () => ({
  resolvePluginCapabilityProviders: resolvePluginCapabilityProvidersMock,
}));

let getImageGenerationProvider: typeof import("./provider-registry.js").getImageGenerationProvider;
let listImageGenerationProviders: typeof import("./provider-registry.js").listImageGenerationProviders;

describe("image-generation provider registry", () => {
  beforeEach(async () => {
    vi.resetModules();
    ({ getImageGenerationProvider, listImageGenerationProviders } =
      await import("./provider-registry.js"));
  });

  afterEach(() => {
    resolvePluginCapabilityProvidersMock.mockReset();
    resolvePluginCapabilityProvidersMock.mockReturnValue([]);
  });

  it("does not load plugins when listing without config", () => {
    expect(listImageGenerationProviders()).toEqual([]);
    expect(resolvePluginCapabilityProvidersMock).toHaveBeenCalledWith({
      key: "imageGenerationProviders",
      cfg: undefined,
    });
  });

  it("uses active plugin providers without loading from disk", () => {
    resolvePluginCapabilityProvidersMock.mockReturnValue([
      {
        id: "custom-image",
        label: "Custom Image",
        capabilities: {
          generate: {},
          edit: { enabled: false },
        },
        generateImage: async () => ({
          images: [{ buffer: Buffer.from("image"), mimeType: "image/png" }],
        }),
      },
    ]);

    const provider = getImageGenerationProvider("custom-image");

    expect(provider?.id).toBe("custom-image");
    expect(resolvePluginCapabilityProvidersMock).toHaveBeenCalledWith({
      key: "imageGenerationProviders",
      cfg: undefined,
    });
  });

  it("ignores prototype-like provider ids and aliases", () => {
    resolvePluginCapabilityProvidersMock.mockReturnValue([
      {
        id: "__proto__",
        aliases: ["constructor", "prototype"],
        capabilities: {
          generate: {},
          edit: { enabled: false },
        },
        generateImage: async () => ({
          images: [{ buffer: Buffer.from("image"), mimeType: "image/png" }],
        }),
      },
      {
        id: "safe-image",
        aliases: ["safe-alias", "constructor"],
        capabilities: {
          generate: {},
          edit: { enabled: false },
        },
        generateImage: async () => ({
          images: [{ buffer: Buffer.from("image"), mimeType: "image/png" }],
        }),
      },
    ]);

    expect(listImageGenerationProviders().map((provider) => provider.id)).toEqual(["safe-image"]);
    expect(getImageGenerationProvider("__proto__")).toBeUndefined();
    expect(getImageGenerationProvider("constructor")).toBeUndefined();
    expect(getImageGenerationProvider("safe-alias")?.id).toBe("safe-image");
  });
});
