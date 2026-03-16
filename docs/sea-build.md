# Single Executable Application (SEA) Build

OpenClaw can be packaged as a [Node.js Single Executable Application (SEA)][sea-docs] — a
self-contained binary that embeds the entire JavaScript runtime and OpenClaw source. No
`npm install`, no `pnpm build` at container startup.

## Why SEA?

In container-based deployments (e.g. Botyard on the HEL1 ARM cluster), each container
currently runs `pnpm install` at boot, which takes ~30 seconds. A pre-built SEA binary
eliminates that cost entirely.

| Approach                         | Cold start | Image size      |
| -------------------------------- | ---------- | --------------- |
| Current (`pnpm install` at boot) | ~30s       | ~500MB          |
| SEA binary + esm-modules         | ~0s        | ~500MB (cached) |

The binary is ~156 MB and is cached in container image layers, so subsequent container
starts have near-zero overhead from the JS runtime.

## Requirements

| Requirement | Minimum | Notes                                            |
| ----------- | ------- | ------------------------------------------------ |
| Node.js     | 21.7.0  | `--build-sea` flag built in (no postject needed) |
| esbuild     | any     | Available via `tsx` devDependency in pnpm store  |

## Quick Start

```bash
# Install deps (only needed once)
pnpm install

# Build SEA binary for current platform
pnpm build:sea
# → dist-sea/openclaw       (self-contained binary, ~156 MB)
# → dist-sea/addons/        (native .node addons)
# → dist-sea/esm-modules/   (ESM-only deps shipped alongside)
```

## Cross-Compilation (linux/arm64 for HEL1)

The HEL1 Kubernetes cluster runs on ARM64. To build linux/arm64 from macOS (Mac Mini):

```bash
# Download linux-arm64 Node.js binary (~30 MB, cached after first run)
node scripts/fetch-node-for-sea.mjs --target linux-arm64

# Build for linux/arm64
OPENCLAW_SEA_NODE_PATH=$(node scripts/fetch-node-for-sea.mjs --target linux-arm64) \
  pnpm build:sea --target linux-arm64
# or: make -f Makefile.sea sea-linux-arm64
```

> **Note on native addons**: The `.node` binaries in `dist-sea/addons/` are for the
> host platform (e.g. darwin-arm64). For production linux-arm64 containers, run the SEA
> build inside a linux-arm64 Docker container to get the correct addon ABI:
>
> ```bash
> docker run --rm --platform linux/arm64 \
>   -v $(pwd):/app -w /app node:22-bookworm \
>   sh -c "corepack enable && pnpm install && pnpm build:sea"
> ```

## Output Structure

```
dist-sea/
  openclaw             — self-contained binary (~156 MB on linux-arm64)
  openclaw-sea.cjs     — bundled CJS entrypoint (intermediate)
  addons/              — native .node addons (must live beside binary at runtime)
    @lydell/node-pty/
    sharp/
    sqlite-vec/
  esm-modules/         — ESM-only packages that couldn't be bundled into CJS
    @mariozechner/
    @buape/
    file-type/
    osc-progress/
  manifest.json        — build metadata (target, size, node version, etc.)
```

## Native Addons

Several dependencies use native Node.js addons (`.node` files):

| Package            | Purpose                                        |
| ------------------ | ---------------------------------------------- |
| `@lydell/node-pty` | Pseudo-terminal for interactive agent sessions |
| `sharp`            | Image processing (thumbnails, resize)          |
| `sqlite-vec`       | SQLite vector extension for embeddings         |
| `opusscript`       | Opus audio codec for voice calls               |

These addons are platform-specific and must be present alongside the binary.
They cannot be embedded in the SEA blob.

## ESM-Only Dependencies

Some packages are [ESM-only][esm-only] (no CommonJS dist) and cannot be statically
bundled into a CJS SEA binary by esbuild:

| Package                         | Purpose                     |
| ------------------------------- | --------------------------- |
| `@mariozechner/pi-ai`           | Pi AI provider client       |
| `@mariozechner/pi-coding-agent` | Pi coding agent integration |
| `@mariozechner/pi-tui`          | Pi TUI components           |
| `file-type`                     | MIME type detection         |
| `osc-progress`                  | Progress indicators         |
| `@buape/carbon`                 | Discord bot framework       |

These are collected into `dist-sea/esm-modules/` and must be available on
`NODE_PATH` or as `node_modules` at runtime.

> **Future improvement**: These packages can be made lazy-loadable (dynamic `import()`)
> so they're only resolved when their features are actually used, not at startup.

## Dockerfile Integration (Botyard)

```dockerfile
# --- Stage 1: Build SEA binary (run inside linux-arm64 container for correct ABI) ---
FROM node:22-bookworm AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY patches ./patches
RUN NODE_OPTIONS=--max-old-space-size=2048 pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:sea

# --- Stage 2: Runtime container ---
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libvips42 \
      libc6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/dist-sea/openclaw /usr/local/bin/openclaw
COPY --from=builder /app/dist-sea/addons   /app/addons
COPY --from=builder /app/dist-sea/esm-modules /app/node_modules
COPY skills/ /app/skills/

ENV NODE_ENV=production
CMD ["openclaw", "gateway", "start"]
```

The SEA binary is ~156 MB (cached in image layer). Container cold starts drop from ~30s
to near-zero.

## npm Scripts

| Script                       | Description                                |
| ---------------------------- | ------------------------------------------ |
| `pnpm build:sea`             | Build SEA binary for current host platform |
| `pnpm build:sea:linux-arm64` | Cross-compile for linux/arm64 (HEL1)       |
| `pnpm build:sea:linux-x64`   | Cross-compile for linux/x64                |

## Makefile Targets

```bash
make -f Makefile.sea sea               # Current platform
make -f Makefile.sea sea-linux-arm64   # linux/arm64 (HEL1)
make -f Makefile.sea sea-linux-x64     # linux/x64
make -f Makefile.sea clean-sea         # Remove dist-sea/
```

## How It Works

The build pipeline has 4 steps:

1. **Bundle** (`esbuild`): Bundles `src/entry-sea.ts` into a single CJS file, bundling
   all non-native dependencies. ESM packages are converted to CJS automatically.
   - Uses `src/entry-sea.ts` — a SEA-specific entrypoint that avoids `import.meta.url`
     and top-level await (both incompatible with plain CJS bundling).

2. **Patch**: Injects `import.meta.url` shims into the CJS bundle so that modules using
   `fileURLToPath(import.meta.url)` for path resolution work correctly in the CJS context.

3. **Inject** (`node --build-sea`): Node.js 21.7+ can inject the JS blob directly into
   a copy of the node binary — no `postject` needed.

4. **Collect**: Gathers native `.node` addons and ESM-only packages into `dist-sea/`.

## Troubleshooting

### `ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module`

An external package is being `require()`'d inside the SEA binary but isn't available
in `node_modules`. Copy `dist-sea/esm-modules/` to the container's `node_modules` path.

### Binary crashes on linux/arm64

Native addon ABI mismatch. Rebuild inside a linux/arm64 container (see cross-compilation
section above).

### `Cannot find esbuild binary`

esbuild isn't installed. Run `pnpm add -D esbuild` or let `pnpm install` pull it in
as a transitive dependency of `tsx`.

[sea-docs]: https://nodejs.org/api/single-executable-applications.html
[esm-only]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c
