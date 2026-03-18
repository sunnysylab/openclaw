---
summary: "QQ Bot overview, features, and configuration"
read_when:
  - You want to connect a QQ Bot
  - You are configuring the QQ Bot channel
title: QQ Bot
---

# QQ Bot

QQ Bot connects OpenClaw to QQ (the popular Chinese messaging platform) via the official QQ Bot API. It supports private chats, group chats, media messages, and streaming replies.

---

## Bundled plugin

QQ Bot ships bundled with current OpenClaw releases, so no separate plugin install
is required.

If you are using an older build or a custom install that does not include bundled
QQ Bot, install it manually:

```bash
openclaw plugins install @openclaw/qqbot
```

---

## Quickstart

There are two ways to add the QQ Bot channel:

### Method 1: onboarding (recommended)

If you just installed OpenClaw, run onboarding:

```bash
openclaw onboard
```

The wizard guides you through:

1. Collecting AppID and ClientSecret from the QQ Open Platform
2. Configuring credentials in OpenClaw
3. Starting the gateway

After configuration, check gateway status:

- `openclaw gateway status`
- `openclaw logs --follow`

### Method 2: CLI setup

If you already completed initial install, add the channel via CLI:

```bash
openclaw channels add
```

Choose **QQ Bot**, then enter the AppID and ClientSecret.

After configuration, manage the gateway:

- `openclaw gateway status`
- `openclaw gateway restart`
- `openclaw logs --follow`

---

## Step 1: Create a QQ Bot application

### 1. Open QQ Open Platform

