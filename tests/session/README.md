# Phase 3: real Pi persistence, offline fixture provider

## Cleanup status after reviewed host gates

The user reports the original host `/tmp` fixtures removed and confirms all seven
approved named Herdr test sessions stopped/deleted, with `default` excluded. No
live inventory was rechecked here. After separate explicit approval, this agent
removed the seven untracked raw deployment copies under `tests/host/`, after
checking durable reports, tracked-file absence, canonical paths and nested mounts.
All seven sanitized reports, harnesses, tests and docs remain. Raw copies named
below are historical evidence origins, no longer available for inspection.
Do not repeat completed gates to reconstruct them. No Docker cleanup/prune,
worktree-metadata repair, staging or commit was performed; no current container
inventory is claimed. No further cleanup is requested. See `PLAN.md` handoff.

## Current task: automatic server-restart harness implemented; execution approval pending

The user selected design of the next Phase 3 gate and then continued
implementation. See
[HERDR_SERVER_RESTART_DESIGN.md](HERDR_SERVER_RESTART_DESIGN.md) for the pinned
Herdr 0.9.5 contract, implemented harness and evidence matrix.
Offline-only `../host/prepare-server-restart.mjs` now creates private unarmed
ordinary/linked fixtures, hashed fresh-shell environment/shim and a non-live
runbook without invoking Herdr/Docker/Pi. New `restart-checkpoint.ts` preserves
startup history and checks the still-open seed without telling the user to quit.
Read-only `../host/server-restart-evidence.mjs` now validates stopped persistence
and cross-lifetime saved evidence, including raw process/argv/container/history
and approval/exit receipts. Its public wrappers enforce frozen input hashes and
pinned official reporter bytes; its synthetic-test core is explicitly not an
execution gate. See the
[collector contract](HERDR_SERVER_RESTART_EVIDENCE.md) for exact artifacts and
limits. The shim also saves parent-shell stat for later ancestry verification;
the validator additionally checks a fresh named host snapshot after each open
checkpoint.

New `../host/server-restart-control.mjs` implements a controller/collector **core**:
exclusive artifact/step/query reservations, ordered journal, host/context/private-
environment guards, scoped read-only bounded queries, initial version/image/
empty-inventory/socket-length preflight and open/stopped/final-shell capture.
Its only CLI mode is offline `--inspect`; no live workflow is exposed. Core
capture is not full-input validation, live attestation or an execution gate.
Preparation freezes this module and non-secret host tool-path metadata too.
Public checkpoint validators now check seed/restored evidence without later
artifacts. The user chose narrow pending-receipt validation before publication:
`confirmBoundary` uses the full-input public pending validator, publishes success,
then requires the normal saved-directory gate. Missing/mismatched publication
proof or a crash blocks the next step. Generic callbacks cannot confirm data
boundaries, and pending results alone never permit re-entry.
The user chose **two normal host terminals**: A keeps restored Pi visible and
captures the immediate shell return; B collects/confirms outside Herdr. This
procedure decision does not authorize execution or create extra Herdr panes.

The complete guarded workflow is now `../host/server-restart-live.mjs`. It
implements private official installation, typed entry/stop/visual approvals,
strict live host/tool/context/daemon checks, public entry and data-boundary gates,
exclusive arming, genuine ready proof, seed/detach/pre-stop recheck, separate
fresh automatic entry and immediate builtin exit capture. The shim checks full
launch prerequisites; linked entry requires the completed ordinary proof.
Every live command requires the review flag and frozen fixture entry. No retry,
manual restored Pi command, repair or cleanup is provided. The finished
[host runbook](HERDR_SERVER_RESTART_RUNBOOK.md) and ready/finish helpers are copied
and hashed by preparation. `--plan` is offline and prints the exact private targets
and commands for review. Sourcing `control/finish.sh` must be the FIRST shell
command after /quit; no intervening source/echo/diagnostic is permitted.

Local restart-specific tests, including new `test-server-restart-live.mjs`:
**268 passed** with a separately selected SHA-pinned upstream reporter source
asset read only as data in synthetic fixtures. Full suite: **308 passed, 1 skipped**
(jq unavailable). Without that optional asset, ten full-pin simulations skip:
**298 passed, 11 skipped**. Full public saved-evidence positives here use inert
runtime/installer adapters, not an official host installation or real restart;
no reporter source is vendored/executed and no live attestation is claimed.

**IMPLEMENTATION FINISHED; NO HOST EXECUTION APPROVED OR RUN.** Next is review
of a new host-prepared frozen plan, explicit execution approval, and actual host
runs/evidence review. Do not arm phase files manually or import low-level helpers
to bypass those boundaries. Completed native reopen gates below must not be
rerun to reconstruct evidence. Phase 3 stays open.

## Historical same-pane lifecycle investigation

See [HERDR_SAME_PANE_ANALYSIS.md](HERDR_SAME_PANE_ANALYSIS.md) for tagged-source
analysis of the saved stale A→B report. A new candidate cause is the driver's
unchanged foreground process group, which can suppress Herdr's process probes;
this is not yet a proven production launcher defect. The user approved preparing
a **separate shell-boundary diagnostic**, not a production workaround. The user
has now run it; the reviewed result is below. Do not repeat it just to reconstruct
evidence or rerun the old single-driver corpus unchanged.

