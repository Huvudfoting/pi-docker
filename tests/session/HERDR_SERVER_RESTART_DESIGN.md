# Phase 3: disposable automatic server-restart restore — design

Status: **SECOND ORDINARY HOST ATTEMPT BLOCKED; STARTUP INITIALIZATION FIX/AUDIT.**
The user-approved `/tmp/pi-docker-restart.FopIIj` (`pi-restart-fopiij`) passed
ready, opened Pi and reported the seed checkpoint saved. Collection rejected
changed immutable settings after Pi added `lastChangelogVersion: "1.5.2"` and
pretty-serialized the JSON. The user chose fixing this and auditing startup
writes before another fresh fixture. Preserve its open Pi and BOTH failed
fixtures/sessions without detach, quit, stop, repair or cleanup. Preparation now
pre-seeds the marker and uses exact SDK save serialization. See the audit below.

Earlier first attempt:
User-approved `/tmp/pi-docker-restart.dyN3HI` (`pi-restart-dyn3hi`) opened its
initial shell but ready rejected the config after Herdr added `onboarding = false`.
Pinned 0.9.5 `client/shell/overlay_input.rs::complete_onboarding` performs exactly
that write. Preparation now disables onboarding before hashing, and tests assert
exact top-level TOML for both cases. Preserve the failed fixture/server untouched;
no seed Pi or restart was reached. The user chose a fresh fixture, whose exact
plan requires new approval. Do not repair/re-hash/resume the failed attempt.
The user requested finishing implementation, not executing a restart. The complete
host procedure is [HERDR_SERVER_RESTART_RUNBOOK.md](HERDR_SERVER_RESTART_RUNBOOK.md).
Neither document authorizes stopping a server. Phase 3 remains open; the real
restart gate is NOT RUN. Existing native launcher-protocol passes need no rerun.

## Implemented harness and validation

- `tests/host/prepare-server-restart.mjs`: offline-only preparation with fresh
  mode-0700 fixtures, copied deployment, ordinary/fixture-local linked checkout,
  production mount discovery under isolated Git configuration, private Pi/Herdr
  config/home/state, frozen input hashes, unarmed stages and a non-live runbook.
  Preparation never invokes Herdr, Docker or Pi, including version/image probes.
  It snapshots its own source and this design for later evidence review.
- Generated fresh-shell wrapper restores the fixture environment without
  depending on exports from an old pane. It disables system/user rc files and
  inherited Bash startup hooks/functions/options (`--noprofile --norc -p`, without
  changing UID). It preserves inherited Herdr context. A transparent one-shot
  shim logs exact argv and its own/parent-shell raw process stat, then execs the
  unchanged copied launcher; it refuses the default unarmed stage and reserves failed
  launch attempts so they cannot be retried silently.
- `tests/session/restart-checkpoint.ts`: separate test-only observer saves
  exclusive startup history before the provider can overwrite its latest result,
  then strictly checks settled history and official live identity. The seed
  checkpoint explicitly says **leave Pi running**, not `/quit`. Observer failure
  blocks later attempts; the existing native checkpoint/reporter is unchanged.
- `tests/host/server-restart-evidence.mjs`: read-only stopped-boundary validator
  and cross-lifetime saved-evidence assessor, with public input/reporter pinning
  separate from its synthetic-test artifact core. Checks exact official refs,
  v3 bytes/storage/history, stopped snapshot, explicit approvals, ordered receipts,
  raw process/shell lineage and new lifetimes, native argv, container/image
  projections, socket disappearance, visual/final-exit and empty inventory
  evidence. It never runs a command or inspects live state. Collector format:
  [HERDR_SERVER_RESTART_EVIDENCE.md](HERDR_SERVER_RESTART_EVIDENCE.md).
