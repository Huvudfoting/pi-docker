# Docker-Pi integration with Herdr

## Purpose and agreed scope

Integrate Docker-Pi with Herdr while remaining as close as possible to the
official Herdr Pi integration. This is a conceptual architecture and feasibility
plan, not a detailed implementation procedure or test plan.

The initial scope is:

- local Linux with a local Docker Engine and same-user Herdr;
- the official Herdr Pi extension and Herdr itself remain unchanged;
- trusted containers, with explicit access to Herdr's full local socket API;
- interactive Pi operation, including native session restore;
- unchanged standalone Docker-Pi behavior.

The central design is:

> Run the unchanged official Herdr Pi extension inside the container over an
> opt-in socket mount. Identify the host Docker wrapper as Pi with
> `HERDR_AGENT=pi`. Preserve Herdr's native `pi --session <path>` restoration by
> giving Herdr-mode sessions a wrapper-recognizable path namespace and retaining
> a minimal host-side workspace/storage mapping. Do not implement a second
> lifecycle reporter.

This design is conceptually feasible with the reviewed upstream behavior. It
has not been runtime-validated, and compatibility depends on that behavior
remaining available in the deployed Herdr and Pi versions.

## Documentation and source references

### Herdr

- https://herdr.dev/docs/
- https://herdr.dev/docs/add-herdr-support/
- https://herdr.dev/docs/integrations/
- https://herdr.dev/docs/agents/#vms-and-sandbox-wrappers
- https://herdr.dev/docs/socket-api/
- https://github.com/herdrdev/herdr/blob/master/docs/next/website/src/content/docs/socket-api.mdx
- https://github.com/herdrdev/herdr/blob/master/src/integration/assets/pi/herdr-agent-state.ts
- https://github.com/herdrdev/herdr/blob/master/src/integration/actions.rs
- https://github.com/herdrdev/herdr/blob/master/src/integration/targets.rs
- https://github.com/herdrdev/herdr/blob/master/src/api/schema/agents.rs
- https://github.com/herdrdev/herdr/blob/master/src/api/schema/panes.rs
- https://github.com/herdrdev/herdr/blob/master/src/agent_resume.rs
- https://github.com/herdrdev/herdr/blob/master/src/terminal/state.rs
- https://github.com/herdrdev/herdr/blob/master/src/platform/linux.rs
- https://github.com/herdrdev/herdr/blob/master/src/platform/mod.rs
- https://github.com/herdrdev/herdr/blob/master/src/pane.rs
- https://github.com/herdrdev/herdr/blob/master/src/app/api/panes.rs
- https://github.com/herdrdev/herdr/blob/master/src/persist/restore.rs

The review examined Herdr commit
`5608de0608918aba2f9d501e7793b984a0ca9cfa`, including Pi integration version 9.
The `master` links above are moving references; findings describe the reviewed
source, not a guarantee about every released version.

### Pi

The installed Pi documentation was read from:

- `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/README.md`
- `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/cli.md`
- `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/cli-integration.md`
- `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/usage.md`
- `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/sessions.md`
- `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/session-format.md`
- `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/configuration.md`
- `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/environment-variables.md`
- `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/containerization.md`
- `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md`

The corresponding upstream Pi repository is:

- https://github.com/earendil-works/pi

### Docker-Pi and installed resources

- `README.md`
- `setup/README.md`
- `setup/SETUP.md`
- `setup/AUTHENTICATION.md`
- `setup/CUSTOMIZATION.md`
- `setup/AGENTS.md`
- `setup/bin/pi`
- `setup/pi/compose.yaml`
- `setup/pi/Dockerfile`
- `/usr/local/lib/node_modules/@juicesharp/rpiv-ask-user-question/events.ts`

## Findings

### Herdr context, transport, and authority

Herdr supplies pane processes with `HERDR_ENV=1`, `HERDR_PANE_ID`,
`HERDR_BIN_PATH`, and `HERDR_SOCKET_PATH`. The official Pi extension uses
newline-delimited JSON directly over the Unix socket; it does not need to
execute the host Herdr binary inside the container.

Herdr accepts semantic state and session reports through `pane.report_agent`
and `pane.report_agent_session`. Sequence numbers suppress stale reports.
Reports must remain bounded and failure-tolerant.

Herdr's official lifecycle authority also interacts with recognized foreground
process presence. A successful socket write alone does not establish that a
report was accepted as authoritative. Host-visible wrappers can identify their
agent through `HERDR_AGENT=<agent>`. This hint must be visible on the host
foreground process; setting it only inside a container is insufficient.