### Reviewed native shell-boundary gate: ordinary AND linked reopen PASS

Run `0rXTuSjw` passes all four ordinary/linked seed and native-reopen launches.
Raw review verifies exact official managed references, stable conversation IDs/
files and v3 records, complete original plus new user/assistant history, expected
titles/cwd/header cwd, two isolated conversation identities, four distinct
container receipts and all four visual yes confirmations. Hashes for inputs,
reporter, driver, controls and seed evidence match; 11 copied source counterparts
match repository bytes. No checkpoint error artifacts; final restored files
remain intact. Durable sanitized review:
`../host/native-boundary-restore-report-pi-1.5.2.txt`.

The supplied copy includes the final shell-return marker and completed assessment.
All five steps exit 0, and all ordered shell/job boundaries verify. All six
preflight/prelaunch/assessment snapshots have no agent/session reference and
unchanged one-pane topology; all 12 saved container queries are empty. No missing-
marker exception is needed. **Native launcher-protocol gate passed and reviewed**;
automatic server-restart restore remains untested and Phase 3 is still open.
Do not repeat the completed gate or infer current resource state from saved logs.

### Native shell-boundary procedure (completed run retained above)

The user approved preparing the full native-protocol harness with explicit shell
boundaries. The completed host run is reviewed above. No
production lifecycle policy, reporter, image selection or mount/history behavior
was changed. This is not automatic restoration after a Herdr server restart.

From a normal terminal **outside Herdr** on the supported original Linux Docker
host, create another genuinely NEW disposable session:

```bash
herdr --session "pi-native-boundary-$(date +%s)-$$"
```

Inside its single empty interactive **Bash** pane, from the host checkout root,
run these commands separately:

```bash
bash tests/host/verify-native-restore.sh --preflight --prepare-native-boundary
bash tests/host/verify-native-restore.sh --run --prepare-native-boundary --confirm-disposable-session
```

Requirements remain host Herdr 0.9.5, local Linux Docker/Compose, existing image,
Git, Bash, flock/coreutils, test-only jq and genuine inherited same-user context.
Do not set/fabricate Herdr variables or unset a legitimate agent marker to pass
checks; use a new disposable shell. Socket exposure grants access to the whole
disposable session. Private fixture auth/settings/provider, network isolation,
actual image entrypoint and fresh image-selection checks remain unchanged.

`--run --prepare-native-boundary` asks for `disposable` confirmation, creates the
allowlisted copied deployment and fixture-local ordinary/linked checkouts, and
installs/verifies the official reporter in private config. It launches **no Pi**.
It writes `control/INSTRUCTIONS.txt` at the printed exact fixture path.

Enter that file's commands **one at a time** at the actual interactive shell
prompt—do not run it as a script or paste the entire sequence. They guide:

1. Source the test-only function definitions and record `ready-native`.
2. Separate `seed-ordinary` command: send `phase3-ordinary-seed`, checkpoint once,
   `/quit`, answer the visual question, let the command exit, record shell return.
3. Separate `restore-ordinary`: inspect original history, send
   `phase3-ordinary-restored`, checkpoint once, `/quit`, confirm, record return.
4. Separate `seed-linked`: selected `packages/backend` under a fixture linked
   checkout; send `phase3-linked-seed`, checkpoint once, `/quit`, confirm, return.
5. Separate `restore-linked`: inspect original history, send
   `phase3-linked-restored`, checkpoint once, `/quit`, confirm, return.
6. Separate `assess` command after the last shell-return marker.

Wait for each exact `offline-fixture:` response before checkpointing, and wait
for its saved notification before `/quit`. A checkpoint STOP means quit and let
the host save evidence, then **stop**: no retry, reset, fallback or automatic
recovery. All four visual checks require nonempty observations and explicit yes.

`native-boundary.sh` enforces the same interactive-shell parent, distinct
foreground jobs, built-in `/proc` shell-return receipts, single-start/order
checks, pinned control/input/image bytes, and Herdr version/topology. Before
each launch (and assessment), its read-only snapshot must show **no agents or
pane session reference**. It never clears these itself. Query failure, stale
identity, missing/mismatched context, or retained containers stops the workflow.
Run/project container queries and exit receipts are saved after every step.

Restore reads the **official seed checkpoint path**, not a reconstructed/local
substitute, checks saved seed evidence hashes, and invokes only `--session` with
that reference. Strict checkpoints and capture validate stable IDs/files,
original plus new user/assistant history, title, cwd/header cwd, exact selected
storage/v3 record, and unchanged launch records. Assessment checks two histories,
four distinct container receipts, unchanged final files and retained clean linked
checkout. PASS covers **ordinary/linked native launcher protocol only**, not
server-restart restore or overall Phase 3 completion.

Keep and return the fresh fixture for review, not wholesale staging. Preserve
all shell/process receipts, prelaunch/official checkpoint snapshots and errors,
seed-evidence/input/reporter/control/driver hashes, visual answers, history/v3
copies, per-step/container results, `receipts.jsonl`, `evidence.json`,
`native-evidence.json`, and `result.txt`. No cleanup/server stop is included.
Earlier copied evidence trees remain unchanged; do not reuse them.

Local checks:

```bash
node --test tests/session/test-driver-process-groups.mjs \
  tests/session/test-native-checkpoint.mjs \
  tests/session/test-session-handover.mjs \
  tests/session/test-shell-boundary.mjs \
  tests/session/test-native-boundary.mjs
```

