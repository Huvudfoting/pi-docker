# Restart evidence collector contract (test-only, version 1)

Status: the complete guarded workflow, public validators and collector have
inert tests. **No host execution is authorized or performed.** The finished
procedure for separate review/approval is
[HERDR_SERVER_RESTART_RUNBOOK.md](HERDR_SERVER_RESTART_RUNBOOK.md).
This contract describes saved evidence, not execution permission.
Do not create synthetic evidence or manually arm fixtures to obtain a host PASS.

Validator: `tests/host/server-restart-evidence.mjs`.
Controller/collector core: `tests/host/server-restart-control.mjs` (CLI only exposes
read-only offline `--inspect`; no live entry/stop/arming commands in that module).
Guarded host workflow: `tests/host/server-restart-live.mjs`; its frozen CLI requires
`--execute-reviewed-procedure` for every live operation and separate user approval.
Tests: `test-server-restart-evidence.mjs` and `test-server-restart-control.mjs`
under `tests/session/`, plus `test-server-restart-live.mjs`.
No production record, launcher, mount policy or Herdr protocol is changed.

## Validator entry points and limits

- `validateStop(directory)` / CLI `--check-stop DIRECTORY`: verifies immutable
  inputs and pinned official reporter, seed checkpoint/history/runtime, explicit
  stop approval/command, old server/socket disappearance and empty container
  inventories. Compares the stopped archive against the actual saved session,
  conversation and v3 record before any re-entry. Requires precisely the first
  three completed lifecycle stages and only the seed launch reservation. It is
  **not** a successful restart assessment or authorization to resume.
- `assessRestart(directory)` / CLI `--assess DIRECTORY`: adds fresh-server/shell/
  container identity, exact native argv, original history plus one new turn,
  unchanged v3 bytes, visual confirmation, Pi/shell exit and empty final container
  queries. Requires the complete six-stage receipt sequence and exactly two
  launch reservations. Outputs `saved_evidence_validated`, not a live-state or
  overall Phase 3 PASS. It never starts anything or writes files.
- `validateEntry(directory, phase, state='saved')`: full-input initial-empty-shell
  or restored-entry check. `state='pending'` reads the real uncertain journal and
  projects only its internally derived entry confirmation for structural checking;
  no caller receipt/reader/hash is accepted. Seed checks genuine ready-shell/server
  evidence, named status, empty selected snapshot/inventories and unarmed stages.
  Restored entry stays uncertain until automatic startup/continued-turn artifacts
  exist, then verifies both lifetimes and continuity. The live controller checks
  pending, publishes the entry, then checks saved state before further progress.
  `receiptPending: true` never grants execution authority.
- `validateCheckpoint(directory, phase)`: full-input saved-evidence check for the
  `seed` or `restored` open checkpoint. Requires exactly two or five completed
  lifecycle stages respectively. Seed needs no stopped archive; restored needs
  stop/new-lifetime/native-argv/continued-history evidence but no later visual or
  exit artifacts. Returns `checkpoint_evidence_validated`, `complete: false`;
  it cannot substitute for the stop gate or finished assessment.
- `validatePending(directory, step, candidate)`: the user selected this narrow
  **validate-before-publish** API. Supported steps are only `seed-checkpoint`,
  `stop`, `restored-checkpoint`, `finish`. Candidate keys must be exactly
  `{step, outcome, session, at}`, with matching step/name, `confirmed_success`
  and canonical ISO timestamp. The saved journal must end with precisely that
  stage's single uncertain receipt. All previous stages and evidence must pass.
  Only the proposed last receipt is projected; frozen inputs, official reporter
  and every other artifact are read from the real supplied directory. No reader,
  validator callback, reporter hash or bypass option can be supplied. Results
  say `pending_evidence_validated`, `receiptPending: true`, `complete: false`.
  **This is never permission to re-enter.** After publication the ordinary
  saved-directory gate and completed controller publication proof are mandatory.
  This API has no CLI mode and never publishes the proposed receipt itself.
