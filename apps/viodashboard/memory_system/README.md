# Memory System MVP

This is the new local memory-system MVP for project memory, auditability, and session recovery.

## Storage model

- **Primary store:** SQLite (`db/memory.db`)
- **Human-readable layer:** Markdown reports / summaries outside or alongside this system
- **Legacy prototype:** preserved under `legacy/`

## Current MVP scope

This MVP introduces five core tables:

- `events` — raw memory / audit event stream
- `facts` — distilled stable facts
- `artifacts` — linked files, directories, commits, docs
- `risks` — tracked risk items
- `daily_summaries` — end-of-day project summaries

And one full-text search table:

- `events_fts`

## Initialize

```bash
python3 memory_system/scripts/init_db.py
```

## Directory layout

```text
memory_system/
  README.md
  schema.sql
  db/
    memory.db
  docs/
  scripts/
    init_db.py
  exports/
    daily/
  config/
  legacy/
```

## MVP design notes

- The old JSONL-based prototype is intentionally kept in `legacy/` for reference and migration.
- SQLite is the system of record for structured memory.
- Markdown remains important for readable summaries and curated long-term memory.
- This MVP does **not** yet implement ingestion, migration, or automatic summarization; it only lays the storage foundation.

## Ingest one event

```bash
python3 memory_system/scripts/ingest_event.py \
  --kind decision \
  --source session \
  --project-area memory_system \
  --tags mvp,sqlite \
  --title "Choose SQLite for memory MVP" \
  --content "We decided to use SQLite as the primary structured memory store for the MVP." \
  --artifact "memory_system/schema.sql|file|Initial schema for MVP" \
  --fact "decision|long_term|SQLite is the primary structured memory store for the memory-system MVP" \
  --risk "low|process|Legacy JSONL migration is not implemented yet|Add migrate_legacy.py in next step|open"
```

Accepted option formats:

- `--artifact "path|artifact_type|note"`
- `--fact "fact_type|scope|content"`
- `--risk "severity|category|description|mitigation|status"`

## Next likely steps

1. Add legacy JSONL → SQLite migration script
2. Add summary export script
3. Add query/search CLI on top of SQLite/FTS
4. Refine event/fact/risk taxonomy in `docs/schema.md`