**40 passed, 1 skipped** here: real-jq aggregate checks skip because test-only jq
is absent. The new PTY tests exercise generated steps, exact restore argv and
failure guards with inert Docker/Herdr/Pi/jq substitutes. They do not certify
actual JSON filter/runtime behavior or host Docker/Herdr integration. No package
was installed and no live API was contacted.

### Reviewed shell-boundary result: ordinary handover succeeds

Run `Z8likvIQ` reports **current** and raw review confirms it: the same interactive
shell owns the terminal before A, between A and B, and after B; A and B are
separate foreground jobs with distinct PGIDs. Crucially, the official **pre-B
snapshot has no agents and no session reference**, followed by B's own exact
`herdr:pi` path and idle state at its checkpoint. State sequence advances from
A's 3 to B's 7. Both local histories and explicit visual confirmations agree.
Input/reporter/driver/control hashes, exact storage/v3 records, unchanged A and
two distinct session/container identities all verify. All three steps exit 0;
all eight saved container queries are empty. Durable sanitized review:
`../host/shell-boundary-handover-report-pi-1.5.2.txt`.

This supports the driver/job-boundary explanation, not a production reset or
reporter patch. The earlier stale-reference result and its no/interrupted visual
answer remain real and unchanged; its historical PGIDs/server internals were not
recorded. This experiment is **not a native restore pass**: linked native reopen,
automatic server-restart restore and other Phase 3 gates remain pending. Next
recommended work is a reviewed shell-boundary adaptation of the full native
harness, not another unchanged run. No live request or cleanup was made during
review. Preserve original fixtures; do not stage full deployment copies.

### Shell-boundary diagnostic procedure (completed run retained above)

This differs from the old single-driver reproduction: A and B are launched as
separate foreground jobs, returning to the same interactive Bash shell between
them. No pane/workspace is created or moved by the driver. Strict official path
checks, local history/storage/v3 checks and independent visual questions remain.
The existing raw finding is not relabeled or discarded.

On the original supported Linux Docker host, create a genuinely NEW disposable
Herdr session from a normal terminal **outside Herdr**, for example:

```bash
herdr --session "pi-shell-boundary-$(date +%s)-$$"
```

Inside its single empty interactive **Bash** pane, from the actual host checkout
root, run these separately:

```bash
bash tests/host/verify-native-restore.sh --preflight --prepare-shell-boundary
bash tests/host/verify-native-restore.sh --run --prepare-shell-boundary --confirm-disposable-session
```

The second command asks for `disposable` confirmation, copies the same allowlisted
private deployment/offline fixture, and installs/verifies its official reporter.
It **prepares only**: no Pi launch. The inherited socket still controls the entire
disposable session. No real data/config/auth or host Git configuration is copied.
The shell must not have `HERDR_AGENT` set; do not unset a legitimate marker in a
working session to force the test through. Use a genuinely fresh disposable shell.

Preparation prints the exact retained run path. Open its
`control/INSTRUCTIONS.txt` and enter its commands **one at a time** at the actual
interactive shell prompt. Do not run the file as a script, paste all commands as
one block, source `boundary-step.sh`, use a loop, or enable driver job control.
The instructions define an inert `boundary_mark` function in that disposable
shell, then guide:

1. `ready-a` shell marker, followed by a separate A step command.
2. In A: `phase3-handover-a`, wait for response, checkpoint **once**, `/quit`;
   answer the A visual question. Let the step exit to the actual shell prompt.
3. `after-a` shell marker, followed by a separate B step command.
4. In B: `phase3-handover-b`, wait for response, checkpoint **once**, `/quit`.
   A wrong-path STOP remains a possible finding, not permission to retry. The
   automated assessment is saved before B's separate title/history question.
5. After the step exits to the actual shell, `after-b` marker and `assess`.

Markers use only Bash built-ins and `/proc/<own-pid>/stat`, so they observe the
shell itself owning the terminal rather than a short-lived inspection command.
Each step requires that same shell as its parent and a distinct foreground job;
A and B must have different PGIDs. The runner validates inherited context, pinned
inputs/image, server version/topology, ordering and single-start receipts. It
saves read-only snapshots immediately before each launch, including before B.
No environments, credentials or arbitrary process command arguments are dumped.
The known launcher marker is not modified or replaced by this diagnostic.

This does not force Herdr to observe a shell return. A shell marker proves the
kernel job boundary; the pre-B snapshot and B checkpoint reveal what Herdr
actually retained/adopted. Success is **DIAGNOSTIC COMPLETE**, never native restore
PASS. Ambiguous/failed steps stop; do not retry/reset or change topology. Run-
and project-labelled container queries are retained after every step, and any
matches/query errors prevent continuation. No cleanup, release, reporter patch,
server restart/upgrade, native reopen or linked worktree is part of this test.

Return the fresh fixture copy for review as with earlier runs, **not for wholesale
staging**. Keep shell/process receipts, prelaunch/checkpoint snapshots and errors,
`handover.json`, `evidence.json`, visual observations, v3/history copies, all input/
reporter/control hashes, per-step/container results and the final result. Review
and sanitize before making a durable report. Do not reuse old fixture sessions.

Local checks (no Docker/Herdr/Pi calls):

