# Docker-Pi integration with Herdr

## Current state

The integration is implemented for **local Linux Docker Engine and trusted,
same-user Herdr sessions**. Eligible interactive launches automatically enable
Herdr support, prepare the official Pi extension and operating skill, and print a notice explaining
the session-wide socket access. `--no-herdr` disables integration; `--herdr`
requires it. Native restore always requires integration and never falls back.

The user previously reported a successful core host launch-and-restore trial.
The subsequent automatic detection/extension preparation and container-side
shutdown changes have local test coverage, but still need host validation.
The user has also reported a successful live agent-to-agent `ok` exchange:
shared skill discovery, container CLI session access, peer execution, bounded
wait, and response retrieval all passed. Sibling creation subsequently succeeded
on retry after an improvised host-shell verification likely closed the first
created pane. This does not establish dependable repetition or every
reporting/restore/shutdown regression. Compatibility depends on the
deployed Herdr and Pi releases retaining the reviewed behavior.

This file records architecture, implementation constraints, validation, and
remaining work. Durable user instructions live in
[the Herdr guide](setup/HERDER_INTEGRATION.md), with general deployment details
in [SETUP.md](setup/SETUP.md) and [CUSTOMIZATION.md](setup/CUSTOMIZATION.md).

## Next: dependable communication and creation through a focused skill + script

**Existing-agent communication and a sibling retry succeeded (user-reported).**
The recipe alone left room for unsafe agent improvisation. The next implementation
is a focused Docker-Pi skill backed by a deterministic Python script with `start`
and `ask` operations, using the official Herdr CLI. This is planned, not yet
implemented. Repeated success and controlled failure handling come before worktrees.

Follow [AGENT_COMMUNICATION_PLAN.md](AGENT_COMMUNICATION_PLAN.md) for completed
results, settled version policy, and the host acceptance handoff. Integrated
Compose now forwards the resolved host project as `PI_DOCKER_HOST_WORKSPACE`;
container `/workspace` is not the host project path. Use the official CLI/skill, not a Pi subagent extension or
separate messaging system. Herdr Git worktree integration follows this slice.

## Settled design

- Keep Herdr and its official Pi extension unchanged; do not vendor or fork it.
- Run the official extension inside the container over the selected Unix socket.
- Identify the host Docker/Compose foreground process with `HERDR_AGENT=pi`.
- Preserve Herdr's native `pi --session <path>` restore command.
- Translate managed container session paths into the original host workspace
  and storage selection using private launch records.
- Use upstream integration status and installation, not our own hash/version
  registry or a second lifecycle reporter.
- Keep the base Compose service free of Herdr context/socket mounts; add the
  Herdr override only for enabled launches.
- Preserve ordinary Docker-Pi behavior outside eligible Herdr launches and
  whenever `--no-herdr` is selected.

### Ownership and files

| Responsibility | Owner |
|---|---|
| State/session reports, sequencing, delivery | Official Herdr Pi extension |
| Native Pi resume command and pane lifecycle authority | Herdr |
| Persistent conversations and interactive session switching | Pi |
| Mode selection, host identity, workspace/storage, Docker execution | `setup/bin/pi` |
| Detection, argument/context validation, restore records, local diagnostics | `setup/lib/herdr-launch.sh` |
| Locked extension and skill install/uninstall/ensure operations | `setup/bin/herdr-extension` |
| Host executable resolution, upstream status parsing, version-managed skill publication | `setup/lib/herdr-extension.sh` |
| Pinned Pi/Herdr image build | `setup/pi/build-pi-docker.sh`, `setup/pi/Dockerfile` |
| Container context/socket mounts | `setup/pi/compose.herdr.yaml` |
| Explicit session-wide shutdown | `setup/bin/stop-herdr` |

The libraries are sourced support code; sourcing creates no deployment state.
The executable helper is independent of Docker and session-launch logic.

## Launch selection and failure policy

The launcher parses arguments, resolves workspace/storage, handles diagnostics,
checks Docker/image availability, selects Herdr mode, prepares integration,
configures mounts/environment, and executes Docker Compose.

