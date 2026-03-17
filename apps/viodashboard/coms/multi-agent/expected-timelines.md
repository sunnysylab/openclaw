# Expected Timelines for Orchestrator v1 Demo Cases

## Case 1: success + approve

### Root task expected states
created
-> planned
-> running
-> approved

### Work task expected states
planned
-> dispatched
-> running
-> completed
-> under_review
-> approved

### Review task expected states
planned
-> dispatched
-> running
-> completed

### Final assertions
- root final status = approved
- work task retry_count = 0
- work task revise_count = 0
- review task count = 1
- latest review verdict = approve

---

## Case 2: success + revise + approve

### Root task expected states
created
-> planned
-> running
-> revise_requested
-> running
-> approved

### Work task expected states
planned
-> dispatched
-> running
-> completed
-> under_review
-> revise_requested
-> dispatched
-> running
-> completed
-> under_review
-> approved

### Review task expected states
review r1:
planned
-> dispatched
-> running
-> completed

review r2:
planned
-> dispatched
-> running
-> completed

### Final assertions
- root final status = approved
- work task retry_count = 0
- work task revise_count = 1
- review task count = 2
- first review verdict = revise
- second review verdict = approve

---

## Case 3: failed + retry + success

### Root task expected states
created
-> planned
-> running
-> partial
-> running
-> approved

### Work task expected states
planned
-> dispatched
-> running
-> failed
-> dispatched
-> running
-> completed
-> under_review
-> approved

### Review task expected states
planned
-> dispatched
-> running
-> completed

### Final assertions
- root final status = approved
- work task retry_count = 1
- work task revise_count = 0
- review task count = 1
- latest review verdict = approve
- first execution attempt failed before approval

### Targeted retry variant
For the code-targeted retry demo, the failed -> retry -> success branch should land on the `code` task rather than the `research` task, while the root timeline remains:
created
-> planned
-> running
-> partial
-> running
-> approved
