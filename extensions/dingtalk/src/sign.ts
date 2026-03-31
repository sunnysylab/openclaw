import { createHmac } from "node:crypto";

/**
 * Verify the DingTalk webhook signature.
 *
 * DingTalk sends a timestamp + nonce + X-DingTalk-Signature header.
 * The signature is HMAC-SHA256(appSecret, timestamp + "\n" + nonce), base64-encoded.
 *
 * Reference: https://open.dingtalk.com/document/orgapp/enterprise-robot-message-security-settings
 */
export function verifyDingTalkSignature(params: {
  appSecret: string;
  timestamp: string;
  nonce?: string;
  signature: string;
}): boolean {
  const { appSecret, timestamp, nonce, signature } = params;
  const content = nonce ? `${timestamp}\n${nonce}` : timestamp;
  const hmac = createHmac("sha256", appSecret);
  hmac.update(content);
  const expected = hmac.digest("base64");
  return expected === signature;
}

/**
 * Generate the outbound sign params for DingTalk custom bot webhook URLs.
 * The URL must be appended with &timestamp=...&sign=...
 *
 * Reference: https://open.dingtalk.com/document/orgapp/customize-robot-security-settings
 */
export function buildDingTalkCustomBotSign(params: { secret: string; timestampMs?: number }): {
  timestamp: number;
  sign: string;
} {
  const timestamp = params.timestampMs ?? Date.now();
  const content = `${timestamp}\n${params.secret}`;
  const hmac = createHmac("sha256", params.secret);
  hmac.update(content);
  const sign = encodeURIComponent(hmac.digest("base64"));
  return { timestamp, sign };
}
