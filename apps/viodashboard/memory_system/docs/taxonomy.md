# Memory System Taxonomy v1

## Event kinds
Recommended values for `events.kind`:

- `conversation`
- `decision`
- `lesson`
- `review`
- `risk`
- `file_change`
- `task`
- `note`

## Fact types
Recommended values for `facts.fact_type`:

- `preference`
- `decision`
- `todo`
- `lesson`
- `rule`
- `status`

## Fact scopes
Recommended values for `facts.scope`:

- `short_term`
- `long_term`
- `audit`

## Risk categories
Recommended values for `risks.category`:

- `security`
- `privacy`
- `reliability`
- `maintainability`
- `process`

## Project areas
Recommended freeform but stable values:

- `memory_system`
- `wrapper`
- `vio_body`
- `project_governance`
- `legacy_import`

## Daily summary export path
Human-readable end-of-day summaries should be exported to:

- `memory_system/exports/daily/YYYY-MM-DD.md`

## Summary shape
Suggested sections:

1. Summary
2. Key changes
3. Decisions
4. Risks
5. Open questions
6. Next actions
