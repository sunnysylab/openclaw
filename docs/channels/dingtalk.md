---
summary: "DingTalk robot channel setup, deployment, and configuration"
read_when:
  - Setting up DingTalk bot integration
  - Configuring DingTalk webhook receiver
title: "DingTalk"
---

# DingTalk (Stream API / Webhook)

Status: ready for DMs and group chats via DingTalk robot webhook (HTTP only).

## Prerequisites

- A DingTalk organization (enterprise or developer account).
- A publicly reachable HTTPS endpoint for your OpenClaw gateway (see [Public URL](#public-url)).
- Node 22+ and OpenClaw gateway installed on your server.

---

## Quick setup

### 1. Create a DingTalk robot app

1. Log in to the [DingTalk Open Platform](https://open.dingtalk.com/).
2. Navigate to **Application Development** > **Enterprise Internal Applications** > **Robot**.
3. Click **Create Application**.
4. Fill in the basic info:
   - **Application Name**: e.g., `OpenClaw`
   - **Application Description**: e.g., `Personal AI Assistant`
   - **Application Icon**: (optional)
5. After creation, go to the **Credentials and Basic Info** tab:
   - Copy your **Client ID** (`AppKey`).
   - Copy your **Client Secret** (`AppSecret`).
6. Under **Robot Configuration** > **Message receiving mode**, choose:
   - **HTTP mode** — the robot will POST events to your webhook URL.
7. Set the **Message receiving address** to:
   ```
   https://gateway-host/dingtalk
   ```
   _Replace `gateway-host` with your public gateway hostname. Run `openclaw status` to find your gateway URL._
8. Under **Permissions**, ensure the robot has access to the scopes you need (e.g., `qyapi.chat.message.send`).
9. Click **Save and Publish**.

### 2. Configure OpenClaw

Add the DingTalk channel to your OpenClaw config (e.g., `~/.openclaw/config.json5`):

```json5
{
  channels: {
    dingtalk: {
      enabled: true,
      clientId: "your-client-id",
      clientSecret: "your-client-secret",
      // Optional: robotCode for proactive messages (from app details page)
      robotCode: "your-robot-code",
    },
  },
}
```

Or use environment variables (no config file change required):

```bash
export DINGTALK_CLIENT_ID=your-client-id
export DINGTALK_CLIENT_SECRET=your-client-secret
```

### 3. Start the gateway

```bash
openclaw gateway run
```

Verify the channel is active:

```bash
openclaw channels status
# Should show: DingTalk default: enabled, configured, ...
```

### 4. Add the bot in DingTalk

1. Open DingTalk and start a **Direct Message** with the robot app you created.
2. Send any message to trigger the assistant.
3. For group chats: add the robot to a group, then mention it by name to send a message.

---

## Public URL

DingTalk webhook requires a public HTTPS endpoint. Only expose the `/dingtalk` path to the internet.

### Option A: Tailscale Funnel (Recommended)

```bash
# Expose only the webhook path publicly:
tailscale funnel --bg --set-path /dingtalk http://127.0.0.1:18789/dingtalk

# Keep the dashboard private on tailnet:
tailscale serve --bg --https 8443 http://127.0.0.1:18789
```

Your public webhook URL:
`https://<node-name>.<tailnet>.ts.net/dingtalk`

Verify:

```bash
tailscale funnel status
```

### Option B: Caddy reverse proxy

```caddy
your-domain.com {
    reverse_proxy /dingtalk* localhost:18789
}
```

### Option C: Cloudflare Tunnel

Configure your tunnel's ingress rules:

- **Path**: `/dingtalk` → `http://localhost:18789/dingtalk`
- **Default Rule**: HTTP 404 (Not Found)

---

## Authentication / credentials

The DingTalk plugin supports two credential modes:

| Field          | Description                                                                      |
| -------------- | -------------------------------------------------------------------------------- |
| `clientId`     | App Key from the Open Platform (Stream API / new mode).                          |
| `clientSecret` | App Secret from the Open Platform. Also used for webhook signature verification. |
| `appKey`       | Legacy alias for `clientId`.                                                     |
| `appSecret`    | Legacy alias for `clientSecret`.                                                 |

Environment variable fallback (default account only):

| Variable                 | Description                      |
| ------------------------ | -------------------------------- |
| `DINGTALK_CLIENT_ID`     | Same as `clientId`.              |
| `DINGTALK_CLIENT_SECRET` | Same as `clientSecret`.          |
| `DINGTALK_APP_KEY`       | Legacy alias for `clientId`.     |
| `DINGTALK_APP_SECRET`    | Legacy alias for `clientSecret`. |

---

## Webhook security

DingTalk signs each inbound webhook request with HMAC-SHA256.

- Header `X-DingTalk-Timestamp`: Unix timestamp in milliseconds.
- Header `X-DingTalk-Nonce` (optional): random nonce.
- Header `X-DingTalk-Signature`: `base64(HMAC-SHA256(appSecret, timestamp + "\n" + nonce))`.

OpenClaw automatically verifies this signature using `clientSecret` / `appSecret`.
Requests with invalid or missing signatures are rejected with HTTP 401.

---

## How it works

1. DingTalk POSTs inbound events (messages) to your gateway's `/dingtalk/<accountId>` path (default: `/dingtalk/default`).
2. OpenClaw verifies the HMAC-SHA256 signature on each request.
3. Messages are routed by conversation:
   - Direct messages use session key `agent:<agentId>:dingtalk:direct:<conversationId>`.
   - Group chats use session key `agent:<agentId>:dingtalk:group:<conversationId>`.
4. The AI processes the message and sends a reply using the **session webhook** included in each inbound event (valid for a limited time after the event arrives).
5. If the session webhook has expired, a proactive reply is attempted via OpenAPI (requires `robotCode` and valid credentials).
6. DM access is controlled by the `dm.policy` setting (default: `pairing`). Unknown senders receive a pairing code; approve with:
   ```bash
   openclaw pairing approve dingtalk <code>
   ```

---

## Multi-account setup

To use multiple DingTalk robots, add named accounts:

```json5
{
  channels: {
    dingtalk: {
      defaultAccount: "work",
      accounts: {
        work: {
          clientId: "work-client-id",
          clientSecret: "work-client-secret",
          robotCode: "work-robot-code",
        },
        personal: {
          clientId: "personal-client-id",
          clientSecret: "personal-client-secret",
          webhookPath: "/dingtalk/personal",
        },
      },
    },
  },
}
```

Each account registers its own webhook path (`/dingtalk/<accountId>` by default).

---

## Config reference

```json5
{
  channels: {
    dingtalk: {
      // --- Credentials ---
      enabled: true,
      clientId: "your-client-id", // App Key from Open Platform
      clientSecret: "your-client-secret", // App Secret from Open Platform
      robotCode: "your-robot-code", // Required for proactive messages
      // appKey / appSecret are legacy aliases for clientId / clientSecret

      // --- Webhook ---
      webhookPath: "/dingtalk", // Default: /dingtalk/<accountId>
      // webhookUrl: "https://gateway-host/dingtalk" // Alternative: derive path from URL

      // --- DM access ---
      dm: {
        enabled: true,
        policy: "pairing", // "pairing" | "allowlist" | "open"
        allowFrom: ["staffId1"], // staffId or dingtalkId values
      },

      // --- Group messages ---
      groupPolicy: "allowlist", // "allowlist" | "open"
      groups: {
        "<conversationId>": {
          enabled: true,
          requireMention: true, // Only reply when bot is @-mentioned
          users: ["staffId1"], // Allowlist of users who can invoke the bot
          systemPrompt: "Short answers only.",
        },
      },

      // --- Delivery ---
      defaultTo: "<staffId>", // Default target for openclaw message send

      // --- Limits ---
      textChunkLimit: 2000, // Max chars per reply chunk
      mediaMaxMb: 20, // Max media attachment size

      // --- Multi-account ---
      defaultAccount: "default",
      accounts: {
        secondary: {
          clientId: "...",
          clientSecret: "...",
          webhookPath: "/dingtalk/secondary",
        },
      },
    },
  },
}
```

---

## Troubleshooting

### No messages received

1. **Check the channel is enabled and configured:**

   ```bash
   openclaw config get channels.dingtalk
   openclaw channels status
   ```

2. **Verify the webhook URL** in the DingTalk Open Platform matches your gateway's public URL + path.

3. **Check the gateway is reachable** from the internet:

   ```bash
   curl -v https://gateway-host/dingtalk
   # Expect: 405 Method Not Allowed (GET is rejected; POST is the correct method)
   ```

4. **Restart the gateway** after config changes:
   ```bash
   openclaw gateway restart
   ```

### Signature verification failed (401)

- Confirm `clientSecret` / `appSecret` in your config matches the **App Secret** on the DingTalk Open Platform.
- Check for trailing spaces or incorrect copy-paste.

### Replies not delivered (session webhook expired)

- DingTalk session webhooks expire after a short window (typically 60 seconds). If the AI takes longer, the reply falls back to proactive messaging.
- Ensure `robotCode` is configured for proactive message fallback.
- Check `openclaw logs --follow` for `session webhook expired` errors.

### Channel shows as disabled

```bash
openclaw plugins list | grep dingtalk
```

If disabled, add `plugins.entries.dingtalk.enabled: true` to your config.

### Other issues

```bash
openclaw channels status --probe   # Checks credentials and connectivity
openclaw logs --follow             # Live log while sending a test message
openclaw doctor                    # Diagnose common config issues
```

Related docs:

- [Gateway configuration](/gateway/configuration)
- [Pairing](/channels/pairing)
- [Security](/gateway/security)
- [Channel routing](/channels/channel-routing)