| Invocation or condition | Behavior |
|---|---|
| Eligible interactive launch with valid local Herdr context | Ensure official extension and skill, print access notice, launch with Herdr |
| No Herdr context | Ordinary launch without integration or a warning |
| Partial/invalid detected context in auto mode | Warn; launch without integration |
| Upstream preparation failure in auto mode | Warn that reporting/native restore are unavailable; launch without integration |
| `--herdr` with invalid context, incompatible arguments, or preparation failure | Abort |
| `--no-herdr` | No detection, installation/update, or socket exposure |
| Native managed-path restore | Validate record, workspace, session, context, and integration; abort on failure |
| Headless, maintenance, or integration-incompatible invocation in auto mode | Ordinary launch; do not install/update |
| Launcher help or `--herdr-status` | No installation or Docker invocation |

Auto eligibility requires Linux, terminal stdin/stdout, `HERDR_ENV=1`, a nonempty
`HERDR_PANE_ID`, and an absolute `HERDR_SOCKET_PATH` selecting an existing Unix
socket owned by the current user. These are local checks, not proof of live
connectivity or pane authority. Never manufacture pane context or probe the
control API merely to detect it.

Explicit `--herdr` and `--no-herdr` are mutually exclusive launcher options,
before Pi arguments. A shell tool's non-TTY status inside a container does not
establish whether the host launch was in Herdr. In-container detection uses
its forwarded Herdr environment and mounted socket, not `PI_*` variables alone.

Herdr mode permits `--continue`/`--resume` and Pi's interactive session commands.
It rejects explicit CLI session/fork paths except the exact native restore
invocation, custom session directories, ephemeral sessions, disabled extension
discovery, headless modes, and maintenance commands. Other original CLI flags
are not recorded for replay.

## Official extension preparation

The managed file is `data/config/extensions/herdr-agent-state.ts`, discovered
normally by Pi at `/pi/agent/extensions/`. It is deliberately exempt from the
general policy of baking downloaded extensions into the image. Do not load it
a second time explicitly. Without Herdr context, it remains inactive.

`setup/bin/herdr-extension` supports:

- `install` (also the default action): force official extension installation/update
  and ensure the operating skill;
- `uninstall`: remove the managed extension, skill, and skill-version marker;
- `ensure`: check upstream extension status and skill version; install only when needed.

The helper resolves its deployment through symlinks, independently of the
working directory. It selects executable `HERDR_BIN_PATH` when supplied,
otherwise `herdr` on `PATH`. A stale explicit binary path is an error, not a
reason to silently select a different installation. It scopes
`PI_CODING_AGENT_DIR=<deployment>/data/config` to upstream CLI invocations,
without changing the caller's environment or host default Pi configuration.
The helper never downloads/upgrades host Herdr. The image includes the official
Linux CLI, pinned with Pi in `setup/pi/build-pi-docker.sh` (currently Herdr 0.9.5,
Pi 1.4.0). Build on the host with `./setup/pi/build-pi-docker.sh`.
Manual preparation needs neither Docker nor an active pane; changed extensions
require a new Pi process/container.
Uninstall preserves credentials, sessions, and launch records; `--no-herdr`
prevents automatic reinstallation in a Herdr pane.

### Shared skill and version policy

The host binary's `herdr --skill` generates
`data/config/skills/herdr/SKILL.md`, discovered at
`/pi/agent/skills/herdr/SKILL.md`. Under the same preparation lock, compare
`herdr --version` with the adjacent `.herdr-version`; refresh only on version
change or missing/empty skill. Stage files before replacement; generation failure
preserves the previous skill and marker. `/reload` refreshes active Pi skill
discovery. The upstream skill remains unchanged; Docker-specific guidance lives
in `setup/AGENTS.md`.

An integrated launch authorizes Herdr features, including peer communication.
Potential host/server/container version mismatches are accepted; rely on upstream
compatibility. Do not add version forwarding, mismatch gates, or automatic server
updates/restarts. The skill marker is not a running-server version check.

### Status and verification

Upstream embeds the official extension in its executable. The reviewed
`integration status` CLI has no JSON option; our parser accepts only one
recognized Pi status line for the exact deployment destination. Unknown,
malformed, duplicate, or failed status output is a preparation failure.

- **Current:** leave the extension untouched, checking it is readable/nonempty.
- **Missing/outdated:** invoke the same binary's `integration install pi`,
  verify a readable/nonempty file, then require current upstream status.

