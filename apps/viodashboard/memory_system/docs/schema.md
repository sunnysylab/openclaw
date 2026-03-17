# Memory System Schema Notes

## Design goal

Support three simultaneous needs:

1. **Short-term recovery** — what happened recently
2. **Long-term memory** — stable conclusions and recurring lessons
3. **Auditability** — traceable records of changes, reviews, and risks

## Tables

### `events`
Canonical append-oriented event stream.

Suggested `kind` values:

- `conversation`
- `decision`
- `lesson`
- `review`
- `risk`
- `file_change`
- `task`
- `note`

Suggested `source` values:

- `manual`
- `session`
- `import_legacy`
- `daily_review`
- `git`
- `heartbeat`

### `facts`
Distilled facts extracted from events.

Suggested `fact_type` values:

- `preference`
- `decision`
- `todo`
- `lesson`
- `rule`
- `status`

Suggested `scope` values:

- `short_term`
- `long_term`
- `audit`

### `artifacts`
Links an event to code or documentation artifacts.

Examples:

- file path
- directory path
- commit hash
- design doc

### `risks`
Tracks risk items independently from freeform prose.

Suggested categories:

- `security`
- `privacy`
- `reliability`
- `maintainability`
- `process`

### `daily_summaries`
One record per day for the project-level summary.

## Minimal ingestion contract

The MVP write path currently supports:

- one `event` per CLI call
- zero or more attached `artifacts`
- zero or more attached `facts`
- zero or more attached `risks`

Recommended usage pattern:

1. always write the raw event first
2. attach artifacts only when they materially improve traceability
3. attach facts only for stable takeaways
4. attach risks only when the item should be tracked independently

## Notes on FTS

`events_fts` is included now so the storage layer is ready for semantic-ish local retrieval later, even before we add richer ranking.

## Migration posture

The system is intentionally designed so legacy JSONL records can be imported into `events`, then selectively promoted into `facts`.
