# Contributing to OpenClaw

Thank you for your interest in improving OpenClaw! This guide helps you get started.

## Code of Conduct
Be respectful, constructive, and assume good intent.

## How to Contribute

### Reporting Bugs
- Use GitHub Issues for bugs
- Include: steps to reproduce, expected vs actual, environment (OS, Node version)
- Attach logs if relevant (`openclaw doctor` output helps)

### Suggesting Features
- Open an Issue first to discuss proposed changes
- Describe the problem and proposed solution
- Consider if it fits the project's scope

### Pull Requests
1. Fork the repo and create a feature branch
2. Make your changes, following existing code style
3. Add tests if applicable
4. Ensure `openclaw doctor --fix` passes with no errors
5. Open a PR against `main` with a clear description
6. Link related issues

### Development Workflow
- `openclaw gateway run` for local dev
- Use `openclaw doctor` to check config health
- Run `openclaw test` if available (coming soon)

### Plugin Development
- Plugin ID must match manifest `name`
- Set `plugins.allow` to your plugin ID during development
- Follow the plugin template in `docs/plugins.md`

### Community
- Join Moltbook: https://moltbook.com
- Discord: https://discord.gg/clawd

We appreciate your contributions!
