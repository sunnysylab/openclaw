# Roadmap Schema v1

This document defines the structured roadmap payload consumed by VioDashboard.

## Goal
Separate:
- **user-facing reply text**
- **machine-facing roadmap data**

The preferred transport is a fenced code block embedded in the assistant final reply:

```vio-roadmap
{
  "title": "Road Map",
  "summary": "Short execution summary.",
  "items": [
    {
      "id": "task-1",
      "title": "Implement task board status lanes",
      "description": "Convert the current flat list into todo/doing/blocked/done.",
      "status": "proposed",
      "priority": "high",
      "source": "assistant"
    }
  ]
}
```

## Top-level fields
- `id` (optional string)
- `title` (required string)
- `summary` (required string)
- `updatedAt` (optional ISO timestamp)
- `items` (required array)

If omitted, the backend may generate `id` and `updatedAt`.

## Item fields
Each item should contain:
- `id` (optional string, backend can normalize)
- `title` (required string)
- `description` (optional string)
- `status` (optional string, default `proposed`)
- `priority` (optional string, default `normal`)
- `source` (optional string, default `assistant`)

## Allowed values
### status
- `proposed`
- `todo`
- `doing`
- `blocked`
- `done`

### priority
- `low`
- `normal`
- `high`

## Generation rules v1
Default policy: attach a `vio-roadmap` block to every assistant final reply.

Wrapper display rule:
- the wrapper should detect and strip the `vio-roadmap` block before rendering assistant text in the chat window
- the roadmap block remains available to backend parsing, persistence, and task UI consumption

Recommended content policy:
- when the reply has meaningful follow-up work, include populated roadmap items
- when the reply has no meaningful follow-up work, still emit a valid roadmap payload with an empty `items` array and a truthful summary

## Authoring guidance
Good roadmap items are:
- concrete
- independently actionable
- short enough to scan
- specific enough to add to a task board

Prefer:
- one action per item
- imperative titles
- optional description for context

Avoid:
- mixing multiple tasks into one item
- vague items like "improve things"
- repeating the whole reply in the description


## Reply composition template v1
Preferred assistant final reply shape:

1. Human-readable reply body first
2. Structured `vio-roadmap` block last

Template:

```text
<normal user-facing reply>

```vio-roadmap
{
  "title": "Road Map",
  "summary": "What follow-up work this reply implies.",
  "items": [
    {
      "id": "task-1",
      "title": "Concrete next action",
      "description": "Optional context.",
      "status": "proposed",
      "priority": "normal",
      "source": "assistant"
    }
  ]
}
```
```

Why this order:
- safer for wrapper stripping
- easier for human readers when raw text is ever inspected
- keeps the machine block visually isolated

## Generation policy v1.1
- Every assistant final reply should emit a `vio-roadmap` block.
- The block should be the last section of the reply.
- If there is no meaningful follow-up work, emit a valid empty roadmap (`items: []`).
- Keep roadmap items short, concrete, and task-board-ready.
- Do not duplicate the whole reply body inside roadmap descriptions.
