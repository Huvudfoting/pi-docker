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

Host Pi, Node.js, and Python are not needed for launching. Git 2.31+ is required
for any selection with an enclosing `.git` marker. Without Git, only successfully
inspected marker-free ordinary directories can launch. Help/local diagnostics
need no Git. Compose must support long-form binds with `create_host_path: false`
and `run --pull never`. For offline tests, see the
[repository README](../README.md#repository-and-tests).

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
# Local custom is selected automatically when available; otherwise base.
```

Choose an existing project. Inside Pi, run `/login` then `/model`, or configure
an existing model API as described in [authentication](AUTHENTICATION.md).
This project does not discover, start, or manage model servers.

For integration, install host Herdr and launch inside its pane with `--herdr`.
New pane shells must resolve `pi` to this launcher. See [Herdr setup](HERDR_INTEGRATION.md#requirements-and-modes).

## Directory layout and persistence

| Host | Container | Access/purpose |
|---|---|---|
| Selected ordinary directory/self-contained checkout | `/workspace` | Writable selected directory |
| Linked/external-metadata checkout | Canonical absolute host checkout path | Whole checkout writable; cwd is exact selected subdirectory |
| Required external Git common directory | Canonical absolute host metadata path | Writable Git metadata; omitted if already contained in checkout |
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

## Worktree mount policy

Select an existing checkout, e.g. `pi /host/path/to/worktree --name reviewer`.
Git discovers checkout root, per-worktree directory and common directory; Docker
preserves required absolute paths instead of rewriting Git pointers. The main
checkout's source files are not mounted just to expose its `.git`. Metadata
already inside a required checkout bind is deduplicated. Unsupported extra
pointer paths, broad/unsafe metadata overlaps, or missing metadata fail closed.
Direct `.git` symlinks to represented physical metadata work; literal metadata
pointers through further symlink aliases are conservatively rejected, including
aliases hidden by `..`. Unrelated unmounted directories visited before `..` are
also rejected, even when the final endpoint is represented. Administrative
`commondir` and reverse `gitdir` files must not be symlink aliases. Pointer files
must contain one line, optionally ending in LF; NULs, embedded controls and extra
lines are unsupported. Symlinked directory selections are canonicalized normally.

Path-preserving checkout/common-metadata destinations may not equal, contain,
or sit below `/pi`, `/run`, `/var/run`, `/var/lock`, `/opt/pi-docker`, `/home/node`,
`/usr`, `/bin`, `/sbin`, `/lib`, `/lib64`, `/etc`, `/dev`, `/proc`, `/sys`, `/boot`,
or `/root`. `/tmp` itself is also reserved, but projects below it are allowed.
Checks use path-component boundaries, not a project-prefix allowlist. Every
bind disables source creation; disappearing sources fail instead of creating
host directories. `/workspace` is not globally reserved: the default project
bind is replaced, not retained beneath a path-preserving layout.

Selected-directory/name conversation storage does not widen to the checkout
root. No checkout creation, Git repair, registry, or automatic cleanup is added.

## Migrating the old layout

Replace the old `setup/bin/pi` launcher symlink with `bin/pi` using step 2 above.
Rebuild base, then custom, and restart containers to refresh the deployment mounts.
Build tags are now `pi-docker:base` and `pi-docker:custom`. Use `./bin/build custom`
in place of the old personal variant. `PI_DOCKER_BASE_IMAGE` is a build input;
`PI_DOCKER_IMAGE` is no longer a launch preference. Private `data/` stays in place;
do not move or regenerate it.

Current native-restore records use image-independent v3 keys and contain only
version, selected directory and storage name. Old v1/v2 records/references are
unsupported and fail clearly; there is no migration, alias loader or deletion of
old files. Physical workspace/name conversation storage is unchanged. Do not
rewrite old records or assume that retaining/tagging legacy images enables them.

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
- Keep secrets only in private `data/`, not deployment paths. Mounting this repository root as the project also
  exposes private `data/` through writable `/workspace`; choose a narrower project
  when possible. Back up credentials, sessions, and restore records privately.
- Be aware: All agents working on the same repository share read/write access
  to its Git metadata, including objects, refs, and configuration, even when
  working in different worktrees.
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
| Missing image | Check Docker access, then build base and optionally custom; selection is automatic |
| Missing Python/uv/nano/extensions | Build custom; these are absent from base |
| Herdr unavailable | `pi <project> --herdr-status`; see [diagnostics](HERDR_INTEGRATION.md#maintenance-and-diagnostics) |
| Changed resource not active | [Reload/rebuild rules](CUSTOMIZATION.md#applying-changes) |
| Model API unreachable | Check configured URL from host and container; host-local APIs can use `127.0.0.1` |

For Compose diagnostics, supply launcher variables explicitly; output may expose paths:

```bash
PI_CONFIG="$PWD/data/config" GH_CONFIG="$PWD/data/gh-config" \
PI_SESSIONS="$PWD/data/sessions/check" PI_WORKSPACE="$PWD/docs" \
PI_CHECKOUT_SOURCE="$PWD/docs" PI_CHECKOUT_TARGET=/workspace PI_WORKDIR=/workspace \
PI_UID="$(id -u)" PI_GID="$(id -g)" \
  docker compose -f compose.yaml config
```

Exit Pi to remove its container. Remove the launcher symlink when no longer
needed. Delete private `data/` only deliberately after backup; model servers are
unaffected.
