# Task Lifecycle Policy v1

## 1. State Layers

This system uses three related but distinct state layers:

1. child task execution states
2. root task orchestration states
3. finalResponse aggregate states

These layers must not be mixed.

---

## 2. Child Task States

Allowed child task states:

- planned
- dispatched
- running
- completed
- under_review
- approved
- revise_requested
- rejected
- failed
- timed_out
- blocked

### Child terminal states
The following child task states are terminal:

- approved
- rejected
- failed
- blocked

### Child non-terminal states
The following child task states are non-terminal:

- planned
- dispatched
- running
- completed
- under_review
- revise_requested
- timed_out

Note:
- `completed` is not terminal if review is required.
- `timed_out` is retry-eligible in v1 until retry budget is exhausted.

---

## 3. Root Task States

Allowed root task states:

- created
- planned
- running
- partial
- approved
- revise_requested
- blocked
- failed
- rejected

### Root terminal states
The following root task states are terminal:

- approved
- rejected
- failed
- blocked

### Root non-terminal states
The following root task states are non-terminal:

- created
- planned
- running
- partial
- revise_requested

### Root semantics
- `running` means orchestration is actively progressing.
- `partial` means orchestration entered a temporary degraded / mixed state (typically while handling a retryable execution failure).
- `revise_requested` means a key task requires revision before orchestration can continue.
- `approved`, `rejected`, `failed`, and `blocked` are hard stop states in v1.

---

## 4. finalResponse Status Layer

Allowed `finalResponse.status` values:

- approved
- partial
- revise_requested
- blocked
- failed
- rejected

### Forbidden in finalResponse.status
The following values must never appear in finalResponse.status:

- created
- planned
- running
- dispatched
- completed
- under_review
- timed_out

### Reason
finalResponse is an orchestration-level aggregate output, not a child execution snapshot.

---

## 5. Revise Policy

### Revise trigger
A child task enters `revise_requested` only through:

- `under_review -> revise_requested`

### Revise retry budget
Each work task may be automatically revised at most once:

- `MAX_REVISE_PER_TASK = 1`

### Revise exit path
If revise is allowed:
- child: `revise_requested -> dispatched -> running -> completed`
- root: `revise_requested -> running`

### Revise exhaustion policy
If either condition is true:
- `revise_count >= MAX_REVISE_PER_TASK`
- latest review still returns `revise` after the last allowed revision

Then:
- child task -> `rejected`
- root task -> `rejected`

### Reason
Revise exhaustion indicates unresolved quality failure, not execution failure.

---

## 6. Retry Policy

### Retry trigger
Automatic retry applies only to execution failure states:

- `failed`
- `timed_out`

### Retry budget
Each work task may be automatically retried at most once:

- `MAX_RETRY_PER_TASK = 1`

### Retry exit path
If retry is allowed:
- child: `failed/timed_out -> dispatched -> running`
- root: `partial -> running` after recovery

### Retry exhaustion policy
If retry budget is exhausted and the task still cannot succeed:

#### execution failure outcome
If the task remains an execution failure:
- child task -> `failed`
- root task -> `failed`

#### blocked outcome
If the task is determined to be unable to proceed because of dependency / access / resource blockage:
- child task -> `blocked`
- root task -> `blocked`

### Reason
Execution failure and blockage are semantically distinct and must not be collapsed.

---

## 7. Partial Usage Constraint

`partial` must be used conservatively.

### Recommended usage in v1
Root task enters `partial` only when:
- a key work task failed once in a retry-eligible way
- orchestration is temporarily degraded while preparing or executing recovery

### Anti-pattern
`partial` must not become a generic catch-all for "not done yet".

---

## 8. Blocked Reason Retention

Whenever a task enters `blocked`, the system must retain:

- `reason_code`
- `reason_text`

Example:

```json
{
  "reason_code": "missing_artifact",
  "reason_text": "Required file coms/token-saver.mjs was not available."
}
```

This applies to both child and root blockage paths whenever possible.

---

## 9. State Separation Rules

### Rule A
Child execution intermediate states must not leak into root task state.

### Rule B
Child execution intermediate states must not leak into finalResponse.status.

### Rule C
Root task state must be updated only through root transition guards.

### Rule D
Child task state must be updated only through child transition guards.

### Rule E
finalAggregator may compute aggregate status, but must not directly mutate root task state.

---

## 10. Terminal Summary

### Child terminal states
- approved
- rejected
- failed
- blocked

### Root terminal states
- approved
- rejected
- failed
- blocked

### finalResponse terminal/aggregate status set
- approved
- partial
- revise_requested
- blocked
- failed
- rejected