A reported `resume_argv` takes precedence over native restore, but belongs to
the reporter holding the pane. An independent companion cannot simply attach a
resume command to the official extension's authority under another source.
Sharing its reserved source would introduce sequence and ownership coupling.

### Official Pi extension

`herdr integration install pi` installs the Herdr-managed
`herdr-agent-state.ts`. Herdr may overwrite that file on reinstall or update.

The reviewed extension:

- uses source `herdr:pi` and visible agent label `pi`;
- reports only for interactive TUI sessions;
- connects directly to `HERDR_SOCKET_PATH`;
- reports `working` on `agent_start` and `idle` on `agent_settled`;
- receives blocked-state changes through the `herdr:blocked` extension event;
- obtains session identity from Pi's session manager;
- prefers an absolute session file path over a session ID;
- reports session changes without supplying a wrapper-aware `resume_argv`;
- queues the newest state while delivery is in flight;
- uses bounded delivery attempts rather than continuous background recovery;
- does not make Herdr connectivity a reason for Pi to fail;
- does not register a shutdown/release handler.

Docker-Pi must not fork, modify, vendor, or silently replace this extension.
Preserving it also means acknowledging its existing cleanup and recovery
limitations rather than claiming capabilities it does not provide.

### Native restore behavior

For official Pi session references, Herdr constructs:

```text
pi --session <reported-path-or-id>
```

Because the extension prefers paths, the normal persisted reference is a
container-local absolute session filename. Herdr's reviewed native restore code
passes that reference to the command; it does not require the file to exist on
the host before invoking `pi`.

The command does not retain Docker-Pi's workspace argument, `--herdr`, or
launcher `--name`. Constructing a different command inside the launcher does
not communicate it to Herdr.

The restore entry point must therefore adapt to this native command shape.
Using `--session-id` instead is not the preferred solution: Pi can create a new
session if that ID is absent. Restore must reopen the intended existing file,
not silently substitute a new conversation.

### Pi lifecycle, sessions, and modes

Pi extensions run with the Pi process's OS permissions. The lifecycle provides
`session_start`, `agent_start`, `agent_settled`, and shutdown hooks.
`agent_end` is not a final-idle signal because automatic work may continue.

Pi supports persistent sessions through `PI_CODING_AGENT_SESSION_DIR` and
`--session-dir`. Session switching and branching remain Pi responsibilities.
The official extension refreshes session identity as those operations occur.

Pi also supports print, JSON, and RPC modes. These are not interactive Herdr
reporting targets. The host process hint must not indiscriminately identify
headless operations as interactive Pi agents.

### Current Docker-Pi boundary

The launcher resolves its deployment repository independently of the workspace,
selects storage deterministically from the canonical workspace and launcher
name, and runs `docker compose run --rm pi`.

Current mounts include:

| Host resource | Container location |
|---|---|
| `data/config/` | `/pi/agent` |
| `data/sessions/<name>-<path-hash>/` | `/pi/sessions` |
| Selected project | `/workspace` |
| Non-secret deployment source | `/opt/pi-docker` (read-only) |

The container retains stdin/TTY, `init: true`, caller UID/GID, dropped
capabilities, and `no-new-privileges`. No Docker socket is mounted. These
properties should remain; only the Herdr-specific session mount target needs
to differ from standalone operation.

## Proposed architecture

### Responsibility boundary

| Responsibility | Owner |
|---|---|
| State, session reports, sequencing | Official Herdr Pi extension |
| Native Pi resume command | Herdr |
| Host foreground identity and Docker restore routing | Docker-Pi launcher |
| Workspace/storage selection and mounts | Docker-Pi launcher |
| Persistent conversations and session switching | Pi |

The launcher must not report lifecycle state, watch session files for state
changes, or maintain a parallel Herdr sequence stream.

### Initial explicit launch

A Docker-Pi-specific `--herdr` option opts into integration. The launcher
requires valid current Herdr context, selects the usual workspace and storage,
and retains a minimal launch record as described below.

For interactive Herdr operation, it scopes `HERDR_AGENT=pi` to the host-side
Docker/Compose invocation. The hint is not a global shell setting and is not
merely a container environment variable.

Inside the container, the launcher supplies:

- `HERDR_ENV=1`;
- the current `HERDR_PANE_ID`;
- `HERDR_SOCKET_PATH` pointing to a fixed container endpoint such as
  `/run/herdr/herdr.sock`;
- a bind mount of the exact socket selected by the current host Herdr context.

