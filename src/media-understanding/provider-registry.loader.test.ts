import { beforeEach, describe, expect, it, vi } from "vitest";

const resolvePluginCapabilityProvidersMock = vi.fn((_params?: unknown) => []);

vi.mock("../plugins/capability-provider-runtime.js", () => ({
  resolvePluginCapabilityProviders: (params: unknown) =>
    resolvePluginCapabilityProvidersMock(params),
}));

let buildMediaUnderstandingRegistry: typeof import("./provider-registry.js").buildMediaUnderstandingRegistry;

describe("media-understanding provider loader", () => {
  beforeEach(async () => {
    vi.resetModules();
    resolvePluginCapabilityProvidersMock.mockClear();
    ({ buildMediaUnderstandingRegistry } = await import("./provider-registry.js"));
  });

  it("reuses the active plugin registry when one is already loaded", () => {
    buildMediaUnderstandingRegistry(undefined, { plugins: { enabled: true } } as never);

    expect(resolvePluginCapabilityProvidersMock).toHaveBeenCalledWith({
      key: "mediaUnderstandingProviders",
      cfg: { plugins: { enabled: true } },
    });
  });
});
