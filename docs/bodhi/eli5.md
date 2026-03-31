# OpenBodhi -- ELI5

## What is this?

A personal wellness journal that thinks.

You send thoughts to a Telegram bot. The system files them, finds research connections, spots patterns over time, and nudges you when an idea is ready to act on.

Your data never leaves your machine. There is no cloud. There is no account. You own everything.

## How does it work?

Imagine five workers sitting behind your Telegram bot. Each one has a specific job.

### The Curator (every message)

You send a message. The Curator catches it, figures out what type of thought it is (an idea, a pattern you noticed, a decision you made), guesses how much energy the thought carries from how you wrote it, picks the right wellness domain (fitness, health, mental health, etc.), and saves it to a file on your machine.

If you send a photo of a recipe, it knows that is nutrition. If you send a voice note about your morning run, it knows that is fitness. Text, images, voice, documents, links, video -- it handles all of them.

You never fill out a form. You never pick a category. You just talk.

### The Enricher (a few seconds after each message)

After the Curator saves your thought, the Enricher looks at it and finds relevant research. If you wrote about sleep cycles, it connects that to circadian rhythm research. If you mentioned spaced repetition, it links the original Ebbinghaus 1885 study.

This runs on a small local AI model (Mistral Nemo), not the main Claude model. It is a background task. You never see it happen.

### The Distiller (every morning at 6am)

Each morning, the Distiller looks at everything you captured in the last 7 days. It groups your thoughts by theme, tracks which topics are gaining energy over time, and finds connections between different areas.

You get a short summary on Telegram. If you captured fewer than 3 thoughts that week, it stays silent. Silence is a signal too.

### The Janitor (Sunday 3am)

Once a week, the Janitor checks the vault for problems. Orphan thoughts with no connections. Near-duplicates. Broken links between ideas. It sends you a report and asks before cleaning anything up.

The Janitor never deletes without your permission.

### The Surveyor (Saturday 2am)

The most interesting worker. The Surveyor takes every thought in your vault, turns them into mathematical vectors, and clusters them using an algorithm called HDBSCAN. This reveals structure you cannot see by reading your notes.

The real value: cross-domain bridges. When your fitness thoughts and your mental health thoughts start clustering together, that means something. Maybe your running habit is affecting your anxiety. The Surveyor names this connection and writes it back into the vault.

It also tracks SOC signals (Self-Organized Criticality). When a cluster of ideas has been building energy for 3 or more weeks, with average energy above 3.5 out of 5, the Surveyor flags it: "This cluster has been building. Ready to act?"

The system never pushes you to do anything. It notices when your own ideas reach readiness.

## Where does the data live?

On your machine, in a folder called `vault/`. Every thought is a JSON file.

```
vault/
  nodes/
    2026-03/
      abc123.json    <-- one thought
      def456.json    <-- another thought
    2026-04/
      ...
  edges/
    ghi789.json      <-- connection between two thoughts
  manifest.json      <-- tamper detection (SHA-256 hashes)
  schema/
    nodes.json       <-- rules for what a thought looks like
```

The files are organized by month so the system stays fast even after years of use.

## What AI models are used?

| Task | Model | Why |
|------|-------|-----|
| Classifying your thoughts | Claude (Sonnet/Opus) | Accurate, fast, handles images and voice |
| Morning digest | Claude (Opus) | Needs to read a full week of thoughts at once |
| Expanding short notes | Mistral Nemo (local) | Runs on your machine, no internet needed |
| Turning thoughts into vectors | nomic-embed-text (local) | Fast, runs on your machine |

Claude is the main brain. The local models handle small, specific tasks so your data stays on your hardware when possible.

## What are the five wellness domains?

Every thought gets classified into exactly one domain.

| Domain | What it covers |
|--------|---------------|
| wellness | sleep, hydration, daily routine, balance, breathing, nature |
| fitness | exercise, training, movement, strength, cardio |
| health | nutrition, diet, supplements, medical, lab results, recipes |
| mental-health | meditation, therapy, journaling, emotions, stress |
| cognitive | learning, reading, memory, focus, problem-solving |

The most interesting insights come when two different domains start connecting. That is what the Surveyor looks for.

## How do I set it up?

You need a machine that stays on. A Mac Mini, an Intel NUC, an old laptop, anything with 4GB of RAM.

1. Open Telegram, message @BotFather, type /newbot, pick a name
2. Copy the bot token BotFather gives you
3. Run the installer on your machine
4. Paste your bot token when prompted
5. Send your first thought

Setup takes under 5 minutes. No cloud accounts. No subscriptions.

## What is OpenClaw?

OpenClaw is the open source platform OpenBodhi is built on. Think of it as the engine under the hood. OpenClaw handles connecting to Telegram, routing messages, running scheduled jobs, and managing sessions. OpenBodhi adds the wellness-specific skills (Curator, Enricher, Distiller, Janitor, Surveyor) and the vault system on top.

OpenBodhi is a fork of OpenClaw. It inherits all of OpenClaw's infrastructure and adds the wellness layer.

## What does "SOC" mean?

Self-Organized Criticality. It is a physics concept from 1987 (Per Bak's sandpile model).

Imagine dropping grains of sand onto a pile, one at a time. Most grains just sit there. But occasionally, adding one grain triggers a cascade -- an avalanche. The pile naturally organizes itself to a state where avalanches of all sizes become possible.

OpenBodhi uses this as a model for ideas. Your thoughts accumulate. Some topics build energy over time. When a cluster of related thoughts reaches a critical threshold, the system notices and surfaces it. Not because a calendar reminder went off, but because the structure of your own thinking reached readiness.

This is a design metaphor grounded in real research (Beggs & Plenz 2003, Chialvo 2010), not a claim that your brain literally operates at criticality.