- `tests/host/server-restart-control.mjs`: controller/collector **core**, with an
  offline-only `--inspect` CLI. Includes exclusive artifact/step/query reservations,
  append-only ordered lifecycle journal, projected read-only validation before
  confirmation, genuine-context/private-environment guards, scoped read-only
  command allowlist, bounded receipts, initial version/image/empty-inventory
  preflight and open/stopped/final-shell collection. Actual observations derive
  the server from recorded shell ancestry; stop polling reads only the recorded
  PID and two private socket paths. Failures preserve evidence/reservations.
  This core does not execute live entry/stop/arming or install the reporter;
  collection results explicitly do not validate inputs or attest live state.
  Preparation now freezes this module and a non-secret host tool-path snapshot.
  Public checkpoint gates now validate seed/restored evidence independently of
  later stages. The user selected narrow pending-receipt validation before
  publication: `confirmBoundary` hardwires the public full-input pending check,
  then publishes and runs the normal saved-directory gate. Missing publication
  proof/crashes block next-step entry; generic callbacks cannot confirm data
  boundaries. Pending results never permit re-entry on their own.
- `tests/host/server-restart-live.mjs`: complete guarded host controller with
  offline `--plan`/`--assess-pair` and explicit-review-flag live entry, ready,
  collection, named stop, separate fresh entry, visual and immediate-exit steps.
  Uses the official copied private installer, frozen executable identity checks,
  local daemon/context identity checks, real shell/server ancestry and exclusive
  operation reservations. Initial entry is public-gated; restored entry is
  confirmed only after automatic startup/continued-turn evidence is captured.
  The shim checks full input/reporter/ledger/phase prerequisites before exec;
  partial arming cannot silently launch Pi. No restored Pi command is generated.
  Linked entry requires the completed ordinary public gate/ledger/client receipt.
  Preparation freezes the controller, ready/finish builtin helpers and runbook.
- Local tests use inert command substitutes, a no-request local socket, a fresh
  PTY shell and synthetic archived evidence. They cover preparation/isolation,
  one-shot receipts, startup retention, stale identity/history, no retry, same-
  server reattach, PID/inode reuse, custom-resume overrides, incomplete/failed
  boundaries, changed records/storage, manual reopen and visual/exit failures.
  Synthetic core success explicitly reports `inputsValidated: false`; public
  wrappers have no option to bypass frozen inputs or official reporter bytes.

**Remaining:** independent review and explicit approval of a newly prepared host
plan, followed by the actual ordinary/linked host runs and evidence review. No
implementation stub or missing live step remains. Runtime behavior is untested:
agent-side tests used inert substitutes, never real Herdr/Docker/Pi. The user
host attempt above reached only initial entry and the blocked ready check.
Do not manually arm, repair, retry, clean up or import low-level helpers to bypass
the guarded procedure. The complete CLI is not permission to execute it. No real
server restart, image runtime or continuity PASS can be inferred from unit tests.

Safety review completed (static/inert only):
- Repeat the public stopped-evidence gate and strict ledger after fresh-entry
  approval, not only before the potentially long human prompt. Recheck the local
  daemon/context, boot/old lifetime, both sockets, both inventories and image
  selection before arming/attaching. A changed history/record/persistence cannot
  be hidden by starting a new server first.
- Repeat the seed public gate and daemon check after stop approval, then check the
  old process/socket/data immediately before the exact named stop. Revalidate
  frozen inputs and tools immediately before private installation and attachment.
- Recheck same-owner mode-0700 root protection after approvals and before arming,
  installation, attachment or stop. Tool checks enforce the recorded SHA256 as
  well as inode/size/timestamps and PATH resolution.
- Eighteen prompt-time drift regressions cover these boundaries; the executable
  test also rejects a wrong digest even when filesystem metadata is unchanged.
  No live mutation was used to verify these safeguards. This is not atomic
  check-to-exec isolation against a malicious/concurrent same-user actor; the
  reviewed procedure prohibits concurrent fixture/configuration edits.

Local checks (no host runtime claims):

```bash
node --test tests/session/test-server-restart-preparation.mjs \
  tests/session/test-restart-checkpoint.mjs \
  tests/session/test-restart-settings.mjs \
  tests/session/test-server-restart-evidence.mjs \
  tests/session/test-server-restart-control.mjs \
  tests/session/test-server-restart-live.mjs
```

Validation: **138 evidence-validator, 70 core, 40 live-workflow and 5 SDK settings
tests**; restart-specific suite **291 passed** and full session suite **331 passed,
1 skipped** with the explicitly selected, SHA-pinned upstream reporter source
asset read as inert test data (jq unavailable). Without that asset, 28 full-pin
simulations skip explicitly: full suite **303 passed, 29 skipped**. No reporter
source is vendored or executed, no real official installer is run by tests, and
public synthetic saved-evidence success still reports no live attestation or
Phase 3 completion. No dependencies were installed.

