# Phase 1 host mount-contract verification

This is an **experimental standalone harness**, not the production launcher.
It tests a Bash/Git discovery helper and small static Compose files. It does not
change `bin/pi`, load deployment Compose, or claim production-launcher coverage.
The mount suite requires no host Node.js, Python, or Herdr. Node runs only inside
the image. The **separate Herdr contract suite** below requires host Herdr and
`jq`, but neither Docker nor host Node/Python.

## 1. Offline checks (also runnable inside the agent container)

```bash
bash tests/host/test-mount-contract.sh
bash tests/host/test-preflight.sh
```

These use unique temporary repositories, remove only their own fixtures on exit,
and need Bash, Git, and GNU core utilities. The discovery tests include no-Git
fallback, deep ancestor markers, dangling markers, reserved-path boundaries,
selected subdirectories, unusual path characters, symlinks, broken pointers,
separate Git directories, and contained-metadata deduplication. The unreadable
ancestor assertion is explicitly skipped for users who bypass file permissions.
The preflight tests use a fake Docker CLI, not a daemon. They also verify that
batch probes disable TTY/interactivity and receive `/dev/null` as stdin.

## 2. Read-only host preflight

From **the host checkout of this repository**, as your normal Docker-enabled
user (not root/sudo):

```bash
bash tests/host/verify-worktree-mounts.sh --preflight
```

Requires Linux, local Linux Docker Engine through a Unix socket, Docker Compose
v2 with `config --format json` and `run --pull never`, host Git supporting
`rev-parse --path-format=absolute` (Git 2.31+), Bash, and GNU core utilities
including `realpath` and `timeout`. It checks the tools/daemon and selects the
local `pi-docker:custom` image if present, otherwise `pi-docker:base`. A daemon
or image-inspection failure is not interpreted as custom-image absence. It does
not pull/build images or create test files/containers. It prints only selected
version/image metadata, not configuration or credentials.

If neither usable image exists, build base on the host with `./bin/build` first.
Docker Desktop, remote daemons, socket forwarding to another host, and userns
remapping/rootless configurations that cannot bind-write as the supplied host
UID are outside this harness's verified target. Do not run it against a remote
host just because a forwarded endpoint looks like a local Unix socket.

## 3. Run the isolated host suite

```bash
bash tests/host/verify-worktree-mounts.sh --run
```

The suite pins the image ID selected during preflight and creates a unique
`/tmp/pi-docker-mount.XXXXXXXX/` directory. It runs fixed test code, not Pi.
The container probe reads image-owned package metadata and requires Pi **1.5.2**;
rebuild your base/custom images first. This catches a custom image still derived
from the older base without launching Pi or loading extensions.
Containers have:

- Only test checkout/metadata binds and this test-code directory mounted.
- No real Pi configuration, credentials, conversations, Git configuration, Docker
  socket, or Herdr context/socket mounted or forwarded.
- No networking, a read-only root filesystem, writable temporary `/tmp`, dropped
  capabilities, no-new-privileges, a 512 MiB memory limit, and a 128-process limit.
- The current host UID/GID; never add repository trust automatically.

Fixtures use isolated Git configuration, fixed test authors, and disabled hooks
and commit signing. All checkout/ref/index mutations stay in disposable fixture
repositories. Caller `--image`/`PI_DOCKER_IMAGE` preferences are not inputs.
Compose uses explicit files/project name and `/dev/null` as its environment file;
it does not load the repository's `.env` or deployment configuration.

### Assertions

- Ordinary directories/checkouts retain `/workspace` behavior.
- Linked checkout/common metadata mounts preserve host paths, are writable, and
  leave no residual `/workspace` bind. Runtime mount information is checked.
- Main checkout source files are not exposed through metadata-only mounts.
- Status, unstaged/staged diff, add, commit, log, and worktree listing work.
- Main staged files/index and another worktree's index stay unchanged when a
  child commits. Two writing containers rendezvous at a fixture-only shared
  metadata barrier before committing in distinct worktrees.
- Deep subdirectory cwd, spaces/quotes/dollar/colon characters, canonical symlink
  selection, nested worktrees, and separate Git directories work.
- A direct `.git` symlink to represented physical metadata works inside Docker.
- Missing checkout/metadata bind sources fail without being created; errors must
  actually identify the missing source, not an unrelated operational failure.
- Container exit leaves fixture worktrees intact.

The reserved-path and malformed-pointer checks run offline before containers;
the suite never mounts host runtime directories to test rejection. The reviewed
policy and remaining adoption gates are recorded in `MOUNT_CONTRACT.md`. Current
checks include direct `.git` symlinks and refusal of pointer aliases whose
canonical endpoints conceal unavailable intermediate paths. This is mount and
index separation, **not a security boundary around shared Git metadata**.

### Results and ambiguous failures

The runner stops on failure and prints:

- `report.txt`: sanitized output, versions/image ID, pass/fail assertions.
- `logs/`: raw per-check output for local inspection.
- `effective-linked-compose.json`: the experimental merged configuration.
- `containers.txt`: names recorded before container startup attempts.
- `fixtures/`: all disposable repositories, retained even on success.

