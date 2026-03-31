---
name: clawflow.authoring
description: Use when you need to author or modify a ClawFlow job in plain code without inventing a new DSL. Prefer the bound authoring helper for linear flows, keep conditionals in the caller, and use ClawFlow for flow identity, task linkage, waiting state, small outputs, and owner-facing emergence.
metadata: { "openclaw": { "emoji": "🪝" } }
---

# ClawFlow authoring

Use this skill when work should span one or more detached tasks but still behave like one job with one owner session and one return context.

## Use the helper, not raw record mutation

Prefer the authoring helper layer above the runtime substrate:

- `createFlowAuthoringHelper(...)`
- `bindFlowAuthoringHelper(flowId)`

That helper exposes the runtime verbs already scoped to one flow:

- `runTask(...)`
- `wait(...)`
- `setOutput(...)`
- `appendOutput(...)`
- `emitUpdate(...)`
- `resume(...)`
- `finish(...)`
- `fail(...)`

## Keep ClawFlow small

ClawFlow owns:

- flow identity
- owner session and return context
- waiting state
- small persisted outputs
- blocked, finish, fail, and cancel state

Do **not** put branching semantics into core ClawFlow calls. Keep decisions in the caller, skill logic, or a higher authoring layer like Lobster or acpx.

## Authoring pattern

1. Create or bind one flow.
2. Spawn one detached task under that flow.
3. Wait on the child task or outside event.
4. Resume in the caller.
5. Route to the next task, update, or finish.

## Example

```ts
const { flow, helper } = createFlowAuthoringHelper({
  ownerSessionKey,
  requesterOrigin,
  goal: "triage inbox",
  currentStep: "classify",
});

const started = helper.runTask({
  runtime: "acp",
  task: "Classify inbox messages",
  currentStep: "wait_for_classification",
});

helper.wait({
  currentStep: "wait_for_classification",
  waitingOnTaskId: started.task.taskId,
});

helper.resume({
  currentStep: "route_results",
});

helper.appendOutput({
  key: "eod_summary",
  value: { subject: "Newsletter" },
});
```

## Good fit

- Telegram or Slack agents that need background work to return to the same thread
- multi-step detached work that should still look like one job
- flows that may block, retry, or wait on outside answers

## Not the right layer

- full branching DSLs
- graph editors
- business-specific routing logic

Those should sit above ClawFlow and call the helper/runtime surface.