Next: present the frozen plan/runbook for explicit host execution approval. Do not
run it here or repeat previously completed native gates.

## Pi 1.5.2 startup-write audit

Scope: installed package `@earendil-works/pi-coding-agent` version 1.5.2; its
`dist/main.js`, `cli/startup-ui.js`, `modes/interactive/interactive-mode.js` and
core settings/resource/package/agent-session paths. No live Pi CLI/TUI, model,
network, Herdr or Docker execution was used for this audit. This is not a claim
that arbitrary extensions/images can never write settings.

- `getChangelogForDisplay` records VERSION on a fresh session if its marker is
  missing/unreadable/older. Pre-seed `lastChangelogVersion: "1.5.2"`. Resumed
  sessions with messages skip this startup path.
- `SettingsManager.persistScopedSettings` writes `JSON.stringify(value, null, 2)`
  with NO trailing newline. Generate those exact bytes initially: an
  identical-value model/version save must not invalidate the immutable hash.
  Load/migration alone does not persist; the fixture has no legacy queueMode,
  websockets, skills-object or retry.maxDelayMs migration keys.
- First-time theme/analytics setup requires a missing settings file, experimental
  features and no custom agent directory. The fixture supplies an existing file
  and private agent-dir override, so both guards independently suppress setup.
- Extension changelog writes apply to package-origin extensions with package
  version/changelog metadata. Fixture packages are empty; its extensions are
  loose auto/CLI resources. Unexpected packaged extensions remain outside this
  audit and may trigger the strict guard rather than being silently accepted.
- Project trust changes visibility in memory, not the global settings file.
  Package install/remove and interactive theme/model/thinking/settings changes
  can persist settings, but are not part of the approved test commands. There
  are no CLI model/thinking overrides in the exact seed/native-restore argv.
- Analytics/install telemetry are disabled and PI_OFFLINE is set; no auth/login
  flow or transported model call is used. Device IDs are generated on explicit
  auth/provider paths, not by merely loading the fixture settings.

Five `test-restart-settings.mjs` cases exercise the REAL installed SettingsManager
against newly allocated test-only directories. Narrowly extracted installed
startup method bodies run in a VM with intercepted telemetry, actual changelog
parsing and only controlled resource descriptors; full UI/auth/model modules are
not imported. Tests reproduce the pre-fix rewrite, prove ordinary/linked byte
stability through startup/trust/identical-value persistence and resumed startup,
prove first-time setup guards, and prove semantic drift is still rejected by the
public immutable-input validator. No existing fixture or credential file is read.
The five cases skip explicitly if the installed 1.5.2 SDK is unavailable; an
explicit `PI_RESTART_TEST_PI_ROOT` override must exist and match that version.

No in-place repair or hash exemption is introduced. Actual host continuity still
requires a fresh reviewed/approved fixture and real runtime evidence.

## Scope and success claim

Test a graceful stop and fresh start of one genuinely new, named disposable
Herdr 0.9.5 server while an offline fixture Pi conversation is still open.
Herdr must automatically invoke the deployment launcher with the official saved
managed reference, recovering the same conversation and exact selected directory.
A detach/reattach, handoff, manually issued `pi --session`, or a reused live
container is **not** a pass.

Use two independent cases, each with its own fresh fixture and disposable server:

1. Ordinary directory (expected container cwd `/workspace`).
2. Linked checkout, selected at `packages/backend` (expected cwd computed by the
   existing mount contract, not copied from the ordinary case).

One pane/workspace/tab per server avoids additional topology and duplicate-session
restore behavior. Start with the ordinary case; stop on any failure before the
linked case. These are new automatic-restart cases, not repetitions of the
completed manual native reopen gate. No image switching, checkout replacement,
failure-path mutation, worktree removal, or helper orchestration is included.

## Source-reviewed contract