**Return `report.txt` first.** It replaces fixture and test-code paths with
placeholders and strips terminal control bytes. Review it before sharing; Docker
errors may still include host-specific details. Raw logs/configuration contain
local paths; share those only if needed and reviewed. No real conversations or
credentials should appear in any artifact because they are not test inputs.

Each batch command explicitly uses `-T --interactive=false` and stdin from
`/dev/null`; it must not read the host terminal from the timeout process group.
Container output is buffered in `logs/check-N.log` until the check finishes.
Each container command has a 120-second timeout, with a further five-second
local CLI kill grace period. A timeout/cancellation may leave remote work running;
container names do not imply startup was confirmed. Do not
blindly rerun the suite, remove resources, or interpret a timeout as a successful
negative test. Inspect the recorded names first, for example:

```bash
docker container inspect --format '{{.Name}} {{.State.Status}} {{.State.ExitCode}}' <recorded-name>
```

Successful/exited test containers use `--rm`; no worktrees or fixture directories
are automatically removed by the host suite. After reviewing results and
confirming no recorded container remains running, you may explicitly delete the
**exact generated test directory**. All its repositories and worktree metadata
are self-contained disposable fixtures, not registrations in your real project.
Do not use broad cleanup commands such as `docker system prune`.

## 4. Separate disposable Herdr contract suite

`verify-herdr-contract.sh` uses the official CLI to test Herdr lifecycle semantics,
**without Docker or Pi startup**. Requirements: Linux, normal (non-root) user,
Bash, Git 2.31+, `jq` 1.6+, GNU `realpath`/`timeout`, host `pi` resolving directly
(or through a symlink) to this deployment's launcher, and reviewed Herdr
CLI/server **0.9.5**. A different version fails closed: return its preflight
output for review; do not upgrade/restart a server to make the harness pass.
Use an uncomplicated interactive shell without long-running startup commands.

### Create a genuinely separate session yourself

From a **new host terminal outside your existing Herdr session**:

```bash
herdr --session "pi-docker-phase1-$(date +%Y%m%d-%H%M%S)"
```

This explicitly launches a disposable session. Inside its initial real shell
pane, change to the actual **host checkout** containing these harness files:

```bash
cd /absolute/host/path/to/this-checkout
type -a pi
bash tests/host/verify-herdr-contract.sh --preflight --launcher "$PWD/bin/pi"
```

Inspect `type -a pi`: the command must resolve to this deployment, not an unrelated
Pi installation or shell function. The script verifies the executable/symlink on
PATH against the supplied absolute launcher path without executing it. If your
launcher installation lives elsewhere, supply its actual path; never infer host
paths from container `/workspace`. Preflight checks inherited `HERDR_ENV`, caller
pane and socket, server version/protocol, and that only the initial workspace,
tab and pane exist with no agents. It performs no mutation or file creation.
Do not export fabricated caller/session/socket variables or retarget a server.

After preflight passes, in that same disposable shell:

```bash
bash tests/host/verify-herdr-contract.sh --run --launcher "$PWD/bin/pi" \
  --confirm-disposable-session
```

The confirmation flag attests that **you created this session for disposable
tests**; one-pane topology alone cannot establish that. Never use your work
session, even if it currently has just one pane. The harness does not launch,
stop, upgrade, or restart any session/server, agent or Docker container.

### Contract assertions

