# Pi Docker customization and maintenance

**Commands run on the host from the deployment repository root unless marked as
container commands.** See [SETUP.md](SETUP.md) for installation and
[README.md](../README.md) for everyday usage. OpenAI/provider login and GitHub
credentials are documented in [AUTHENTICATION.md](AUTHENTICATION.md).

## Container runtimes

The image includes Node.js 24, the latest stable Python 3 (`python` and
`python3` are the same interpreter), pip, and uv/uvx.

Prefer uv for Python package management: `uv sync` for uv projects, or
`uv venv` then `uv pip install <package>` for a project-local `.venv`.
Do not install packages globally. `UV_PYTHON_DOWNLOADS=never` disables uv's
automatic Python downloads; use the image-provided interpreter.

## Extension architecture decision

- **Downloaded/third-party extensions (except Herdr below):** install `package@latest` with npm in
  `setup/Dockerfile`, baked into the image. Explicitly load them with
  `--extension` in `setup/bin/pi`; global npm installation alone does not load
  an extension. Do not vendor upstream code into custom folders or deploy it
  with runtime `pi install`.
- **Homemade extensions:** keep code in extension folders. Repository-owned tools
  go in `setup/extensions/`, mounted read-only at `/opt/pi-docker/extensions/`
  and loaded by the `pi` launcher. Personal/project folders are listed below.

### Herdr-managed exception

Host Herdr manages the official reporter; the image owns the container CLI and
operating skill. Every image includes both; integration is optional at launch.
Do not vendor or modify upstream resources. See
[Herdr maintenance](HERDR_INTEGRATION.md#maintenance-and-diagnostics) for resource
paths, loading, updates, and removal. Use `--no-herdr` to skip preparation and
socket exposure.

### Subscription usage extension

See [authentication requirements](AUTHENTICATION.md#subscription-usage-extension)
for the additional provider login needed by `@specode/pi-subscription-usage`.

## Quick reference

`PI_CODING_AGENT_DIR=/pi/agent` replaces upstream's default `~/.pi/agent`.
Shared resources affect all instances; project resources require Pi project trust.

| Resource | Host location | Container location |
|---|---|---|
| Settings | `data/config/settings.json` | `/pi/agent/settings.json` |
| Repository homemade extensions | `setup/extensions/` | `/opt/pi-docker/extensions/` (read-only) |
| Shared homemade extensions | `data/config/extensions/` | `/pi/agent/extensions/` |
| Shared skills | `data/config/skills/` | `/pi/agent/skills/` |
| Global instructions | `data/config/AGENTS.md` | `/pi/agent/AGENTS.md` |
| Project settings | `<project>/.pi/settings.json` | `/workspace/.pi/settings.json` |
| Project homemade extensions | `<project>/.pi/extensions/` | `/workspace/.pi/extensions/` |
| Project skills | `<project>/.pi/skills/` | `/workspace/.pi/skills/` |

Extension folders accept `.ts`/`.js` files or subdirectories with `index.ts` or
`index.js`. Skills are subdirectories containing `SKILL.md`.

## Launcher structure

`setup/bin/pi` keeps the launch flow explicit: parse arguments, select the
workspace/storage, optionally show diagnostics, configure Docker/Herdr, then
execute Pi. Herdr-specific restore records, validation, and diagnostics are
isolated in `setup/lib/herdr-launch.sh`; host executable resolution and strict upstream
status parsing live in `setup/lib/herdr-extension.sh`. Sourcing these helpers
does not create deployment state. `setup/bin/herdr-extension ensure`
serializes integration status/install/verification before enabled launches.
Keep argument forwarding and the final `exec` visible in the launcher rather
than adding a background supervisor or a second lifecycle reporter.

## Applying changes

| Change | Action |
|---|---|
| Settings, mounted homemade extensions, or skills | `/reload` in each affected active session; no rebuild |
| Documentation under `setup/` | Immediately readable through the mount |
| Appended `setup/AGENTS.md` instructions | Start a new Pi process for fresh prompt text |
| Launcher or Compose | Start new containers |
| Dockerfile, Pi, downloaded extensions, global npm or OS packages | Rebuild image, then start new containers |

## Updating image-managed packages

Pi and Herdr are pinned in `setup/bin/build` (currently Pi 1.4.0 and
Herdr 0.9.5). Update those pins deliberately. Host/server/container version
mismatches are accepted; there is no runtime version alignment gate. Direct
Docker builds must supply both `PI_VERSION` and `HERDR_VERSION`.
Herdr is always included in the image; only launch-time integration is optional.
Pinning the image does not update or check host Herdr or an already-running server.

Python/uv image tags and extension npm `@latest` still track current releases.
To refresh those dependencies, bypass build caches:

```bash
./setup/bin/build --no-cache
docker run --rm pi-agent:latest --version
```

After rebuilding, launch with `pi` and smoke-test the extensions and models.
Inside a container, check versions with `node --version`,
`python --version`, `uv --version`, and `npm list -g --depth=0`.
Docker is unavailable inside the container; do not update global packages there.
Direct `docker run` is only an image smoke test, not a configured launcher session.
See [mounts](SETUP.md#directory-layout-and-persistence) and
[security](SETUP.md#security-and-concurrency) for those boundaries.

## Upstream documentation

Version-matched Pi docs and extension examples inside the image:

```text
/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/
/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/
```

Read only what the task needs; `extensions.md` and `packages.md` cover loading
and packaging. Use installed documentation rather than copying upstream API
reference into these deployment guides.