There is no need to forward `HERDR_BIN_PATH`: the extension uses direct IPC,
and a host executable path must not be assumed executable inside the container.

### Compose boundary

Prefer a separate Herdr Compose override, leaving the default service's
standalone behavior unchanged. The Herdr additions provide context forwarding,
the socket mount, and the Herdr-specific session mount target and environment.

The architectural requirements are:

- no Herdr socket mount in standalone mode;
- no silent creation of a missing socket source;
- only the selected session directory is exposed, not the entire host session
  store;
- the session-directory environment matches the Herdr-specific mount target;
- interactive transport, security options, and disposable-container lifecycle
  remain intact.

The precise YAML is an implementation detail, not an unresolved architecture
choice.

### Extension installation and discovery

Herdr remains the installation and update authority. On the host, its
`PI_CODING_AGENT_DIR` must explicitly select this deployment's `data/config/`
directory. A normal host install targeting `~/.pi/agent` does not automatically
install into Docker-Pi's configuration.

That host directory maps to `/pi/agent`, where Pi's normal user-extension
discovery loads the managed file. Explicit duplicate loading is unnecessary.
Without Herdr context, the discovered extension remains inactive; standalone
operation must neither require nor activate it.

This is a deliberate exception to `setup/CUSTOMIZATION.md`'s general rule that
third-party extensions are npm packages baked into the image. This particular
file is installed and maintained by Herdr, not Docker-Pi. The deployment policy
should explain that exception when integration is implemented.

## Session and restore design

### Recognizable container session namespace

For Herdr mode, expose the selected host session directory at a distinctive
container path, conceptually:

```text
/pi/herdr-sessions/<storage-key>/<session-file>.jsonl
```

The spelling is illustrative. The namespace must be stable across containers,
identify the storage selection unambiguously, and distinguish different
workspace/name selections. The underlying host directory remains
`data/sessions/<name>-<path-hash>/`; standalone operation retains `/pi/sessions`.

The official extension reports the actual file under this namespace. It is a
container path understood by the Docker-Pi restore entry point, not a claim
that the same path exists on the host. This relies on the reviewed Herdr native
Pi restore behavior of passing the path to `pi` without resolving it itself.

Session operations within the selected storage continue to work normally.
When `/new`, `/resume`, `/fork`, or `/clone` changes the conversation, the
extension reports the new filename under the same storage namespace.

### Minimal persistent launch record

A host-side record associates the storage key with:

- the canonical host workspace;
- the launcher name/storage selection;
- the fact that this selection was explicitly enabled for Herdr.

Keep it in private deployment state under `data/`. It describes a launch
selection, not agent activity, and does not require a watcher or reporter.
The key-to-selection association must remain unambiguous across launches.

This mapping is needed because the workspace hash is not reversible, Pi sees
`/workspace`, and Herdr's restored shell directory may differ from the project
explicitly selected at initial launch.

Do not persist pane IDs or socket endpoints in the record. Restored containers
must use the fresh Herdr context, not reconnect to a previous pane or server.

The initial restore promise covers workspace, storage selection, and the exact
conversation. It does not promise arbitrary replay of every original CLI flag.
User-selected session storage overrides must have an explicit compatibility
policy rather than silently escaping this managed namespace. Ephemeral
`--no-session` runs cannot provide native conversation restore.

### Native restore entry point

The restore flow is:

```text
Herdr restarts and supplies fresh pane context
  -> pi --session <managed-container-session-path>
    -> host launcher recognizes the Docker-Pi namespace
      -> launch record recovers workspace and storage selection
        -> launcher restores Herdr-mode mounts and host process hint
          -> Pi opens the exact existing session file
```

The plain host command `pi` must resolve to this deployment's launcher on the
restored shell's `PATH`. No custom `resume_argv` or companion session reporter
is needed.

The literal `--herdr` flag does not survive native restore. Re-entry is instead
allowed only when a managed namespace reference resolves to an existing
Herdr-enabled launch record and valid current Herdr context is present. This is
continuation of an earlier explicit opt-in, not automatic integration whenever
`HERDR_ENV=1` is inherited.

Unknown, stale, missing, or out-of-scope references must fail clearly rather
than selecting another workspace, mounting an arbitrary path, or creating a
replacement conversation. Ordinary Pi arguments remain ordinary unless they
match this narrowly defined managed restore entry point.

## Blocked-state coverage

The official extension consumes `herdr:blocked`. The installed
`@juicesharp/rpiv-ask-user-question` exposes `rpiv:ask-user:blocked`, so its
question dialogs do not automatically reach the official reporter through that
event contract.

