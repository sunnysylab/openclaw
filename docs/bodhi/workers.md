# OpenBodhi Workers

Four autonomous agents. Each has a schedule, a trigger, and a defined scope.
None of them act without the user's vault data. None of them store data externally.

---

## Curator

**Schedule:** Real-time
**Trigger:** Incoming message via Telegram
**Skill file:** `skills/bodhi-curator/`

### Flow

1. Message arrives at OpenClaw Gateway via Telegram bridge
2. Gateway routes to bodhi-curator skill
3. Curator assesses complexity:
   - Simple (single clear thought) → proceed to classification
   - Complex (multi-part, ambiguous, or emotionally loaded) → ask 2-3 clarifying questions
4. Classification: Claude assigns node type from the 6 available types
5. Tag generation: Claude produces 2-5 tags from content (lowercase, hyphenated)
6. Energy prompt: Bodhi asks "Energy level 1-5?" — user replies with a number
7. Node written to vault (JSON file + ChromaDB embedding)
8. Acknowledgment sent: brief confirmation of type + tags

### Complexity assessment heuristics

- Simple: one sentence, clear noun + verb, no embedded questions
- Complex: multiple sentences, contradictions, emotional language, nested ideas
- When uncertain: ask one clarifying question, not multiple

### Clarifying question patterns

- "Is this something you want to do, or something you noticed?"
- "Is this a new thought or a recurring one?"
- "What does this connect to, if anything?"

Curator uses the minimum number of questions. The goal is capture, not analysis.

### Error handling

- No response to energy prompt within 30 minutes: assign energy_level = 3 (middle)
- Message contains only a URL: store as Idea with tag `reference`, skip energy prompt
- Message is a question directed at Bodhi: route to general Claude response, do not file

---

## Distiller

**Schedule:** Cron — 6:00am daily
**Trigger:** Time-based
**Skill file:** `skills/bodhi-distiller/`

### Flow

1. Query vault for all nodes created or updated in the last 7 days
2. Group nodes by type and by tag frequency
3. Identify recurring patterns: tags appearing 3+ times = pattern candidate
4. Synthesize connections: Claude reviews the grouped nodes and identifies themes
5. Generate morning digest:
   - 3-5 bullet points max
   - Each bullet references a specific node or tag cluster
   - Tone: calm, observational, no urgency
6. Deliver digest via Telegram
7. Flag recurring pattern candidates: send separately with "Noticed a pattern. Idea or Pattern node?"

### Digest format

```
Here is what your mind has been working on.

- [theme 1]: appeared [n] times, energy [avg]
- [theme 2]: connected to [related tag]
- [synthesis observation]

One thing to sit with: [single most energetic or recurring idea]
```

### Pattern promotion

When a tag appears 3+ times in 7 days, Distiller proposes a Pattern node.
User can confirm ("yes"), rename ("call it X"), or dismiss ("no").
Confirmed patterns are added to vault with SURFACES_FROM edges to the source Ideas.

### Non-delivery condition

If vault has fewer than 3 nodes in the last 7 days, Distiller skips the digest.
No message is sent. Silence is appropriate when the vault is quiet.

---

## Janitor

**Schedule:** Cron — Sundays at 3:00am
**Trigger:** Time-based (weekly)
**Skill file:** `skills/bodhi-janitor/`

### Flow

1. Scan all nodes for orphans (nodes with zero edges)
2. Detect duplicates: embed all nodes, compute pairwise cosine similarity
3. Flag pairs with similarity > 0.92 as duplicate candidates
4. Find broken edges (edges referencing deleted or missing node IDs)
5. Generate hygiene report
6. Send report via Telegram for human approval
7. Wait for user response before taking any action
8. Apply approved changes only

### Hygiene report format

```
Weekly vault report.

Orphans: [n] nodes with no connections
  → [sample titles]

Possible duplicates: [n] pairs
  → "[title A]" and "[title B]" — similarity 0.94

Broken edges: [n]

Approve cleanup? Reply "yes" to merge duplicates and remove orphans.
Or reply specific node IDs to keep.
```

### Safe defaults

Janitor never deletes without explicit user approval.
Janitor never merges without showing the user both node contents first.
Orphan detection does not include nodes created in the last 7 days (too new to have edges).

---

## Surveyor

**Schedule:** Cron — Saturdays at 2:00am
**Trigger:** Time-based (weekly)
**Skill file:** `skills/bodhi-surveyor/`

### Flow

1. Embed all vault nodes using nomic-embed-text (via Ollama)
2. Run HDBSCAN clustering on the embeddings
   - min_cluster_size: 5
   - min_samples: 3
   - metric: cosine
3. Label each cluster: Claude reads the cluster's node contents and assigns a 3-5 word label
4. Identify bridge nodes: nodes with high betweenness centrality connecting two clusters
5. Generate Synthesis nodes for each significant bridge
6. Write Synthesis nodes to vault with SURFACES_FROM edges
7. Run SOC analysis: plot energy_level distribution, check for power law signature
8. Send weekly insight summary via Telegram

### HDBSCAN rationale

HDBSCAN (Hierarchical Density-Based Spatial Clustering of Applications with Noise) is
preferred over OPTICS or k-means for this use case because:
- It does not require specifying the number of clusters in advance
- It handles noise points gracefully (ideas that do not cluster yet)
- It is robust to clusters of varying density
- It scales to tens of thousands of nodes without parameter tuning

### SOC analysis

Self-organized criticality provides a framework for understanding when ideas are ready to act on.

The sandpile model (Per Bak, 1987): grains of sand accumulate until a critical threshold,
then cascade. Cognitive insights follow a similar pattern — ideas accumulate energy until
a threshold triggers a breakthrough.

Surveyor tracks:
- Distribution of energy_level across the vault (should approach power law)
- High-energy clusters (avg energy_level > 3.5) flagged as potential avalanche zones
- Recurrence rate: how often the same node or tag cluster appears in Distiller reports

If a cluster has been flagged in 3 consecutive Distiller reports and average energy > 3.5,
it is marked as a nudge candidate for the Nudge System (Phase 6).

### Synthesis node format

```json
{
  "type": "Synthesis",
  "content": "[Claude-generated bridge observation connecting the two clusters]",
  "energy_level": 3,
  "created_by": "surveyor",
  "tags": ["synthesis", "cluster-bridge"],
  "source": "surveyor"
}
```
