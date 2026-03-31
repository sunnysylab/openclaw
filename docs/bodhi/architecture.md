# OpenBodhi Architecture

OpenBodhi is a fork of [OpenClaw](https://github.com/openclaw/openclaw). It inherits
OpenClaw's Gateway WebSocket architecture and agent/skills system, then adds a
wellness-focused knowledge layer on top.

---

## OpenClaw Foundation

### Gateway WebSocket

OpenClaw runs a local Gateway. All message channels (Telegram, Signal, WhatsApp) connect as clients to this Gateway. Skills connect as skill servers.

```
Telegram bridge → |               | ←── bodhi-curator (skill)
Signal bridge ──→ | OpenClaw      | ←── bodhi-distiller (skill)
WhatsApp bridge → | Gateway       | ←── bodhi-janitor (skill)
                  |               | ←── bodhi-surveyor (skill)
                  |               |
                  └── Claude API (primary intelligence)
```

The Gateway handles:
- Message routing between channels and skills
- Session state per conversation
- Tool call dispatching
- Streaming response assembly

### Agent/Skills System

Skills are SKILL.md prompt files, not compiled code. Claude reads the SKILL.md and uses
built-in tools (bash, read, write) to execute the logic. Each SKILL.md declares:
- Its name and description (YAML frontmatter)
- Rules for how to handle messages
- CLI commands to run for vault operations

OpenBodhi adds 5 custom skills (Curator, Enricher, Distiller, Janitor, Surveyor) plus a
Greeter skill for the @openbodhibot signpost bot. The rest of the OpenClaw skill system
is inherited unchanged.

---

## OpenBodhi Data Flow

```
Incoming message (Telegram)
    ↓
OpenClaw Gateway (localhost only)
    ↓
bodhi-curator skill
    ↓
Claude Sonnet 4.6 (classify, tag)
    ↓
Vault write (JSON node via bodhi_vault Python module)
    ↓
Acknowledgment → user

Scheduled (6am daily):
bodhi-distiller → vault query → Claude synthesis → Telegram digest

Scheduled (weekly):
bodhi-janitor → duplicate/orphan scan → hygiene report → user approval
bodhi-surveyor → embed all nodes → HDBSCAN → Synthesis nodes → vault write → Telegram insight
```

---

## Model Routing

OpenBodhi uses a cascade approach, matching task complexity to model capability and cost.

| Task | Model | Rationale |
|------|-------|-----------|
| Node classification, tagging | Claude Sonnet 4.6 | Fast, cheap, accurate on structured tasks |
| Morning digest synthesis | Claude Opus 4.6 | Needs 1M context for 7-day vault query |
| Cluster labeling | Claude Sonnet 4.6 | Pattern recognition, shorter context |
| Bridge synthesis generation | Claude Opus 4.6 | Creative connection, full context preferred |
| Embeddings | nomic-embed-text (Ollama) | Local, fast, good semantic resolution |
| Routing decisions | Qwen3-0.6B (optional) | Ultra-fast local router to avoid API calls |

The Ollama stack is optional. If not running, all tasks fall through to Claude API.

### Context window strategy

Claude Opus 4.6's 1M context is used deliberately:

- Distiller loads all nodes from the last 7 days into a single prompt
- Surveyor sends cluster contents for labeling in bulk
- No chunking required until vault exceeds ~500K tokens of content

At that scale, the system will introduce cursor-based pagination against the vault.

---

## Storage

### JSON graph (nodes + edges)

Primary storage for structured data. Append-friendly. Human-readable.

```
vault/
├── nodes/
│   ├── 2026-03/
│   │   ├── {uuid}.json    ← one file per node
│   │   └── ...
├── edges/
│   ├── {uuid}.json
│   └── ...
└── schema/
    ├── nodes.json         ← JSON Schema for validation
    └── edges.json
```

Node files are stored by year-month directory for performance at scale.
Edges are stored flat (no subdirectory) since there are typically fewer edges than nodes.

### ChromaDB (vector store)

Local ChromaDB instance handles all vector operations:
- Embedding storage (one vector per node)
- Semantic similarity queries (Janitor duplicate detection)
- Cluster analysis input (Surveyor)

ChromaDB runs in embedded mode (no separate server process) via the Python client.
Node UUIDs are used as ChromaDB document IDs to maintain referential integrity.

### No remote storage

No data leaves the local machine except:
- Message text sent to Anthropic API for Claude inference
- (Optional) Backup sync to user-controlled S3-compatible storage

---

## Self-Organized Criticality (SOC) Model

Per Bak's sandpile model provides the theoretical framework for OpenBodhi's nudge system.

**The model:** grains of sand accumulate on a sandpile. When a local threshold is exceeded,
a cascade (avalanche) occurs. The system naturally organizes itself to a critical state where
avalanches of all sizes are possible, following a power law distribution.

**Applied to cognition:**
- Each idea has an `energy_level` (1-5). Energy accumulates through recurrence and connection.
- The vault as a whole is the sandpile. Individual idea clusters are local accumulations.
- When a cluster's average energy consistently exceeds a threshold (3.5) and it has appeared
  in 3+ consecutive weekly Distiller reports, it is at the critical threshold.
- The nudge ("Ready to act?") is the trigger for the cognitive avalanche.

**What the Surveyor measures:**
- Power law distribution of energy_level across all nodes (should emerge naturally)
- Cluster energy averages and their week-over-week change
- Betweenness centrality of individual nodes (bridge ideas carry the most cascade potential)

**Why this matters:**
Standard productivity tools push you to act on everything. SOC analysis surfaces the
ideas that are genuinely ready — not based on date or priority tags, but based on
structural properties of the vault itself.

---

## Security Model

- All data stored locally
- No auth layer on local Gateway (localhost only)
- Anthropic API key stored in `.env`, never committed
- Signal bridge runs on local machine, not internet-exposed
- Network isolation (planned Phase 1): Docker network with egress whitelist (api.anthropic.com only)
- If Ollama is used for embeddings, zero API traffic for that task

---

## Development Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Gateway runtime | Node.js (OpenClaw) | 22+ |
| Vault module | Python | 3.11+ |
| Vault testing | pytest | 9+ |
| Package manager | pnpm (gateway), uv (vault) | latest |
| Gateway | OpenClaw | latest |
| AI | Anthropic API (Claude) | latest |
| Local models | Ollama (Mistral Nemo, nomic-embed-text) | latest |
| Vector store | ChromaDB (Phase 2) | latest |
| Containerization | Docker Compose | latest |
