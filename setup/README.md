# Using Pi with Docker

Run Pi in disposable containers with persistent projects, configuration, and
sessions. Local inference uses the shared Ollama service; starting Pi does not
start another model server.

- [Initial installation](SETUP.md)
- [OpenAI/provider login and GitHub authentication](AUTHENTICATION.md)
- [Extensions, resource paths, and maintenance](CUSTOMIZATION.md)

## Launching

Build the image once before launching Pi:

```bash
docker build -t pi-agent:latest ./setup/pi
```

Run these commands on the host after installing the launcher. If the image is
missing, `pi` prints the build command and repository directory to use.

| Command | Action |
|---|---|
| `pi` | Mount the current directory as `/workspace` |
| `pi ~/repos/project-a` | Mount a specific project |
| `pi --name backend` | Use separate session storage in the current project |
| `pi ~/repos/project-a --name frontend` | Select both project and session storage name |
| `pi -- --version` | Forward a Pi CLI argument without selecting a workspace |

`--name` is a launcher option; put it before Pi arguments. Use `--` to pass
remaining arguments directly to Pi.

## Sessions and parallel work

The launcher stores sessions under `data/sessions/<name>-<path-hash>/`. The name
defaults to the workspace directory name; the hash distinguishes absolute paths.
Run the same command again to access that storage, then use Pi's session commands
to resume a conversation. `--name` selects storage, not a conversation title.

Multiple terminals can run separate containers. Each has its own session storage
selection, but all share `data/config/` for settings, models, resources, and
authentication, plus the host's read-only `.gitconfig` and read-only
`data/gh-config/` GitHub CLI configuration.

Use separate Git worktrees for concurrent writing agents. See
[security and concurrency](SETUP.md#security-and-concurrency) for shared-state risks.

## Herdr

The first integration slice targets **local Linux Docker Engine and trusted
containers**. It uses Herdr's official Pi extension unchanged. The socket grants
container tools and extensions access to Herdr's entire local API, including
other panes; the pane ID is not an access restriction.

On the host, from this deployment's repository root, install the managed
extension into Docker-Pi's configuration (not the host's default `~/.pi/agent`):

```bash
mkdir -p data/config
PI_CODING_AGENT_DIR="$PWD/data/config" herdr integration install pi
```

Use the same directory override when reinstalling/updating or uninstalling the
integration. No image rebuild is needed for the launcher/Compose changes or
this managed extension. Start a new container after installing it. A compatible
Pi image and Herdr release are required; this slice follows the upstream
behavior reviewed in the repository's `PLAN.md`.

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

### Short host trial

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

## GitHub CLI

`gh` is available through Pi's shell tool for issues, PRs, and GitHub API queries.
Optional private repository authentication uses a read-only mount of
`data/gh-config/`; see [GitHub authentication](AUTHENTICATION.md#github-cli-optional).
For example, ask Pi to run `gh issue list`, `gh issue view 123`, or `gh pr checks`.
Agree on confirmation rules before allowing remote changes such as posting
comments, closing issues, or merging PRs. Installing `gh` does not automatically
configure Git pushes.

## Inside Pi

- `/model`: select a configured local or cloud model independently per instance.
- `/exit`: exit Pi and remove its temporary container, retaining host data.
- `/reload`: reload changed settings and mounted resources in that session.

Deployment guides and source are readable at `/opt/pi-docker` inside the container.
For reload/rebuild rules, see [applying changes](CUSTOMIZATION.md#applying-changes).