```bash
node --test tests/session/test-driver-process-groups.mjs \
  tests/session/test-native-checkpoint.mjs \
  tests/session/test-session-handover.mjs \
  tests/session/test-shell-boundary.mjs
```

**32 pass, no failures/skips** here, including real local PTY shell markers and
generated-step guards with inert stubs. These are not host runtime certification.

## Scope and explicit test decision

The user chose an **in-process deterministic fixture provider**, not real API
calls. `fixture-provider.ts` is test code, not a deployment extension/package.
It activates only with an isolated `phase3-fixture` sentinel in the agent config,
accepts only `phase3-*` fixture prompts, emits finite synthetic text responses,
and never opens a transport, requests credentials or calls tools. Usage/cost are
zero because no model service is called. It does not certify provider protocol,
request instrumentation, network/authentication, or model quality.

Pi itself creates and persists the user/assistant turns; tests do not seed JSONL
or pretend mocked responses establish real Pi startup. The observer records only
fixture messages/IDs/cwd/name/container hostname, not prompts from other sessions
or provider configuration. It writes only inside the private test config.
**Do not install this provider in real/shared configuration.**

## Local real-CLI regressions

```bash
python3 -m unittest discover -s tests -p test_session_fixture.py -v
```

These tests run the installed Pi 1.5.2 Node CLI directly with a minimal environment,
private HOME/config/auth/session storage, `--offline`, no MCP or tools, and no
inherited credentials or Herdr context. They cover persisted turns, stable
continue IDs/files/history, explicit session reopen restoring its recorded cwd,
separate storage isolation, missing recorded cwd without a replacement, and
sentinel enforcement. The suite now has **12 tests**, including the cwd-transition
and explicitly requested file characterizations below. They skip when Node/Pi is absent; `PI_PHASE3_CLI` can select
a reviewed installation outside the image's normal package path. No Python
packages or global installs are required. This is **not** a Docker/entrypoint or
native Herdr test.

`tests/test_herdr_launcher.py` also verifies host restore preparation against
current filesystem state, without a historical layout/checkout-identity registry:
valid replacement checkout, surviving marker-free directory, missing exact
subdirectory, recognized broken metadata and directory/name-scoped forwarding of
`--continue`/`--resume`. These fake-Docker checks are not conversation/UI evidence.

## Host integration: actual launcher and image entrypoint

From the supported original Linux Docker host checkout:

```bash
bash tests/host/verify-session-persistence.sh --preflight
bash tests/host/verify-session-persistence.sh --run
```

Requires the Phase 2 tools plus **test-only jq**, not host Node or Python. Preflight
is read-only. Run creates a unique `/tmp/pi-docker-persistence.XXXXXXXX/` and copies
only deployment source allowlist paths; it never copies real `data/`, `.git/`,
`.env`, credentials, conversations or host Git config. Agent auth is empty and
GitHub config is fresh. `--no-herdr --no-host-gitconfig` prevents socket integration
and host Git-config exposure, even inside an inherited Herdr pane.

The copied `compose.yaml` uses `extends` to inherit an unchanged production
Compose service (`compose.production.yaml`). Test-only overrides set batch
stdin/TTY, HOME/scratch, no network, read-only root and bounded memory/CPU/PIDs.
**No entrypoint or command is replaced.** Custom/base image selection is still
performed freshly by the copied real `bin/pi`; no image is built, pulled, retagged
or removed. Custom availability and the preflight image ID are checked before each turn;
unexpected availability/tag changes stop the run instead of silently overriding
launcher image selection.
The custom image's own extensions/resources still load through its real entrypoint.
This does not certify unmodified interactive terminal transport or host networking.

The 14-check corpus exercises:

- Fresh actual Pi turns, display title distinct from launcher storage name.
- Stable file/ID/history with `--continue` and explicit `--session` reopen.
- Independent storage names and ordinary/self-contained selections even though
  both use container `/workspace`.
- Linked worktree paths with spaces/quotes/dollar/colon, canonical symlink selection,
  independent root/deep-subdirectory histories and sibling-worktree separation.
- Host JSONL header/ID/cwd/user-and-assistant-message verification, including
  fixture provider identity and successful terminal responses, not just exits.
- Retained checkout after exit, missing selection and recognized invalid metadata
  refusing startup without modifying conversation files.

Return the **reviewed/sanitized** report as
`tests/host/persistence-report-pi-1.5.2.txt`; retain Phase 1/2 reports. Each launch
has `logs/state-<check>.json` and raw logs. `inputs.sha256` records copied launcher,
mount/restore helpers, Compose and fixture-provider inputs. `containers.txt` records the unique
Compose project/label and observed container hostnames; on failure the finish
handler also lists any remaining containers for that exact label. Success
requires no matching retained containers. Inspect ambiguous outcomes without
retrying. Per-launch deadlines are bounded; there is no automatic cleanup,
rollback, checkout/branch deletion or container removal by the driver (Compose's
normal `run --rm` still applies). The final negative intentionally leaves one
fixture gitfile invalid; it is not repaired. Later cleanup must be explicitly
requested and scoped to that run.

Driver regressions use fake Docker and private Git/data trees:

```bash
python3 -m unittest discover -s tests -p test_session_host.py -v
```