The harness uses the tagged upstream [CLI reference](https://github.com/herdrdev/herdr/blob/v0.9.5/docs/next/website/src/content/docs/cli-reference.mdx),
[response schema](https://github.com/herdrdev/herdr/blob/v0.9.5/src/api/schema/response.rs),
[pane schema](https://github.com/herdrdev/herdr/blob/v0.9.5/src/api/schema/panes.rs),
and [worktree implementation](https://github.com/herdrdev/herdr/tree/v0.9.5/src/app/api/worktrees).
These are source-level evidence; only the returned host report establishes live
behavior on your installation.

- Create returns checkout/workspace/tab/root-pane identities, already opens the
  checkout, and establishes common parent/child provenance without another split.
- Read-only listing from a linked source discovers the parent; create/open from
  that linked source fail with `linked_worktree_source`. Subsequent operations
  select the returned parent explicitly, never a focused workspace fallback.
- Open reuses an existing workspace/pane with `already_open`; close retains its
  checkout; opening that closed checkout returns a new workspace.
- Dirty removal returns `dirty_worktree_requires_force`, retains the edit and
  open workspace, and is never retried with force. A separate planned assertion
  restores only the fixture file we wrote, then explicitly removes the exact
  clean linked workspace, verifies its checkout/workspace are gone and branch
  retained. This is an intentional test step, not failure cleanup.
- A bounded foreground fixture shell process occupies a second test-created
  worktree pane. Inspection detects it; open returns the same occupied pane and
  process group. No agent is started or replaced. Its release file is written
  only on normal test completion; otherwise it exits itself after at most 60
  one-second iterations (plus scheduling time).
- Focus remains on the original workspace/tab/pane. No `--force`, repository
  trust override, branch deletion, extra topology, or automatic cleanup.

### Results and partial failure

The unique `/tmp/pi-herdr-contract.XXXXXXXX/` directory is retained:

- `report.txt`: sanitized per-step status/identity summaries and assertions.
  **Review and return this file first**, under a distinct name such as
  `tests/host/herdr-report.txt`; do not overwrite the existing Docker report.
- `receipts.jsonl`: append-only stage events. Planned mutation stages begin as
  `not_attempted`; a call appends `uncertain` **before** invoking the CLI and then
  appends the observed outcome. Use the latest event for each stage/step. Returned
  result identities are persisted before assertions, even after a CLI timeout
  with a valid JSON response. Missing/malformed responses leave uncertainty.
- `logs/`: private raw stdout/stderr for each CLI call; `fixtures/`: repositories.
  Receipts and raw logs contain host paths and snapshot/process data; share only
  after review if specifically needed. The report omits full snapshots, process
  argv and terminal output, substitutes fixture/socket/launcher paths, and strips
  terminal control bytes. Errors can still contain other host-specific details.

Each test CLI call has a 20-second local timeout and five-second kill grace;
preflight calls use 15 seconds. A timeout/cancellation stops the sequence, but
may follow a successful remote mutation. **Do not blindly rerun or clean up.**
Inspect the exact returned identities and raw logs first. No rollback, automatic
retry, forced removal, or failure cleanup is attempted. On success, the parent
and second linked checkout/workspace intentionally remain for inspection; any
later cleanup must be explicitly requested and target only these fixture IDs.
A leftover bounded fixture process must not be mistaken for a user agent.

### Offline harness regression tests

The repository's Python unittest suite includes `tests/test_herdr_contract.py`,
which invokes a fake CLI (`fake-herdr.py`) against unique local fixture repos and
a private dummy socket. It tests preflight, consent/context/version/topology
refusals, full sequencing, focus changes, malformed/partial responses, timeout
classification, occupied panes, and stop-without-retry behavior. It never contacts
real Herdr or Docker. These **development tests** use Python and `jq`; Python is
not a host integration or launcher prerequisite. Without `jq`, these tests skip
explicitly rather than pretending to establish coverage.

## 5. Reviewed results and optional cleanup for dKOURTXx

**Phase 1 is complete:** `herdr-report.txt` passes 26 assertions and
`mount-report-pi-1.5.2.txt` passes 23 checks on the rebuilt custom image. The
historical 22-check Docker report remains in `report.txt`. The copied current
logs/effective standalone Compose agree with the report; only the two expected
missing-source probes fail.

The user supplied the entire current run at `pi-docker-mount.dKOURTXx/`. This
raw tree is not a durable repository input: it contains local paths and Git
pointers/symlinks to the original `/tmp` fixtures. **Do not stage it in Git or
run Git cleanup/worktree commands on its copied repositories.** The sanitized
report has been preserved separately as `mount-report-pi-1.5.2.txt`.

Cleanup is optional and was explicitly requested, not part of automatic test
completion. On the **original Docker host/daemon**, with no concurrent use or
new containers using these fixtures, first run:

```bash
bash tests/host/cleanup-mount-dKOURTXx.sh
```

This performs read-only checks. To delete both the exact original
`/tmp/pi-docker-mount.dKOURTXx` and the copied directory beside the script:

```bash
bash tests/host/cleanup-mount-dKOURTXx.sh \
  --confirm-original-docker-host --delete-host-fixtures --delete-copy
```

Use only `--delete-copy` if you want to retain the original fixtures, or only
`--delete-host-fixtures` to retain the copy. Both deletions require the explicit
host/daemon attestation; the script cannot prove daemon continuity from a copied
report. It checks a local Unix-socket Linux daemon and **refuses if any container
with the run's unique prefix remains**, including stopped or created containers.
Inspect those exact containers manually before deciding what to do; this script
does not stop or remove them. Daemon/list/timeout failures also block deletion.

Both present directories must be physical, owned by the current user, and have
reports matching the checksum-verified saved report. Missing directories are
reported as already absent. The script never follows fixture symlinks, keeps the
saved reports, and touches no images, volumes, other runs or Herdr resources.
A filesystem failure may leave a partially deleted tree: inspect before any
explicit retry. No host cleanup was executed by the agent.

Offline cleanup safety tests (fake Docker, temporary unit directories only):

```bash
bash tests/host/test-cleanup-mount.sh
```

## What this does not establish

The mount suite never contacts Herdr; the Herdr suite never launches Docker/Pi.
Production Compose merging, helper lifecycle orchestration, conversation
storage/resume, native restore, and rewind remain subsequent integration stages.
Passing **both host reports**, reviewing `MOUNT_CONTRACT.md`, and checking host
launcher resolution/capabilities closes Phase 1's discovery/contract gate; it
does not complete the plan's production acceptance criteria. Both current
reports have now been reviewed; the refreshed 23-check report, not the historical
22-check report, is evidence for the Pi 1.5.2 prototype baseline.
