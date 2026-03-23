import { describe, expect, it, vi } from "vitest";

vi.mock("openclaw/plugin-sdk/plugin-runtime", () => ({
  getGlobalHookRunner: vi.fn().mockReturnValue(null),
}));

import { slackOutbound } from "./outbound-adapter.js";

function requireSendText() {
  const sendText = slackOutbound.sendText;
  if (!sendText) {
    throw new Error("slackOutbound.sendText unavailable");
  }
  return sendText;
}

function baseSendParams(text: string, extra?: Record<string, unknown>) {
  const sendSlack = vi.fn().mockResolvedValue({ messageId: "m1", channelId: "C123" });
  return {
    params: {
      cfg: {},
      to: "C123",
      text,
      accountId: "default",
      deps: { sendSlack },
      ...extra,
    },
    sendSlack,
  };
}

describe("slack outbound HEARTBEAT_OK safety-net", () => {
  it("strips messages that are exactly 'HEARTBEAT_OK'", async () => {
    const { params, sendSlack } = baseSendParams("HEARTBEAT_OK");
    const result = await requireSendText()(params);
    expect(sendSlack).not.toHaveBeenCalled();
    expect(result.channel).toBe("slack");
  });

  it("strips messages that are 'HEARTBEAT_OK' with surrounding whitespace", async () => {
    const { params, sendSlack } = baseSendParams("  HEARTBEAT_OK  ");
    const result = await requireSendText()(params);
    expect(sendSlack).not.toHaveBeenCalled();
    expect(result.channel).toBe("slack");
  });

  it("strips HEARTBEAT_OK from messages with surrounding content", async () => {
    const { params, sendSlack } = baseSendParams("HEARTBEAT_OK Here is some other text");
    await requireSendText()(params);
    expect(sendSlack).toHaveBeenCalledWith(
      "C123",
      expect.not.stringContaining("HEARTBEAT_OK"),
      expect.any(Object),
    );
  });

  it("does NOT strip normal messages containing the word 'heartbeat'", async () => {
    const { params, sendSlack } = baseSendParams("The heartbeat check passed successfully");
    await requireSendText()(params);
    expect(sendSlack).toHaveBeenCalledWith(
      "C123",
      "The heartbeat check passed successfully",
      expect.any(Object),
    );
  });

  it("does NOT strip normal messages", async () => {
    const { params, sendSlack } = baseSendParams("Hello, how can I help?");
    await requireSendText()(params);
    expect(sendSlack).toHaveBeenCalledWith("C123", "Hello, how can I help?", expect.any(Object));
  });
});
