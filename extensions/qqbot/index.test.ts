import { beforeEach, describe, expect, it, vi } from "vitest";

const setQQBotRuntimeMock = vi.hoisted(() => vi.fn());
const registerChannelMock = vi.hoisted(() => vi.fn());

vi.mock("./src/runtime.js", () => ({
  setQQBotRuntime: setQQBotRuntimeMock,
  getQQBotRuntime: vi.fn(),
}));

vi.mock("./src/channel.js", () => ({
  qqbotPlugin: {
    id: "qqbot",
    meta: { id: "qqbot", label: "QQ Bot" },
  },
}));

vi.mock("./src/outbound.js", () => ({
  sendText: vi.fn(),
  sendMedia: vi.fn(),
}));

vi.mock("./src/onboarding.js", () => ({
  qqbotOnboardingAdapter: {},
}));

vi.mock("openclaw/plugin-sdk/core", () => ({
  defineChannelPluginEntry: (opts: Record<string, unknown>) => ({
    id: opts.id,
    name: opts.name,
    register: (api: Record<string, Function>) => {
      (opts as any).setRuntime?.(api.runtime);
      api.registerChannel?.({ plugin: opts.plugin });
    },
  }),
}));

const { default: qqbotEntry } = await import("./index.js");

describe("qqbot plugin registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the QQ Bot channel and sets runtime", () => {
    const runtime = {} as never;
    qqbotEntry.register({
      runtime,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      registerChannel: registerChannelMock,
    } as never);

    expect(setQQBotRuntimeMock).toHaveBeenCalledWith(runtime);
    expect(registerChannelMock).toHaveBeenCalledWith({
      plugin: expect.any(Object),
    });
  });

  it("exports expected plugin metadata", () => {
    expect(qqbotEntry.id).toBe("qqbot");
    expect(qqbotEntry.name).toBe("QQ Bot");
  });
});
