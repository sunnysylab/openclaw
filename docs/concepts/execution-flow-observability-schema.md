---
summary: "Execution stages and observability event schema for tracing user input through preprocess, prompt assembly, model/tool loops, finalization, and outbound delivery"
read_when:
  - Designing dashboard observability for OpenClaw
  - Adding timeline events to the fork runtime
  - Tracing user message to final reply behavior
  - Naming execution stages and event fields consistently
title: "Execution Flow Observability Schema"
---

# Execution Flow Observability Schema

This file defines a **source-aligned observability model** for tracing one user-triggered execution chain from ingress to final delivery.

It is intentionally designed to sit between:

- source-level runtime behavior
- dashboard timeline/event visualization
- future diagnostic or internal hook/event emission

Use this schema before adding observability code so stage names, event names, and field meanings stay consistent.

## Scope

This schema is for the main execution path covered in:

- `src/gateway/server-methods/chat.ts`
- `src/auto-reply/reply/get-reply.ts`
- `src/auto-reply/reply/get-reply-run.ts`
- `src/auto-reply/reply/agent-runner.ts`
- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/hooks/internal-hooks.ts`
- gateway event / delivery return path

It is **not** a full protocol spec.
It is an observability/timeline schema for source-level execution understanding.

## Design goals

- Make one execution chain visible from message ingress to final reply
- Separate stage transitions from low-level log lines
- Distinguish model/tool loop events from finalization events
- Distinguish `final candidate` from `final committed`
- Be simple enough for dashboard timeline visualization
- Be source-aligned enough to map back to concrete files and hook points

## Core mental model

One user-triggered execution chain moves through these major stages:

1. `ingress`
2. `preprocess`
3. `prompt_assembly`
4. `run_lifecycle`
5. `tool_loop`
6. `finalization`
7. `outbound`

These stages are logical, not necessarily implemented by single files.

## Stage definitions

### 1. `ingress`

Meaning:

- the system has accepted a user-triggered message or control-plane request as input to an execution chain

Primary source anchor:

- `src/gateway/server-methods/chat.ts`

Typical questions answered:

- what entered the system?
- from which channel/provider/client?
- under which session key?

### 2. `preprocess`

Meaning:

- the inbound message is normalized, enriched, classified, and connected to session/config context before prompt assembly

Primary source anchors:

- `src/auto-reply/reply/get-reply.ts`
- `src/auto-reply/reply/message-preprocess-hooks.ts`
- `src/hooks/internal-hooks.ts`

Typical questions answered:

- what did raw input become after normalization?
- were media or links understood?
- which preprocess hooks fired?

### 3. `prompt_assembly`

Meaning:

- the agent-facing command body and run context are assembled

Primary source anchor:

- `src/auto-reply/reply/get-reply-run.ts`

Typical questions answered:

- what did the model actually receive?
- which session/thread/system-event context was injected?
- which queue mode, model, or thinking defaults were chosen?

### 4. `run_lifecycle`

Meaning:

- the agent run exists as a tracked execution with a runId and lifecycle state

Primary source anchors:

- `src/auto-reply/reply/agent-runner.ts`
- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/infra/agent-events.ts`

Typical questions answered:

- when did the run start?
- which provider/model ran?
- was there fallback or retry?

### 5. `tool_loop`

Meaning:

- the model/tool/model loop within a run is progressing through tool requests, tool results, and resumed model execution

Primary source anchors:

- `src/auto-reply/reply/agent-runner-execution.ts`
- tool result and tool output handling around agent events/pipelines

Typical questions answered:

- which tools were called?
- what came back?
- when did the model resume after tool results?

### 6. `finalization`

Meaning:

- the runtime is converging from execution to final visible reply state

Primary source anchors:

- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/auto-reply/reply/agent-runner.ts`
- reply payload shaping helpers

Typical questions answered:

- when did a final candidate appear?
- when was it accepted as the committed final payload?
- did filtering, fallback, or continuation suppress or delay finality?

### 7. `outbound`

Meaning:

- the final payload is routed and delivered back out through gateway/client/channel/UI surfaces

Primary source anchors:

- reply delivery helpers
- gateway event return path
- outbound channel delivery layers

Typical questions answered:

- where did the final reply go?
- was it streamed, chunked, retried, or dropped?
- what did the user-facing surface actually receive?

## Standard event envelope

All observability events should fit this logical envelope.

```json
{
  "eventId": "uuid-or-stable-id",
  "runId": "run-uuid",
  "sessionKey": "optional-session-key",
  "stage": "prompt_assembly",
  "event": "prompt.assembled",
  "ts": 1737264000000,
  "status": "info",
  "summary": "Short human-readable description",
  "data": {},
  "source": {
    "file": "src/auto-reply/reply/get-reply-run.ts",
    "subsystem": "auto-reply"
  }
}
```

## Required top-level fields

- `eventId` — unique event id
- `runId` — stable execution-chain identifier where available
- `stage` — one of the named execution stages
- `event` — stable event name
- `ts` — timestamp in ms since epoch
- `status` — `info | warning | error | debug`
- `summary` — concise human-readable summary
- `data` — structured event-specific payload

## Recommended contextual fields

- `sessionKey`
- `sessionId`
- `messageId`
- `provider`
- `model`
- `channel`
- `source.file`
- `source.subsystem`
- `parentEventId`
- `seq` — per-run sequence number when available

## Canonical event names by stage

### Ingress events

- `message.ingressed`
- `chat.request.accepted`
- `session.route.resolved`

### Preprocess events

- `message.transcribed`
- `message.preprocessed`
- `media.understanding.applied`
- `link.understanding.applied`
- `reply.context.finalized`

### Prompt assembly events

- `prompt.context.started`
- `prompt.session_hints.applied`
- `prompt.system_events.injected`
- `prompt.assembled`
- `prompt.queue_variant.assembled`

### Run lifecycle events

- `run.started`
- `run.model_selected`
- `run.fallback_attempted`
- `run.fallback_succeeded`
- `run.error`
- `run.aborted`
- `run.done`

### Tool loop events

- `tool.call.requested`
- `tool.call.started`
- `tool.call.completed`
- `tool.result.received`
- `model.resumed`
- `assistant.partial_emitted`

### Finalization events

- `final.candidate_emitted`
- `final.filtered`
- `final.committed`

### Outbound events

- `reply.route.resolved`
- `reply.block_emitted`
- `reply.delivered`
- `reply.delivery_failed`

## Event semantics that matter most

### `final.candidate_emitted`

Meaning:

- execution produced a candidate terminal reply payload
- not yet equivalent to final committed delivery

Use when:

- the runtime has a plausible final payload but later filtering/routing/fallback may still affect what is finally seen

### `final.committed`

Meaning:

- the runtime has accepted the payload as the final user-visible reply for this execution chain

Use when:

- no further tool/continuation/fallback path is going to replace it for this run
- the payload has survived final filtering and is entering delivery routing

### `run.done`

Meaning:

- the run lifecycle has ended

Important note:

- `run.done` is not always the same moment as `final.committed`
- keep both events distinct

## Minimum field recommendations by event family

### For `message.*`

```json
{
  "channel": "telegram",
  "messageId": "123",
  "summary": "Inbound message accepted"
}
```

### For `prompt.*`

```json
{
  "bodyPreview": "truncated command body preview",
  "hasThreadContext": true,
  "hasSystemEvents": true,
  "queueMode": "followup",
  "provider": "openai",
  "model": "gpt-5"
}
```

### For `tool.*`

```json
{
  "toolName": "read",
  "toolCallId": "optional-call-id",
  "argsSummary": "Read src/config.mjs",
  "resultSummary": "Returned 180 lines"
}
```

### For `run.*`

```json
{
  "provider": "openai",
  "model": "gpt-5",
  "fallbackProvider": "anthropic",
  "fallbackModel": "claude-3.7",
  "reason": "transient_http_error"
}
```

### For `final.*`

```json
{
  "payloadKind": "text",
  "textPreview": "First 160 chars of final text",
  "filtered": false,
  "deliveryMode": "direct"
}
```

## Timeline rendering guidance for dashboard

A dashboard timeline should group by `runId` and display events in stage order:

- ingress
- preprocess
- prompt assembly
- run lifecycle
- tool loop
- finalization
- outbound

The most important visual distinctions are:

- partial vs final
- tool wait vs resumed model
- final candidate vs final committed
- run done vs reply delivered

## MVP event set

If only a minimal observability implementation is added first, start with these events:

- `message.ingressed`
- `message.preprocessed`
- `prompt.assembled`
- `run.started`
- `tool.call.requested`
- `tool.result.received`
- `model.resumed`
- `final.candidate_emitted`
- `final.committed`
- `reply.delivered`
- `run.done`
- `run.error`

## Suggested source-first hook points

Start instrumentation here before going broader:

- `src/gateway/server-methods/chat.ts` → `message.ingressed`
- `src/auto-reply/reply/message-preprocess-hooks.ts` / `src/hooks/internal-hooks.ts` → preprocess events
- `src/auto-reply/reply/get-reply-run.ts` → `prompt.assembled`
- `src/infra/agent-events.ts` + `agent-runner-execution.ts` → run/tool lifecycle events
- reply delivery/router layer → `final.committed`, `reply.delivered`

## One-sentence schema summary

This schema models one OpenClaw execution chain as a staged timeline from ingress through preprocess, prompt assembly, model/tool loop, finalization, and outbound delivery, with explicit separation between `final candidate` and `final committed` so dashboard observability reflects runtime truth rather than textual guesswork.