They require jq/Git and otherwise skip explicitly. They verify read-only
preflight/help, all 14 driver checks, stop-on-incorrect-history and configuration
failure without false readiness. They do **not** replace host evidence.

## Reviewed first host gate

The user supplied `../host/persistance-report-pi-1.5.2.txt` (filename spelling
preserved): **14 checks passed** with the real custom-image entrypoint. Report
SHA256 is `401f73378a4d77d6d42e517ec411906491f35ea4d917995a4ae85760e54c54d1`.
The report records 11 distinct container hostnames, six conversation identities,
and the expected stable IDs/files on ordinary, linked and deep continues/reopens.
Raw observations/JSONL/Compose artifacts were not supplied for independent review;
this is the user-run report of the automated driver assertions, not an additional
Docker run by the coding agent.

### Cleanup for this successful run

**Handoff status:** the user confirmed cleanup was inspected and OK. No further
cleanup is requested. The instructions below document the run's cleanup boundary;
they are not a request to repeat cleanup or recreate removed fixtures.

Only the original exact `/tmp/pi-docker-persistence.XXXXXXXX/` tree remains to
be deleted if no longer wanted; preserve the report in this checkout. Nested Git
worktrees and their common metadata are all fixture-local. There is no external
Git registration, Herdr workspace/socket, Docker volume/network or modified image
to remove. Normal `run --rm` removes containers; the successful finish handler
also checked that no run-labelled containers remained. No cleanup script or
`docker compose down`/prune/image deletion is needed.

Optionally recheck **on the same original Docker host/context** before removing
files, while no processes/containers/mounts are using or changing the fixtures:

```bash
docker ps --all \
  --filter 'label=pi-docker.phase3-run=pipersist-pi-docker-persistence-vqnjnism' \
  --format '{{.ID}} {{.Names}} {{.Status}}'
docker ps --all \
  --filter 'label=com.docker.compose.project=pipersist-pi-docker-persistence-vqnjnism' \
  --format '{{.ID}} {{.Names}} {{.Status}}'
```

Both commands must succeed with no output. On errors or matches, stop and inspect;
do not remove containers or retry automatically. Use the **exact case-sensitive
path printed by the run**, confirmed by its `containers.txt` project receipt.
The report lowercases the project suffix and redacts paths, so it does not reveal
that exact path; do not guess it or use a wildcard deletion. Check for nested
mounts before deletion. No cleanup has been executed by the coding agent.

## Follow-up offline probes: cwd transitions and unusable explicit sessions

The 12 isolated installed-Pi 1.5.2 CLI tests pass. These are real Pi operations,
but **not Docker mount-transition or native Herdr restore evidence**. Distinct
private absolute directories model different container cwd layouts:

- Replacing the selected directory at the identical absolute cwd preserves the
  session ID/file/history on explicit reopen. Pi does not check checkout identity.
- Reopening from another existing cwd still uses the original header cwd.
- If the old header cwd disappears after a layout change, explicit print-mode
  reopen fails without changing the conversation or creating a replacement.
- With the same session storage but a different current cwd, `--continue` creates
  separate history and leaves the previous conversation unchanged. Storage-key
  stability alone therefore does **not** establish continuity across cwd changes.
- Nonempty malformed JSON and a non-session entry fail explicit reopen without
  file changes, extra sessions or provider activation. These cases do not prove
  strict validation of every possible damaged session: Pi's loader is permissive.
- An empty explicitly requested file is initialized by Pi; a missing explicit
  pathname is created. These are upstream characterizations, **not** deployment
  acceptance criteria for native restore.

**User decision after reviewing the probes:** preserve current rediscovery and
immutable history policy; document layout-changing continuity as a limitation.
No historical layout flags, migration, header rewriting, pointer repair or mount
changes are added. In particular, linked-to-ordinary rediscovery can be accepted
by the host while the old conversation cannot reopen at its former cwd. An
interactive missing-header-cwd recovery UI may still appear when the recorded
host selection survives but its container path changes; this is not a verified
native restore success or an automatic deployment fallback.

The native-restore launcher already rejects missing files and out-of-storage
paths. It now also rejects empty or host-unreadable requested files before
Compose launch/reporter preparation, preventing Pi from initializing an empty
requested conversation. One fake-Docker regression asserts no Compose launch,
reporter calls or session/record mutation; read-only image selection may precede
the check. Existing fake-Docker positive tests use nonempty sentinels only, not
validity/readiness evidence. Pi remains responsible for parsing nonempty files;
no independent session parser or broad history scanner is introduced. Actual
container-user readability and interactive malformed-session behavior remain
integration gates.

## Host interactive resume picker gate

From the supported Linux Docker host checkout, in an interactive terminal:

```bash
bash tests/host/verify-interactive-resume.sh --preflight
bash tests/host/verify-interactive-resume.sh --run
```

Requires the same host tools and test-only jq as the batch persistence driver.
Do not pipe or redirect `--run`: both stdin and stdout must be terminals. No
host Node/Python, live model provider, or Herdr session is needed.

The script creates a fresh `/tmp/pi-docker-resume.XXXXXXXX/` deployment from
allowlisted source, empty private configuration/auth and the guarded fixture
provider. Its Compose `extends` wrapper inherits production interactive stdin,
TTY, entrypoint and command unchanged, with no network, temporary HOME/scratch,
read-only root and resource bounds. It uses the actual copied launcher with
`--no-herdr --no-host-gitconfig`, checks fresh image selection against preflight,
and records input hashes. No images are built, pulled, retagged or removed.

