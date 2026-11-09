# Phase 1 host mount-contract verification

This is an **experimental standalone harness**, not the production launcher.
It tests a Bash/Git discovery helper and small static Compose files. It does not
change `bin/pi`, load deployment Compose, or claim production-launcher coverage.
No host Node.js, Python, or Herdr is required. Node runs only inside the image.

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
- Missing checkout/metadata bind sources fail without being created; errors must
  actually identify the missing source, not an unrelated operational failure.
- Container exit leaves fixture worktrees intact.

The reserved-path and malformed-pointer checks run offline before containers;
the suite never mounts host runtime directories to test rejection. The reserved
list is a prototype requiring review before production adoption. This is mount
and index separation, **not a security boundary around shared Git metadata**.

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

## What this does not establish

Production launcher/deployment Compose merging, helper lifecycle orchestration,
Herdr create/open/remove, conversation storage/resume, native restore, and rewind
remain subsequent integration stages. Herdr checks require an explicitly created
disposable session with genuine inherited pane/socket context; this suite never
contacts Herdr. A passing host report is evidence for the mount contract, not
completion of every Phase 1 or plan acceptance criterion.
