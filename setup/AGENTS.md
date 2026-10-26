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

## Herdr context and safety
- To identify connected Herdr mode, check only `HERDR_ENV`, `HERDR_PANE_ID`, and
  `HERDR_SOCKET_PATH`: expect `HERDR_ENV=1`, a nonempty pane ID, and an existing
  Unix socket. `PI_*` variables and a shell tool's non-TTY status do not establish
  whether Pi is in a Herdr pane. Missing context does not prove the host terminal
  is outside Herdr; `--no-herdr`, ineligible invocations, or auto preparation
  failures intentionally leave the integration unexposed.
- Never manufacture pane context or probe the control API just to identify it.
  Local context checks do not prove live connectivity or reporting readiness.
- An integrated Docker-Pi launch authorizes Herdr features, including pane-to-pane
  communication. Use the official `herdr` skill and CLI with the provided
  `HERDR_SOCKET_PATH`; the skill is shared at `/pi/agent/skills/herdr/SKILL.md`.
- The mounted socket controls the entire connected Herdr session, including
  other panes; the pane ID is not an access restriction. Stopping the entire
  session still requires an explicit user request.

## Docker-Pi Herdr start/ask
- This capability is a **skill + Python script**, not a registered Pi tool or
  extension. Your existing `read` and shell tools are sufficient. For a matching
  request, read `/opt/pi-docker/skills/docker-pi-herdr/SKILL.md` before concluding
  the capability is unavailable. Do not stop after searching tools/extensions,
  install a package, or ask the user to run Python because no Herdr tool exists.
- When the user asks in ordinary language to open/split a Docker-Pi helper pane
  or ask/contact/call another agent, read
  `/opt/pi-docker/skills/docker-pi-herdr/SKILL.md` and execute its deterministic
  `scripts/herdr-helper.py` start/ask workflow yourself through the shell tool.
  Do not just show the user Python commands or require a skill slash command.
  Integrated launches advertise this skill and append its full instructions to
  the system prompt, so execution does not depend on the model discovering it.
  If already present in context, apply them directly. General inspection and blank
  terminal panes stay with the unchanged official Herdr skill/CLI; clarify a bare
  “open/split a pane” when helper versus blank shell intent is unclear.
- Startup requires `PI_DOCKER_HOST_WORKSPACE`, the selected host project root,
  and host `pi` resolving to this deployment in new shells. Never substitute
  container `$PWD` or `/workspace`, or submit improvised host-shell checks.
  Missing metadata requires a fresh integrated container, not a guessed path.
- Preserve structured receipts, known pane/agent IDs, and submission uncertainty.
  No blind retries, resends, replacement helpers, or automatic pane cleanup.
  Separate conversation storage does not isolate files; one outstanding request
  per idle helper, with no concurrent senders.

## Herdr shutdown
When explicitly asked to stop the entire connected Herdr session, use
`/opt/pi-docker/bin/stop-herdr` through the shell tool. This stops all panes
and processes, not just Pi; clarify first if the user only wants to exit Pi or
detach. The helper requires a Herdr-enabled launch (auto or `--herdr`). It may
terminate this container before acknowledgement; do not automatically retry an
ambiguous result.

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