Use a small local event adapter for the known question-extension contract if
blocked reporting for those dialogs is required. It should translate balanced
active/inactive events into `herdr:blocked`, not issue Herdr socket requests,
claim authority, or own sequence numbers. Other UI extensions must likewise
participate in the event contract to provide blocked-state coverage.

Do not describe blocked reporting as universal simply because the socket is
mounted. State reporting remains owned by the official extension.

## TTY, signals, cleanup, and connectivity

Preserve the existing interactive process chain:

```text
Herdr pane PTY
  -> host pi launcher
    -> docker compose (host-visible HERDR_AGENT=pi)
      -> container PTY
        -> Pi TUI and official Herdr extension
```

Do not pipe Pi's stdin/stdout, force print mode, or replace the existing
`docker compose run --rm` lifecycle. Preserve `init: true`, signal and
exit-status behavior, and Compose's disposable-container cleanup.

The reviewed official extension has no explicit release handler. Preserving
upstream behavior means relying on Herdr's process-exit/idle-shell detection
for normal as well as unexpected exit cleanup. The host process identity hint
helps Herdr associate that lifetime with Pi. Do not claim explicit release or
add a second lifecycle owner merely to imitate the generic integration guide.

Connectivity failures must not terminate Pi, but transparent recovery is not
promised:

- delivery attempts are bounded per report, not continuous reconciliation;
- a single-file socket bind mount can retain an old socket inode if the host
  unlinks and recreates its endpoint;
- a fresh container launch binds the current endpoint, but an existing
  container is not guaranteed to recover automatically after replacement.

The initial guarantee is failure tolerance, not uninterrupted reporting across
every server/socket lifecycle.

## Trust and security consequences

The accepted initial trust model permits the container to access Herdr's full
local control plane. A pane ID is context, not a permission boundary: extensions
and shell tools can use the socket to control unrelated panes and other Herdr
resources.

Accordingly:

- expose the socket only on initial explicit Herdr launch or validated native
  restore of an earlier opt-in;
- use exactly the current context's socket and verify the mount source is a
  socket, not an arbitrary host resource;
- keep the ordinary Compose service free of the Herdr socket;
- keep managed restore references constrained to known storage selections;
- retain existing UID/GID, capability, and mount restrictions;
- document that Docker-Pi provides process/filesystem isolation, not a hardened
  sandbox.

A scoped proxy would be a separate future security architecture. It is not
required by the trusted-container scope and should not complicate the initial
design. Docker Desktop/macOS, remote Docker daemons, and Windows named pipes
also require separate transport designs and are outside this plan.

## Expected behavior

| Invocation or condition | Expected behavior |
|---|---|
| Standalone `pi`, including inside a Herdr shell without opt-in | Existing Docker-Pi behavior; no Herdr socket exposure |
| `pi --herdr` without valid Herdr context/socket | Refuse the explicit integration path |
| Interactive `pi --herdr` in a Herdr pane | Host identifies wrapper as Pi; official extension reports state/session |
| Native `pi --session <managed-path>` restore with valid record/context | Recover workspace/storage, enter Herdr mode, reopen exact conversation |
| Invalid or stale managed restore reference | Clear failure; no fallback conversation or arbitrary mounts |
| Discovered managed extension outside Herdr mode | Inactive and not required for standalone use |
| Headless Pi operation | No official TUI reporting or indiscriminate interactive host hint |
| Participating question UI plus event adapter | Blocked transitions reach the official reporter |
| Temporary connectivity failure | Pi continues; delivery remains best-effort |
| Host replaces the socket inode | Existing mount may remain stale; automatic recovery not guaranteed |
| Pi/container exits | Herdr's process-exit/idle-shell cleanup clears authority |

## Architectural decisions and remaining boundaries

The conceptual decisions are settled:

- unchanged official extension, direct socket transport, no parallel reporter;
- host-side `HERDR_AGENT=pi` for interactive integration;
- native Herdr restore command retained;
- managed session-path namespace plus minimal persistent host launch record;
- standard extension discovery with host installation targeting `data/config`;
- separate Herdr Compose override;
- local Linux and full-socket trusted-container scope.

Implementation must choose the namespace spelling, storage-key/record format,
and argument-handling details without changing these responsibilities. It must
also define handling of session-directory overrides and any additional launch
options beyond the minimum restore promise. These are bounded compatibility
details, not reasons to introduce a custom lifecycle integration.

The resulting integration follows official Pi reporting and native Herdr
restore while confining Docker-specific adaptation to host process identity,
mounts, and the launcher's restore entry point.