- `validateStopArtifacts(reader, fixture)` / `assessRestartArtifacts(reader,
  fixture)`: internal artifact-contract core for synthetic unit tests. These
  **do not validate immutable inputs or reporter bytes**; their distinct results
  always say `inputsValidated: false`. They must never be used as execution gates.
  Public wrappers always run `validateInputs` first and cannot disable its pin.
  `validateRuntimeArtifacts`, `validateCheckpointArtifacts` and
  `validatePendingArtifacts` are likewise raw-artifact helpers, not gates. The
  pending helper also reports `receiptPending: true` and `inputsValidated: false`.
- `validatePreparation(reader)`: validates frozen preparation inputs without
  requiring the not-yet-installed reporter; returns preparation metadata only.
  The offline inspector uses it. It is **not** runtime validation, permission to
  arm/enter, or a substitute for `validateInputs` at a public gate.

All results have `liveStateInspected: false` and `phase3Complete: false`. A result
covers one supplied case only, not both ordinary/linked cases or image-switch
runtime coverage. A failure is a STOP, not a reason to manufacture evidence,
retry a mutation, repair metadata, rewrite history, or clean resources.

The collector's recorded observations and human answers are trusted evidence,
not cryptographic attestation that no unrecorded manual actions occurred. Hashes
catch changed/mismatched saved inputs; they do not authenticate an adversarially
rewritten fixture. Independent host review remains necessary. Synthetic tests
exercise contract acceptance/rejection, **not** a genuine stopped/restarted
server or a successful public assessment with an installed official reporter.

## Safe artifact reads and copied fixtures

Use an absolute canonical directory. Reads reject symlinks in artifact paths,
traversal, `.env` names, non-regular files, empty/oversized files (16 MiB limit),
invalid UTF-8 for text, changed root identities and files changing during a read.
The validator does not follow recorded host paths into the host filesystem.

When a retained fixture is copied for review, only artifact lookup is rebased
from recorded `fixture.root` to the supplied directory. Literal host selections,
container cwd, launch refs, v3 bytes, shim argv and source hashes stay unchanged.
This is offline evidence review, not conversation migration or pointer repair.

`control/fixture.json` and `preparation.json` come from offline preparation. Their
initial `prepared_only_not_run_ready` status is immutable historical preparation
state, not a source of truth about later host execution. The input manifest is
verified against `preparation.inputsSha256`; duplicate/outside/unexpected paths
are rejected before reading them. The official reporter is validated separately
against pinned Herdr 0.9.5 SHA256
`2c5272d732b475bbf91a027203b1f98d25fe43d2c1402530a442b288aeaca1e4`.
It must come from the official host installer in the private deployment. The
validator does not install, vendor, patch or substitute a reporter.

Preparation snapshots the validator under `control/server-restart-evidence.mjs`,
the core under `control/server-restart-control.mjs`, non-secret tool/PATH metadata
under `control/host-tools.json`, the guarded entry under
`control/server-restart-live.mjs`, ready/immediate-finish helpers under
`control/pane-helpers.sh` and `control/finish.sh`, the reviewed runbook under
`control/runbook.md`, and this contract under `control/evidence-contract.md`. `terminalWorkflow` is
`two_normal_host_terminals`, reflecting the user's procedure-design choice.
Old unarmed preparation artifacts without them need not be reused or repaired;
there has been no approved host run of this harness.

## Controller/collector and guarded workflow

`ArtifactStore` only creates exclusive files under logs/step reservations; it
cannot overwrite copied inputs, conversation data, records or existing captures.
Journal appends reject symlinks and multiply-linked files. `StepLedger` enforces
the exact ordered stages below, with exclusive step and confirmation reservations.
An orphan reservation, incomplete journal, failure or extra stage blocks further
progress. `confirmBoundary(step)` now hardwires checkpoint/stop/finish confirmation
to the public pending validator, publishes the one receipt only after success,
then invokes the ordinary saved-directory checkpoint/stop/finish validator.
It accepts no callback or synthetic bypass. Generic `confirm` is restricted to
entry stages; it cannot confirm a checkpoint, stop or finish.