Upstream considers an installed integration version at least as new as expected
current. This is not exact-content matching and does not detect arbitrary local
edits. We follow that compatibility policy rather than maintain a hash registry.

### Concurrency and write boundary

Host `flock` (util-linux) serializes status/install/verification and manual
helper operations, with a 30-second wait on
`data/config/.herdr-integration.lock`. Check status after acquiring the lock,
so concurrent launches do not redundantly install. Keep the lock file: unlinking
it could give concurrent processes different locks. Preserve permissions on
existing shared configuration and leave unrelated files unchanged.

The upstream installer writes directly to its destination, not atomically.
Our lock coordinates helper invocations, not direct upstream CLI commands or
all readers of shared configuration. Atomic staging/publication would require
a separate implementation change; it is not provided by the current installer.

## Container transport and process identity

The process chain remains:

```text
Herdr pane PTY
  -> host pi launcher
    -> docker compose run --rm (HERDR_AGENT=pi)
      -> container PTY
        -> Pi TUI and official Herdr extension
```

The host hint matters because Herdr combines semantic reports with recognized
foreground process presence. Setting the hint only inside the container would
not identify the host wrapper. Ordinary launches clear the wrapper hint.

The override forwards `HERDR_ENV=1`, the current `HERDR_PANE_ID`, and
`HERDR_SOCKET_PATH=/run/herdr/herdr.sock`, binding the exact current host socket
there. Missing bind sources must fail rather than be created. The host
`HERDR_BIN_PATH` is not needed inside the container: reporting uses direct IPC.
The same override forwards `PI_DOCKER_HOST_WORKSPACE` from the launcher's resolved
`PI_WORKSPACE`, including on restore. It is the selected host project root, not
container cwd. Ordinary/opt-out containers do not receive it. The Docker-specific
sibling recipe uses it for split cwd and explicit launcher workspace; a unique
helper alias selects separate conversation storage. Host `pi` must still resolve
to this deployment in new pane shells. No new mounts or helper manager were added.

Retain interactive stdin/TTY, `init: true`, caller UID/GID, dropped capabilities,
`no-new-privileges`, signals, exit-status propagation, and disposable-container
cleanup. There is no Docker socket mount or background supervisor.

## Sessions and native restore

The host session directory remains `data/sessions/<name>-<path-hash>/`, selected
from canonical workspace and launcher name. Standalone containers mount it at
`/pi/sessions`; Herdr mode uses `/pi/herdr-sessions/<storage-key>`. Only the
selected storage is mounted, not the full host session store.

The storage key is SHA-256 of the canonical workspace, a NUL separator, and the
launcher name. A versioned, NUL-delimited record at
`data/herdr-launches/<storage-key>.record` maps it to workspace and name. Records
are private data, never sourced shell code. Publication is atomic; conflicting
records are rejected. They contain no pane IDs or socket paths. Back them up
alongside sessions.

The official extension prefers an absolute session file path over an ID and
reports changes when Pi switches/branches conversations. Herdr passes that
reference to its native command without requiring the file to exist on the host:

```text
pi --session /pi/herdr-sessions/<storage-key>/<session-file>.jsonl
  -> recognize the managed namespace and exact invocation shape
  -> recover canonical workspace/name from a valid owned launch record
  -> validate the existing session stays within that storage
  -> use the restored pane's fresh context and ensure integration
  -> recreate mounts/host hint and open the exact conversation
```

The host `pi` on the restored shell's `PATH` must resolve to this launcher.
Missing/invalid records, moved workspaces, missing session files, path escapes,
and symlink escapes fail rather than select arbitrary mounts or create another
conversation. New conversations must persist a message before they can restore.

The restore promise covers workspace, storage selection, and conversation—not
all original flags. Neither a custom `resume_argv` nor a companion reporter is
needed. A managed restore reference is authoritative routing input only after
validation, not permission to bypass current context/integration checks.

## Reporting, cleanup, and socket authority

The reviewed official extension uses newline-delimited JSON over the socket,
source `herdr:pi`, and agent label `pi`. It reports `working` on `agent_start`,
`idle` on `agent_settled`, session identity through Pi's session manager, and
blocked-state changes through `herdr:blocked`. `agent_end` is not final idle.
It queues the newest pending state and uses bounded delivery attempts rather
than continuous reconciliation. Connectivity/reporting failure does not kill Pi.

