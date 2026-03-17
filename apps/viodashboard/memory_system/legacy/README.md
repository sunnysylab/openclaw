# Personal Memory System

A lightweight local memory system that stores and retrieves:

- Your conversations with this OpenClaw assistant
- Your conversations exported from ChatGPT

It writes normalized records to:

- `memory_system/data/memory-log.jsonl`
- `memory_system/data/facts.jsonl` (structured extracted memory)

## Quick start

```bash
python3 memory_system/memory_system.py init
```

## 1) Log OpenClaw messages

```bash
python3 memory_system/memory_system.py log-openclaw \
  --speaker user \
  --text "I prefer short morning briefings." \
  --tags preference,morning \
  --extract
```

Or from stdin:

```bash
echo "Remind me to renew my passport in April" | \
  python3 memory_system/memory_system.py log-openclaw --speaker user --stdin --extract
```

## 2) Import ChatGPT dialogues (from export)

Export from ChatGPT (Settings → Data controls → Export), then import `conversations.json`:

```bash
python3 memory_system/memory_system.py import-chatgpt-export \
  --file /path/to/conversations.json \
  --extract
```

Optional filter:

```bash
python3 memory_system/memory_system.py import-chatgpt-export \
  --file /path/to/conversations.json \
  --title-contains "travel" \
  --extract
```

## 3) Import OpenClaw JSON messages

If you have a JSON export of messages from OpenClaw (list or `{messages:[...]}`):

```bash
python3 memory_system/memory_system.py import-openclaw-json \
  --file /path/to/openclaw_messages.json \
  --conversation-title "Xin + Vio" \
  --extract
```

Accepted message fields are flexible: `role/speaker`, `text/content/message`, `timestamp/created_at/time`.

## 4) Search memory (dedup-aware + recency ranking)

```bash
python3 memory_system/memory_system.py search --query passport --limit 10
```

## 5) Structured memory extraction

Re-scan all logs and extract key facts:

```bash
python3 memory_system/memory_system.py extract-facts
```

List extracted facts:

```bash
python3 memory_system/memory_system.py list-facts --type todo --limit 20
```

## Schema

Each line in `memory-log.jsonl`:

- `id`
- `timestamp`
- `source` (`openclaw` or `chatgpt`)
- `conversation_id`
- `conversation_title`
- `speaker`
- `text`
- `text_hash`
- `tags`
- `meta`

Each line in `facts.jsonl`:

- `id`
- `type` (`preference`, `todo`, `decision`)
- `text`
- `source_record_id`
- `timestamp`
- `conversation_id`
- `conversation_title`

## Notes

- Local-only by design (no cloud sync).
- Duplicate imports are skipped by normalized text hash.
- Fact extraction is heuristic and intentionally simple; easy to upgrade later.