Each data boundary has `control/steps/<step>/publication-required.json`, an
exclusive `confirmation/` reservation and, only after saved-directory validation,
`publication-validated.json` binding the exact success receipt and expected
normal-gate status. Completed journal rows without matching publication proof
block ledger inspection/next-step entry. Thus a crash after publishing but before
revalidation cannot permit the next mutation or silently retry confirmation.
Post-publication failure also saves `logs/controller-failure.json`; public input
validation and the ledger reject its presence, even if empty. No rollback,
receipt rewrite, resource cleanup or automatic retry occurs.

Directory validators remain saved-evidence assessments, not execution authority:
the live controller must check both their result **and** the strict
ledger before any next mutation. The completed live wrapper does so and calls
only public entry/checkpoint/stop/assessment gates, never synthetic helpers.

`ReadOnlyRunner` has an explicit command allowlist: named status/snapshot, version,
local Docker context/engine/plugin/image metadata and exact-label inventories/
projected container inspection. No bare Herdr, attach, stop, installer, image
mutation or removal command is allowed. Calls have a 20-second timeout and 1-MiB
output cap. Each query is reserved before invocation and saves its result before
checking success; repeat collection cannot overwrite or resend that query.
Invalid UTF-8 fails closed, with original failure bytes retained as base64 rather
than silently replaced; such a receipt cannot pass a gate.

`CollectorCore` implements initial preflight, open-Pi runtime/history/record
capture, post-stop disappearance polling/archive and final-shell/empty-inventory
capture. Polling repeats only read-only observations of the recorded server PID
and two private sockets, with a bounded monotonic deadline. It never sends stop,
kills a server, removes a socket/container, repairs a record, arms a phase, or
commits lifecycle success. Core results say `captured_only`,
`inputsValidated: false`, `liveStateInspected: false`, `phase3Complete: false`:
injected observations are not live attestation, and collection alone is no gate.

`server-restart-live.mjs` implements the complete two-terminal procedure with
exclusive whole-operation reservations, original-root/0700/same-owner checks,
real Linux/nonroot/TTY/inherited-context guards, frozen tool resolution/identity
checks, stable local Docker endpoint/context/daemon checks, typed entry/stop/
visual confirmations, official private installation, initial ready proof,
one-shot named stop, separate fresh entry and immediate builtin shell return.
The shim's pure `--check-launch` gate requires pinned inputs/reporter, coherent
phase files and the correct strict ledger before exec; it cannot arm or choose a
conversation. Failed starts retain their exclusive raw launch reservation.

Linked entry requires the completed original ordinary assessment/ledger/final
client receipt before even querying the daemon; the pair assessor checks that
prerequisite binding, independent identities and both completed client returns.
The final public result is retained as `logs/assessment.json`. New dynamic
artifacts also include `logs/host-tools.json`, `logs/daemon.json`,
`logs/entry-{seed,restored}-client.json`, `logs/ordinary-prerequisite.json` (linked),
`logs/ready-shell.stat`, `logs/ready-runtime.json` and `logs/ready-status.json`.
No record/profile/reporter is repaired on uncertainty, and no cleanup is supplied.

What remains is host procedure review, explicit execution approval, actual host
runs and evidence review—not an implementation stub. Do not import low-level
helpers, arm phases manually or manufacture evidence to bypass that approval.
Full-input positive integration tests use genuine SHA-pinned upstream reporter
source only as data in synthetic fixtures with inert I/O; they do not run an
official installer or attest a genuine runtime restart.

## Command result envelope

Every saved CLI query/stop result uses this shape; `argv` excludes the executable:

```json
{
  "argv": ["--session", "pi-restart-example", "status", "server", "--json"],
  "exitCode": 0,
  "signal": null,
  "error": null,
  "timedOut": false,
  "truncated": false,
  "stdout": "original stdout bytes as UTF-8",
  "stderr": "original stderr bytes as UTF-8"
}
```

Capture through bounded calls with output caps and no automatic retries. Never
turn a query failure into an empty result. Preserve failed/uncertain results even
though they cannot pass the validator. Do not store credentials, real environment
files, full process environments or full Docker inspections. The projection
below intentionally omits container environment variables.

## Files and capture boundaries

### Preparation / immutable inputs

Retain all copied deployment/control files, `inputs.sha256`, `preparation.json`,
private fixture sentinels/config, `data/config/extensions/herdr-agent-state.ts`
and the selected fixture directory. A linked fixture also retains its gitfile
and main `.git` directory. The latter is a retention check, not an independent
Git mount policy implementation. Production launcher discovery remains authority
for the real launch. Do not change literal gitfile pointers in copied evidence.

### Initial empty pane and each open-Pi checkpoint

- `logs/seed-preflight-snapshot.json`: raw `herdr api snapshot` response while
  the initial selected shell is empty; server 0.9.5, one workspace/tab/pane, no
  agent/session ref. The future seed workflow must first select/cd to the exact
  fixture directory in that shell, then launch as a separate foreground job.
- `data/config/phase3-restart-{seed,restored}-startup.json` and
  `...-checkpoint.json` / `...-snapshot.json`: exclusive artifacts emitted by
  `restart-checkpoint.ts`, unchanged. An `...-error.txt` file, even empty, blocks
  acceptance. The raw snapshot and checkpoint snapshot/agent must agree.
- `logs/{seed,restored}-live-snapshot.json`: a second, host-side named
  `['--session',<name>,'api','snapshot']` query envelope after the checkpoint.
  Require the same official path/pane/cwd, settled live Pi, one workspace/tab/pane
  and no restore error/pending launch. Persisted checkpoint metadata alone is
  insufficient if the current identity has changed.
- `logs/{seed,stopped,restored}.jsonl`: exact bytes of the conversation at each
  boundary. Seed and stopped bytes must match; restored must retain the complete
  seed byte prefix. JSONL must have a stable session header, linear unique entry
  IDs/parents, persisted title, and exact offline user/assistant history. No
  compaction/branch-summary, alternate provider, unfinished/tool conversation or
  replacement history is allowed in this fixture.
- `logs/{seed,stopped,restored}.record`: exact NUL-delimited v3 launch record.
  All must equal `pi-docker-herdr-v3\0<exact selection>\0backend\0`.
- The final conversation and launch record must remain in the original exact
  directory/name storage and match the final copies, not reconstructed paths or
  replacement conversations. The validator derives the current v3 key with the
  production format and rejects unsupported keys; it implements no migration.

### Launcher reservations (raw shim evidence)

Exactly `logs/launch-seed/` and (after re-entry) `logs/launch-restored/`, with:

- `argv.nul`: each original argument followed by NUL. Seed argv is exactly
  `<selection> --name backend --herdr`; restore is exactly
  `--session <seed official managed reference>`, without extra flags or image.
- `cwd.txt`: exact selected host directory followed by LF.
- `executable.txt`: copied `<recorded root>/bin/pi` followed by LF.
- `process.stat`: raw `/proc/<shim pid>/stat` before exec.
- `shell.stat`: raw `/proc/<shim parent pid>/stat` at the same boundary.
- `outcome.txt`: literal `uncertain\n`, the original one-shot reservation. Do not
  overwrite it with a guessed success. Later official checkpoint and lifecycle
  receipts confirm progress independently. A failed launch stays reserved.