Herdr receives state/session reports through `pane.report_agent` and
`pane.report_agent_session`, with sequence numbers suppressing stale reports.
A reported `resume_argv` belongs to the reporter's authority; an independent
reporter must not share its reserved source or sequence stream.

The extension has no explicit shutdown/release handler. Exit cleanup follows
Herdr's process-exit/idle-shell detection, not an added lifecycle owner. A
single-file bind mount can retain an old inode after socket replacement;
automatic recovery is not guaranteed. New containers bind the current endpoint.

The socket exposes the full local control plane, including other panes. Pane
IDs are context, not access restrictions. Auto activation changes the former
explicit-opt-in-only policy: every enabled launch must print the access notice
and identify `--no-herdr` as the opt-out. This is trusted-container integration,
not a hardened sandbox. Retain existing mount/security boundaries and separate
Git worktrees for concurrent writing agents.

### Explicit shutdown

`setup/bin/stop-herdr` is mounted at `/opt/pi-docker/bin/stop-herdr`. It uses
Node's built-in socket client to send one `server.stop` request to the connected
session. It requires Herdr context and a mounted socket, but no host Herdr CLI,
image rebuild, `--yes` flag, or confirmation prompt.

This stops all panes/processes, not just Pi, and is distinct from detach. Agents
must act only on an explicit user request to stop the entire session; clarify
ambiguous exit/detach requests. A bounded acknowledgement wait can end after
the container is terminated; lost acknowledgement is ambiguous. Never retry
automatically. `--help` does not contact Herdr.

## Diagnostics and validation

`pi --help` is available without Docker. `--herdr-status` reports the selected
workspace/storage, expected container session target, extension/record presence,
pane/socket checks, Docker CLI presence, and restore launcher resolution.
It reads no credentials, conversation contents, or record contents; changes
nothing; and invokes neither Docker nor Herdr. It does not check integration
versions. TTY status is informational, allowing redirected diagnostics.
Exit codes are `0` for prerequisites present, `1` for missing prerequisites,
and `2` for invalid arguments/selection. Output includes local paths and pane ID.

Successful local diagnostics do not establish live connectivity, writable
storage, image/daemon availability, version compatibility, or restore readiness.
A missing launch record is normal before the first enabled launch.

### Validation completed

- The user reported the earlier core host launch-and-restore trial succeeded:
  wrapper identification, official state/session reporting, and restoration to
  the same workspace/storage/conversation worked in that deployment.
- The local suite has 31 fake-Docker/fake-Herdr and temporary-socket tests. It
  covers automatic current/missing/outdated preparation, unchanged current
  extensions, executable/configuration targeting, malformed status, opt-out,
  ineligible invocations, strict restore failures, auto fallback, read-only
  diagnostics, concurrent installation once, and shutdown request/response and
  ambiguous-outcome handling without retries. Added coverage includes shared
  skill refresh/no-op/concurrency/failure-safe publication/removal, and build
  wrapper pins, path quoting, argument forwarding, and exit-status propagation.
  Sibling coverage asserts the integrated-only host-root binding contract,
  canonical path selection, explicit separate helper storage, and restored root.
  Fake Docker does not evaluate Compose interpolation or test live helper startup.
- The user reported all live communication acceptance criteria passed: skill
  discovery, CLI access to the connected session, peer execution of
  `Answer only ok`, bounded wait, and retrieval of `ok`. Helper creation and
  exhaustive failure-path testing were not part of that check.
- Bash syntax and scoped whitespace checks passed during implementation.

