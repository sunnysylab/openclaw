# Security Policy

## Current security model
VioDashboard is currently designed for **trusted localhost use**.

That means:
- the HTTP server is expected to be reachable only from the local machine
- file browsing / editing APIs are intended for a trusted local operator
- secrets should come from local config or environment variables, not committed source

## Reporting
If you find a vulnerability, please report it privately to the maintainer before public disclosure.

## Sensitive areas
Please review these carefully when making changes:
- `/api/file` and `/api/files`
- WebSocket gateway bridge
- script execution helpers
- any future non-localhost exposure

## Hardening checklist
- keep request body limits in place
- avoid broad file-write scopes
- prefer env/config secrets over inline literals
- add auth/origin checks before exposing beyond localhost