The shim now captures parent-shell stat as well as its own stat. Neither file
contains process environments. The controller must confirm the actual ancestry;
it must not guess a server PID, search unrelated working sessions, or infer that
persisted Pi metadata proves a live process.

### Runtime projection, once per server lifetime

`logs/{seed,restored}-runtime.json`:

- `version: 1`, `session`: exact disposable name.
- `cli`: envelope for `['--version']`, reporting `herdr 0.9.5`.
- `status`: envelope for `['--session',<exact name>,'status','server','--json']`,
  collected by the human's host-side procedure with the fixture's private XDG
  paths and explicit named target. Do not fabricate/replay pane/socket context
  or rely on a focused/default session. The host agent must not execute this
  without the separately approved disposable-session procedure. Original JSON
  must show running, compatible server 0.9.5, exact session and private
  `herdr.sock` path. A container-side status projection is not a substitute:
  its local session/socket labels can differ. Herdr 0.9.5 status has **no PID
  field**; do not invent one in the raw result.
- `server: {stat, bootId, exe}`: raw stat, Linux boot ID and canonical executable
  path captured from the genuine pane-shell ancestry. Require the shell to be a
  child of that server and the shim a child of that shell. Server comm is pinned
  to `herdr` for this reviewed harness; a different topology/name requires review,
  not a guessed PID or automatic fallback.
- `shellStat`: raw stat for the parent shell, matching the shim's saved parent
  identity. Use PID **and start ticks**, retaining ticks as strings to avoid
  numeric precision loss. Server/shell/launcher start order must be possible,
  and the new server cannot predate the seed server on the same boot. Do not
  require the PID to change; reuse with a new start identity is valid. A host
  reboot is outside this graceful restart gate.
- `socket: {path, dev, ino}`: observed API-socket path and positive decimal device/
  inode strings. The pathname may stay the same, and even inode reuse is possible;
  disappearance plus a new server lifetime, not inode inequality, is required.
- `customLookup`: envelope for `['image','ls','--filter',
  'reference=pi-docker:custom','--format','{{.Repository}}:{{.Tag}}']`.
- `imageInspect`: envelope for `['image','inspect',<freshly selected tag>,
  '--format','{{.Id}}']`. Both lifetimes must select the same tag and image bytes
  for this gate. Image-switch testing is separate. No image mutation is allowed.
- `containerId`: full Docker ID. `containerInspect`: envelope for
  `['inspect','--format',CONTAINER_FORMAT,<full ID>]`. Import the exact
  `CONTAINER_FORMAT` string from the validator; its JSON projection has `id`,
  `hostname`, `running`, `image`, `imageId`, `labels` and omits environment.
  Validate fixture run/project labels, the running state, and the ID-derived
  hostname against the open Pi observation. Seed/restored IDs must differ.

### Explicit entry, stop and stopped persistence

- `logs/entry-{seed,restored}-approval.json`: `{phase, session, answer, disposable,
  observation, at}`. Phase is `seed` or `restored`; answer must be the exact name,
  disposable must be true and observation nonblank. Initial entry approval must
  precede its uncertain entry receipt; fresh re-entry approval must be between
  confirmed stop and uncertain fresh entry. These record human consent, not an
  agent's inferred permission. Stop-only validation needs only seed approval.
- `logs/stop-approval.json`: `{session, answer, disposable, observation, serverPid,
  at}`. Answer must be the exact disposable session name, `disposable: true`,
  observation nonblank, and PID must match the seed server. `at` is an ISO UTC
  timestamp between confirmed seed checkpoint and uncertain stop receipt.
- `logs/stop-command.json`: envelope for exactly `['session','stop',<name>]`,
  once. No default session, broad kill, upgrade, implicit shutdown trap or retry.
  This records the human's separately approved action, not agent authorization
  to control a foreign session outside inherited context.