Reviewed upstream tag [v0.9.5](https://github.com/herdrdev/herdr/tree/v0.9.5),
commit `2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01`, root Git tree
`8aa25836bb7c8d14ffa866a852dbc724098ca088`. These are source observations, not
Rust tests run here or runtime evidence. Use the tag/commit, not upstream main.

- [`src/agent_resume.rs`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/agent_resume.rs):
  official `herdr:pi` references prefer the reported path. Native planning yields
  exactly `pi --session <reference>`, not the original launcher flags or image.
- [`src/persist/restore.rs`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/persist/restore.rs),
  `restore_tab` and `pane_restore_startup`: saved cwd and official session data
  feed a deferred native plan; missing saved cwd produces an unavailable terminal.
  Native restore does not reuse saved screen history as the agent's conversation.
  Reported custom resume argv can take precedence; the fixture must not install
  or report one to substitute for native Pi planning.
- [`src/app/agent_resume.rs`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/app/agent_resume.rs),
  `start_pending_agent_resume`: spawns a new configured shell, then queues the
  quoted planned argv and Enter. Scheduling depends on runtime/theme/geometry;
  attachment and a bounded observation window are needed. A snapshot containing
  persisted Pi metadata alone does not prove a live restored Pi exists.
- [`src/config/model.rs`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/config/model.rs):
  `session.resume_agents_on_restore` defaults true. The private test config must
  explicitly enable automatic resume and select a known shell. Verify that the
  server's persistence policy is active by inspecting the saved session; do not
  invent a `session.enabled` or persistence config key.
- [`src/server/headless.rs`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/server/headless.rs)
  saves the session on ordinary shutdown;
  [`src/app/session.rs`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/app/session.rs)
  serializes the save and accounts for pane-exit checkpoints. Keep Pi alive and
  settled until the stop, rather than `/quit` and risk saving an empty shell.
- [`src/session.rs`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/session.rs):
  named sessions use a separate `config_dir()/sessions/<name>` data directory.
  Named session stop requests `server.stop` and waits for sockets to disappear.
  This stops pane processes; it is not a detach or live handoff.
- [`src/config/io.rs`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/config/io.rs)
  and [`src/persist/io.rs`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/persist/io.rs):
  `HERDR_CONFIG_PATH` selects a config file, but **does not isolate the session
  directory**. `XDG_CONFIG_HOME` determines Herdr's config directory;
  `XDG_STATE_HOME` controls its state directory. Session JSON/history live in the
  named session data directory. Preserve actual resolved paths in receipts.

## Critical difference from the existing harness

`tests/host/verify-native-restore.sh` creates a copied deployment and exports its
PATH, private HOME, Docker configuration selection and Compose project only in
the driver/children. `native-boundary.sh` explicitly reconstructs that environment
for manual reopen. Neither mechanism configures a newly spawned Herdr restore
shell. Do not add a restart flag to that script and assume its exports persist.
The existing checkpoint also tells the operator to `/quit`; that instruction is
wrong at the pre-stop checkpoint for this test.

The proposed harness must establish its private environment **before the first
server launch and again before the fresh server launch**, through the same
fixture-local operator entry point. No global launcher symlink, shell rc change,
shared config modification, production reporter patch, or fabricated Herdr caller
variables. The host human launches/reattaches the disposable session; the coding
agent must not use an out-of-context CLI to control another session.

## Harness structure

The separate host preparation driver creates a mode-0700 fixture root and emits
an inspectable, hash-pinned runbook plus fixture-local entry points. It never
starts Herdr, Pi, or Docker during preparation. Responsibilities:

- **Prepare:** copied deployment and local ordinary/linked Git fixtures; private
  Pi auth/settings/provider/checkpoint; private Herdr config/state/home; pinned
  control files; no API calls and no stop capability during this stage.
- **Enter:** human-run from a normal host terminal outside Herdr, only after
  separate approval. Establish private PATH/HOME/XDG paths, preserved host Docker
  CLI context selection, Compose project, and an exact new non-default session
  name before invoking host Herdr. Refuse inherited Herdr/agent/socket context;
  do not unset real context to bypass this check. On re-entry use the same
  fixture and name, with an explicit receipt proving the prior stop completed.
- **Observe/checkpoint:** run inside genuine inherited context. Read-only Herdr
  snapshots and fixture file validation; never report replacement identity,
  synthesize a resume reference, or write a reported resume argv.
- **Stop boundary:** emit a review checkpoint, not an automatic chained restart.
  Only the human performs the separately approved exact named-session stop from
  their normal host terminal. Never target default, use a broad kill, or upgrade.
  Capture command, exit, output and bounded disappearance checks. No automatic
  retry if the result is ambiguous.
- **Assess:** offline evidence validation plus bounded read-only host container
  inventory. Never starts/resumes/retries a launcher to make evidence pass.

Use a private Bash startup configuration (or a reviewed fixture-local shell
wrapper that execs Bash), independent of real host rc files. It must preserve
Herdr's newly inherited pane/socket context while keeping the copied launcher
first on PATH for both server lifetimes. Verify actual `pi` resolution in the
initial shell and record the executable/argv used on automatic restore via a
transparent test-only shim. The shim logs once and execs the unchanged copied
launcher with identical argv; it must not choose a conversation, add flags, set
Herdr identity, or spoof official reporting. Log exclusive per-invocation receipts
so duplicate starts cannot overwrite evidence.

Keep separate Pi-private HOME and Herdr config/state paths explicit; preserve the
original host Docker CLI configuration path without reading its contents or
mounting it into Pi. Resolve required host tool paths before isolating HOME.
Nothing may fall back to the real user's Pi auth/settings. Reuse network-none,
read-only rootfs, tmpfs, resource limits and fixture-only credentials from the
existing harness. Freshly select local custom/base each launch, assert unchanged
image availability/ID for this gate, and never pull/build/retag/remove an image.

## Two-terminal procedure decision (approved design, not execution)

The user explicitly chose **two normal host terminals**. This avoids introducing
an additional restored detach/reattach boundary merely to collect evidence; it
creates no extra Herdr pane/workspace/tab.

- **Terminal A** keeps the named disposable Herdr UI visible. The seed launcher
  is a separate top-level foreground job, not a child of a waiting shell driver.
  Terminal B can collect the settled open seed while it remains visible; A then
  detaches without quitting Pi. A fresh pre-stop read must prove the seed remains
  live before the separate stop approval. No working session is a substitute.
- **Terminal B** remains outside Herdr, uses only the approved private fixture
  environment/target, and handles bounded read-only collection and human
  confirmations. It must not copy, invent or replay pane/socket identity.
- After the exact named stop, B must archive the stopped state and pass the public
  `validateStop` gate. A fresh entry is a separate human-approved operation, not
  an automatic chained restart. Terminal A stays attached to the automatically
  restored Pi while B collects its startup/continued-turn checkpoint and visual
  answers. Manual `pi --session`, Continue/Fork or retries cannot count.
- Once B has reserved the finish boundary, A performs `/quit` and captures its
  **actual exit status immediately**, plus its own raw foreground-shell stat
  using shell builtins **before** a collector child changes the foreground job.
  The shell helper must bind that marker to its actual parent PID and inherited
  context. Never infer the status from a later command or manufacture a marker
  if it was lost. Final container queries and the public offline assessment
  remain mandatory. Final detach is not another restore test or cleanup.

Consent, terminal coordination, genuine ready/immediate-exit helpers and public
gates are now implemented and inert-tested. See the frozen runbook for exact
commands and the immediate `source control/finish.sh` requirement. The decision
does **not** authorize either terminal to run now.

## Implemented sequence (host execution pending)

| Boundary | Required evidence / action | Stop condition |
|---|---|---|
| Prepare | New fixture, source/control hashes, exact session name and private paths; no live mutation | Existing/symlinked fixture, invalid name, absent tools/image |
| First entry | Human approves creating the disposable session; CLI/server both 0.9.5, one empty shell pane, no agents; real inherited same-user socket | Existing session, foreign context, unexpected topology/version |
| Seed | Independent top-level foreground launcher job; offline marker `phase3-restart-ordinary-seed` (or linked counterpart); settled provider result | Launch failure, blocked UI, unexpected provider/history |
| Pre-stop checkpoint | Official `herdr:pi` exact path, idle/done, matching ID/file/title/cwd/v3 record; save history/hash/container ID and process identity | Checkpoint disagreement or missing evidence |
| Detach | Human detaches without quitting Pi; external read-only verification confirms same live seed conversation/container | Pi exited, identity cleared, stale official path |
| Stop approval | Show exact disposable name, private config/session paths and current server/process/container identities to human; record explicit approval | No explicit approval or target differs |
| Stop | Exactly one named-session graceful stop; record result, server process termination, socket disappearance and both run/project container inventories | Timeout/query failure, old process/container remains, uncertain outcome |
| Offline boundary | Preserve stopped session JSON/history and hashes; verify saved official seed reference and cwd, unchanged v3 record/history | Missing/invalid saved metadata, changed inputs/image |
| Fresh entry | Human starts same named session via same private environment; no manual Pi input/launch | Old server still alive, environment/hash mismatch |
| Automatic launch | Bounded observation: new server identity and socket, one shim invocation with native argv, new container, live official exact ref | Duplicate/manual start, old container, startup error, timeout |
| Continued turn | Visually inspect original history; send `phase3-restart-ordinary-restored` (or linked counterpart); wait for exact offline response, checkpoint | History missing, replacement ID/file/title/cwd, Continue/Fork UI |
| Finish | Save visual yes + observations, `/quit`, actual shell return and container-exit receipts; assess | Uncertain exit or retained fixture containers |

The pre-stop checkpoint must save while Pi remains running; it must **not** ask
for `/quit`. Archive its files before restart so the post-restart checkpoint can
use exclusive creation without overwriting seed evidence. Add a restart-specific
checkpoint mode or separate test-only extension; do not weaken native checkpoint
assertions or change the official reporter. Preserve the restored startup
observation before the provider overwrites it with settled-turn evidence.

Use server PID plus process start identity, not PID alone (reuse is possible).
Socket path may remain the same; require evidence of disappearance/recreation,
not a different pathname. Do not assert pane IDs must change; rediscover them
from genuine post-restart context/snapshots and verify topology/mapping instead.
A stopped Docker-attached client might leave its container alive: this is a
STOP finding, not permission to force-remove it or continue using a stale socket.

## Evidence and verdict

Retain receipts with stages `not_attempted`, `uncertain`, `confirmed_success`,
`confirmed_failure`; save before each mutation and preserve known identities
immediately. Include timestamps, exact operator commands, exit/output, process
start identities, socket lifecycle observations, CLI/server versions, topology,
launcher argv/executable receipts, official snapshots, copied stopped persistence,
all source/control/reporter hashes, image selection/ID, container labels/IDs,
fixture history/provider observations, v3 records and visual answers.

PASS requires all of:

- A real completed stop followed by a distinct server lifetime; seed Pi was open
  at stop and all old fixture containers were absent before fresh entry.
- Exactly one automatic native invocation, argv `pi --session <seed-official-ref>`;
  no custom resume argv, manual reopen, handoff, replacement/fallback or retry.
- Same conversation ID/file/title/storage/v3 bytes, exact host selection and
  expected container/header cwd; original user/assistant history plus the single
  new offline turn; distinct seed/restored container identities.
- Fresh official post-restart `herdr:pi` report matches that conversation and
  live settled state, not just metadata read back from disk.
- Explicit visual confirmation and successful final Pi/container exit checks.

Missing evidence is FAIL/INTERRUPTED or NOT RUN, never an assumed PASS. An
ordinary pass alone is not a linked pass or Phase 3 completion. Do not delete
fixtures/session data, repair metadata, close workspaces, remove worktrees, prune
Docker, or stage raw deployments; cleanup requires a separate explicit request.

## Local validation required before offering execution

Implement inert PTY/CLI substitutes and offline assessor tests covering:

- Prepare/help/source paths make zero Herdr/Docker control calls.
- Initial entry rejects inherited context, existing names and unsafe paths.
- Private launcher resolution survives a simulated fresh shell without driver
  exports; seed checkpoint leaves Pi alive; restored startup is archived.
- Stop/re-entry are separate, single-attempt receipted boundaries with no retry,
  implicit stop, shutdown trap, fallback targeting, cleanup or image mutation.
- Wrong target/version/topology, stale ref, bad argv, missing seed artifacts,
  changed hashes/image, retained container, query failure and timeout fail closed.
- Assessor rejects same-server reattach, unchanged container, persisted-only
  identity, duplicate starts, replaced conversation and incomplete visual evidence.

Existing native tests should remain green. These local checks validate harness
logic only, not host Docker/Herdr runtime. Before host execution, present the
finished scripts, exact environment/config/stop target and safety boundaries for
review and obtain explicit approval. The complete guarded harness is supplied;
no host run is currently authorized.