It seeds Alpha and newer Beta under the same exact directory and `backend`
storage name, plus Reviewer under a separate storage name and Subdirectory
under a distinct exact selection. It then guides four real `--resume` launches.
Select **older Alpha first**, inspect the original user and assistant history,
send the displayed finite fixture prompt, wait for its response, and `/quit`.
Repeat for the other titles. Observe default/local picker scope, not global/all
browsing; type a short visual observation and explicitly confirm each result.

After each launch, the script immediately saves the observer output and checks
settled state, complete user/assistant history, title, ID/file, cwd/header cwd,
absence of Herdr and exact host directory/name storage. Root and subdirectory
both use container `/workspace`; distinct storage/identities establish isolation.
The exit handler checks both run and Compose-project labels for retained
containers. Any failed/ambiguous check stops without retry or repair.

Return the fresh fixture's `receipt.txt`, `inputs.sha256`, `checks.txt`,
`observations.txt`, `evidence.json` and `result.txt` after reviewing for unexpected
content; raw per-launch observations and JSONL snapshots remain in `logs/`.
On failure, return available evidence and the error instead. Keep the fixture
until reviewed: no automatic cleanup, rollback, container removal beyond normal
Compose `run --rm`, or checkout/conversation deletion is performed. Ctrl-C stops
the test; inspect retained state before any separately requested recovery.

**Full host rerun passed and reviewed:** artifacts from
`../host/pi-docker-resume.nhtANrCS/` verify all four seeds and all four interactive
resumes on Pi 1.5.2/custom. IDs/files/titles/cwd and complete original plus new
user/assistant histories agree across raw snapshots and aggregate evidence.
Exact host directory/name storage receipts agree; all input/driver hashes match.
Manual confirmations establish the default/local Alpha/Beta list (older Alpha
selected first), Reviewer isolation and selected-subdirectory isolation. Saved
run/project container queries are empty. Durable sanitized report:
`../host/interactive-resume-report-pi-1.5.2.txt`.

The earlier run `24uFOGYH` stopped on a blank visual observation after successful
Alpha reopen; `../host/interactive-resume-partial-pi-1.5.2.txt` remains historical.
Both supplied artifact directories are full fixture deployments, not directories
to stage wholesale. No cleanup was performed on review. This pass does not
establish native Herdr restore, base/cross-image continuity, Docker layout
transitions, malformed-session UI handling or rewind.

## Earlier single-driver gate: official reporter and native launcher reopen

**Historical procedure:** the plain `--run` driver below keeps all launches in
one foreground job. Use the new `--prepare-native-boundary` procedure at the top
of this document for the next full native gate; do not rerun this older corpus
unchanged to diagnose the known stale-reference finding.

**User decision:** proceed with a new explicitly disposable Herdr session and
fixture-only offline provider. This approval is not permission to expose an
existing working session. The reviewing coding agent has no inherited live
Herdr context and has made no live API requests.

`tests/host/verify-native-restore.sh` tests the official reporter and actual
launcher `pi --session <reported-managed-path>` protocol. **It does not restart
Herdr or prove automatic server-restart restoration.** That remains a separate
next gate; do not describe a direct managed-path reopen as a completed server
restore test.

On the Linux Docker host, from the checkout root, create a **new** named session
in a normal terminal outside any existing Herdr session:

```bash
herdr --session "pi-native-$(date +%s)-$$"
```

Do not use this command to nest Herdr or attach to an existing working session.
If prompted to upgrade/restart an incompatible server, stop instead. The test
requires the reviewed host CLI/server 0.9.5. Inside the new session's lone shell
pane, navigate to the actual host checkout root if necessary, then run directly
in the terminal (no pipe/redirection):

```bash
bash tests/host/verify-native-restore.sh --preflight
bash tests/host/verify-native-restore.sh --run --confirm-disposable-session
```

Requires the previous host test tools plus host Herdr and `flock`; jq is test-only.
Preflight makes bounded read-only requests to the genuine inherited session and
requires one workspace/tab/pane, no agents, and a same-user Unix socket. Run asks
you to type `disposable` before creating a fresh
`/tmp/pi-docker-native.XXXXXXXX/` deployment. Only allowlisted deployment source
and test extensions are copied; no real `data/`, `.git/`, `.env`, auth or Git
configuration is copied/mounted. A private host HOME prevents native restore from
mounting host Git config, while explicit host `DOCKER_CONFIG` preserves normal
Docker context selection (never mounted into Pi). No global PATH/config changes
are made; this driver's child PATH resolves `pi` to the copied real launcher.

The production Compose and image entrypoint/command/interactive transport remain
in use through an `extends` wrapper with network none, read-only root, temporary
HOME/scratch and resource bounds. `PI_OFFLINE=1` and private default provider/model
settings keep startup/restored model selection offline even though native restore
correctly does not replay seed CLI flags. `defaultTools: []` disables default
tools on restore; the finite fixture provider never requests tools or transport.
The actual host installer installs/verifies the official reporter only in this
fresh deployment's private config. Its bytes are hashed, not replaced by a mock.

The driver guides four foreground launches in the calling pane: ordinary seed,
ordinary native reopen, linked-subdirectory seed, linked-subdirectory native
reopen. For each launch:

