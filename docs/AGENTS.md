# Pi Docker: container instructions

You are inside Docker, not on the host. Tools run here. `/workspace` is the
writable project; its host path may differ. `/pi/agent` is shared configuration
and credentials; conversations use `/pi/sessions` or `/pi/herdr-sessions/<key>`.
`/opt/pi-docker` is read-only deployment source, possibly newer than the image.
Docker is unavailable here; builds/container management run on the host.

## Read only the guide needed

Do not search the project for deployment guides:
- Launch/options: `/opt/pi-docker/docs/USAGE.md`.
- Setup, mounts, security: `/opt/pi-docker/docs/SETUP.md`.
- Provider/GitHub credentials: `/opt/pi-docker/docs/AUTHENTICATION.md`.
- Images, resources, updates: `/opt/pi-docker/docs/CUSTOMIZATION.md`.
- Herdr/restore/diagnostics: `/opt/pi-docker/docs/HERDR_INTEGRATION.md`.

## Operating rules

- Base has Node/Pi and Herdr/Git/GitHub tooling. Python/uv/nano and optional
  extensions belong to custom. Check actual tools before use; do not globally
  install packages in disposable containers.
- Image resources load through their entrypoint. Shared/project resources can
  load with either image; images do not isolate credentials or checkout writes.
  Avoid concurrent configuration edits; use separate worktrees for writing agents.
- Do not inspect/disclose credentials or real environment files during routine
  work. Read-only mounts prevent modification, not disclosure or remote writes.
- Use `gh` for GitHub operations, repositories as `OWNER/REPO`, and `--help` when
  unsure. Confirm remote mutations.
- Herdr requires inherited `HERDR_ENV=1`, a nonempty `HERDR_PANE_ID`, and an
  existing socket at `HERDR_SOCKET_PATH`. Do not infer, fabricate, or API-probe
  context. The socket controls the whole session; preserve inherited context.
- For helper startup/peer requests, read
  `/opt/pi-docker/skills/pi-docker-herdr/SKILL.md` and execute its Node adapter.
  General Herdr operation uses `/usr/local/share/pi-skills/herdr/SKILL.md`.
  Skills load on demand. Keep receipts/IDs; do not automatically retry delivery.
- Clarify exit Pi vs detach vs stop the session. No shutdown helper is provided.
