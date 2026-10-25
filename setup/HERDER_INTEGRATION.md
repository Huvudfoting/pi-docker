# Herdr integration

Run Docker-Pi inside Herdr with agent status reporting and conversation restore.
For general installation and usage, see [SETUP.md](SETUP.md) and
[README.md](README.md).

## Scope and installation

Supported with **local Linux Docker Engine and trusted containers**. The mounted
Herdr socket grants control of the **entire connected session**, including other
panes; the pane ID is not an access restriction. Docker Desktop, remote Docker,
and Windows are not supported.

Install Herdr on the host, put this deployment's [Pi launcher on PATH](SETUP.md#3-install-the-host-launcher-symlink),
and ensure `flock` (util-linux) is available. Inside a Herdr pane, run:

```bash
pi /absolute/path/to/project --name backend
```

Eligible interactive launches automatically install/update the official Pi
extension in `data/config/extensions/` and enable integration, with a clear
socket-access notice. The launcher does not install or upgrade Herdr itself.
No image rebuild is needed.

## Launch modes

Put the workspace first, then launcher options, before any Pi arguments.

| Mode | Behavior |
|---|---|
| Default (auto) | Enable in an interactive Herdr pane; warn and launch without integration if preparation fails |
| `--herdr` | Require integration; abort if context or preparation is invalid |
| `--no-herdr` | Skip integration preparation and socket exposure |

Integration requires terminal stdin/stdout, current Herdr pane context, and an
existing same-user Unix socket. Headless, maintenance, and incompatible session
options do not auto-enable it. Outside Herdr, launches remain ordinary Pi sessions.

To manage the extension manually, run on the host from this repository root:

```bash
./setup/bin/herdr-extension install     # Install or force an update
./setup/bin/herdr-extension ensure      # Install/update only when needed
./setup/bin/herdr-extension uninstall   # Remove only the managed extension
```

The helper uses the host Herdr executable and targets this deployment's shared
configuration, not the host's default Pi configuration. Credentials, sessions,
and launch records are retained. Start a new container after changing the
extension; use `--no-herdr` to prevent reinstallation after removal.

## Sessions and restore

Use `--continue` or `--resume` to select an existing conversation at launch.
Pi's interactive `/new`, `/resume`, `/fork`, and `/clone` commands remain available.
Herdr mode requires persistent sessions and normal extension discovery; custom
CLI session/fork paths, session-directory overrides, and ephemeral sessions
are not supported.

Herdr restores the original workspace, storage selection, and conversation—not
all original CLI flags. The host `pi` on `PATH` must remain this launcher.
Back up `data/herdr-launches/` alongside `data/sessions/`: restore needs both.
Inside the container, Herdr sessions live under `/pi/herdr-sessions/<key>`.
Missing records, workspaces, or session files abort restore rather than create
a replacement conversation. Restore never falls back to an ordinary launch.

## Diagnostics

Run on the host with the same workspace and storage name used to launch:

```bash
pi /absolute/path/to/project --name backend --herdr-status
```

This checks local paths, extension and launch-record presence, pane/socket
context, and the launcher on `PATH`. It changes nothing, reads no credentials
or conversation contents, and invokes neither Docker nor Herdr. Exit codes are
`0` for prerequisites present, `1` for missing prerequisites, and `2` for invalid
arguments. A missing launch record is normal before the first integrated launch.

A successful check does not prove live connectivity, version compatibility, or
restore readiness. Output includes local paths and the pane ID; review before
sharing. If the host socket is replaced, start a new container rather than rely
on the existing mount reconnecting.

## Exit, detach, or stop

- **Exit only Pi:** `/exit`.
- **Detach while keeping agents running:** Herdr's default **Ctrl+B, then Q**.
- **Stop the entire connected Herdr session, including all panes and processes:**
  enter this in Pi:

  ```text
  !/opt/pi-docker/bin/stop-herdr
  ```

In Pi's shell tool or a container shell, omit the leading `!`. Shutdown requires
an integrated launch and its mounted socket, and runs **immediately without a
confirmation prompt**. The container may terminate before acknowledgement;
check Herdr before retrying an ambiguous result. The helper never retries
automatically. Use `--help` to inspect usage without contacting Herdr.
