# Herdr integration

Run Docker-Pi inside Herdr with agent status reporting, conversation restore,
and upstream CLI/skill support for pane-to-pane communication.
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

Eligible interactive launches automatically prepare the official Pi extension in
`data/config/extensions/` and the official operating skill in
`data/config/skills/herdr/SKILL.md`, then enable integration with a clear
socket-access notice. An integrated launch authorizes Herdr features, including
agent communication; no separate collaboration confirmation is required.

The image includes the official Linux Herdr CLI (amd64 or arm64) at the version
pinned in `setup/pi/build-pi-docker.sh`, alongside the Pi pin. Build with
`./setup/pi/build-pi-docker.sh` on the host; after changing pins, rebuild and
start new containers. The launcher does not install, upgrade, or enforce version
alignment with host Herdr. Potential host/server/container mismatches are accepted
in favor of upstream compatibility.

One preparation lock protects both shared resources. Extension updates follow
upstream integration status; the skill is generated with the selected host
binary's `herdr --skill` only when missing/empty or its `herdr --version` changes.
The adjacent `.herdr-version` records the installed skill version. Failed skill
generation preserves the previous copy and version. Pi discovers the shared
skill at `/pi/agent/skills/herdr/SKILL.md`; no project-trust change is needed.
Host and image versions may differ until the next rebuild; this slice relies on
upstream CLI/server compatibility, without a custom compatibility layer.

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

To manage both upstream resources manually, run on the host from this repository root:

```bash
./setup/bin/herdr-extension install     # Install/update extension; ensure skill
./setup/bin/herdr-extension ensure      # Prepare both only when needed
./setup/bin/herdr-extension uninstall   # Remove managed extension and skill
```

The helper uses the host Herdr executable and targets this deployment's shared
configuration, not the host's default Pi configuration. Credentials, sessions,
and launch records are retained. Start a new container after changing the
extension; use `/reload` in active Pi sessions to refresh skill discovery.
Use `--no-herdr` to prevent reinstallation after removal. It also disables socket
exposure; a previously installed shared skill can remain discoverable but its
upstream context guard prevents operation outside Herdr.

## Agent communication with an existing peer

**Validated on the host (user-reported):** shared skill discovery, CLI access to
the connected session, peer prompt delivery/execution, bounded wait, and response
retrieval all passed. The smoke task was `Answer only ok`; Agent A retrieved
Agent B's `ok` response. This confirms existing-agent communication, not automatic
helper creation or every failure path.

For normal use, ask Pi to use Herdr to contact a specific existing agent and
collect its answer. The official skill teaches the prompt/wait/read workflow.
No separate communication extension or confirmation is needed in an integrated
launch.

### Repeatable smoke test

After rebuilding on the host, use a disposable named Herdr session with two
existing, idle Docker-Pi agents in separate panes. Do not create helpers or change
real work for this check. In Agent A's container, verify `herdr --version` and
`/skill:herdr` discovery, then use the official CLI directly with its inherited socket:

```bash
herdr agent list
# Set target to the actual helper pane ID or unique live name from that response.
herdr agent get "$target"
herdr agent prompt "$target" "Answer only ok" --wait --timeout 120000
herdr agent read "$target" --source recent-unwrapped --lines 40
```

Pass: Agent B executes a turn, responds `ok`, and Agent A retrieves that response.
Keep the target explicit and the wait/read bounded. A timeout does not prove the
prompt was not delivered: inspect before retrying. No wrapper, message bus,
review workflow, or helper creation is part of this slice. Follow the official
skill for normal CLI operation. Also smoke-test reporting, native restore,
ordinary launches, and `--no-herdr` after rebuilding; the successful `ok` exchange
does not establish those regressions passed.

### Next: creating a helper

A helper is another ordinary Docker-Pi instance in a sibling Herdr pane. The next
slice will let an existing agent create that pane without focus theft, start
Docker-Pi in the intended host project, then reuse this exchange. This is not a
Pi subagent extension or nested Docker launch. Host path translation is still to
be implemented: container `/workspace` must not be used as the host project path.
Automatic sibling creation is not yet validated; see
[the implementation handoff](../AGENT_COMMUNICATION_PLAN.md).

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
