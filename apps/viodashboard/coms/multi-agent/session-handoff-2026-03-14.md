# Multi-Agent System Session Handoff

Date: 2026-03-14
Purpose: fast restart context after session refresh

---

## 1. What this workstream is

This workstream is the first concrete orchestrator v1 for a multi-agent system inside `VioWrapper`.

The direction we converged on is:

- centralized **orchestrator**
- role-based **specialist agents**
- explicit **reviewer** path
- structured task / review / final-response schemas
- multi-model capability designed in at the schema / routing layer
- v1 keeps model routing **controlled**, not autonomous

The guiding principle that emerged and stayed stable:

> multi-agent v1 should be a **controlled orchestration system**, not a self-directed swarm.

---

## 2. Core architecture decisions already made

### 2.1 Orchestrator-centered design
We explicitly chose:

- orchestrator receives root task
- orchestrator builds plan
- orchestrator dispatches work tasks
- review is derived from work-task metadata
- orchestrator aggregates final response

Not chosen:

- free-form agent-to-agent conversation
- agent self-selected models
- swarm / decentralized planning
- UI-level routing logic

### 2.2 Model routing policy
The system is designed to support different underlying models per agent.

Stable design decision:

- model selection authority belongs to **orchestrator dispatch layer**
- each agent config has:
  - `default_model`
  - `fallback_model`
  - `thinking`
  - `tool_mode`
- reviewer should preferably use a different model from primary executor

But v1 intentionally does **not** do dynamic auto model selection.

### 2.3 Review is a first-class path
Review is not just a comment after execution.

We converged on:

- work task completes
- work task enters `under_review`
- reviewer task runs separately
- reviewer returns `approve / revise / reject`
- parent task transitions based on review verdict

### 2.4 Review task is a real taskExecution
Important later decision:

- review task should be stored as its own `taskExecution`
- review task ids must be sequenced:
  - `::review::r1`
  - `::review::r2`
- this avoided overwriting first review on second review pass

---

## 3. State machine decisions that matter

### 3.1 Child task execution states
Current child task states:

- `planned`
- `dispatched`
- `running`
- `completed`
- `under_review`
- `approved`
- `revise_requested`
- `rejected`
- `failed`
- `timed_out`
- `blocked`

### 3.2 Root task orchestration states
Current root task states:

- `created`
- `planned`
- `running`
- `partial`
- `approved`
- `revise_requested`
- `blocked`
- `failed`
- `rejected`

### 3.3 finalResponse.status
Current allowed final statuses:

- `approved`
- `partial`
- `revise_requested`
- `blocked`
- `failed`
- `rejected`

Important rule:

> child execution intermediate states must not leak into root task or finalResponse top-level status.

### 3.4 Terminal policy
Current intended terminal logic:

#### Child terminal
- `approved`
- `rejected`
- `failed`
- `blocked`

#### Root terminal
- `approved`
- `rejected`
- `failed`
- `blocked`

#### Revise exhaustion
If revise budget is exhausted:
- child -> `rejected`
- root -> `rejected`

#### Retry exhaustion
If retry budget is exhausted:
- child/root -> `failed` or `blocked` depending on failure semantics

Important nuance:
- `failed` = execution attempted but did not succeed
- `blocked` = execution cannot validly continue
- `rejected` = quality/review failure, not execution failure

---

## 4. Big protocol / file outputs already created

### 4.1 Strategy / validation docs
These files now exist under:

`/Volumes/2TB/clawd/coms/multi-agent/`

Key files:

- `task-lifecycle-policy.md`
- `expected-timelines.md`
- `demo-cases-assertions.json`
- `validation-summary.md`
- `agents.json`
- `session-handoff-2026-03-14.md` (this file)

### 4.2 What these mean
- `task-lifecycle-policy.md`
  - current most important lifecycle / terminal / exhaustion policy source
- `expected-timelines.md`
  - human-readable expected trajectories for demo cases
- `demo-cases-assertions.json`
  - machine-readable assertion expectations
- `validation-summary.md`
  - what has already passed / what was a fixture issue vs real bug
- `agents.json`
  - initial agent registry sample used by stub runtime

---

## 5. Orchestrator code now in repo

Current implementation directory:

`/Volumes/2TB/clawd/VioWrapper/src/server/orchestrator/`

Current files present:

- `types.mjs`
- `stores.mjs`
- `registryLoader.mjs`
- `planBuilder.mjs`
- `transitionGuard.mjs`
- `rootTaskTransitionGuard.mjs`
- `dispatchRunner.mjs`
- `reviewRouter.mjs`
- `resultCollector.mjs`
- `runtimeAdapter.mjs`
- `finalAggregator.mjs`
- `orchestrator.mjs`
- `demoSummaryFormatter.mjs`
- `demo-run-success.mjs`
- `demo-run-revise.mjs`
- `demo-run-retry.mjs`
- `demo-run-retry-code-target.mjs`
- `assert-demo-success.mjs`
- `assert-demo-revise.mjs`
- `assert-demo-retry.mjs`
- `assert-demo-retry-code-target.mjs`
- `run-demo-assertions.mjs`

This is now a real stub prototype directory, not just notes.

---

## 6. What has been validated already

### 6.1 Unified assertion runner exists
Main entry:

- `VioWrapper/src/server/orchestrator/run-demo-assertions.mjs`

Package entry added:

- `VioWrapper/package.json`
- script: `demo:assert`

Run with:

```bash
cd /Volumes/2TB/clawd/VioWrapper
npm run demo:assert
```

### 6.2 Current validation status
This was actually run and passed.

Current assertion suite covers:

- success
- revise
- retry
- code-targeted retry

And the unified runner passed with:

- total: 4
- passed: 4
- failed: 0

This means orchestrator v1 currently has:

> lightweight pass/fail regression capability

### 6.3 Passed chains
#### success
Passed.

#### revise
Passed after fixing revise budget semantics.

#### retry
Passed.

#### code-targeted retry
Passed after improving runtimeAdapter targeting precision.

---

## 7. Most important bugs/pitfalls we hit and what was learned

### 7.1 Reviewer should not live as a normal plan mainline node
Earlier design had reviewer appearing like a normal task in plan execution order.

This created a semantic mismatch because reviewer was actually a derived path.

Current stable direction:

- `plan.tasks` should mainly represent work tasks
- review is derived from `review_required + reviewer_agent_id`

### 7.2 Review task id overwrite problem
Initially review path risked reusing the same review task id.

Fix:
- review task ids became sequenced (`r1`, `r2`)

This matters because revise requires multiple reviews.

### 7.3 Revise budget bug was real and important
This was the most important real mainline bug found through execution.

Bug behavior:
- first `revise_requested` immediately exhausted revise budget
- system jumped to rejection too early

Root cause:
- `revise_count` was consumed too early at `under_review -> revise_requested`

Fix:
- move revise-count consumption to actual `revise_requested -> dispatched`
- i.e. only consume revise budget when the real revise redispatch begins

This fix is critical. If this regresses, revise chain breaks.

### 7.4 required_fixes propagation bug
After fixing revise budget timing, revise still failed because:
- `required_fixes` was not passed all the way into the dispatch guard context

Fixes applied:
- orchestrator passes `required_fixes` during revise redispatch
- `dispatchRunner.runDispatch()` forwards them into `transitionTask()` context

Without this, revise redispatch fails guard validation.

### 7.5 reviews store only keeps latest canonical verdict per work task
This caused a subtle assertion issue.

Observed behavior:
- `snapshot.reviews` only shows the latest review for a work task
- in revise flow that means only the final `approve`, not earlier `revise`

Consequence:
- assertion code initially read verdicts from `snapshot.reviews`
- revise assertion incorrectly failed because it expected `["revise", "approve"]`

Fix:
- for assertion scripts, extract verdict sequence from review task execution payloads instead:
  - `taskExecutions.filter(kind==='review').map(result_payload.verdict)`

This is an important pitfall and easy to forget.

### 7.6 Timeout terminalization bridge was a bad idea
There was a temporary attempt to force child `timed_out` into a harder terminal state using a fake bridge such as:
- `timed_out -> dispatched -> ...`

This was wrong because:
- it polluted retry semantics
- it could create illegal transitions (`dispatched -> blocked`)
- it could incorrectly increment retry_count

Current decision:
- that bridge was removed
- keep semantics clean rather than faking dispatch just to harden a terminal state

### 7.7 Retry demo initially hit research instead of code
This looked like a bug at first, but it turned out to be a fixture precision issue.

Root cause:
- runtimeAdapter sequence used call order only
- first matching work dispatch was `research`

Fix:
- runtimeAdapter was enhanced to support targeted rule matching via `sequenceRules`
- matching can now use:
  - `task_id`
  - `agent_id`
  - `parent_task_id`
  - `kind`
  - `dispatch_kind`

This allowed a code-targeted retry demo that now passes.

Important conclusion:

> the earlier retry mis-target was a demo fixture issue, not a core orchestrator state-machine bug.

---

## 8. Current implementation realities / caveats

### 8.1 This is still a stub prototype
Even though the structure is strong now, this is still not the final runtime-integrated system.

Still stub-like:
- runtime adapter is synthetic
- no real agent runtime binding yet
- no real persistence backend yet
- no real cost/budget policy yet
- fallback model switching is mostly designed, not fully realized

### 8.2 Root guard has forward-compatibility recovery transitions that v1 does not actively use
In `rootTaskTransitionGuard.mjs`, transitions like:
- `failed -> running`
- `blocked -> running`

are currently retained as forward-compatibility positions, but orchestrator v1 does not actively exercise them.

This is intentional, but easy to misread later.

### 8.3 Review helpers have strong ordering assumptions
`reviewRouter` helpers assume:
- parent task reaches `completed`
- `openReview()` moves it to `under_review`
- only then `acceptReviewResult()` consumes verdict

This ordering was documented in comments and currently holds.
Do not casually bypass it.

---

## 9. Recommended quick restart workflow tomorrow

If resuming this work tomorrow, do this first:

### Step 1
Read:
- `coms/multi-agent/validation-summary.md`
- `coms/multi-agent/task-lifecycle-policy.md`
- this handoff file

### Step 2
Run the current regression suite:

```bash
cd /Volumes/2TB/clawd/VioWrapper
npm run demo:assert
```

If this fails, inspect:
- `run-demo-assertions.mjs`
- failing `assert-demo-*.mjs`
- recent changes in orchestrator files

### Step 3
If suite still passes, the system state is roughly:
- orchestrator v1 stub prototype is healthy
- success/revise/retry/code-targeted-retry are covered
- next work can shift from proof-of-structure toward better automation or richer scenarios

---

## 10. Most natural next steps from here

These are the most natural next moves if continuing this workstream.

### Option A: strengthen regression automation
Best next step if staying in validation mode.

Possible tasks:
- add a higher-level `check` integration for demo assertions
- emit cleaner pass/fail summaries
- make assertion suite easier to run in CI/dev flow

### Option B: richer runtimeAdapter control
Best next step if continuing stub scenario coverage.

Possible tasks:
- more complex `sequenceRules`
- multiple targeted hits on same task across multiple dispatch kinds
- mixed scenarios involving review revise + retry on different tasks

### Option C: move from stub to more real execution binding
Best next step if transitioning to implementation depth.

Possible tasks:
- connect orchestrator dispatch to real sessions/subsessions
- attach actual model/runtime selection per agent
- persist stores beyond in-memory state

---

## 11. Short one-paragraph memory refresher

We designed and implemented a centralized orchestrator v1 multi-agent stub inside `VioWrapper`, with structured work/review/final-response flow, explicit root/child state machines, multi-model-aware agent registry, sequenced review tasks, retry/revise handling, and a runnable demo + assertion suite. The biggest real bug found was revise budget being consumed too early; this was fixed by moving revise-count consumption to actual revise redispatch. The earlier retry demo hitting `research` instead of `code` turned out to be a runtimeAdapter targeting issue, not a state-machine issue; targeted sequence rules were added and the code-targeted retry scenario now passes. Current status: `npm run demo:assert` passes all 4 assertion demos.

---

## 12. Post-OpenClaw-update compatibility note (2026-03-14)

After an OpenClaw npm update, a separate wrapper compatibility inspection found a high-risk latent restart hazard outside the orchestrator state machine itself:

- `VioWrapper/src/server/gatewayBridge.mjs` had hardcoded a hash-named OpenClaw dist helper import
- that file no longer existed after the update
- the wrapper only appeared healthy because the already-running old process still had the old module loaded in memory

Fix applied:
- removed the hardcoded hash-bound helper import
- replaced it with runtime helper resolution that scans compatible `openclaw/dist` bundles (`gateway-rpc-*` first, fallback `auth-profiles-*`) and resolves the helper symbol dynamically
- preserved the helper-path strategy rather than regressing to raw operator RPC assumptions

Validation after fix:
- controlled wrapper restart passed
- `cd /Volumes/2TB/clawd/VioWrapper && npm run smoke` passed (`14 passed, 0 failed`)
- `cd /Volumes/2TB/clawd/VioWrapper && npm run demo:assert` passed (`4 passed, 0 failed`)

Important lesson:
> after OpenClaw updates, do not trust a still-running wrapper process as proof of compatibility; force a real restart and rerun smoke + demo assertions.
