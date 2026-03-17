# VioDashboard Audit Changes — 2026-03-12

## Goals covered
- readability improvements
- small security hardening
- no intended behavior changes

## Changes made
- added explanatory header comments to `src/moodBridge.mjs` and `src/sidecarClient.mjs`
- changed `src/sidecarClient.mjs` to prefer `VIO_SIDECAR_BASE` / `VIO_SIDECAR_TOKEN` env vars while keeping the previous local defaults
- modularized `src/server.mjs` into focused helper modules under `src/server/` plus shared `src/config.mjs` so gateway, filesystem, gesture/camera, static serving, and HTTP helpers are easier to maintain independently
- added `GET /api/health` as a simple local readiness endpoint for smoke checks and future monitoring
- added `scripts/smoke-test.mjs` plus `npm run smoke` to verify wrapper health/static/API basics and key regressions without needing a full browser session
- updated `README.md` and `ARCHITECTURE.md` to document the new module structure and smoke-test usage

## Security notes
- the wrapper still exposes powerful local file-read/write endpoints under `/api/file` and `/api/files`; this is acceptable only for a trusted localhost workflow
- sidecar credentials previously lived only in source; they now support environment overrides to reduce secret duplication
- larger hardening opportunities remain in `src/server.mjs` because it currently accepts arbitrary JSON body sizes and allows broad project-root file editing

## Recommended follow-ups
1. add endpoint-level auth/origin checks if the wrapper ever stops being localhost-only
2. move token telemetry diff/model-window logic into its own module once that surface grows further
3. add one browser-level smoke or snapshot test for the main UI if/when the frontend stabilizes enough


## Additional changes
- moved the composer visually into the chat pane so input and conversation now live in one column, while the editor remains beside them
- increased wrapper input font size by another 3px for easier reading and typing
- added open-source baseline files: `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `.env.example`
- updated `src/config.mjs` to support env-based overrides for config path, project root, wrapper port, gateway port, gateway token, and gateway URL
- added `npm run check` for quick syntax validation before smoke tests or releases

## Why these changes matter
- the merged chat/input layout matches the actual task flow better: read conversation, type reply, send, all in one visual region
- env overrides reduce the amount of machine-specific or secret-adjacent data that must live in tracked source
- baseline repo docs make the project easier for outside contributors to approach safely


## Roadmap protocol work
- added `ROADMAP_SCHEMA.md` to define roadmap schema v1 and generation rules v1
- documented the preferred `vio-roadmap` fenced JSON payload format
- documented when roadmap payloads should and should not be generated
- telemetry task board v1 now supports `done_candidate`, explicit `complete/block/reopen` controls, and trace-like lifecycle history instead of only storing the final archived snapshot
- completed tasks now move out of the active board into Task History with lifecycle records preserved; deploy still transitions tasks into `doing`
- clarified the split between reply body, backend extraction, and telemetry consumption

- task board batch deploy v1 added: active tasks can be multi-selected, a batch toolbar appears for 2+ selected tasks, and `/api/tasks/deploy-batch` packages the selected tasks into one coordinated chat message while explicitly preserving separate task identities
- selected tasks now record `batchId`, shared `deployedAt`, and per-task `batch_deployed` trace events for auditability without merging task entities
- smoke coverage now includes the batch deploy dry-run endpoint, and `npm run check` now syntax-checks `public/telemetry.js` too

- roadmap history and task history now have independent two-step clear buttons matching the Deleted Tasks interaction; roadmap history clearing is backed by a confirm-gated `/api/roadmap/history/clear` endpoint so archived roadmap storage is wiped intentionally rather than implicitly
- Road Map panel now supports multi-select claim: candidate items can be checkbox-selected, claimed together into Task Board in one grouped local step, and traced as `batch_claimed` without deploying them
- smoke coverage now checks the confirm guard and success path for roadmap history clearing
