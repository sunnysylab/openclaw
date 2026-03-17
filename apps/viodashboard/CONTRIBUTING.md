# Contributing

Thanks for considering a contribution to VioDashboard.

## Principles
- Keep changes small and reversible.
- Prefer local-first, dependency-light solutions.
- Preserve localhost-only assumptions unless a change explicitly broadens the trust model.
- Document behavior changes in `AUDIT_CHANGES_2026-03-12.md` or a newer dated change log.

## Local setup
```bash
npm install
npm run check
npm run smoke
```

## Before opening a PR
- Run `npm run check`
- Run `npm run smoke` against a fresh local wrapper instance
- Update `README.md` / `ARCHITECTURE.md` when structure or API behavior changes
- Add concise comments when code intent is not obvious from structure alone

## Scope guidance
Good fits:
- readability improvements
- safe refactors
- bug fixes
- local tooling and docs

Discuss first:
- network exposure changes
- auth model changes
- large UI rewrites
- changes that add heavy dependencies
