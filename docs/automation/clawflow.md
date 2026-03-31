---
summary: "ClawFlow workflow orchestration for background tasks and detached runs"
read_when:
  - You want a flow to own one or more detached tasks
  - You want to inspect or cancel a background job as a unit
  - You want to author a linear flow in plain TypeScript
  - You want to understand how flows relate to tasks and background work
title: "ClawFlow"
---

# ClawFlow

ClawFlow is the flow layer above [Background Tasks](/automation/tasks). Tasks still track detached work. ClawFlow groups those task runs into a single job, keeps the parent owner context, and gives you a flow-level control surface.

Use ClawFlow when the work is more than a single detached run. A flow can still be one task, but it can also coordinate multiple tasks in a simple linear sequence.

## TL;DR

- Tasks are the execution records.
- ClawFlow is the job-level wrapper above tasks.
- A flow keeps one owner/session context for the whole job.
- Use `openclaw flows list`, `openclaw flows show`, and `openclaw flows cancel` to inspect or manage flows.
- For plain code authoring, prefer the bound helper layer above the runtime substrate.

## Quick start

```bash
openclaw flows list
openclaw flows show <flow-id-or-owner-session>
openclaw flows cancel <flow-id-or-owner-session>
```

## How it relates to tasks

Background tasks still do the low-level work:

- ACP runs
- subagent runs
- cron executions
- CLI-initiated runs

ClawFlow sits above that ledger:

- it keeps related task runs under one flow id
- it tracks the flow state separately from the individual task state
- it makes blocked or multi-step work easier to inspect from one place

For a single detached run, the flow can be a one-task flow. For more structured work, ClawFlow can keep multiple task runs under the same job.

## Runtime substrate

ClawFlow is the runtime substrate, not a workflow language.

It owns:

- the flow id
- the owner session and return context
- waiting state
- small persisted outputs
- finish, fail, cancel, and blocked state

It does **not** own branching or business logic. Put that in the authoring layer that sits above it:

- Lobster
- acpx
- plain TypeScript helpers
- bundled skills

In practice, authoring layers target a small runtime surface:

- `createFlow(...)`
- `runTaskInFlow(...)`
- `setFlowWaiting(...)`
- `setFlowOutput(...)`
- `appendFlowOutput(...)`
- `emitFlowUpdate(...)`
- `resumeFlow(...)`
- `finishFlow(...)`
- `failFlow(...)`

That keeps flow ownership and return-to-thread behavior in core without forcing a single DSL on top of it.

## Authoring helper

If you are authoring a linear flow in plain TypeScript, prefer the helper layer instead of calling every runtime primitive with `flowId` manually.

The helper surface is intentionally small:

- `createFlowAuthoringHelper(...)`
- `bindFlowAuthoringHelper(flowId)`

Each helper is already scoped to one flow and exposes the usual runtime verbs:

- `runTask(...)`
- `wait(...)`
- `setOutput(...)`
- `appendOutput(...)`
- `emitUpdate(...)`
- `resume(...)`
- `finish(...)`
- `fail(...)`

That keeps the runtime substrate generic while making plain-code authoring less repetitive.

## Bundled skill

OpenClaw also ships a general `clawflow.authoring` skill for agents that need to reason about flow structure above the runtime layer.

Use that skill for:

- deciding when a job should become a flow
- keeping conditionals and business logic out of the runtime layer
- following the plain-code authoring pattern consistently

The skill does not replace the runtime. It teaches the authoring pattern above the same ClawFlow runtime and helper surface described here.

## Authoring pattern

The intended shape is linear:

1. Create one flow for the job.
2. Run one detached task under that flow.
3. Wait for the child task or outside event.
4. Resume the flow in the caller.
5. Spawn the next child task or finish.

ClawFlow persists the minimal state needed to resume that job: the current step, the task it is waiting on, and a small output bag for handoff between steps.

In plain TypeScript, that usually looks like:

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
```

## CLI surface

The flow CLI is intentionally small:

- `openclaw flows list` shows active and recent flows
- `openclaw flows show <lookup>` shows one flow and its linked tasks
- `openclaw flows cancel <lookup>` cancels the flow and any active child tasks

`flows show` also surfaces the current wait target and any stored output keys, which is often enough to answer "what is this job waiting on?" without digging into every child task.

The lookup token accepts either a flow id or the owner session key.

## Maintainer test checklist

Use this checklist when you want broad manual confidence in ClawFlow changes:

### Core linkage

- Start a detached ACP or subagent task and confirm it gets a `FlowRecord`.
- Confirm the task carries `parentFlowId`.
- Restart and restore, then confirm the flow and task linkage survive.

### Owner-facing emergence

- Start a detached task from a real owner context such as Telegram.
- Confirm state-change or terminal updates emerge through the parent flow owner context, not a raw child context.
- Force delivery fallback and confirm the fallback event still lands on the owner session.

### Blocked and retry

- Force a detached task to end `blocked`.
- Confirm the flow becomes `blocked` and stores the blocker summary.
- Retry the blocked flow and confirm it reuses the same `flowId`, clears stale blocked state, and reopens cleanly.
- Try retrying a non-blocked flow and confirm it is refused.

### Linear authoring

- Create a linear flow in plain code with `createFlowAuthoringHelper(...)`.
- Spawn at least one child task with `runTask(...)`.
- Move the flow through `wait(...)`, `resume(...)`, and `finish(...)`.
- Confirm `openclaw flows show <flow-id>` reports the current step, wait target, and output keys correctly.

### Recovery surface

- Run `openclaw doctor` with an intentionally broken waiting flow and confirm the ClawFlow recovery note points maintainers at `openclaw flows show` and `openclaw flows cancel`.

## Related

- [Background Tasks](/automation/tasks) — detached work ledger
- [CLI: flows](/cli/flows) — flow inspection and control commands
- [Cron Jobs](/automation/cron-jobs) — scheduled jobs that may create tasks
- [Lobster](/tools/lobster) — one authoring layer above the ClawFlow runtime
