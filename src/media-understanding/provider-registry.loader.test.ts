import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPluginRegistry } from "../plugins/registry.js";
import { resetPluginRuntimeStateForTest, setActivePluginRegistry } from "../plugins/runtime.js";

const loadOpenClawPluginsMock = vi.fn((_params?: unknown) => ({
  mediaUnderstandingProviders: [],
}));

vi.mock("../plugins/loader.js", () => ({
  loadOpenClawPlugins: (params: unknown) => loadOpenClawPluginsMock(params),
}));

let buildMediaUnderstandingRegistry: typeof import("./provider-registry.js").buildMediaUnderstandingRegistry;

describe("media-understanding provider loader", () => {
  beforeEach(async () => {
    vi.resetModules();
    loadOpenClawPluginsMock.mockClear();
    resetPluginRuntimeStateForTest();
    ({ buildMediaUnderstandingRegistry } = await import("./provider-registry.js"));
  });

  it("reuses the active plugin registry when one is already loaded", () => {
    setActivePluginRegistry(createEmptyPluginRegistry(), "active-registry");

    buildMediaUnderstandingRegistry(undefined, { plugins: { enabled: true } } as never);

    expect(loadOpenClawPluginsMock).not.toHaveBeenCalled();
  });
});
