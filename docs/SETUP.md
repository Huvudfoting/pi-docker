# Setup

Commands run on the **host from the repository root** unless stated otherwise.
For launcher options, see [usage](USAGE.md).

## Requirements

- Linux, local Docker Engine with Compose, and daemon access for your user.
- Bash, GNU `realpath`, `sha256sum`, and standard core utilities.
- Internet access to build; a reachable model API and provider authentication.
- For Herdr integration: host Herdr, `flock`, a trusted same-user pane, and an
  interactive terminal. Docker Desktop, remote Docker, and Windows are unsupported
  for integration. Standalone Docker Desktop use requires host networking and
  compatible GNU utilities; it is not the integration target.

Host Pi, Git, Node.js, and Python are not needed for launching. For offline tests,
see the [repository README](../README.md#tests).

## 1. Build Pi

```bash
./bin/build         # pi-docker:base
./bin/build custom  # optional pi-docker:custom; requires local base
```

Base includes Pi and Herdr/GitHub support. Custom adds development tools and
optional extensions; see [contents and customization](CUSTOMIZATION.md#two-images).
Rebuilds affect future containers, not running ones.

## 2. Install the host launcher symlink

```bash
mkdir -p ~/.local/bin
ln -sfn "$(pwd)/bin/pi" ~/.local/bin/pi
```

Ensure `~/.local/bin` is on PATH. `pi --help` shows launcher help;
`pi --no-herdr -- --version` checks the image through Docker.

## 3. Authenticate and launch

```bash
pi /absolute/path/to/project --no-herdr
# Or add: --image pi-docker:custom
```

Choose an existing project. Inside Pi, run `/login` then `/model`, or configure
an existing model API as described in [authentication](AUTHENTICATION.md).
This project does not discover, start, or manage model servers.

For integration, install host Herdr and launch inside its pane with `--herdr`.
New pane shells must resolve `pi` to this launcher. See [Herdr setup](HERDR_INTEGRATION.md#requirements-and-modes).

## Directory layout and persistence

| Host | Container | Access/purpose |
|---|---|---|
| Selected project | `/workspace` | Writable project |
| Allowlisted `bin/`, `lib/`, `docs/`, `images/`, `extensions/`, `skills/`, README and Compose files | `/opt/pi-docker/<path>` | Read-only deployment paths; no repository-root mount |
| `data/config/` | `/pi/agent` | Shared writable settings, models, credentials, resources |
| `data/gh-config/` | `/run/gh-config` | Read-only GitHub credentials; may be empty |
| `data/sessions/<name>-<path-hash>/` | `/pi/sessions`, or `/pi/herdr-sessions/<key>` | Writable conversations |
| `data/herdr-launches/` | Not separately mounted | Host-only native-restore records |
| Readable `~/.gitconfig` | `/home/node/.gitconfig` | Read-only; omit with `--no-host-gitconfig` |

The launcher appends `docs/AGENTS.md`; it is not a repository-root instruction
file. Mounted source may be newer than the image. Builds use only `images/`,
with a narrow allowlist in `images/.dockerignore`; custom copies its own resources.
Never bind the repository root at `/opt/pi-docker`: it contains private state.

## Security and concurrency

- This is filesystem/process isolation, **not a hardened sandbox**. Agents can
  modify mounted projects. Host networking exposes host-local services and ports;
  there is no network isolation from the host.
- Herdr's socket controls the **entire connected session**, including other panes.
  Eligible launches enable it automatically with a notice; use `--no-herdr` to
  prevent preparation and socket exposure. Removing the shutdown helper does not
  restrict the upstream socket API.
- Pi, extensions, and tools can read mounted credentials. Read-only prevents
  modification through that mount, not disclosure or remote API writes.
- Keep secrets only in private `data/`, not deployment paths. Mounting this
  repository root as the project also exposes private `data/` through writable
  `/workspace`; choose a narrower project when possible. Back up credentials, sessions, and restore records privately.
- Containers/images do not isolate shared configuration or concurrent checkout
  writes. Use separate worktrees for writing agents and avoid concurrent credential
  refresh/configuration changes. See [credential handling](AUTHENTICATION.md).
- Host Git includes/credential helpers may not work inside Docker. Configure
  project identity and transport credentials as needed, or omit host Git config.
- No Docker socket is mounted; Docker/build operations remain host-side.

## Diagnostics and removal

| Symptom | Check |
|---|---|
| Wrong `pi` executable | `command -v pi`; inspect the launcher symlink |
| Missing image | Docker access, `--image`/`PI_DOCKER_IMAGE`, then build the selected image |
| Missing Python/uv/nano/extensions | Select custom; these are absent from base |
| Herdr unavailable | `pi <project> --herdr-status`; see [diagnostics](HERDR_INTEGRATION.md#maintenance-and-diagnostics) |
| Changed resource not active | [Reload/rebuild rules](CUSTOMIZATION.md#applying-changes) |
| Model API unreachable | Check configured URL from host and container; host-local APIs can use `127.0.0.1` |

For Compose diagnostics, supply launcher variables explicitly; output may expose paths:

```bash
PI_CONFIG="$PWD/data/config" GH_CONFIG="$PWD/data/gh-config" \
PI_SESSIONS="$PWD/data/sessions/check" PI_WORKSPACE="$PWD/docs" \
PI_UID="$(id -u)" PI_GID="$(id -g)" \
  docker compose -f compose.yaml config
```

Exit Pi to remove its container. Remove the launcher symlink when no longer
needed. Delete private `data/` only deliberately after backup; model servers are
unaffected.