1. Send the exact finite prompt printed by the driver; wait for its
   `offline-fixture:` response.
2. Enter `/phase3-native-checkpoint`, wait for the saved notification, then
   `/quit`. If it reports STOP, quit and inspect; do not retry the checkpoint.
3. At the host questionnaire, enter a nonempty visual observation and type
   `yes` only if title/original history matched and no recovery/fork UI appeared.

`native-checkpoint.ts` is a guarded test-only observer. Its manual command makes
one bounded **read-only** `herdr api snapshot` request using inherited context.
It never reports identity or constructs/registers a resume command. It verifies
that `herdr:pi` officially reported the current persisted path and idle/done
status, alongside a settled provider observation and local `ctx.isIdle()`.
These directly launched foreground sessions do not require the managed-only
`interactive_ready` flag: Herdr 0.9.5 reports it false/omitted without a managed
`agent start` launch. No readiness flag is synthesized, pending launches are
still rejected, and production helper readiness checks remain unchanged.
Raw snapshot/errors survive failure. The host consumes that reported
reference directly through the actual native launcher, with no constructed key,
replayed image choice or original CLI flags. It checks stable ID/file/title,
full persisted user/assistant history, cwd/header cwd, exact directory/name
storage, unchanged v3 selected-subdirectory record, no replacement sessions,
Git/checkout survival and run/project container receipts. No helper/pane creation,
worktree removal, automatic retries, rollback or cleanup is performed.

Return the fresh run's `scope.txt`, `receipt.txt`, `inputs.sha256`,
`reporter.sha256`, `checks.txt`, `observations.txt`, `receipts.jsonl`,
`evidence.json` and `result.txt`. Keep raw `logs/` and original fixtures available
for review. These raw logs contain only the explicitly disposable session, but
review/sanitize before sharing; do not copy/stage an entire deployment blindly.
The named Herdr session itself is retained. `/quit` exits Pi; prefix Ctrl+B then
Q detaches from Herdr, not stops it. No stop/delete command is included here.

Local development checks:

```bash
bash -n tests/host/verify-native-restore.sh
node --test tests/session/test-native-checkpoint.mjs
```

These offline tests mock `pi.exec` and use a private local socket only for guard
checks; no Herdr CLI/API is contacted. They are not Docker/reporter/native reopen
integration evidence.

### First reviewed native-protocol attempt: harness false negative

Run `yXQDav7Z` stopped before the ordinary seed visual questionnaire because the
original test incorrectly demanded the managed-only `interactive_ready` flag.
Review confirms the ordinary seed's persisted turn, exact storage/v3 record and
official `herdr:pi` matching-path idle report. The flag was false/omitted because
Pi was started directly, not through `agent start`; this is not user error or a
reporter-path mismatch. The observer and host assertion are corrected, with
14 passing offline tests including omitted/false readiness and rejection of
pending/blocked states. Production code is unchanged. Durable review:
`../host/native-restore-partial-pi-1.5.2.txt`.

No native reopen or linked-subdirectory TUI check was reached. The corrected
host gate still needs a fresh explicitly requested run; automatic server-restart
restore remains separate. No host retry, cleanup or session stop was performed
on review. Keep the raw original evidence unchanged.

### Second reviewed native-protocol attempt: stale identity at linked seed

Run `yaTn8dy1` **passed ordinary seed and native managed-path reopen**, including
stable conversation identity/history, exact storage/v3 record and explicit
visual confirmations. All input/reporter/driver hashes match. The linked seed
also persisted correctly in its own path-preserving subdirectory cwd/storage.
However, the official Herdr snapshot at the linked checkpoint still reports the
previous ordinary session path, with idle status and unchanged state sequence.
The identity assertion correctly rejects it; linked native reopen was not
attempted. Saved run/project container checks are empty. Durable report:
`../host/native-restore-stale-reference-pi-1.5.2.txt`.

Do not relax the path assertion or substitute Pi's path for the officially
reported reference. This is a new stale-identity finding, not the earlier
managed-readiness false negative. Tagged Herdr source suggests retained
same-pane lifecycle authority: Pi startup is not an allowed same-owner session
replacement, and Docker can hide process-exit detection. The exact mechanism
and whether worktree layout matters are **not yet proven**. A focused same-pane
conversation-replacement diagnostic is needed before any production fix or
another full rerun; no release/reset/reporter patch/server restart is authorized
as an automatic workaround. The observer now has a regression rejecting the
stale but otherwise valid official ordinary path; all 15 offline tests pass.
The full native gate and automatic server-restart restore remain pending.

### Focused ordinary-conversation handover diagnostic

The user requested a focused test of the stale-reference finding. The existing
host driver now has a separate `--focused-handover` mode. It creates two fresh
conversations A and B, successively in the **same pane, exact ordinary directory
and `backend` storage**. It creates no Git repository or worktree and performs no
native reopen, state release/reset, reporter modification or server restart.
It uses the same fixture-only resources/offline provider and fresh deployment
boundaries as the native-protocol gate.

From a normal host terminal outside Herdr, create another NEW disposable session:

```bash
herdr --session "pi-handover-$(date +%s)-$$"
```

Inside its single shell pane, from the actual host checkout root:

```bash
bash tests/host/verify-native-restore.sh --preflight --focused-handover
bash tests/host/verify-native-restore.sh --run --focused-handover --confirm-disposable-session
```

