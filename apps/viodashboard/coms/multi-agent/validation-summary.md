# Orchestrator v1 Validation Summary

Date: 2026-03-14

## Scope
Current validation covers the three primary stub execution chains for orchestrator v1:

- success
- revise
- retry

Validated artifacts include:

- `VioWrapper/src/server/orchestrator/demo-run-success.mjs`
- `VioWrapper/src/server/orchestrator/demo-run-revise.mjs`
- `VioWrapper/src/server/orchestrator/demo-run-retry.mjs`
- `VioWrapper/src/server/orchestrator/demo-run-retry-code-target.mjs`
- `coms/multi-agent/expected-timelines.md`
- `coms/multi-agent/demo-cases-assertions.json`

---

## Overall Conclusion
The orchestrator v1 stub prototype has now passed the three primary chains:

- success chain: passed
- revise chain: passed
- retry chain: passed

At this stage, the main state-machine logic for root/work/review interaction is behaving as intended in stub execution.

---

## 1. Success Chain

### Conclusion
Passed.

### Key trajectory
- root: `created -> planned -> running -> approved`
- code task: `planned -> dispatched -> running -> completed -> under_review -> approved`
- review task: `planned -> dispatched -> running -> completed`

### Key counts
- review task count: 1
- max retry count: 0
- max revise count: 0

### Notes
This validates the baseline execution + review + final aggregation path.

---

## 2. Revise Chain

### Conclusion
Passed.

### Key trajectory
- root: `created -> planned -> running -> revise_requested -> running -> approved`
- code task:
  `planned -> dispatched -> running -> completed -> under_review -> revise_requested -> dispatched -> running -> completed -> under_review -> approved`
- review tasks:
  - `r1`: `planned -> dispatched -> running -> completed`
  - `r2`: `planned -> dispatched -> running -> completed`

### Key counts
- review task count: 2
- code revise count: 1
- max retry count: 0

### Notes
A real bug was found and fixed during validation:
- previously, revise budget was consumed too early
- the first `revise_requested` incorrectly exhausted the only revise slot
- this was fixed by moving revise-count consumption to the actual `revise_requested -> dispatched` redispatch

This chain is now aligned with the expected timeline.

---

## 3. Retry Chain

### Conclusion
Passed.

### Key trajectory
- root: `created -> planned -> running -> partial -> running -> approved`
- retrying work task:
  `planned -> dispatched -> running -> failed -> dispatched -> running -> completed -> ... -> approved`

### Key counts
- max retry count: 1
- max revise count: 0
- review verdict: approve

### Notes
This validates the retry recovery path and confirms that `partial -> running -> approved` remains stable.

---

## 4. Retry Demo Precision: Fixture Issue vs Mainline Bug

### Judgment
The earlier observation that retry sometimes landed on `research` instead of `code` was a fixture-precision issue, not a main orchestrator state-machine bug.

### Why
The original retry demo used sequence consumption by call order, so the first work-task dispatch was hit regardless of which task it represented.

### Resolution
This was addressed by adding targeted matching support to `runtimeAdapter` sequence behavior, including selectors such as:

- `task_id`
- `agent_id`
- `parent_task_id`
- `kind`
- `dispatch_kind`

A dedicated targeted retry demo was then added:
- `demo-run-retry-code-target.mjs`

That targeted demo verifies:
- `research.retry_count = 0`
- `code.retry_count = 1`
- root still follows `created -> planned -> running -> partial -> running -> approved`

### Conclusion
The original retry-demo imprecision should be categorized as a test-fixture precision limitation, not a mainline orchestrator bug.

---

## 5. Current Validation Status

### Passed
- success main chain
- revise main chain
- retry main chain
- code-targeted retry scenario
- root/work/review state coordination
- review sequence handling
- final aggregation behavior

### Still worth improving
- convert current demo assertions into automatic pass/fail checks
- extend targeted matching for more complex multi-step scenarios
- add richer combined multi-agent demo graphs

---

## Short Summary for Task Board Sync

orchestrator v1 stub has now passed the success / revise / retry main chains.
The revise-budget bug found during validation has been fixed.
The earlier retry demo landing on `research` instead of `code` was determined to be a fixture precision issue, not a mainline bug; targeted matching was added and the code-targeted retry case now passes.
