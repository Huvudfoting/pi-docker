# Herdr integration

Optional Herdr reporting and native restore for Docker-Pi. For everyday Pi
usage, see [README.md](README.md); for installation, see [SETUP.md](SETUP.md).

## Scope and installation

The first integration slice targets **local Linux Docker Engine and trusted
containers**. It uses Herdr's official Pi extension unchanged. The socket grants
container tools and extensions access to Herdr's entire local API, including
other panes; the pane ID is not an access restriction.

On the host, from this deployment's repository root, install the managed
extension into Docker-Pi's configuration (not the host's default `~/.pi/agent`):

```bash
./setup/bin/add-herdr-integration install
```

The action defaults to `install`, so `./setup/bin/add-herdr-integration` works too. The
script resolves its own deployment location, even through a symlink or when
called by absolute path from another directory. It sets
`PI_CODING_AGENT_DIR=<deployment>/data/config` only for the official Herdr CLI
invocation, overriding any inherited setting. It does not change your shell
environment or manufacture pane context. Herdr must already be installed on
the host: the script uses the executable `HERDR_BIN_PATH` supplied by a current
pane, or otherwise `herdr` on `PATH`. No running Herdr session or Docker daemon
is needed for installation.

Re-run `install` after upgrading Herdr to refresh its managed extension. To
remove only that extension:

```bash
./setup/bin/add-herdr-integration uninstall
```

Configuration, credentials, sessions, and launch records are retained. No image
rebuild is needed; start a new container after installing/updating, or launch
without `--herdr` after uninstalling. Existing Pi processes are unchanged.
`./setup/bin/add-herdr-integration --help` describes the installer. A compatible Pi image
and Herdr release are required; this integration follows the upstream behavior
reviewed in the repository's `PLAN.md`.

## Launch and native restore

Inside a Herdr pane, launch:

```bash
pi /absolute/path/to/project --name herdr-trial --herdr
```

The workspace remains the first argument; `--name` and `--herdr` are launcher
options before any Pi arguments. Running ordinary `pi` in Herdr does **not**
expose the socket. `--herdr` requires a TTY, current pane context, an existing
same-user Unix socket, and the installed extension.

Herdr mode mounts the usual selected session storage at
`/pi/herdr-sessions/<storage-key>` instead of `/pi/sessions`. A private launch
record under `data/herdr-launches/` maps that key back to the workspace and
launcher name. Keep those records alongside your sessions; they contain no old
pane IDs or socket paths and must not be sourced or hand-edited as shell code.

On restart, Herdr invokes `pi --session <managed-container-path>`. The host
`pi` on `PATH` must be this launcher. It recovers the original workspace/storage
from the record and uses the restored pane's **fresh** context. Missing records,
workspaces, or session files fail rather than creating a replacement session.

For this first slice, use `--continue` or `--resume` to select an existing
conversation at launch; `/new`, `/resume`, `/fork`, and `/clone` remain Pi UI
operations. Explicit CLI `--session`/`--fork` paths are not supported in Herdr
mode except for the exact native restore invocation. Session-directory
overrides, ephemeral sessions, disabled extension discovery, headless modes,
and maintenance commands are rejected with `--herdr`. Other launch flags are
not recorded for replay; the restore promise is workspace, storage, and the
existing conversation.

## Local diagnostics

```bash
pi /absolute/path/to/project --name herdr-trial --herdr-status
```

This shows the selected workspace/storage, expected container session path,
extension presence, launch-record presence, current pane/socket availability,
and whether `pi` on `PATH` points to this launcher for native restore. It does
not create directories, read credentials or session contents, inspect record
contents, contact the socket, or invoke Docker/Herdr. Output includes local
paths and the pane ID; review it before sharing.

Exit status is `0` when the reported local prerequisites are present, `1` when
something is missing, and `2` for invalid arguments or workspace selection.
A missing launch record is normal before the first Herdr launch. TTY status is
informational for diagnostics, so output can be redirected. Even a successful
status check does not prove socket connectivity, writable storage, image/daemon
availability, version compatibility, or live reporting/restore readiness.
Outside a Herdr pane, missing context is expected. Use `pi --help` for launcher
options; `pi -- --help` forwards to Pi's own help.

## Stop Herdr from inside Pi

To stop the **entire connected Herdr session, including all its panes and
processes**, enter this in Pi's input:

```text
!/opt/pi-docker/bin/stop-herdr
```

For Pi's shell tool or an ordinary container shell, use the same command without
the leading `!`. The helper runs immediately without a confirmation prompt;
use it only when you intend to stop the entire session. It requires a `--herdr`
launch and the current mounted socket. It sends one `server.stop` request to that
endpoint, so it targets the connected session rather than guessing the default
session. It does not require the Herdr CLI, an image rebuild, or a container
restart: the helper is available through the deployment-source mount.

This is **not detach**. To leave Herdr while keeping agents running, use its
default **Ctrl+B, then Q** binding. To exit only Pi, use `/exit`.

Stopping Herdr may terminate this container before its acknowledgement appears.
A lost acknowledgement or timeout means the outcome is unknown; check Herdr
before retrying. The helper never retries automatically. With `--help`, it
does not contact Herdr.

## Short host trial

Start a disposable named Herdr session with `herdr --session pi-docker-trial`.
Launch the command above, send a message so the conversation is persisted, and
observe working/idle reporting with `herdr agent list` from another pane.
In another host terminal, restart that named session:

```bash
herdr session stop pi-docker-trial
herdr --session pi-docker-trial
```

Check that Pi returns to the same project and conversation (`/session` shows
the managed session path). This is the real integration trial; local launcher
checks do not establish that host process detection or Herdr restore works.

Known boundaries: the question extension remains installed, but its blocked
UI events are not yet adapted to Herdr. Exit cleanup follows the official
extension's process-exit/idle-shell behavior, not an added release reporter.
Reporting failures do not terminate Pi; automatic recovery after the host
replaces the socket inode is not guaranteed. Docker Desktop, remote Docker,
and Windows are outside this slice.

