# Pi Docker

Disposable container: `/workspace` is the writable project, `/pi/agent` is shared
configuration/credentials, session storage is `/pi/sessions` (or
`/pi/herdr-sessions/<key>` in Herdr mode), and `/opt/pi-docker` is read-only
deployment source (possibly newer than the image).

## Execution boundary
You are running inside a Pi Docker container, not on the host.
- Tool commands execute inside this container.
- `/workspace` is the mounted project; its absolute host path may differ.

Read only the relevant mounted guide; do not search `/workspace` for these docs:
- Installation and security: `/opt/pi-docker/SETUP.md`.
- OpenAI/provider login and GitHub credentials: `/opt/pi-docker/AUTHENTICATION.md`.
- Runtimes, resources, extension policy, maintenance: `/opt/pi-docker/CUSTOMIZATION.md`.
- Launcher and session usage: `/opt/pi-docker/README.md`.
- Herdr integration, diagnostics, restore, and shutdown:
  `/opt/pi-docker/HERDER_INTEGRATION.md`.

## Herdr
- Connected context requires `HERDR_ENV=1`, nonempty `HERDR_PANE_ID`, and an
  existing Unix socket at `HERDR_SOCKET_PATH`. Do not infer it from `PI_*` or
  TTY status, invent it, or probe the API merely to detect it.
- The socket grants access to the entire session, not just the caller pane.
  Integration authorizes peer communication; preserve the supplied context.
- For Docker-Pi helper startup and peer requests, execute the `docker-pi-herdr`
  skill's start/ask workflow through the shell tool. Its instructions are included
  in integrated launches; otherwise read
  `/opt/pi-docker/skills/docker-pi-herdr/SKILL.md`. General pane control uses the
  official skill at `/pi/agent/skills/herdr/SKILL.md`.
- Only on an explicit request to stop the **entire session**, run
  `/opt/pi-docker/bin/stop-herdr`. It stops all panes/processes and may terminate
  this container before acknowledgement. Never retry an ambiguous result
  automatically. Clarify requests to exit Pi versus detach versus stop.

## GitHub
Use `gh` via bash for GitHub operations.
Pass repositories as OWNER/REPO; discover unknown owners with `gh repo list --limit 100`.
Use `gh <command> --help` when unsure of syntax.

## Essential rules
- Node.js and Python are available. Prefer uv with project-local `.venv`
  environments; automatic Python downloads are disabled. No global installs.
- Downloaded extensions belong in the Dockerfile as npm `@latest`, explicitly
  loaded by the `pi` launcher; homemade extensions use mounted resource folders.
- Image/package updates require a host rebuild and new containers; Docker is
  unavailable here. See the maintenance guide for reload/restart rules.
- Shared edits affect other instances; avoid concurrent configuration changes.
- Do not inspect or disclose credentials or real environment files during routine
  setup. Mounts and instructions do not isolate credentials from tools/extensions.
