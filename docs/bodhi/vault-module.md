# Vault Module -- Technical Reference

The vault module (`packages/bodhi_vault/`) is a Python package that handles all reads and writes to the local vault. Every skill calls this module. No skill writes directly to disk.

## Package Structure

```
packages/bodhi_vault/
  src/bodhi_vault/
    __init__.py
    types.py          -- Node/Edge dataclasses and enums
    validate.py       -- JSON Schema validation (jsonschema library)
    write.py          -- write_node(), atomic writes with temp file + os.replace()
    read.py           -- get_node(), query_nodes(), get_recent_nodes()
    manifest.py       -- SHA-256 content hashing, tamper detection
    enrich.py         -- Phase 0: concept matching. Phase 1: Ollama expansion (stub)
    write_cli.py      -- CLI entrypoint for Curator SKILL.md
    enrich_cli.py     -- CLI entrypoint for Enricher SKILL.md
    data/
      concepts.json   -- 15 research references across 5 domains
  tests/
    conftest.py       -- shared fixtures (vault_path, sample_node, schema_path)
    test_types.py     -- 7 tests: dataclass construction, from_dict, to_dict roundtrip
    test_validate.py  -- 9 tests: schema validation, required fields, enum constraints
    test_manifest.py  -- 7 tests: SHA-256 hashing, manifest creation, tamper detection
    test_write.py     -- 14 tests: file creation, content preservation, multimodal fields
    test_read.py      -- 9 tests: get_node, query filters (type, source, energy, tags)
    test_enrich.py    -- 9 tests: concept matching, idempotency, force override
    test_integration.py -- 5 tests: full roundtrip, CLI entrypoint, cross-module
  pyproject.toml      -- uv/pip install, pytest config
```

**58 tests total. All passing.**

## CLI Entrypoints

Skills are SKILL.md prompt files. Claude reads the SKILL.md, then calls these Python CLIs via bash to do the actual vault work.

### write_cli.py (used by Curator)

```bash
python -m bodhi_vault.write_cli "I noticed my sleep improves after evening walks" \
  --type Pattern \
  --energy 4 \
  --source telegram \
  --tags sleep,exercise,wellness \
  --media-type text \
  --domain wellness \
  --vault vault \
  --schema vault/schema/nodes.json
```

Outputs: `{"id": "<uuid>"}` on success, `{"error": "<message>"}` on failure.

Key behavior:
- `--media-type` defaults to `"text"` -- every node self-documents its origin type
- `--media-ref` is optional -- only set for images (Telegram file_id), links (URL), etc.
- `--domain` is optional but the Curator SKILL.md always provides it
- `content` is the first positional argument -- the user's exact words, never edited
- Exit code 0 on success, 1 on failure

Why `python -m bodhi_vault.write_cli` instead of `python write_cli.py`:
Running the script directly adds `src/bodhi_vault/` to sys.path, which shadows Python's
stdlib `types` module. Using `-m` runs it as a package and avoids the collision.

### enrich_cli.py (used by Enricher)

```bash
python -m bodhi_vault.enrich_cli <node_uuid> \
  --vault vault \
  --schema vault/schema/nodes.json \
  --concepts packages/bodhi_vault/src/bodhi_vault/data/concepts.json
```

Outputs: `{"enriched": true}` if enrichment was applied, `{"enriched": false}` if already enriched.

Key behavior:
- Idempotent by default -- skips if node already has `related_papers`
- `--force` flag overrides idempotency for re-enrichment
- Phase 0: pure Python keyword matching against concepts.json
- Phase 1 (future): Ollama expansion before concept matching

## Node Schema

Every node is validated against `vault/schema/nodes.json` before writing.

**Required fields:**
- `id` -- UUID v4, generated on creation
- `type` -- one of: Idea, Pattern, Practice, Decision, Synthesis, Integration
- `content` -- the raw thought, 1-10000 characters, never edited by AI
- `energy_level` -- integer 1-5, inferred from language urgency
- `created_at` -- ISO 8601 with timezone
- `source` -- one of: telegram, signal, whatsapp, manual, surveyor, distiller
- `tags` -- array of 0-10 lowercase hyphenated strings

**Optional fields (set by workers):**
- `media_type` -- text, image, voice, document, link, video, location
- `media_ref` -- Telegram file_id or URL (max 500 chars)
- `domain` -- wellness, fitness, health, mental-health, cognitive
- `content_enriched` -- expanded version for clustering (never displayed)
- `content_hash` -- SHA-256 of content field (set on write, immutable)
- `related_papers` -- array of matched research concepts
- `enriched_at` -- timestamp of enrichment completion
- `enrichment_model` -- name of model used (e.g. "mistral-nemo:12b")
- `updated_at` -- last modification timestamp
- `promoted_from` -- UUID of source node if promoted (Idea to Pattern, etc.)
- `cluster_id` -- HDBSCAN cluster label from Surveyor
- `embedding_model` -- name of embedding model used
- `created_by` -- which worker created this node

`additionalProperties: false` -- no extra fields allowed. This prevents silent schema drift.

## Write Path

```
write_node(node_dict, vault_path, schema_path)
  1. Validate node against JSON Schema
  2. Compute SHA-256 of content field -> content_hash
  3. Create year-month directory if needed (vault/nodes/2026-03/)
  4. Write to temp file in same directory
  5. Atomic rename (os.replace) temp -> final path
  6. Update manifest.json with node_id -> content_hash
  7. Return node_id
```

If validation fails, no file is written. If the write fails mid-operation, the temp file
is cleaned up. The atomic rename ensures no partial writes reach the vault.

## Enrichment Phases

**Phase 0 (current, works offline):**
- `match_concepts(text, concepts_path)` scans text for keywords from concepts.json
- Each concept has a list of `related` keywords (case-insensitive matching)
- Returns matched concepts with id, label, url, scholar fields
- Deduplicates by concept id

**Phase 1 (when Ollama is running on the Ubuntu machine):**
- `expand_content(content)` sends short/fragmented text to Mistral Nemo
- Prompt: "Expand this fragmented thought into 2-3 legible sentences. Preserve original meaning."
- Expanded version stored in `content_enriched`, used for better clustering
- Currently raises `NotImplementedError` -- deliberate, wired in Phase 1

## Concepts Library

`data/concepts.json` contains 15 research references across 5 domains:
- self-organized-criticality (Beggs & Plenz 2003)
- spaced-repetition (Ebbinghaus 1885)
- flow-state (Csikszentmihalyi 1990)
- metacognition (Flavell 1979)
- neural-criticality (Chialvo 2010)
- And 10 more covering sleep, exercise, nutrition, meditation, etc.

Each entry has: id, label, url (DOI/publisher), scholar (Google Scholar link), related (keyword list).

## Testing

Run tests from the vault package directory:

```bash
cd packages/bodhi_vault
.venv/Scripts/python.exe -m pytest tests/ -v  # Windows
# or
uv run pytest tests/ -v                       # if uv is available
```

Test fixtures use `tmp_path` (pytest built-in) for isolation. Every test gets a fresh
empty vault. No test touches the real vault directory.

The `schema_path` fixture points to the real `vault/schema/nodes.json` file -- tests
validate against the actual production schema, not a copy.

## Known Quirks

- **uv + conda warning**: If conda is active, uv warns about VIRTUAL_ENV mismatch. Harmless.
- **Exit code 1 on Windows**: uv commands in PowerShell sometimes return exit code 1 even when tests pass. The test output itself is what matters.
- **conftest path math**: `SCHEMA_DIR` goes up 4 parent directories from `tests/` to reach the repo root. This is because the package is nested at `packages/bodhi_vault/tests/`.
