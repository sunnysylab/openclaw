# Local Setup Guide

This guide sets up OpenBodhi on a dedicated home desktop or server.

---

## Prerequisites

Install these before starting:

| Tool | Version | Notes |
|------|---------|-------|
| [Node.js](https://nodejs.org/) | 22+ | Use the LTS installer |
| [pnpm](https://pnpm.io/installation) | 9+ | `npm install -g pnpm` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | latest | Required for isolated dev |
| [Git](https://git-scm.com/) | latest | Standard install |
| [Ollama](https://ollama.com/) | latest | Optional, for local embeddings |

---

## Step 1: Fork and Clone

First, fork [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw) on GitHub.
Rename the fork to `OpenBodhi` in your GitHub account.

Then clone your fork and add the OpenBodhi docs/config on top:

```bash
git clone https://github.com/YOUR_USERNAME/OpenBodhi.git
cd OpenBodhi
```

---

## Step 2: Install Dependencies

```bash
pnpm install
```

This installs all OpenClaw dependencies. OpenBodhi skill dependencies are installed per-skill.

---

## Step 3: Configure Environment

Copy the example env file:

```bash
cp .env.example .env
```

Edit `.env` with your actual values:

```env
ANTHROPIC_API_KEY=sk-ant-...        # Required
OLLAMA_HOST=http://localhost:11434  # Only if running Ollama
BODHI_VAULT_PATH=./vault            # Where your knowledge graph lives
BODHI_DIGEST_TIME=06:00             # When to send morning digest
```

The `.env` file is in `.gitignore`. Never commit it.

---

## Step 4: Set Up Ollama (Optional)

Ollama provides local embeddings. Without it, all inference goes to the Claude API.

```bash
# Install Ollama from https://ollama.com/
# Then pull the embedding model:
ollama pull nomic-embed-text

# Optional: pull the local reasoning model
ollama pull qwen3:8b
```

The Qwen3-8B model is approximately 5.8GB at Q4_K_M quantization. It fits in an 8GB VRAM GPU.

Verify Ollama is running:

```bash
curl http://localhost:11434/api/tags
```

---

## Step 5: Connect Signal Bridge

OpenClaw's Signal bridge uses [signal-cli](https://github.com/AsamK/signal-cli) under the hood.

Follow the [OpenClaw Signal setup guide](https://github.com/openclaw/openclaw) for your platform.
This requires a phone number to register as the Signal bridge identity.

Common approach: use an old phone or a Google Voice number as the bridge number.

---

## Step 6: Start the Gateway

```bash
pnpm start
```

The Gateway starts at `ws://127.0.0.1:18789`.

You should see output like:

```
OpenClaw Gateway running at ws://127.0.0.1:18789
Signal bridge connected
Skills registered: [bodhi-curator, bodhi-distiller, bodhi-janitor, bodhi-surveyor]
```

---

## Step 7: Test Capture

Send a message to your bridge Signal number from your personal Signal account.

Bodhi should respond with a classification and an energy level prompt.

---

## Vault Location

By default, the vault lives at `./vault/` relative to the project root.

```
vault/
├── nodes/
│   └── 2026-03/
├── edges/
└── schema/
```

The vault directory is in `.gitignore`. It is personal data. Do not commit it.

---

## Docker Compose (Planned Phase 1)

Network-isolated development is planned but not yet implemented. The architecture:

```yaml
services:
  gateway:
    build: .
    networks:
      - bodhi-net
    environment:
      - ANTHROPIC_API_KEY

networks:
  bodhi-net:
    driver: bridge
    # egress whitelist: api.anthropic.com only
```

This ensures the Gateway process cannot make arbitrary outbound connections.
Documentation will be updated when this is implemented.

---

## Troubleshooting

**Gateway fails to start:** Check Node.js version (`node --version` should be 22+).

**Signal bridge not connecting:** Signal-cli registration may need re-linking. Follow OpenClaw docs.

**Ollama not found:** Ensure Ollama is running (`ollama serve`) and `OLLAMA_HOST` is set in `.env`.

**ChromaDB errors:** ChromaDB requires Python 3.8+. Install via `pip install chromadb`.

**VRAM errors with Qwen3-8B:** Try Q3_K_M quantization for ~4.5GB VRAM usage instead.

---

## Hardware Notes

**GPU (optional, for local models):**
- Qwen3-8B at Q4_K_M: ~5.8-6.3GB VRAM
- nomic-embed-text: minimal VRAM, runs alongside the main model
- ChromaDB HDBSCAN (CPU): does not require GPU

**Storage:**
- nomic-embed-text model: ~274MB
- Qwen3-8B at Q4_K_M: ~5.8GB
- Vault data at 1 year of daily captures: estimated 50-200MB
- ChromaDB index: proportional to vault size, typically 2-5x raw text size

Plan for 50GB free storage to be comfortable for 1-2 years of use.
