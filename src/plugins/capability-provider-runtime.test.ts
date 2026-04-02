import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveRuntimePluginRegistryMock = vi.fn();
const loadPluginManifestRegistryMock = vi.fn();

vi.mock("./loader.js", () => ({
  resolveRuntimePluginRegistry: (...args: unknown[]) => resolveRuntimePluginRegistryMock(...args),
}));

vi.mock("./manifest-registry.js", () => ({
  loadPluginManifestRegistry: (...args: unknown[]) => loadPluginManifestRegistryMock(...args),
}));

let resolvePluginCapabilityProviders: typeof import("./capability-provider-runtime.js").resolvePluginCapabilityProviders;

describe("resolvePluginCapabilityProviders", () => {
  beforeEach(async () => {
    vi.resetModules();
    resolveRuntimePluginRegistryMock.mockReset();
    loadPluginManifestRegistryMock.mockReset();
    loadPluginManifestRegistryMock.mockReturnValue({
      plugins: [
        {
          id: "google",
          origin: "bundled",
          contracts: { speechProviders: ["gemini-tts"] },
        },
        {
          id: "moonshot",
          origin: "bundled",
          contracts: { speechProviders: ["kimi-tts"] },
        },
      ],
      diagnostics: [],
    });
    ({ resolvePluginCapabilityProviders } = await import("./capability-provider-runtime.js"));
  });

  it("reuses active capability providers when already loaded", () => {
    resolveRuntimePluginRegistryMock.mockReturnValueOnce({
      speechProviders: [{ provider: { id: "active-tts" } }],
    });

    expect(resolvePluginCapabilityProviders({ key: "speechProviders" })).toEqual([
      { id: "active-tts" },
    ]);
    expect(resolveRuntimePluginRegistryMock).toHaveBeenCalledTimes(1);
  });

  it("does not re-add bundled capability plugins excluded by an explicit allowlist", () => {
    resolveRuntimePluginRegistryMock
      .mockReturnValueOnce({ speechProviders: [] })
      .mockReturnValueOnce({ speechProviders: [{ provider: { id: "fallback-tts" } }] });

    expect(
      resolvePluginCapabilityProviders({
        key: "speechProviders",
        cfg: {
          plugins: {
            allow: ["openrouter"],
          },
        },
      }),
    ).toEqual([{ id: "fallback-tts" }]);

    expect(resolveRuntimePluginRegistryMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        config: expect.objectContaining({
          plugins: expect.objectContaining({
            allow: ["openrouter"],
            entries: expect.objectContaining({
              google: { enabled: true },
              moonshot: { enabled: true },
            }),
          }),
        }),
      }),
    );
  });

  it("still enables bundled capability providers under Vitest without explicit plugin config", () => {
    resolveRuntimePluginRegistryMock
      .mockReturnValueOnce({ speechProviders: [] })
      .mockReturnValueOnce({ speechProviders: [{ provider: { id: "vitest-tts" } }] });

    expect(
      resolvePluginCapabilityProviders({
        key: "speechProviders",
        cfg: {},
      }),
    ).toEqual([{ id: "vitest-tts" }]);

    expect(resolveRuntimePluginRegistryMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        config: expect.objectContaining({
          plugins: expect.objectContaining({
            entries: expect.objectContaining({
              google: { enabled: true },
              moonshot: { enabled: true },
            }),
          }),
        }),
      }),
    );
  });
});
