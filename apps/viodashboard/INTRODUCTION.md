# VioDashboard Introduction

## What this project is
VioDashboard is the local browser-facing shell around OpenClaw. It does three main jobs:

1. opens a local UI at `http://127.0.0.1:8791`
2. bridges wrapper chat traffic to the OpenClaw gateway over WebSocket
3. mirrors assistant state into VioBody so lights / ambient feedback stay in sync

## Main moving parts
- `src/server.mjs` — main HTTP + WebSocket server, gateway bridge, file browser endpoints, camera/gesture endpoints
- `src/moodBridge.mjs` — tiny translation layer from wrapper chat lifecycle to VioBody actions
- `src/sidecarClient.mjs` — local POST client for the VioBody sidecar
- `public/app.js` — main UI logic
- `public/telemetry.js` — separate telemetry/observer screen logic

## Runtime flow
1. user sends a message in the wrapper UI
2. wrapper sends `chat.send` to the OpenClaw gateway
3. incoming chat events update the UI state live
4. final assistant output is classified and forwarded to VioBody via sidecar
5. camera / gesture tools can trigger extra side effects and telemetry updates

## Design intent
This project is intentionally local-first and fast to iterate on. It is not a general-purpose public web app. Most endpoints assume a trusted localhost environment, but they should still behave defensively because they can mutate files and trigger hardware-related flows.

## Things future readers should know quickly
- the wrapper UI is the human control surface
- the OpenClaw gateway is the source of chat/session truth
- VioBody is the physical feedback layer
- gesture support is optional and should fail soft, not break chat
- file-editing endpoints are powerful and should stay narrow in scope
