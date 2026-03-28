import { afterEach, describe, expect, it } from "vitest";
import { createEmptyPluginRegistry } from "../plugins/registry.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import {
  buildMediaUnderstandingRegistry,
  getMediaUnderstandingProvider,
} from "./provider-registry.js";

describe("media-understanding provider registry", () => {
  afterEach(() => {
    setActivePluginRegistry(createEmptyPluginRegistry());
  });

  it("returns no providers by default when no active registry is present", () => {
    const registry = buildMediaUnderstandingRegistry();
    expect(getMediaUnderstandingProvider("groq", registry)).toBeUndefined();
    expect(getMediaUnderstandingProvider("deepgram", registry)).toBeUndefined();
  });

  it("merges plugin-registered media providers into the active registry", async () => {
    const pluginRegistry = createEmptyPluginRegistry();
    pluginRegistry.mediaUnderstandingProviders.push({
      pluginId: "google",
      pluginName: "Google Plugin",
      source: "test",
      provider: {
        id: "google",
        capabilities: ["image", "audio", "video"],
        describeImage: async () => ({ text: "plugin image" }),
        transcribeAudio: async () => ({ text: "plugin audio" }),
        describeVideo: async () => ({ text: "plugin video" }),
      },
    });
    setActivePluginRegistry(pluginRegistry);

    const registry = buildMediaUnderstandingRegistry();
    const provider = getMediaUnderstandingProvider("gemini", registry);

    expect(provider?.id).toBe("google");
    expect(await provider?.describeVideo?.({} as never)).toEqual({ text: "plugin video" });
  });

  it("keeps provider id normalization behavior for plugin-owned providers", () => {
    const pluginRegistry = createEmptyPluginRegistry();
    pluginRegistry.mediaUnderstandingProviders.push({
      pluginId: "google",
      pluginName: "Google Plugin",
      source: "test",
      provider: {
        id: "google",
        capabilities: ["image", "audio", "video"],
      },
    });
    setActivePluginRegistry(pluginRegistry);

    const registry = buildMediaUnderstandingRegistry();
    const provider = getMediaUnderstandingProvider("gemini", registry);

    expect(provider?.id).toBe("google");
  });

  describe("custom provider auto-registration from config", () => {
    it("auto-registers custom providers with models that support image input", () => {
      const cfg = {
        models: {
          providers: {
            bailian: {
              baseUrl: "https://example.com/v1",
              api: "openai-completions",
              models: [
                { id: "qwen3.5-plus", input: ["text", "image"] },
                { id: "qwen3.5-lite", input: ["text"] },
              ],
            },
          },
        },
      } as unknown as Parameters<typeof buildMediaUnderstandingRegistry>[1];

      const registry = buildMediaUnderstandingRegistry(undefined, cfg);
      const provider = getMediaUnderstandingProvider("bailian", registry);

      expect(provider).toBeDefined();
      expect(provider?.id).toBe("bailian");
      expect(provider?.capabilities).toContain("image");
      expect(provider?.capabilities).not.toContain("audio");
    });

    it("auto-registers custom providers with multiple image models", () => {
      const cfg = {
        models: {
          providers: {
            multi: {
              baseUrl: "https://example.com/v1",
              models: [
                { id: "vision-model-1", input: ["text", "image"] },
                { id: "vision-model-2", input: ["text", "image"] },
              ],
            },
          },
        },
      } as unknown as Parameters<typeof buildMediaUnderstandingRegistry>[1];

      const registry = buildMediaUnderstandingRegistry(undefined, cfg);
      const provider = getMediaUnderstandingProvider("multi", registry);

      expect(provider?.capabilities).toEqual(["image"]);
    });

    it("does not auto-register audio/video capabilities (no runtime fallback)", () => {
      const cfg = {
        models: {
          providers: {
            aav: {
              baseUrl: "https://example.com/v1",
              models: [
                { id: "audio-model", input: ["text", "audio"] },
                { id: "video-model", input: ["text", "video"] },
              ],
            },
          },
        },
      } as unknown as Parameters<typeof buildMediaUnderstandingRegistry>[1];

      const registry = buildMediaUnderstandingRegistry(undefined, cfg);
      const provider = getMediaUnderstandingProvider("aav", registry);

      // Audio and video are NOT auto-registered because they lack runtime fallbacks
      expect(provider).toBeUndefined();
    });

    it("does not register providers without media-capable models", () => {
      const cfg = {
        models: {
          providers: {
            textonly: {
              baseUrl: "https://example.com/v1",
              models: [{ id: "text-model", input: ["text"] }],
            },
          },
        },
      } as unknown as Parameters<typeof buildMediaUnderstandingRegistry>[1];

      const registry = buildMediaUnderstandingRegistry(undefined, cfg);
      const provider = getMediaUnderstandingProvider("textonly", registry);

      expect(provider).toBeUndefined();
    });

    it("does not override plugin-registered providers", async () => {
      const pluginRegistry = createEmptyPluginRegistry();
      pluginRegistry.mediaUnderstandingProviders.push({
        pluginId: "google",
        pluginName: "Google Plugin",
        source: "test",
        provider: {
          id: "google",
          capabilities: ["image", "audio", "video"],
          describeImage: async () => ({ text: "plugin image" }),
        },
      });
      setActivePluginRegistry(pluginRegistry);

      const cfg = {
        models: {
          providers: {
            google: {
              baseUrl: "https://custom.google.com/v1",
              // Use image input to trigger auto-registration attempt
              // This tests that plugin-registered providers are NOT overridden
              models: [{ id: "custom-model", input: ["text", "image"] }],
            },
          },
        },
      } as unknown as Parameters<typeof buildMediaUnderstandingRegistry>[1];

      const registry = buildMediaUnderstandingRegistry(undefined, cfg);
      const provider = getMediaUnderstandingProvider("google", registry);

      // Should keep plugin's capabilities, not override with config
      expect(provider?.capabilities).toEqual(["image", "audio", "video"]);
      expect(provider?.describeImage).toBeDefined();
    });
  });
});
