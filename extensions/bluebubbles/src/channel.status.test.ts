import { type OpenClawConfig } from "./runtime-api.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const probeBlueBubblesMock = vi.hoisted(() => vi.fn());
const cfg: OpenClawConfig = {};

vi.mock("./channel.runtime.js", () => ({
  blueBubblesChannelRuntime: {
    probeBlueBubbles: probeBlueBubblesMock,
  },
}));

vi.mock("../../../src/channels/plugins/bundled.js", () => ({
  bundledChannelPlugins: [],
  bundledChannelSetupPlugins: [],
}));

let bluebubblesPlugin: typeof import("./channel.js").bluebubblesPlugin;

describe("bluebubblesPlugin.status.probeAccount", () => {
  beforeEach(async () => {
    vi.resetModules();
    probeBlueBubblesMock.mockReset();
    probeBlueBubblesMock.mockResolvedValue({ ok: true, status: 200 });
    ({ bluebubblesPlugin } = await import("./channel.js"));
  });

  it("auto-enables private-network probes for loopback server URLs", async () => {
    await bluebubblesPlugin.status?.probeAccount?.({
      cfg,
      account: {
        accountId: "default",
        enabled: true,
        configured: true,
        config: {
          serverUrl: "http://localhost:1234",
          password: "test-password",
        },
        baseUrl: "http://localhost:1234",
      },
      timeoutMs: 5000,
    });

    expect(probeBlueBubblesMock).toHaveBeenCalledWith({
      baseUrl: "http://localhost:1234",
      password: "test-password",
      timeoutMs: 5000,
      allowPrivateNetwork: true,
    });
  });

  it("respects an explicit private-network opt-out for loopback server URLs", async () => {
    await bluebubblesPlugin.status?.probeAccount?.({
      cfg,
      account: {
        accountId: "default",
        enabled: true,
        configured: true,
        config: {
          serverUrl: "http://localhost:1234",
          password: "test-password",
          allowPrivateNetwork: false,
        },
        baseUrl: "http://localhost:1234",
      },
      timeoutMs: 5000,
    });

    expect(probeBlueBubblesMock).toHaveBeenCalledWith({
      baseUrl: "http://localhost:1234",
      password: "test-password",
      timeoutMs: 5000,
      allowPrivateNetwork: false,
    });
  });

  it("keeps public HTTPS server URLs on the default restricted policy", async () => {
    await bluebubblesPlugin.status?.probeAccount?.({
      cfg,
      account: {
        accountId: "default",
        enabled: true,
        configured: true,
        config: {
          serverUrl: "https://bluebubbles.example.com",
          password: "test-password",
        },
        baseUrl: "https://bluebubbles.example.com",
      },
      timeoutMs: 5000,
    });

    expect(probeBlueBubblesMock).toHaveBeenCalledWith({
      baseUrl: "https://bluebubbles.example.com",
      password: "test-password",
      timeoutMs: 5000,
      allowPrivateNetwork: false,
    });
  });
});
