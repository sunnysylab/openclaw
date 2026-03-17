# coms

Communication-focused modules for Wrapper and related local integrations.

## token-saver.mjs

P1 implementation for token savings:

- strips leaked wrapper protocol text
- strips `vio-roadmap` blocks from conversational memory
- keeps a small rolling recent-turn buffer
- compacts older turns into a short working summary
- builds a minimized outbound prompt for the model

Intended use:

1. ingest user text before send
2. build minimized prompt
3. send minimized prompt to the model
4. ingest assistant final reply after receive

This folder is meant to hold communication middleware rather than general app logic.
