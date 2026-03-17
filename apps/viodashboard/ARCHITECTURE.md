# VioDashboard Architecture

## Goal
Build a thin personal wrapper UI around OpenClaw gateway chat so Vio can:
- send user prompts
- receive streaming/final model replies
- later route final reply text into VioBody sidecar for mood/body signals

## Phase 1 MVP
- Local wrapper server serves a small web app
- Browser app opens a WebSocket to the local wrapper server
- Wrapper server connects to OpenClaw gateway over WebSocket RPC
- Wrapper forwards chat.send and chat events
- Browser renders user / assistant messages and streaming deltas

## Why this layer exists
Current gateway internal hooks expose reliable inbound signals but not a reliable outbound reply-finished signal on this surface. The wrapper can observe the chat event stream directly (`delta`, `final`, `error`, `aborted`) and therefore recover the exact lifecycle VioBody needs.

## Data flow

User Browser
-> VioDashboard local server
-> OpenClaw Gateway WebSocket
-> chat.send
<- chat events (`delta` / `final` / `error` / `aborted`)
<- VioDashboard local server
<- Browser UI

Later:
`final` reply text -> VioBody sidecar `/reply`

## Modules
- `src/server.mjs`: local HTTP + WebSocket bridge server entrypoint and route orchestration
- `src/config.mjs`: shared local paths, ports, and gateway config loading
- `src/server/gatewayBridge.mjs`: gateway RPC transport and chat lifecycle forwarding
- `src/server/filesystem.mjs`: project-root-safe file listing/read/write helpers
- `src/server/gesture.mjs`: camera telemetry, capture/recognize pipeline, watcher state machine
- `src/server/static.mjs`: static public file serving and `/vio_cam/*` image serving
- `src/server/httpUtils.mjs`: JSON body parsing and response helpers
- `src/server/scripts.mjs`: reusable shell-script runner for capture/gesture scripts
- `src/server/utils.mjs`: small payload parsing helpers
- `public/index.html`: minimal chat UI
- `public/app.js`: browser client
- `public/styles.css`: wrapper styling

## Testing
A lightweight smoke test lives at `scripts/smoke-test.mjs` and is intended for fast localhost regression checks after server changes. It focuses on health/static/API basics and a couple of easy-to-break safeguards (cache-busted static paths, project-root path escape rejection, gesture watcher interval clamp).

## Phase 2
- Add sidecar integration on final replies
- Add mood router in wrapper layer
- Add session controls, reconnect diagnostics, model metadata


## Open-source notes
Before publishing broadly, keep the architecture narrative explicit about trust boundaries: today the wrapper assumes trusted localhost access, local file editing, and local script execution. If that changes, auth/origin checks and a stricter permission model should move from “recommended” to “required.”


## Roadmap generation contract
The wrapper now supports a dual-channel roadmap flow for assistant final replies:
- user-facing natural-language reply body
- machine-facing structured roadmap payload

Preferred payload format inside the final reply text:

```vio-roadmap
{
  "title": "Road Map",
  "summary": "Short execution summary.",
  "items": [
    {
      "id": "task-1",
      "title": "Implement task board status lanes",
      "description": "Convert the current flat list into todo/doing/blocked/done.",
      "status": "proposed",
      "priority": "high",
      "source": "assistant"
    }
  ]
}
```

Backend behavior:
1. prefer the `vio-roadmap` JSON block when present
2. validate/normalize the payload into roadmap items
3. persist it to `data/roadmap.json`
4. fall back to legacy bullet extraction only when no structured payload exists


## Roadmap schema lifecycle
The wrapper roadmap pipeline is now split into three concerns:
1. assistant reply generation
2. structured roadmap extraction / normalization in the wrapper backend
3. roadmap consumption by telemetry / task UI

This lets roadmap production evolve independently from roadmap presentation.