Visit [QQ Open Platform](https://q.qq.com/) and sign in.

### 2. Create a bot application

1. Click **Create Bot** (创建机器人)
2. Fill in the bot name and description
3. Choose a bot avatar

### 3. Copy credentials

From the application's **Development Settings** (开发设置), copy:

- **AppID** (for example: `102146862`)
- **ClientSecret**

Important: keep the ClientSecret private.

### 4. Configure sandbox members

During testing, add sandbox members in **Development Settings** > **Sandbox Configuration** (沙箱配置):

1. Add test users who will interact with the bot
2. Sandbox members can use the bot before it is published

### 5. Publish the bot

Once testing is complete:

1. Submit the bot for review
2. Wait for approval
3. After approval, the bot is live for all users

---

## Step 2: Configure OpenClaw

### Configure with the wizard (recommended)

```bash
openclaw channels add
```

Choose **QQ Bot** and paste your AppID and ClientSecret.

### Configure via config file

Edit `~/.openclaw/openclaw.json`:

```json5
{
  channels: {
    qqbot: {
      enabled: true,
      appId: "102146862",
      clientSecret: "xxx",
      allowFrom: ["*"],
    },
  },
}
```

### Configure via environment variables

```bash
export QQBOT_APP_ID="102146862"
export QQBOT_CLIENT_SECRET="xxx"
```

---

## Step 3: Start and test

### 1. Start the gateway

```bash
openclaw gateway
```

### 2. Send a test message

In QQ, find your bot and send a message.

### 3. Approve pairing

By default, the bot replies with a pairing code. Approve it:

```bash
openclaw pairing approve qqbot <CODE>
```

After approval, you can chat normally.

---

## Overview

- **QQ Bot channel**: QQ Bot managed by the gateway
- **Deterministic routing**: replies always return to QQ
- **Session isolation**: private chats and group chats are isolated
- **WebSocket connection**: persistent connection via QQ Bot API

---

## Access control

### Direct messages

- **Default**: `dmPolicy: "pairing"` (unknown users get a pairing code)
- **Approve pairing**:

  ```bash
  openclaw pairing list qqbot
  openclaw pairing approve qqbot <CODE>
  ```

- **Allowlist mode**: set `channels.qqbot.allowFrom` with allowed user OpenIDs

### Group chats

QQ Bot responds to @mentions in groups by default. Configure group behavior via `groupPolicy`.

---

## Configuration examples

### Allow all users (default)

```json5
{
  channels: {
    qqbot: {
      allowFrom: ["*"],
    },
  },
}
```

### Restrict to specific users

```json5
{
  channels: {
    qqbot: {
      allowFrom: ["USER_OPENID_1", "USER_OPENID_2"],
    },
  },
}
```

### Multiple accounts

```json5
{
  channels: {
    qqbot: {
      accounts: {
        main: {
          appId: "102146862",
          clientSecret: "xxx",
        },
        backup: {
          appId: "102146863",
          clientSecret: "yyy",
          enabled: false,
        },
      },
    },
  },
}
```

---

## Image server

QQ Bot requires images to be accessible via a public URL. Configure the image server base URL:

```json5
{
  channels: {
    qqbot: {
      imageServerBaseUrl: "http://your-server-ip:18765",
    },
  },
}
```

Or via environment variable:

```bash
export QQBOT_IMAGE_SERVER_BASE_URL="http://your-server-ip:18765"
```

---

## Markdown support

QQ Bot supports Markdown-formatted messages by default. To disable:

```json5
{
  channels: {
    qqbot: {
      markdownSupport: false,
    },
  },
}
```

---

## Audio format policy

QQ Bot uses SILK audio format. Configure format conversion behavior:

```json5
{
  channels: {
    qqbot: {
      audioFormatPolicy: {
        // Formats your STT service accepts directly (skip SILK to WAV conversion)
        sttDirectFormats: [".silk", ".wav", ".mp3"],
        // Formats QQ accepts directly (skip to SILK conversion)
        uploadDirectFormats: [".wav", ".mp3", ".silk"],
      },
    },
  },
}
```

---

## Common commands

| Command   | Description       |
| --------- | ----------------- |
| `/status` | Show bot status   |
| `/reset`  | Reset the session |
| `/model`  | Show/switch model |

## Gateway management commands

| Command                    | Description                   |
| -------------------------- | ----------------------------- |
| `openclaw gateway status`  | Show gateway status           |
| `openclaw gateway install` | Install/start gateway service |
| `openclaw gateway stop`    | Stop gateway service          |
| `openclaw gateway restart` | Restart gateway service       |
| `openclaw logs --follow`   | Tail gateway logs             |

---

## Troubleshooting

### Bot does not respond

1. Ensure the bot is published or the user is a sandbox member
2. Check logs: `openclaw logs --follow`
3. Ensure the gateway is running: `openclaw gateway status`

### Bot does not receive messages

1. Ensure AppID and ClientSecret are correct
2. Ensure the bot application is active on QQ Open Platform
3. Check WebSocket connection logs

### Media send failures

1. Ensure `imageServerBaseUrl` is configured and accessible
2. Ensure the server is reachable from QQ's servers (public IP required)
3. Check logs for detailed errors

---

## Supported message types

### Receive

- Text
- Images
- Audio/voice
- Files

### Send

- Text
- Images
- Audio/voice (SILK format)
- Markdown (when enabled)

---

## Configuration reference

Full configuration: [Gateway configuration](/gateway/configuration)

Key options:

| Setting                                     | Description                    | Default     |
| ------------------------------------------- | ------------------------------ | ----------- |
| `channels.qqbot.enabled`                    | Enable/disable channel         | `true`      |
| `channels.qqbot.appId`                      | QQ Bot AppID                   | -           |
| `channels.qqbot.clientSecret`               | QQ Bot ClientSecret            | -           |
| `channels.qqbot.clientSecretFile`           | Path to file containing secret | -           |
| `channels.qqbot.dmPolicy`                   | DM policy                      | `"pairing"` |
| `channels.qqbot.allowFrom`                  | DM allowlist (OpenID list)     | -           |
| `channels.qqbot.imageServerBaseUrl`         | Public URL for image server    | -           |
| `channels.qqbot.markdownSupport`            | Enable Markdown messages       | `true`      |
| `channels.qqbot.audioFormatPolicy`          | Audio format conversion config | -           |
| `channels.qqbot.accounts.<id>.appId`        | Per-account AppID              | -           |
| `channels.qqbot.accounts.<id>.clientSecret` | Per-account ClientSecret       | -           |

---

## dmPolicy reference

| Value         | Behavior                                                        |
| ------------- | --------------------------------------------------------------- |
| `"pairing"`   | **Default.** Unknown users get a pairing code; must be approved |
| `"allowlist"` | Only users in `allowFrom` can chat                              |
| `"open"`      | Allow all users (requires `"*"` in allowFrom)                   |