For A, send `phase3-handover-a`, wait for the response, enter
`/phase3-native-checkpoint` once, wait for the saved notification, and `/quit`.
Enter a nonempty visual observation and confirm the expected A history/title.
Then repeat for B with `phase3-handover-b`. B must be fresh history, with no A
turns. **If B's checkpoint reports the identity/path STOP, `/quit` anyway; do not
retry it.** This is a possible diagnostic finding, not an instruction to repair
anything. The host saves and classifies the raw snapshot. For the B visual
question, judge title/new history only; its checkpoint status is assessed
separately. Other failures/missing snapshots stop the test as ambiguous.

The strict native checkpoint is unchanged: a mismatched reference never produces
a success checkpoint. Diagnostic capture validates B's **local history only**,
then separately requires a genuine official matching-pane idle/done path report.
`handover.json` distinguishes:

- `stale_previous`: Herdr still reports A during B. This reproduces stale identity
  without linked worktrees; it does not yet establish the exact mechanism.
- `current`: Herdr reports B in this run. The earlier linked-stage mismatch still
  needs explanation; this does not establish a full native restore pass.
- Missing/blocked/pending/nonofficial/unrelated references or unexpected histories
  stop as ambiguous, not as either classification.

Both seed IDs/files must be distinct but in the same storage namespace; full
user/assistant histories, exact storage/record, A's unchanged history and exactly
two session files are checked. The script does not substitute Pi's path for an
official reference or construct/invoke any restore command. Completion is labeled
**DIAGNOSTIC COMPLETE, not native restore PASS**, including when stale identity
is reproduced. It retains snapshots/errors, histories, records, observations,
receipts and run/project container checks, with no retries or cleanup.

Return `handover.json`, `evidence.json`, `observations.txt`, `receipt.txt`,
`receipts.jsonl`, `inputs.sha256`, `reporter.sha256`, `checks.txt`, `scope.txt`
and `result.txt`; retain raw `logs/` for review (or return available evidence on
an interrupted run). Do not copy/stage the full fixture deployment blindly.

Offline development checks (no Docker/Herdr requests):

```bash
node --test tests/session/test-native-checkpoint.mjs tests/session/test-session-handover.mjs
bash -n tests/host/verify-native-restore.sh tests/host/session-handover.sh
```

All 24 observer/classifier/driver guard tests pass locally. These unit/static
checks do not certify actual Docker/TUI execution.

### Reviewed focused result: stale reference reproduced without worktrees

Run `7LIAX9Ww` independently reproduces `stale_previous`: both A and B persisted
as distinct fresh conversations in the same ordinary directory/storage/pane,
but Herdr still reported A's exact managed path during B, with idle state and
unchanged state sequence despite the B terminal title. All input/reporter/driver
hashes and raw histories/records agree; A history stayed unchanged and container
receipts are empty. Worktrees are not necessary to trigger this finding.
Durable review: `../host/ordinary-handover-stale-reference-pi-1.5.2.txt`.

The original run remains FAIL/INTERRUPTED: A visual confirmation was yes, but B
was answered no after describing the checkpoint STOP. The generic question then
stopped the driver before `handover.json`/aggregate evidence generation. Review of
raw evidence is sufficient to establish the stale-reference reproduction; do
not invent a successful B visual confirmation or rerun merely to obtain it.
The driver now saves its automated assessment before asking a B-specific
history/title-only question, so a negative/interrupted answer cannot discard an
already observed mismatch. Original evidence/results are unchanged.

This is not a native restore pass or proof of the exact lifecycle mechanism.
Investigate the same-pane session ownership/reporting interaction before a
production policy change; do not relax path checks, release/reset authority,
patch official reporting or switch topology as automatic recovery. No live
requests, host retries or cleanup were performed on review. Phase 3 remains open.

## Still required before Phase 3 is complete

- Interactive `--resume` is now passed for the offline ordinary-directory corpus
  above. This is **not** native restore or linked-layout transition evidence;
  `--session` reopen in print mode is not a substitute for those remaining gates.
- Official reporter/native launcher reopen now passes for both ordinary and
  linked-subdirectory selections in reviewed run `0rXTuSjw`. Automatic Herdr
  server-restart restore remains untested and needs a separately reviewed,
  explicitly consented disposable-session procedure. Never fabricate inherited
  context, expose a working session, or infer restart permission from this pass.
- Validate freshly selected custom/base continuity without automatic tag changes;
  current image-switch coverage is fake-Docker only, with this host run using the
  image currently available. A base-only integration run remains separate.
- Validate replacement-layout/session-header cwd transitions on the Docker host.
  Offline path probes above establish the upstream limitation, not actual mounts.
  Per the user's decision, layout-changing continuity is unsupported without a
  separate policy review; do not add historical flags, migration, pointer repair
  or mount changes. Same-cwd replacement continuity still needs host evidence.
- Native missing checkout/metadata failures must occur before Pi's interactive
  Continue/Fork/Cancel fallback; closing Pi versus Herdr workspace close/removal
  retains the verified upstream semantics. Validate malformed/unusable session
  files without silently creating replacement conversations.
- Live provider connectivity, rewind and helper/worktree orchestration remain
  separate coverage; Phase 4 must not be declared implemented by these tests.
