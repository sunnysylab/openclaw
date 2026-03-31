import type { ResolvedDingTalkAccount } from "./accounts.js";
import type { DingTalkOutboundMsg, DingTalkSendMessageResponse } from "./types.js";

const OPENAPI_BASE = "https://api.dingtalk.com/v1.0";
const ROBOT_SEND_URL = `${OPENAPI_BASE}/robot/oToMessages/batchSend`;
const SESSION_WEBHOOK_TIMEOUT_MS = 10_000;

/**
 * Fetch an access token from DingTalk OpenAPI using client credentials.
 * Reference: https://open.dingtalk.com/document/orgapp/obtain-the-access-credentials-of-the-application
 */
export async function getDingTalkAccessToken(params: {
  clientId: string;
  clientSecret: string;
  fetch?: typeof globalThis.fetch;
}): Promise<string> {
  const fetchFn = params.fetch ?? globalThis.fetch;
  const res = await fetchFn("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appKey: params.clientId,
      appSecret: params.clientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`DingTalk getAccessToken failed: ${res.status}`);
  }
  const data = (await res.json()) as { accessToken?: string };
  const token = data.accessToken?.trim();
  if (!token) {
    throw new Error("DingTalk getAccessToken: empty token response");
  }
  return token;
}

/**
 * Send a message to a DingTalk user or group via the session webhook.
 * The session webhook is provided in the inbound event and is valid for a limited time.
 *
 * Reference: https://open.dingtalk.com/document/orgapp/robot-message-types-and-data-format
 */
export async function sendDingTalkSessionWebhookMessage(params: {
  sessionWebhookUrl: string;
  message: DingTalkOutboundMsg;
  fetch?: typeof globalThis.fetch;
}): Promise<DingTalkSendMessageResponse> {
  const fetchFn = params.fetch ?? globalThis.fetch;
  const res = await fetchFn(params.sessionWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params.message),
    signal: AbortSignal.timeout(SESSION_WEBHOOK_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`DingTalk session webhook send failed: ${res.status}`);
  }
  return (await res.json()) as DingTalkSendMessageResponse;
}

/**
 * Send a proactive message to a DingTalk user by staffId using the OpenAPI.
 *
 * Reference: https://open.dingtalk.com/document/orgapp/sending-enterprise-chat-messages
 */
export async function sendDingTalkProactiveMessage(params: {
  account: ResolvedDingTalkAccount;
  staffId: string;
  message: DingTalkOutboundMsg;
  accessToken?: string;
  fetch?: typeof globalThis.fetch;
}): Promise<DingTalkSendMessageResponse> {
  const { account, staffId, message } = params;
  const fetchFn = params.fetch ?? globalThis.fetch;

  let token = params.accessToken;
  if (!token) {
    const clientId = account.clientId ?? account.appKey;
    const clientSecret = account.clientSecret ?? account.appSecret;
    if (!clientId || !clientSecret) {
      throw new Error(
        "DingTalk: clientId/appKey and clientSecret/appSecret are required for proactive messages.",
      );
    }
    token = await getDingTalkAccessToken({ clientId, clientSecret, fetch: fetchFn });
  }

  const res = await fetchFn(ROBOT_SEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-acs-dingtalk-access-token": token,
    },
    body: JSON.stringify({
      robotCode: account.config.robotCode,
      userIds: [staffId],
      msgKey: message.msgtype,
      msgParam: JSON.stringify(
        message.msgtype === "text" ? (message as { text: { content: string } }).text : message,
      ),
    }),
  });
  if (!res.ok) {
    throw new Error(`DingTalk send proactive message failed: ${res.status}`);
  }
  return (await res.json()) as DingTalkSendMessageResponse;
}

/**
 * Probe the DingTalk API connectivity by fetching a token.
 * Returns ok if credentials are valid.
 */
export async function probeDingTalk(account: ResolvedDingTalkAccount): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const clientId = account.clientId ?? account.appKey;
    const clientSecret = account.clientSecret ?? account.appSecret;
    if (!clientId || !clientSecret) {
      return { ok: false, error: "missing credentials" };
    }
    await getDingTalkAccessToken({ clientId, clientSecret });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Build a plain-text outbound message.
 */
export function buildTextMessage(content: string): DingTalkOutboundMsg {
  return { msgtype: "text", text: { content } };
}

/**
 * Build a markdown outbound message.
 */
export function buildMarkdownMessage(title: string, text: string): DingTalkOutboundMsg {
  return { msgtype: "markdown", markdown: { title, text } };
}