Run the local suite without contacting a real Herdr server:

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
```

These tests do not replace host validation of automatic preparation and shutdown.
The prior core trial does not establish those subsequent changes or arbitrary
Herdr/Pi version compatibility.

### Host validation still needed

Use a disposable named session so restart/shutdown cannot affect real work:

1. Start `herdr --session pi-docker-trial` on the host.
2. In a pane, run `pi /absolute/path/to/project --name herdr-trial`.
   Verify automatic integration and its access notice. Send a message to persist
   the conversation; observe working/idle reporting using `herdr agent list`
   from another pane.
3. In another host terminal, run `herdr session stop pi-docker-trial`, then
   `herdr --session pi-docker-trial`.
4. Confirm the same project/conversation returns; `/session` should show the
   managed session path.
5. Exercise missing/outdated/current extension preparation and `--no-herdr`
   against the actual host release, using disposable deployment configuration
   where needed to avoid changing shared production state.
6. In the disposable connected session, test the container-side shutdown helper
   and confirm it stops that entire session, not an unrelated default session.

## Remaining work and non-goals

- **Next: focused Docker-Pi skill + script.** Implement the narrow deterministic
  `start`/`ask` workflow planned in
  [AGENT_COMMUNICATION_PLAN.md](AGENT_COMMUNICATION_PLAN.md), with structured
  partial-failure results, bounded operations, and no blind retries or interactive
  shell verification. Keep upstream CLI/skill/reporting unchanged. No Pi tool or
  extension is planned yet; candidate research is informational, not installation.
  See [HERDR_EXTENSION_RESEARCH.md](HERDR_EXTENSION_RESEARCH.md) for the ranked
  alternatives and findings; the skill + script plan remains unchanged and is
  not implemented. Validate repeated host cycles and controlled failures before
  claiming dependability.
- **Subsequent: Herdr Git worktree integration.** Deferred until communication
  and creation have dependable, tested behavior, not just one successful retry.
- **Questionnaire blocked-state adapter — deferred at the user's request.**
  `@juicesharp/rpiv-ask-user-question` emits `rpiv:ask-user:blocked`, whereas the
  official reporter consumes `herdr:blocked`. If implemented, bridge balanced
  active/inactive events locally; do not add a second socket reporter, authority
  source, or sequence owner. Other UI extensions need their own event coverage.
- **Host validation:** complete the automatic preparation and shutdown checks
  above before claiming those paths are verified end to end.
- **Socket replacement recovery:** best-effort reporting is implemented;
  continuous recovery across inode replacement is not.
- **Broader launch-option replay:** only workspace/storage/conversation restore
  is promised. Additional flags need an explicit compatibility policy.
- **Atomic extension publication:** not implemented; helper locking is the
  present concurrency boundary.
- **Additional platforms/transports:** Docker Desktop/macOS, remote Docker,
  Windows named pipes, and a scoped control proxy require separate designs.

Do not describe blocked reporting as universal, socket recovery as transparent,
or the full socket as pane-scoped. None of these follow merely from mounting
it or passing local diagnostics.

## Review references

The original core review recorded Herdr commit
`5608de0608918aba2f9d501e7793b984a0ca9cfa` and Pi integration version 9.
Automatic preparation was subsequently checked against upstream installer/status
source. The links below track `master`, not necessarily the deployed release;
recheck contracts when upgrading rather than assume every release matches.

- [Herdr integration documentation](https://herdr.dev/docs/integrations/)
- [Wrapper process identity](https://herdr.dev/docs/agents/#vms-and-sandbox-wrappers)
- [Socket API](https://herdr.dev/docs/socket-api/)
- [Official Pi extension](https://github.com/herdrdev/herdr/blob/master/src/integration/assets/pi/herdr-agent-state.ts)
- [Embedded assets and expected versions](https://github.com/herdrdev/herdr/blob/master/src/integration/mod.rs)
- [Integration CLI/status output](https://github.com/herdrdev/herdr/blob/master/src/cli/integration.rs)
- [Status/version interpretation](https://github.com/herdrdev/herdr/blob/master/src/integration/registry.rs)
- [Installer actions](https://github.com/herdrdev/herdr/blob/master/src/integration/actions.rs)
- [Extension installation](https://github.com/herdrdev/herdr/blob/master/src/integration/targets.rs)
- [Configuration directory resolution](https://github.com/herdrdev/herdr/blob/master/src/integration/env.rs)
- [Native agent resume](https://github.com/herdrdev/herdr/blob/master/src/agent_resume.rs)
- [Persisted restore](https://github.com/herdrdev/herdr/blob/master/src/persist/restore.rs)
- [Pi upstream repository](https://github.com/earendil-works/pi)

Pi lifecycle/session findings came from installed version-matched documentation
under `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/` and the
installed questionnaire extension's event contract. Consult the installed docs
for current APIs rather than treating this design record as an API reference.