- `logs/stopped-boundary.json`: `{version:1, session, serverProbe, sockets}`.
  `serverProbe` contains original `pid`, `bootId`, and either
  `{status:'absent',code:'ENOENT'}` or `{status:'replaced',stat:<raw new stat at
  that same PID>}` with a different start identity. EACCES/query failure is not
  absence. `sockets` is the ordered API/client pair with exact private
  `herdr.sock` / `herdr-client.sock` paths and `status:'absent', code:'ENOENT'`.
  Capture with bounded observation, preserve uncertainty, never remove sockets.
- `logs/stopped-session.json` and `logs/stopped-session-history.json`: original
  stopped named-session files. Check current snapshot format 3, one workspace/
  tab/pane/layout, exact saved shell cwd/public pane mapping and official seed
  reference. Reject a saved custom `agent_resume`, which would override native
  planning. Screen history is retained but is **not conversation evidence**.
  Before re-entry, `--check-stop` compares copies with actual private files.

The snapshot field checks follow pinned Herdr v0.9.5
[`src/persist/snapshot.rs`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/persist/snapshot.rs).
Status fields follow
[`src/cli/status.rs`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/cli/status.rs),
and named socket paths follow
[`src/session.rs`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/session.rs).
Source inspection is not a live test.

### Empty container queries

For each boundary `pre-entry`, `stopped`, `final`, retain both
`logs/<boundary>-containers-{run,project}.json` envelopes. Argv is exactly
`['ps','--all','--filter',<filter>,'--format',INVENTORY_FORMAT]`:

- run filter: `label=pi-docker.phase3-run=<project>`
- project filter: `label=com.docker.compose.project=<project>`
- `INVENTORY_FORMAT`: `{{.ID}} {{.Names}} {{.Status}}`

Both successful stdout values must be empty/whitespace only. These are historical
queries, never an assertion about current host resources. Retained containers
or a failed query stop the workflow; no force-remove or automatic cleanup.

### Lifecycle ordering, visual confirmation and final shell return

`logs/receipts.jsonl` contains exactly two entries per stage, in order:

1. `entry-seed`
2. `seed-checkpoint`
3. `stop`
4. `entry-restored`
5. `restored-checkpoint`
6. `finish`

Each entry has `{step, outcome, session, at}`. Outcomes are `uncertain` before
attempting/observing that step, then `confirmed_success` only after its evidence
is captured and checked. Record failed outcomes too, but the assessor rejects
them; missing/uncertain/duplicate/reordered outcomes cannot pass. Timestamps are
ISO UTC with milliseconds, monotonically nondecreasing. The collector must
reserve steps exclusively, not replay or overwrite them. Stop-only validation
requires exactly stages 1–3, before any restored launch reservation exists.

- `logs/visual.json`: `{session, answer:'yes', observations:<nonblank>,
  manualReopen:false, recoveryUi:false, at}`. Timestamp between confirmed restored
  checkpoint and uncertain finish. Ask the human to verify original history,
  title/cwd and automatic start, with no Continue/Fork or manual reopen.
- `logs/final-exit.json`: `{session, piExitCode:0, shellReturned:true,
  observation:<nonblank>, at}` between uncertain/confirmed finish receipts.
- `logs/final-shell.stat`: actual parent shell returned to foreground after Pi
  exits; same PID/start identity as restored shell, still parented by the restored
  server, and pgrp equals tpgid. Capture
  shell status immediately at a real interactive shell boundary, not after an
  unrelated successful command. A human observation is not a substitute for the
  required raw shell/exit/container receipts.

## Remaining implementation gate

Build the separately reviewed controller, including private environment entry,
version/image/context/Unix-socket-length preflight, official installer, stage
reservations, actual `/proc` ancestry collection, bounded capture/probes,
human-only stop approval, fresh re-entry, checkpoint/visual/exit collection and
inert negative tests. Wire only the public validators into its gates. Then
present exact host commands and obtain explicit execution approval. No host run,
server stop or resource cleanup is authorized by this document.
