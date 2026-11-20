# Plan: Herdr-managed worktrees for Docker-Pi

## Goal

Allow multiple Docker-sandboxed Pi agents to write concurrently in separate
Herdr-managed Git worktrees. Herdr owns worktree creation, opening, grouping, and
removal. Docker-Pi owns container mounts, Pi session persistence, restore, and a
thin helper-start orchestration layer.

## Scope and principles

- Support existing linked worktrees regardless of whether Herdr or Git created
  them; do not depend on Herdr's checkout directory layout. Also support external
  Git metadata layouts such as `git init --separate-git-dir` through the same
  discovery and mount-safety rules; reject layouts that cannot be represented
  safely rather than treating them as self-contained checkouts.
- Host Git is optional globally, but required whenever the selected directory
  has an enclosing `.git` entry. Without Git, scan the selected directory and
  all ancestors: allow ordinary-directory launches only if inspection succeeds
  and no `.git` file, directory, or symlink (including a dangling one) is found.
  Fail clearly on a marker or an inspection failure, without interpreting Git
  metadata ourselves. Apply this policy with or without Herdr and on restore;
  keep help and local diagnostics independent of Git availability.
- Prefer small, readable Bash/Git host preparation with safe argument handling.
  Do not require host Node.js initially. If this needs fragile parsing,
  hand-built configuration, or excessive complexity, stop and report that
  assessment before using the agreed fallback: Node.js on the host. No host
  Python requirement or preliminary-container preparation workflow is planned.
  Keep Herdr orchestration in the existing container-side Node adapter.
- Do not introduce a Docker-Pi worktree registry, creation command, or cleanup
  manager.
- Keep session storage names separate from workspace selection. `--name` must
  continue to select conversation storage, not create or select a worktree.
- Preserve ordinary launches and shared-checkout helper workflows, except for
  the explicitly replaced image-selection and conversation-format behavior.
  Backward compatibility with older conversations is not required.
- Target only the current base/custom image pattern (`pi-docker:base` and
  `pi-docker:custom`). Legacy images and compatibility with their launch records
  or session-storage identities are out of scope.
- Select the image afresh on every launch, helper start, and resume/restore:
  use the local `pi-docker:custom` image if it exists, otherwise `pi-docker:base`.
  Do not ask users to choose an image, inherit the caller's image selection, or
  record an image for later replay. Conversation identity must not depend on
  which image is currently available.
- Worktrees isolate working files and indexes, not security permissions, Git
  refs, host ports, databases, credentials, or shared configuration. Shared
  read/write access to repository metadata is accepted; do not build a Git
  permissions-isolation system. Document: "Be aware: All agents working on the
  same repository share read/write access to its Git metadata, including objects,
  refs, and configuration, even when working in different worktrees."
- Conversation discovery matches the exact canonical selected directory, not
  every directory within a worktree. Mounting the whole checkout does not widen
  conversation scope; preserve selected-directory/name-based storage.
- Support `pi-rewind-hook` for recent-conversation rewind, allowing its
  configured retention policy to clean up snapshots. Do not disable retention
  or build a separate snapshot-retention manager. Snapshot availability is
  best-effort, not a durable-history guarantee: the shared repository-wide ref
  and checkout-scoped discovery can cause another worktree's checkpoints to
  lose reachability protection. Missing/pruned checkpoints must be reported
  clearly without blocking conversation resume or claiming a successful rewind.
  In the image-owned setup, custom loads the hook and base does not: switching
  to base retains conversation metadata but captures no new rewind checkpoints.
- Never delete a worktree on container exit, failed agent startup, or restore.
- For explicit worktree removal, delegate to Herdr's removal interface and
  retain Docker-Pi conversations and launch records. Do not add conversation
  cleanup machinery. Restoring a conversation whose checkout was removed must
  fail clearly rather than recreate the checkout or start a replacement.

## Discovery status and remaining prerequisites

### Verified so far

- The latest merge pins Pi **1.5.2** (previously 1.5.0), Herdr **0.9.5**
  (unchanged), and custom extensions: rewind 1.8.8, web-access 0.48.0,
  ask-user 0.17.2, and subscription-usage 1.5.0. The earlier Docker report is
  historical image-specific evidence, not certification of a rebuilt image.
- A separate host-run Herdr harness now exists at
  `tests/host/verify-herdr-contract.sh`, with disposable-session instructions in
  `tests/host/README.md` and offline fake-CLI regression tests. The user ran it
  in a disposable host session and supplied `tests/host/herdr-report.txt`:
  reviewed **PASS (26 assertions)**, originating from
  `/tmp/pi-herdr-contract.fuBotUWA/`. Host CLI and server are 0.9.5; host Git is
  2.53.0, Bash 5.3.9, and jq 1.8.1. Preflight also verified host `pi` resolution
  without launching Pi. This agent has no inherited Herdr context/socket or
  Docker and has made no live Herdr requests itself.
- The reserved-path/image-resource audit and Bash-first adoption assessment are
  recorded in `tests/host/MOUNT_CONTRACT.md`. Review added runtime alias
  reservations (`/var/run`, `/var/lock`) and rejection of `/tmp` itself, while
  preserving project paths below `/tmp`. It also found and fixed a real gap:
  a `.git` symlink could traverse an unmounted alias while canonical discovery
  passed. Direct `.git` symlinks to represented physical metadata work; further
  symlink traversal in literal pointers now fails closed, including aliases
  hidden by `..`. Offline regressions and the refreshed **23-check** Docker
  report pass, including runtime support for a direct `.git` symlink.
- Container and host Herdr CLIs and the tested server report **0.9.5**;
  `images/base/Dockerfile` also pins 0.9.5. The supplied host report confirms
  create/open/grouping, linked-source parent discovery and rejection, focus
  preservation, close/reopen, dirty-removal refusal, clean removal with branch
  retention, and occupied-pane/process-group preservation. No server upgrade
  or restart was part of the harness.
- Installed help/API schema, tagged upstream documentation/source, earlier
  read-only discovery, and the reviewed disposable host run confirm the contract
  below. The host report verifies the exercised mutation response shapes, not
  every optional API flag or Pi/Docker startup behavior.
- Phase 2 production code is now implemented and locally tested: dedicated
  `lib/workspace-mounts.sh`, configurable long-form project binds/cwd, optional
  `compose.metadata.yaml`, fresh custom/base selection, and removal of helper
  image propagation. Ordinary launches retain `/workspace`; linked/external
  checkouts use canonical host paths. Production Compose runtime validation now
  passes **23 host checks**, reviewed from run `pi-docker-production.SMNf86J3`;
  this is new Phase 2 evidence, not an inference from Phase 1.
- The small image-independent record/key prerequisite from Phase 3 was brought
  forward because Phase 2 removes image recording/replay: new records are v3
  (version/selected-directory/name only), keys are versioned and image-agnostic,
  and v1/v2 records are rejected without migration or file deletion. Local tests
  exercise image switching and rediscovered worktree mounts on native restore;
  full persistence/history/native-restore integration remains Phase 3.
- Disposable local Git checks passed for ordinary/linked checkouts, spaces,
  subdirectories, symlinked selection paths, forward/common/reverse Git pointers,
  separate Git directories, and a worktree nested beneath the main checkout.
  Linked Git operations worked with the main checkout's tracked source file
  absent. Repeatable discovery coverage now lives in `tests/host/`.
- The host-run standalone suite passed **22 checks** using `pi-docker:custom`
  (image ID `sha256:141109bdf9a1d146bec6b339d8bdf485b89a9549a8cd4849105f9182de169cb6`).
  The reviewed report was supplied as `tests/host/report.txt`. Host versions were
  Git 2.53.0, Bash 5.3.9, Compose 5.7.0, and Docker client/server 29.9.3; the image
  supplied Node 24.22.2 and Git 2.39.5. Runtime checks passed for ordinary and
  path-preserving mounts, Git operations, separate indexes, concurrent worktree
  writes, subdirectory cwd, unusual paths, symlink selection, external/contained
  metadata, missing-source refusal, and worktree survival after container exit.
- The refreshed host suite passed **23 checks** on Pi **1.5.2** using custom
  image `sha256:4fbac6482177e793a7d622c92d11cbdc0dcd3fd3523d63755c440f265bf6623b`.
  Durable report: `tests/host/mount-report-pi-1.5.2.txt`; origin:
  `/tmp/pi-docker-mount.dKOURTXx/`. Host Git was 2.53.0, Bash 5.3.9, Compose
  5.7.1, and Docker client/server 29.9.3; runtime Node was 24.22.3 and Git
  2.39.5. The report, copied raw logs and effective standalone Compose were
  reviewed: no unexpected failures or deployment/private mounts. Both missing-
  source errors are intentional negative checks. The original 22-check report
  remains historical evidence. Neither run tests production Compose merging.
- The standalone prototype uses Bash/Git and static long-form Compose files,
  without hand-built YAML or host Node. Its local discovery and fake-Docker
  command tests also pass. An initial host run exposed terminal-input stopping
  the timeout/Compose process group; batch commands now explicitly disable
  interactivity/TTY and use `/dev/null` stdin, with regression coverage. The
  completed host run validates that fix. This is evidence for the experimental
  mount contract, not the production launcher/deployment Compose, Herdr lifecycle,
  conversation/restore, rewind, or a separate base-image integration run.
- The installed rewind hook is 1.8.8; its shared store ref and bounded update
  retries were inspected. Multi-worktree rewind/retention behavior remains to
  be tested against the actual image version.

### Confirmed Herdr 0.9.5 contract

Evidence: installed `herdr --help`, `herdr worktree`, `herdr status`, and
`herdr api schema --json`; the tagged upstream
[CLI reference](https://github.com/herdrdev/herdr/blob/v0.9.5/docs/next/website/src/content/docs/cli-reference.mdx),
[socket API documentation](https://github.com/herdrdev/herdr/blob/v0.9.5/docs/next/website/src/content/docs/socket-api.mdx),
and [worktree implementation](https://github.com/herdrdev/herdr/blob/v0.9.5/src/app/api/worktrees.rs).

- `worktree list` accepts `--workspace ID` or `--cwd PATH`, including a linked
  checkout source. Its `.result.source` exposes `repo_root`,
  `source_checkout_path`, and optional `source_workspace_id`; `.result.worktrees`
  lists checkout paths and optional open workspace IDs.
- `worktree create` accepts a parent source plus optional branch, base, path,
  label, and focus choices. It creates the checkout **and opens/groups its
  workspace** in one request. `.result` contains `workspace`, `tab`, `root_pane`,
  and `worktree`; use `workspace.workspace_id`, `root_pane.pane_id`, and
  `worktree.path`. Do not add a redundant open request or pane split.
- `worktree open` accepts a parent source and exactly one of path or branch.
  It returns those same records plus `already_open`. A returned pane may already
  be occupied; inspect it before starting an agent, never replace an occupant.
- Create/open reject linked-worktree sources (`linked_worktree_source`). For
  callers in linked worktrees, discover the parent through Herdr's read-only
  listing/provenance before invoking create/open. Never guess the parent path
  or fall back to another client's focused workspace.
- There is no separate opaque worktree ID or explicit reuse flag. Retain paths,
  repository provenance, workspace/pane IDs, and agent identities as returned.
  Existing local branches are checked out by create; otherwise Herdr creates a
  branch from the supplied base or HEAD. An existing branch does not use base.
  Existing-checkout reuse belongs to open; surface conflicts rather than retry.
- `worktree remove --workspace ID` requires an open Herdr-managed linked-worktree
  workspace. It returns `workspace_id`, `path`, and `forced`, removes the checkout,
  closes its workspace on success, and retains the branch. Refuse to add force
  when Herdr/Git rejects removal. `workspace close` only closes Herdr state;
  closing a primary workspace with linked children requires explicit group intent.
- Use explicit source/target identities and `--no-focus`. The host `pi` command
  must resolve to this deployment's launcher. Herdr starts that command in its
  returned pane; the launcher starts Docker. Container-side Node talks to Herdr
  through inherited context/socket, not through Docker access.

### Phase 1 complete: adoption decision and evidence limits

Both required host gates are passed and reviewed: **26 Herdr assertions** and
**23 Docker mount checks on Pi 1.5.2**. Host tools/launcher resolution are verified;
`tests/host/MOUNT_CONTRACT.md` consolidates the tested contract and reserved-path
audit. Adopt the Bash/Git/static-Compose approach for Phase 2. No host Node or
Python prerequisite is needed; report before taking the agreed Node fallback if
production integration becomes brittle or complex.

This closes discovery and contract definition, **not production implementation**.
Effective deployment Compose merging has since passed the separate Phase 2
host run described below; that evidence is not supplied by the Phase 1 reports.
A separate base-image integration run, Pi startup/readiness, conversation storage,
resume/restore, isolated-helper orchestration, and rewind remain later gates.
Phase 1 itself made no production launcher/Compose/adapter changes; Phase 2's
implementation and reviewed host-validation gate are tracked below.

## Next-session handoff

### Session-end handoff — create a NEW host `/tmp` fixture next session

**Restart gate NOT PASSED. Phase 3 remains open; Phase 4 has not begun.**
The session ended after two real host attempts exposed first-run initialization
writes. Both preparation fixes and the startup audit are implemented/tested.
A third fixture has NOT been reported or approved. Do not reuse either old
fixture, repair its hashes, or reconstruct/rerun completed native gates.

#### Start here next session

1. Read this handoff and `tests/session/HERDR_SERVER_RESTART_RUNBOOK.md`, plus the
   design's startup-write audit. Preserve all existing working-tree changes;
   do not stage, commit, reset, clean Git or repair/remove repository worktrees.
2. Ask whether the user completed the **user-managed host cleanup** below.
   The user's last message was: "I will stop their processes and delete data
   under host /tmp". Completion was NOT reported. Do not recreate old sessions
   to check them. If cleanup is incomplete, verify actual host state and assist
   only within the two exact approved targets. Cleanup is never a test PASS.
3. From the actual deployment checkout in a normal HOST terminal outside Herdr,
   create a completely new fixture under host `/tmp` (not this container's `/tmp`):
   `/usr/bin/node tests/host/prepare-server-restart.mjs --prepare --case ordinary --parent /tmp`.
   Do not guess the host checkout from container `/workspace`. Preparation invokes
   no Herdr/Docker/Pi or image probes; retain the newly printed exact path.
4. Verify the new config has top-level `onboarding = false`; settings must already
   have `lastChangelogVersion: "1.5.2"` and canonical two-space JSON with no final
   newline. Run that fixture's frozen `server-restart-live.mjs --plan NEW_ROOT`.
   Review its actual session/name/paths/input hash, then obtain explicit approval
   for THAT new target. Prior ordinary approvals do not transfer to it.
5. Guide the user **ONE COMMAND AT A TIME**, waiting for each result. Use explicit
   Bash backslash continuations for long host commands: an earlier pasted line
   split the review flag into a separate command (parser rejected before any live
   action). Two normal host terminals per new case, no extra Herdr topology.
6. Follow the frozen runbook: entry -> genuine ready -> separate foreground Pi ->
   `/name` -> exact offline seed -> checkpoint -> B collection -> A detach only
   after collection/client success -> exact named stop -> separately gated fresh
   entry -> AUTOMATIC Pi only -> new turn/checkpoint -> visual/exit capture.
   `/quit` must be followed IMMEDIATELY by sourcing the frozen finish helper as
   the FIRST shell command. Do not manually reopen, repair, retry or auto-chain.
7. Ordinary must finish and be reviewed before a separately prepared/approved
   linked fixture. Do not build/pull/retag images, remove volumes, or infer all
   Phase 3 gates complete from this single test. Any unexpected mutation is STOP.

#### Host cleanup requested at session end — PENDING, not performed here

The user explicitly selected cleanup including BOTH failed host runs, then
volunteered to stop their processes and delete their host `/tmp` data themselves.
**Owner: user; completion UNCONFIRMED at handoff.** The agent advised limiting
removal to the two exact fixture roots after their sessions/containers stop,
never all of `/tmp`. This supersedes earlier preserve-only instructions **for
scoped cleanup only**, not for resuming either test or deleting unrelated
resources. Do not assume the two directories or resources still exist next time.

| Exact host fixture | Exact session / Compose project / run-label value | Last USER-reported state |
| --- | --- | --- |
| `/tmp/pi-docker-restart.dyN3HI` | `pi-restart-dyn3hi` | Herdr shell open; ready blocked on config hash; no Pi seed |
| `/tmp/pi-docker-restart.FopIIj` | `pi-restart-fopiij` | Herdr/Pi open; seed checkpoint saved; B collection blocked on settings hash |

Neither directory is mounted/visible inside this agent container. No host
shutdown, container removal or fixture-directory removal was performed here.
Do not claim cleanup complete. Do not kill broad PID sets, remove sockets by
hand, use `docker ... prune`, or touch `default`/working sessions. Never source
an old fixture's environment helper or invoke its gated test `stop` to bypass
its failed hashes/incomplete lifecycle; no cleanup helper is supplied.

Host-side cleanup next session must first verify the exact original private
XDG/session directories, same-user ownership and existing resource identities.
Use read-only observations, not attach (which can start a missing server).
Confirm the original local Docker endpoint/context/daemon from each fixture's
`logs/daemon.json` and `logs/host-tools.json` before targeting containers; do not
silently substitute today's default daemon. Host credential contents are never
needed. Use the real host CLI with the fixture's private configuration to stop
ONLY the exact named sessions, and inspect containers under BOTH exact filters
`pi-docker.phase3-run=<project>` and `com.docker.compose.project=<project>`.
Only matching, verified full container IDs are in cleanup scope. If graceful
shutdown leaves containers, handle those explicitly/boundedly; no blind retry or
unrelated removal. Only after server/socket disappearance and empty matching
inventories may the exact fixture directories be removed. If identities or
scope are uncertain, ask the user and leave cleanup pending. Retain completed
native gate reports, source changes, shared configuration, images and volumes.

#### Implemented fixes, tests, and remaining limits

- Herdr 0.9.5 first-run onboarding writes `onboarding = false`; generate it BEFORE
  freezing TOML. Exact config assertions cover ordinary AND linked preparation.
- Pi 1.5.2 first TUI startup writes a missing changelog version. Preseed
  `lastChangelogVersion: "1.5.2"` and generate exact SDK save serialization
  (`JSON.stringify(settings, null, 2)`, NO trailing newline). Do NOT make settings
  mutable or weaken the hash gate. Both failures were preparation omissions.
- `test-restart-settings.mjs` adds five installed-SDK tests, without a Pi process,
  TUI, model, network or live Herdr/Docker: reproduces the old write, validates
  ordinary/linked byte stability through startup and same-value persistence,
  tests first-time setup guards, and proves real settings drift is rejected.
  See the design for startup migrations/package/trust/telemetry audit limits.
- Latest full suite with SHA-pinned upstream reporter source used as DATA only:
  **331 passed, 1 skipped** (jq unavailable), 332 total. Default suite with the
  installed Pi 1.5.2 SDK: **303 passed, 29 skipped**; 28 simulations need the
  optional reporter source. Five SDK cases skip explicitly if 1.5.2 is absent;
  no installation is attempted. Restart-specific total: **291 passed**.
  Syntax and tracked/new-test whitespace checks passed. No dependencies installed.
- Reproduce default tests with `node --test tests/session/test-*.mjs`.
  Optional `PI_RESTART_TEST_REPORTER_SOURCE` must name bytes matching reporter
  SHA256 `2c5272d732b475bbf91a027203b1f98d25fe43d2c1402530a442b288aeaca1e4`.
  The current cached upstream clone is retained under
  `/tmp/pi-github-repos/runtime-wG7Piv/43f99b34c6aa8ada5399c5bec0a712cd380e5ff87ae6a39404b6b16fbf946eee`,
  asset `src/integration/assets/pi/herdr-agent-state.ts`, pinned Herdr commit
  `2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01`. It may be absent in a fresh container;
  never substitute a fake reporter or vendor it to manufacture runtime authority.
- Local cleanup COMPLETED: removed 14 explicitly named, same-user/single-link
  regular transient test-output logs from container `/tmp` after recording their
  results here (review, onboarding and startup-audit output, plus earlier unit
  suite logs). Do not rely on those old log paths next session. No host process,
  container or fixture directory was stopped/removed by the agent. Kept the
  upstream source cache, source changes and completed native gate evidence.
  All project edits remain unstaged; this agent made no repository commit.

Current changed files: `PLAN.md`, `tests/host/prepare-server-restart.mjs`,
`tests/host/server-restart-live.mjs`, session design/evidence/runbook/README,
`test-server-restart-live.mjs`, `test-server-restart-preparation.mjs`, and new
untracked `tests/session/test-restart-settings.mjs`. The controller/evidence/core
and checkpoint foundations already exist; preserve them and all prior user work.

#### Earlier host outcome details: Pi first-run settings write

User approved all stages for `/tmp/pi-docker-restart.FopIIj`, session
`pi-restart-fopiij`, manifest SHA256
`72221d283e0e47d68436e2529ffdb0842b830f3a759e7a8456377e498af9c104`.
With onboarding disabled initially, entry/ready and Pi launch succeeded. The user
reported the exact seed response and `Restart seed checkpoint saved` notification.
Terminal B `collect-seed` then rejected changed immutable
`data/config/settings.json`. Supplied settings retain the original values but
add `lastChangelogVersion: "1.5.2"` and use Pi's pretty JSON serialization.
No seed collection confirmation, named stop or automatic restore was reached.

User chose fixing initialization AND auditing startup writes before another host
attempt. Preparation now seeds the changelog version before hashing and uses
Pi 1.5.2's two-space JSON/no-final-newline save format. Five new SDK audit tests
use the installed 1.5.2 SettingsManager and narrowly extracted startup methods:
reproduce the legacy write, preserve frozen ordinary/linked settings through
startup and identical-value saves, prove first-time setup skips the private
config, and still reject real settings drift. No Pi process, model, network,
Herdr or Docker was run by this agent. See the design's startup-write audit.

At the time of failure both fixtures were to be preserved, with no in-place
repair/re-hash/resume. At session end the user explicitly requested scoped
cleanup; see the authoritative pending-host-cleanup section above. A new test
still requires a NEW fixture, reviewed plan and target-specific approval.

#### Earlier host attempt: onboarding config write

User approved all ordinary stages for `/tmp/pi-docker-restart.dyN3HI`, session
`pi-restart-dyn3hi`, manifest SHA256
`88eb114c1d4483dbebfd98bdcf89352e4262360e93dd8951f0ce834a2e02dc9c`.
Initial entry opened a Herdr shell. `restart_ready` then stopped with
`changed immutable input: herdr-config/herdr/config.toml`; user-provided config
shows Herdr added top-level `onboarding = false`. Pinned 0.9.5 onboarding
completion code performs that write. This exposed a preparation bug, NOT a
continuity PASS: Pi seed, server stop and restart were not reached.

User explicitly chose fixing preparation and using a fresh fixture. New configs
set `onboarding = false` BEFORE hashing; ordinary/linked preparation assertions
pin the exact complete TOML. Do not relax hashes, edit/re-hash/resume the failed
fixture, stop its server, or clean it up implicitly. Preserve it and its host
state; this agent cannot directly inspect that host-only directory. Next prepare
a fresh host fixture one command at a time, review its new plan and obtain its
own execution approval. Approval of dyN3HI does not transfer to a new target.

#### Earlier pre-host implementation checkpoint (historical)

The user requested continued Phase 3 implementation after selecting the design.
`tests/host/prepare-server-restart.mjs` creates private unarmed ordinary/linked
fixtures, copied/hashed deployment and private config/state/home, invoking only
local fixture Git/mount discovery, never Herdr/Docker/Pi or image/version probes.
Its fresh-shell wrapper and one-shot argv shim now retain both shim and parent-
shell raw stat; preparation snapshots the validator, collector/state core,
non-secret host tool paths and collector contract.
`tests/session/restart-checkpoint.ts` retains startup history and checks open Pi
against official settled identity; the seed instructions keep Pi running.

New `tests/host/server-restart-evidence.mjs` is a read-only stopped-boundary
validator and cross-lifetime saved-evidence assessor. It checks frozen inputs
and pinned official reporter bytes, official refs/history/cwd/v3 storage, raw
process lineage/new server and container lifetimes, exact native argv, fresh
named host snapshots, explicit entry/stop approvals, ordered receipts, stopped
persistence, socket absence, image consistency, visual/exit checks and empty historical container queries.
It never executes commands, probes live state or writes/repairs evidence. Its
synthetic-test core explicitly reports `inputsValidated: false`; only public
wrappers validate input/reporter pins. Tests cannot be reported as a runtime
restart pass. Collector contract: `tests/session/HERDR_SERVER_RESTART_EVIDENCE.md`;
implementation status/design: `tests/session/HERDR_SERVER_RESTART_DESIGN.md`.
Existing native harness, production launcher/records and reporter are unchanged.

New `tests/host/server-restart-control.mjs` provides the controller/collector
**core**: exclusive artifact/step/confirmation/query reservations; ordered
append-only journal and fail-closed uncertainty; host/inherited-context and
allowlisted private-environment guards; scoped read-only bounded CLI runner;
version/local-Docker/image/empty-inventory/socket-length preflight; open runtime,
stopped process/socket/archive and final-shell capture algorithms. Tests inject
inert command/process/socket adapters. Captures explicitly do not validate inputs
or attest live state. The CLI only supports offline `--inspect`; no live mutation
or collection command is exposed. Preparation separately validates its frozen
inputs without requiring an installer-produced reporter; this is not a gate.

Public `validateCheckpoint` now checks open seed/restored evidence without
requiring later boundaries. The user selected a **narrow pending-receipt API**:
`validatePending` validates actual frozen inputs/reporter/evidence with exactly
one proposed success row, never publishing it or granting re-entry authority.
`StepLedger.confirmBoundary` hardwires checkpoint/stop/finish confirmation to
that public validator, publishes only on success, then runs the ordinary saved-
directory gate. Generic callback confirmation cannot handle those four stages.
Required/validated publication proof binds the exact receipt and normal-gate
status; missing/disagreeing proof, post-publication failure or crash blocks the
next stage and retry. No injected validator, reader or hash can bypass pins.
Raw synthetic helpers remain explicitly non-authoritative. These are tested
saved-evidence/control algorithms, not an installed-reporter public runtime PASS.

The user explicitly chose **two normal host terminals**: A keeps restored Pi
visible and captures its actual immediate exit/foreground-shell marker; B stays
outside Herdr for collection and confirmations. This avoids an additional restore
detach/reattach boundary and adds no Herdr pane/workspace. The choice approves
procedure design, NOT host execution.

**Implementation finished; NOT AUTHORIZED FOR HOST EXECUTION.** New
`tests/host/server-restart-live.mjs` completes guarded entry/stop/arming and all
public gates, canonical host executable identity checks, same-owner private-root/
Linux/nonroot/TTY/inherited-context checks, stable local Docker daemon/context,
official private reporter installation, genuine foreground-ready proof, seed
capture/detach/pre-stop recheck, separately approved fresh entry, visual answers
and immediate builtin exit capture. Live commands require the explicit review
flag and frozen fixture entry; mutations are one-shot and no cleanup is supplied.
The shim now checks full pinned prerequisites/ledger/coherent phases before exec.
The finish helper must be sourced as the FIRST command after /quit; it captures
actual status and foreground stat before any child. This was tested on a real
local PTY, without Herdr/Pi. Linked entry requires a completed ordinary public
assessment, publication ledger and final client receipt. Offline pair assessment
binds the independent cases and prerequisite; outputs never claim all Phase 3.

Finished host procedure: `tests/session/HERDR_SERVER_RESTART_RUNBOOK.md`, copied
and hashed as `control/runbook.md` in every new fixture. Preparation also freezes
the live module and ready/finish helpers. `--plan` emits exact private paths,
named targets and quoted commands WITHOUT invoking any live tools. Next action
is independent review of a new host-prepared plan and separate explicit execution
approval, then actual host runs/evidence review. No missing implementation stub
remains; do not repeat completed native gates. The user asked to finish the work,
not to execute it.

Final static/inert safety review closed approval-gap drift: after human approval,
repeat public evidence/strict ledger checks and fresh daemon/context, boot/old
process, socket, image and inventory observations before entry. Repeat seed/
input/daemon validation before stop, and frozen inputs/tools before installer or
attach. Recheck private root ownership/0700 and enforce tool SHA256, not just
metadata. Eighteen prompt-time drift regressions require rejection before any
installer/stop/new-client action. No check-to-exec isolation against malicious
same-user concurrent edits is claimed; those edits remain prohibited.
Do not manually arm generated phase files or fabricate evidence. No server
start/stop/restart, live API call, image operation or host test was performed or
authorized; Phase 3 remains open and Phase 4 has not begun. All earlier user/
agent changes remain un-staged; no staging or commits.

Latest validation: **138 evidence-validator, 70 core, 40 live-workflow and 5 SDK
settings tests**; restart-specific suite **291 passed**; full session suite
**331 passed, 1 skipped**
(jq unavailable), with explicitly selected SHA-pinned upstream reporter SOURCE
read as inert test data. Both complete ordinary/linked controller flows reach
public saved-evidence success, including publication and client boundaries, with
all runtime/installer I/O inert. Source is not vendored/executed and no official
host installation/runtime is attested. Without that optional source asset the
full suite reports **303 passed, 29 skipped**. Syntax/whitespace checks passed;
no dependencies installed. These do not certify real Docker/Herdr behavior or
successful public assessment with an actually installed official reporter. Preserve all current scripts/tests/docs;
there are no new host fixtures to review or clean up.

### Earlier selection: automatic server-restart restore design

The user selected **designing the disposable server-restart test** as the next
Phase 3 gate. Preparation/design only: no live restart, server/session creation,
image change or host mutation is authorized. Source-reviewed design:
`tests/session/HERDR_SERVER_RESTART_DESIGN.md`.

The design reviews pinned Herdr 0.9.5 native planning, deferred fresh-shell
startup, shutdown persistence and named-session/config isolation. Crucially,
existing manual-reopen driver exports do not configure a restarted server's
shell. The future harness must establish a private launcher environment before
both server lifetimes, keep seed Pi alive at stop, and prove new server AND
container identities plus unchanged official reference/history/cwd/v3 records.
Proposed cases are independent ordinary and linked-subdirectory disposable
sessions, with a human-approved stop boundary and no automatic retry/cleanup.

**Next implementation:** build the separate preparation/entry/checkpoint/assessor
harness and inert local tests described in that design, then present exact
scripts and target for explicit host execution approval. No executable restart
harness or runtime PASS exists yet. Existing completed gates need no repeat;
Phase 3 remains open and Phase 4 has not begun. Git was clean at session start;
older staged/untracked preservation notes below are historical, not current
status. No live API request, Docker operation, restart, staging or commit was
performed during this design work. Existing five-file Node regression suite:
40 passed, 1 skipped (test-only jq unavailable); `git diff --check` passed.
These checks exercise existing inert harness tests, not the proposed restart
harness or any live restore. Only this plan, session README and the new design
were changed.

### Earlier session pause: native protocol passed; select the next Phase 3 gate

The user requested a status reminder and a handoff to a new session. No further
implementation, host run or live mutation is requested during this pause.
Subsequently approved cleanup is completed as recorded below; do not repeat it.
Start by reading this section, the Phase 3–5 sections below, and the opening of
`tests/session/README.md`; recheck Git status and preserve all user changes.
Later entries here are historical and may describe gates as pending that have
since passed. This opening handoff and the latest durable reports take precedence.

**Current milestone:** Phases 1 and 2 passed. Phase 3 offline persistence (14 host
checks), interactive resume (`nhtANrCS`), shell-boundary ordinary handover
(`Z8likvIQ`) and ordinary PLUS linked-subdirectory native managed-path reopen
(`0rXTuSjw`) are passed and reviewed. Phase 3 is NOT complete; Phase 4 isolated-
helper orchestration has not begun. Existing shared-checkout helper functionality
is not the Phase 4 worktree orchestration deliverable.

Latest durable report:
`tests/host/native-boundary-restore-report-pi-1.5.2.txt`.
It verifies four launches, stable official refs/IDs/files/history/cwd/v3 records,
four visual yes answers, four distinct containers, all five step exits 0 and
12 saved empty container queries. The supplied copy includes the final marker
and assessment; no omitted-marker exception is needed. No repeat run is needed.

**Remaining Phase 3:**
- Actual automatic Herdr restoration after a server restart. The passed gate
  only exercised official reporting plus launcher reopen with --session; it did
  not restart Herdr. The user has now selected design of a reviewed disposable-
  session restart test; see the current task and design above. Live execution
  remains unauthorized. Obtain explicit consent before executing any procedure
  that restarts a server; never use an existing working session.
- Separate base-image runtime and real custom/base/custom conversation continuity.
  Existing image-switch unit tests are not runtime evidence. Do not pull, retag,
  remove images or alter availability without explicit user review/approval.
- Actual Docker replacement/layout-transition evidence, especially replacement
  at the same cwd. Different container-cwd continuity is explicitly unsupported;
  do not add migration, historical identity/type fields, header rewriting, pointer
  repair or mount-policy changes to hide that limitation.
- Outstanding native failure paths: missing recorded checkout/exact subdirectory,
  invalid/inaccessible metadata, missing/empty/unreadable/malformed explicit
  session, with clear errors and no replacement conversation/checkout or Pi
  Continue/Fork fallback. Some launcher/offline/host negatives already pass;
  target gaps rather than repeating the whole completed matrix.
- Remaining integrated exit/container-exit versus workspace-close/worktree-removal
  and restore-after-removal behavior. Herdr's disposable contract already verified
  close/removal semantics; ensure deployment conversations/records remain and a
  removed checkout is not recreated. Broader helper removal tests belong Phase 4/5.

**Beyond Phase 3:** Phase 4 adds explicit isolated-worktree helper create/open/
start/resume/remove through the existing Node adapter and skill, with shared
helpers remaining the default, provenance-based parent discovery, occupied-pane
protection, focus preservation, exact-directory/latest-usable conversation
selection across names, retained identities/step receipts and stop-on-uncertainty
without retries/force/cleanup. Phase 5 completes regression/host coverage and
user/agent/skill documentation alongside implementation, including two-worktree
rewind/index/concurrency/retention and custom/base/custom rewind continuity,
blocked/unblocked readiness, helper error/partial-result cases, and the full
acceptance matrix. Do not treat all Phase 5 tests as absent: many launch/mount/
restore tests already exist. Read the actual sections below for the full scope.

**Blocker finding retained:** the legacy noninteractive single-driver job kept
A's official identity when B started. Tagged Herdr 0.9.5 skips routine process
probes with live lifecycle authority and unchanged foreground PGID; the launcher
already exports the supported wrapper identity hint. Separate top-level jobs
with actual shell returns clear identity and pass the native workflow. No
production lifecycle reset, reporter patch, event relabeling, server upgrade or
new pane topology is indicated. Old interrupted/no visual findings remain real,
not relabeled by the later passes. Source analysis:
`tests/session/HERDR_SAME_PANE_ANALYSIS.md`.

**Harness/tools:** `tests/host/verify-native-restore.sh --prepare-native-boundary`
with consented --run prepares only; `native-boundary.sh` emits four independent
commands/markers and assessment. Do not run the legacy plain --run corpus
unchanged. Last local validation: 40 Node tests pass, 1 skipped because test-only
jq is absent; PTY/transport guards use inert substitutes. Bash syntax and current
whitespace checks passed. No global dependency installation. For a new live
Herdr task read the prescribed upstream and Docker adapter skills; preserve real
inherited context. This agent has no Docker/live Herdr context and made no live
API requests; do not request Docker-socket exposure.

**Preserve:** PLAN.md and tests/session/README.md have user-staged AND unstaged
changes. Scripts/tests/reports/source analysis remain untracked; this agent has
not staged or committed. Preserve all seven sanitized report files, source,
tests and documentation. Keep earlier Phase 1/2 checksum-pinned evidence unchanged,
including intentional whitespace.

**Cleanup completed after explicit approval:**
- The user reports deleting the original /tmp fixtures on the host.
- The user confirmed successfully stopping/deleting all seven explicitly approved
  named Herdr test sessions, without pasting output. Record this as user-confirmed,
  not independently live-inspected. `default` was explicitly excluded.
- This agent deleted ONLY these seven untracked raw copied directories under
  tests/host/: native 0rXTuSjw, 7LIAX9Ww, Z8likvIQ, yXQDav7Z, yaTn8dy1; resume
  24uFOGYH, nhtANrCS. Before deletion it verified all durable reports existed,
  no tracked files/root symlinks/canonical-path surprises, and no nested mounts.
  Reports, scripts/tests, documentation and staged changes were preserved.
- Raw fixtures are no longer available. Durable reports are the review record;
  do not recreate/rerun completed gates merely to reconstruct deleted artifacts.
  Older preservation instructions below describe historical pre-cleanup state.
- No Docker cleanup, worktree-metadata repair/pruning, default-session deletion,
  global configuration change or live API request was performed by this agent.
  No current Docker resource inventory was supplied; do not claim one was checked.
  No further cleanup is requested; do not run prune or infer host resource state.

### Reviewed native shell-boundary gate PASS: ordinary AND linked reopen

The user supplied `tests/host/pi-docker-native.0rXTuSjw/`. Raw review confirms
all four seed/reopen launches: ordinary and linked-subdirectory native managed-
path reopen pass, with official herdr:pi exact references, stable IDs/files,
complete original plus new user/assistant history, titles/cwd/header cwd, exact
storage/v3 records and all four explicit visual yes confirmations. Two session
files/records and four distinct container receipts verify; restored files remain
unchanged by later steps. All input/driver/reporter/control/seed-evidence hashes
match, along with 11 source counterparts. Twenty-four grouped raw review checks
pass. Durable sanitized report:
`tests/host/native-boundary-restore-report-pi-1.5.2.txt`.

The user initially described omitting the last marker and explicitly authorized
assuming it passed if all else matched. The supplied copy actually includes
`shell-after-restore-linked.txt`, an ordered final shell receipt, assessment
process/snapshot/results and PASS. No missing-marker exception is needed. All
five steps exit 0; all six preflight/prelaunch/assessment snapshots show cleared
identity and unchanged one-pane topology; all 12 saved container queries are
empty. This verifies the full native LAUNCHER protocol gate, not automatic
Herdr restoration after server restart. Do not repeat the completed host run.

No production lifecycle fix is indicated by the earlier single-driver finding.
Phase 3 remains open for automatic server-restart restore, base/cross-image and
outstanding layout/failure/lifecycle integration gates. A server-restart test
requires its own explicit user decision and reviewed procedure in a genuinely
new disposable session; do not infer restart/upgrade or working-session access
consent from the passed native protocol test. Do not begin Phase 4 yet.

No production change, live API call, host rerun, cleanup, staging or commit was
made during this review. Preserve all seven copied fixture deployments intact
and un-staged; keep sanitized reports as durable evidence. Saved empty queries
are not a claim about current host resources.

### Full native shell-boundary harness prepared; host run pending

The user requested preparing the remaining native gate with explicit shell
boundaries. `tests/host/verify-native-restore.sh` now supports
`--prepare-native-boundary` with either preflight or consented run. Run prepares
only: no Pi launch. It retains the fixture-only setup and creates ordinary plus
linked-subdirectory selections; `control/INSTRUCTIONS.txt` contains separate
seed-ordinary, restore-ordinary, seed-linked, restore-linked and assess commands,
with built-in interactive-shell return markers. Read the opening native-gate
section of `tests/session/README.md` for exact fresh-session host instructions.
The plain --run corpus is documented as the legacy single-driver workflow,
not the next host gate. Old evidence copies remain untouched.

New source-only `tests/host/native-boundary.sh` validates inherited context,
same shell parent/distinct foreground groups, single-start/order/result guards,
pinned inputs/image, and version/topology plus no agents/session reference before
each launch/assessment. It never resets state. Each step retains run/project
container queries and blocks continuation on matches or inspection failures.
Restore verifies seed checkpoint/result/record hashes and consumes only the
OFFICIAL seed reference via --session, without replaying flags. Existing strict
capture/visual/history/cwd/v3 checks are retained. Final assessment checks two
session identities, four container receipts, unchanged restored files and clean
retained linked checkout. PASS would cover native launcher protocol only, not
automatic server-restart restore or Phase 3 completion.

Local Node suites: **40 passed, 1 skipped** (test-only jq absent for the real-jq
aggregate test). Generated steps and failure guards run in isolated local PTYs
with explicitly inert Docker/Herdr/Pi/jq substitutes; they do not certify JSON
filter/runtime behavior or actual host integration. Bash syntax/whitespace pass.
No package install, production change, live API request, Docker/host rerun,
cleanup, staging or commit was performed. Next: user-run NEW disposable host
native-boundary gate, then review raw evidence. Phase 3 remains open.

### Reviewed shell-boundary host result: B current; A cleared before B

The user supplied `tests/host/pi-docker-native.Z8likvIQ/`. Raw evidence confirms
**CURRENT B** with verified interactive-shell returns and distinct A/B foreground
jobs of the same shell, same pane/terminal. The decisive pre-B official snapshot
has no agents and no pane session reference: A was actually cleared, not replaced
by the observer. B's official exact path matches its distinct persisted history;
state sequence advances from A's 3 to B's 7. Both visual answers are yes.
All 13 copied input hashes, reporter, driver and two generated-control hashes
match; 12 source counterparts match repository bytes. Exact storage/v3/history,
unchanged A, exactly two sessions and distinct container receipts all verify.
All three steps exit 0 and all eight saved container queries are empty.
Durable sanitized report:
`tests/host/shell-boundary-handover-report-pi-1.5.2.txt`.

This supports the foreground-job/test-driver explanation; it is not a production
lifecycle defect requiring a reset or reporter patch. The exact internal server
branch/timing is not traced and earlier run PGIDs were not saved. Preserve the
original stale-reference/no visual/interrupted result unchanged. The new result
is **DIAGNOSTIC COMPLETE, NOT native restore PASS**. No linked checkout, native
reopen or server restart was exercised. Phase 3 remains open.

Next recommended task: adapt the remaining native-protocol harness to explicit
shell boundaries (after review), then test linked native reopen. Do not rerun
the old single-driver corpus unchanged or implement production lifecycle
workarounds. Automatic server-restart restore and other base/cross-image/layout/
failure gates remain separate. No live API call, host rerun, cleanup, production
change, staging or commit was done in this evidence review. Keep all six full
copied fixture directories un-staged; preserve sanitized reports as durable
review evidence and do not infer current host resource state from saved queries.

### Approved shell-boundary diagnostic prepared; host execution pending

The user chose **prepare shell-boundary diagnostic** after the source review,
not a production lifecycle workaround. The host native driver now accepts
`--prepare-shell-boundary` with `--run --confirm-disposable-session`. It prepares
only, using existing new-disposable-session guards/private fixture setup and
no Pi launch. `control/INSTRUCTIONS.txt` contains separate top-level commands:
built-in `ready-a` shell marker, A, `after-a`, B, `after-b`, assessment.
Read the opening section of `tests/session/README.md` for full host instructions.

Test-only `tests/host/shell-boundary-handover.sh` enforces the same inherited
pane/socket and interactive Bash parent, real foreground shell markers, distinct
A/B foreground groups, single-start/order guards, input/image checks, version/
topology checks and per-step container queries. No lifecycle state resets,
reporter patch/replacement, fabricated context, new panes, native reopen or
server restart is performed. It retains prelaunch snapshots and strict official
checkpoint/local history/v3 checks; shared A/B assessment was extracted unchanged.
Diagnostic completion is not native restore PASS. No full rerun of the old
single-driver reproduction is needed. No live host/API operations occurred here.

Local suites: **32 pass, no failures/skips**, including Linux PTY markers and
generated-step execution with inert stubs; Bash syntax and whitespace pass.
These do not certify actual Docker/Herdr host execution. The source investigation
and earlier original no/interrupted visual finding remain unchanged. Phase 3 is
open. Next: user-run fresh disposable shell-boundary diagnostic, then review its
process-group/snapshot evidence before choosing any production remedy.

### New source finding: foreground-job boundary may explain stale authority

Read `tests/session/HERDR_SAME_PANE_ANALYSIS.md` before selecting a fix.
Tagged Herdr 0.9.5 source confirms the live-authority startup rejection, but
also exposes a driver-specific candidate mechanism: full-lifecycle authority
skips process probes while the foreground PGID stays unchanged. The host driver
is noninteractive Bash without job control, spanning A, its prompts and B as
one foreground job; there is no intervening return to the pane shell.
A new isolated Linux PTY regression verifies that Bash process-group property
locally. It does not establish historical host PGIDs or the exact server branch.
The launcher already exports `HERDR_AGENT=pi`, and Herdr supports wrapper hints;
therefore "Docker hides Pi" alone is not an adequate root-cause conclusion.
The unknown/custom-agent shell-return fallback does not apply to known `pi`.

The report also distinguishes managed-path rejection from the separate ID-only
conflict helper, and notes that an API response is not proof a report applied.
Official tagged reporter hash matches the focused run. Upstream Rust tests were
reviewed, not executed (Rust/Cargo unavailable). Local Node suite including the
new `test-driver-process-groups.mjs`: **25 passed, no failures/skips**.

Recommended next step: explicitly choose preparation of a diagnostic comparing
verified top-level interactive shell boundaries against the existing single-job
driver, recording safe PGID/process observations. Do not silently alter test job
control/topology or request another identical reproduction. No production fix,
reporter patch/reset/release, host rerun, live API call, staging or cleanup was
performed. Existing evidence and the original interrupted/no visual result stand;
this finding does not prove a production defect or a successful native gate.

### Session pause: resume with same-pane lifecycle investigation

The user is ending this session because context is nearly full. No further host
test, cleanup or mutation is requested. Start the next session by reading this
handoff and `tests/session/README.md`, and rechecking Git status. Do not repeat
host runs merely to reconstruct already-reviewed evidence.

Current decision/task:
- Interactive resume picker passed (`nhtANrCS`). Ordinary native managed-path
  reopen passed (`yaTn8dy1`), but automatic Herdr server-restart restore has never
  been tested. Linked native reopen remains blocked.
- Focused ordinary A→B handover (`7LIAX9Ww`) reproduces the stale official path
  without any worktree. This is enough reproduction evidence; **do not ask the
  user for another identical run**. Original B visual answer was no, and original
  result remains interrupted; do not invent successful visual confirmation.
- Next investigate same-pane lifecycle/session ownership before selecting a fix.
  Tagged Herdr 0.9.5 `src/terminal/state.rs` rejects different same-owner Pi
  session replacement on `startup` (allows `new`/`resume`/`fork`), and the official
  reporter has no shutdown release. Docker can mask native Pi process identity
  from host process-exit detection. These source observations are consistent
  with the finding, but the precise root cause/remedy is not yet established.
  Relevant source: `src/app/agents.rs`, `src/terminal/state.rs`,
  `src/integration/assets/pi/herdr-agent-state.ts`; use the v0.9.5 tag. Prior
  downloads under `/tmp/pi-herdr-phase3-source/` are disposable, not durable inputs.
- Do not weaken exact-reference assertions, silently replace the reported path,
  release/reset authority, modify the official reporter, change topology, or
  upgrade/restart a server as automatic recovery. Any production lifecycle/
  security policy change requires the ask-user decision handshake first.
- The user approved host-run tests in genuinely NEW disposable Herdr sessions,
  not access to an existing working session. This agent has no inherited Herdr
  context/socket or Docker. No live APIs were contacted here. Keep that boundary;
  read the prescribed Herdr skills before any future control operations.

Latest test-only change: focused mode now writes automated assessment/evidence
before a separate B history/title-only question. This prevents a no/interrupted
visual answer from discarding the observed mismatch. **This changed driver has
not had a new host run**, and no rerun is needed just to re-establish the finding.
Local checks: all 24 Node observer/classifier/driver-guard tests pass, Bash syntax
for launcher/libs/host scripts and `git diff --check` pass. Node command:
`node --test tests/session/test-native-checkpoint.mjs tests/session/test-session-handover.mjs`.
These offline tests do not prove production readiness or the mechanism above.

Preservation: `PLAN.md` has user-staged changes plus this session's unstaged
handoffs; leave both intact. Test scripts/extensions/sanitized reports are still
untracked, README changes unstaged. No commit/staging was done by this agent.
All five supplied `pi-docker-resume.*` / `pi-docker-native.*` directories under
`tests/host/` are full raw copied deployments, not report-only folders; **do not
stage them wholesale**. Preserve the five sanitized report `.txt` files as the
durable review. No fixtures, containers, Git worktrees or Herdr sessions have
been cleaned up here; do not infer which original host resources still exist.
Phase 3 stays open; do not begin Phase 4 helper orchestration.

### Latest result: focused ordinary A→B reproduced stale Herdr identity

The user supplied `tests/host/pi-docker-native.7LIAX9Ww/`. Raw evidence confirms
**stale_previous without worktrees**: A and B are distinct fresh conversations in
the same exact ordinary directory/backend storage/pane, both with expected
persisted user/assistant histories, IDs/titles/cwd/v3 record. B did not modify A;
there are exactly two session files and no fixture .git entries. During B, Herdr
still reports A's path and state sequence despite the changed terminal title.
Input/reporter/pre-review-driver hashes match; saved container queries are empty.
Durable report: `tests/host/ordinary-handover-stale-reference-pi-1.5.2.txt`.

The original driver run is still FAIL/INTERRUPTED: B's visual answer was no after
describing the checkpoint STOP, so the old generic questionnaire stopped before
saving automated assessment files. Raw evidence independently establishes the
stale identity; do not invent a yes, relabel native success or ask another rerun
just to reproduce it. The driver now saves classification/aggregate evidence
before a distinct B title/history-only question, keeping findings even on no or
interruption. All 24 offline tests pass including this ordering regression;
Bash syntax and whitespace checks pass. Original artifacts are unchanged.

**Next:** investigate same-pane lifecycle/session ownership before choosing a
production fix. Linked layout is not necessary for this failure; the exact
source mechanism is not yet proven. Prior tagged-source hypothesis is retained
below. No lifecycle release/reset, official reporter patch, server upgrade/
restart, topology workaround or weakened reference assertion is authorized as
automatic recovery. No production code change, live API request, host retry or
cleanup was performed during review. Phase 3 remains open; a full native/linked
restore and automatic server-restart restore are not established by this finding.

### Earlier task: focused same-pane ordinary handover diagnostic prepared

The user explicitly requested the focused test. The existing
`tests/host/verify-native-restore.sh` now accepts `--focused-handover` with the
same new-disposable-session/consent/version/context/topology guards. It launches
two NEW ordinary conversations A and B in the exact same directory, `backend`
storage and pane. No Git repository/worktree is created in this mode, no native
reopen is attempted and no official reporter/session state is reset or modified.

A must have a correct official checkpoint. B's local history is validated
separately from the official raw snapshot: the strict checkpoint still rejects
a wrong path, but diagnostic mode can classify `stale_previous` versus `current`
without claiming native restore success or substituting Pi's path as official.
Missing/blocked/pending/nonofficial/unrelated reports stop as ambiguous. Both
histories/IDs/files, unchanged A history, same exact storage/record and exactly
two session files are checked; raw errors/snapshots and manual observations are
retained. A B-checkpoint identity/path STOP is an expected possible finding:
quit without retry and let the host classify it. Completion is explicitly
DIAGNOSTIC COMPLETE, not a native restore PASS.

`tests/host/session-handover.sh` holds a source-only observed-reference classifier;
`tests/session/test-session-handover.mjs` adds eight offline guard/classifier checks.
Together with the observer tests, all 23 checks pass locally; Bash syntax and
whitespace checks pass. These do not certify actual host Docker/TUI execution.
The focused host run has NOT happened. Instructions/return evidence are in
`tests/session/README.md`. No production changes, live requests, reruns, cleanup,
image operations or staging/commits were performed here. Phase 3 remains open.

### Latest reviewed result: ordinary native reopen passed; linked seed found stale identity

The user supplied `tests/host/pi-docker-native.yaTn8dy1/`. Review verifies all
copied input/reporter/driver hashes and ordinary seed/native-reopen history,
ID/file/title/cwd/v3 record plus explicit visual confirmations. The earlier
managed-readiness harness correction worked. The linked-subdirectory seed also
persisted correctly in its own path-preserving cwd and exact host storage.

**New real finding:** at the linked checkpoint Herdr still reports the previous
ordinary conversation's managed path under `herdr:pi`, despite Pi's distinct
linked file/ID and changed terminal title. Official status remains idle and
state_change_seq remains 5. The checkpoint correctly stops on the wrong path;
no linked native reopen or visual confirmation was reached. Saved run/project
container queries are empty. Durable sanitized review:
`tests/host/native-restore-stale-reference-pi-1.5.2.txt`.

Do NOT weaken the reference assertion, silently substitute Pi's path, claim the
full native gate passed, or simply request another identical full rerun. Tagged
Herdr 0.9.5 source suggests same-pane lifecycle authority may retain the old Pi
session: startup is not an allowed same-owner session replacement, the reporter
has no shutdown release, and Docker masks native Pi process detection. This is a
hypothesis, not a proven host root cause or proof of a worktree-specific defect.
Next diagnostic should distinguish same-pane different-conversation handover
from linked-layout behavior. Any production lifecycle change needs explicit
review; do not release/reset state, patch the official reporter, upgrade/restart
Herdr, or change launch semantics as automatic recovery.

The offline observer now has a stale-valid-ordinary-reference regression and all
15 tests pass. No production code changed, no live requests or rerun/cleanup were
performed during review, and raw evidence remains unchanged. Phase 3 is open;
automatic server restart and linked native reopen remain unverified.

### Earlier result: native seed checkpoint exposed a test-harness false negative

The user supplied full fixture evidence at
`tests/host/pi-docker-native.yXQDav7Z/` after the test stopped before visual
observation with "Official reporter identity/path/readiness mismatch". Review
confirms a correct ordinary seed: settled real Pi 1.5.2 history, exact selected
storage/v3 record, and official `herdr:pi` identical managed path with idle status.
All supplied input/reporter/pre-fix-driver hashes match; saved run/project
container queries are empty.

**Root cause was the harness, not the user:** it demanded `interactive_ready`
from a directly launched foreground Pi. Tagged Herdr 0.9.5 source confirms this
flag applies to managed `agent start` startup only; false is omitted from JSON.
Both observer and host assertion are corrected to retain local idle + settled
history + official identity/path/idle-or-done checks and reject pending launches,
without demanding/synthesizing managed readiness. Production helper readiness
and all launcher policy are unchanged. Offline tests now pass 14 checks,
including omitted/false readiness and pending/blocked rejection. Durable review:
`tests/host/native-restore-partial-pi-1.5.2.txt`.

No native reopen/linked-subdirectory TUI launch or visual confirmation was reached.
The corrected gate needs a fresh explicitly requested host run. No automatic
rerun, cleanup, evidence modification or live API request was performed during
review. Keep fixture artifacts unchanged; do not stage full copied deployments.
Automatic Herdr server-restart restore remains separate; Phase 3 is still open.

### Earlier task: consented disposable native-protocol test prepared

After the interactive pass, the user explicitly approved preparing a guided
host-run native Herdr test in a new disposable session with the offline provider.
This is not permission to expose the user's working session. This agent has no
inherited Herdr context/socket and has made no live Herdr requests.

New `tests/host/verify-native-restore.sh` provides context/topology/version-checked
`--preflight` and explicitly confirmed `--run`, with fixture-only copied resources,
real official reporter installation, bounded read-only snapshot observation and
foreground ordinary/linked-subdirectory seed/native reopen checks. A guarded
`tests/session/native-checkpoint.ts` command observes the actual `herdr:pi`
reported managed reference; it does not report identity or construct resume argv.
The actual copied launcher consumes that reference with only `--session`; no
original flags/image choice are replayed. Private settings/default model,
PI_OFFLINE, no default tools, network none and fresh HOME/auth keep restore offline.
Input/reporter hashes, snapshots, histories, v3 records and receipts are retained.

**Scope boundary:** this first native gate tests official reporting plus the
launcher managed-path reopen protocol. It does NOT restart Herdr and does not
prove automatic restoration after a server restart. That remains a separate gate,
as do native missing/unusable-session failure paths, base/cross-image continuity,
Docker transitions and lifecycle semantics. Phase 3 remains open; no Phase 4 work.
See `tests/session/README.md` for named-disposable-session setup and exact commands.
Local offline observer/guard tests pass (9 checks), Bash syntax and diff whitespace
pass. No Docker or live Herdr test has been run here; no dependency installation,
image changes, staging/commit or host cleanup were performed. Await host results.

### Latest reviewed result: full interactive resume rerun passed and reviewed

The user ran a fresh full test and supplied
`tests/host/pi-docker-resume.nhtANrCS/`. **The interactive `--resume` gate now
passes** on Pi 1.5.2/custom image
`sha256:4fbac6482177e793a7d622c92d11cbdc0dcd3fd3523d63755c440f265bf6623b`.
All four seeds and all four interactive resumes are verified against raw
observer/JSONL snapshots: stable ID/file/title/cwd, original plus new user AND
assistant history, settled stage and no Herdr. Four seed IDs are distinct;
eight container receipts are distinct. Exact selected-directory/name host
storage receipts and aggregate evidence agree. Input/driver hashes match;
saved run/project container queries are empty. Manual observations and yes
confirmations establish Alpha/Beta local visibility, older Alpha selection,
Reviewer storage isolation and selected-subdirectory isolation.

Durable sanitized review: `tests/host/interactive-resume-report-pi-1.5.2.txt`.
The first partial run below remains historical, not a remaining picker failure.
The copied artifact directories are full deployments; do not stage them wholesale.
No cleanup or live API requests were performed during review.

**Phase 3 remains open.** Next gates are explicitly consented disposable native
Herdr restore, base/cross-image continuity and real Docker replacement/layout,
failure and lifecycle evidence. Do not begin Phase 4 yet or infer consent to live
Herdr socket exposure. Retain fixtures until separately reviewed cleanup.

### Earlier result: interactive driver supplied, first host run partial

The user requested a file-based workflow instead of copy/paste blocks.
`tests/host/verify-interactive-resume.sh` now implements the guided host gate;
usage/scope is documented in `tests/session/README.md`. The user supplied a full
fixture copy at `tests/host/pi-docker-resume.24uFOGYH/`. Review confirms four
successful distinct seeds and a successful older Alpha interactive reopen with
stable ID/file/title/cwd and complete original plus new user/assistant history.
All copied input hashes and the driver hash match; saved run/project container
queries are empty. The user reports seeing Alpha and Beta in the picker.

**The full gate did not pass:** `result.txt` records exit 1. The driver stopped on
an empty Alpha visual observation (`alpha: `), before yes/no confirmation and
before Beta/Reviewer/Subdirectory picker runs. No final `evidence.json` exists.
Do not interpret the interruption as an Alpha persistence failure or infer the
remaining visual/scope checks passed. Durable sanitized review:
`tests/host/interactive-resume-partial-pi-1.5.2.txt`.

No recovery, rerun or cleanup was performed. Keep the original fixture; obtain
explicit recovery intent before continuing it. The copied full deployment is raw
artifact material, not a directory to stage wholesale. Native Herdr,
base/cross-image, Docker layout-transition/failure gates remain pending.
The earlier copy/paste handoff below is historical; use the script workflow.

### Earlier request: start with copy/paste scripts for interactive resume

The user has selected **Step 1: validate the real interactive `--resume` picker**
as the next Phase 3 task. **Start the next session by providing reviewed Bash
blocks to cut and paste into the host terminal**, followed by short manual TUI
instructions and evidence checks. Do not start another clipboard investigation
or substitute a repository-script-only workflow unless the user asks.

Current stopping point:

- The user switched back to branch `worktrees` and reported a clean working
  tree. Recheck Git status; this handoff itself is a new documentation edit.
- Interactive test instructions were provided in the conversation, but no setup,
  seed, picker run or report was confirmed. Treat this gate as **not run**. Do
  not assume any previous shell variables, temporary fixtures or containers exist.
- Clipboard copying blocked progress. Pi was launched directly, not through
  Herdr/tmux. Neither xclip nor wl-copy was present in the container; no display
  was exposed. A direct host OSC 52 write also failed to populate the clipboard.
  The host was described as Ubuntu 26.04, “Terminal 50.1”. The exact application
  was not conclusively identified. The user will fix clipboard access separately.
- No clipboard package, image, launcher or desktop-socket changes were made.
  No host test runs, image builds, cleanup or live Herdr operations were performed
  by the agent during this pause.

Prepare the copy/paste procedure from current source, especially
`tests/session/README.md`, `tests/session/fixture-provider.ts`,
`tests/session/compose.fixture.yaml`, `compose.yaml` and `bin/pi`. The existing
host driver is batch-only and does **not** test the interactive picker. Review
these requirements when generating the blocks:

1. Run on the supported Linux Docker host, from the checkout root, in Bash and
   an interactive terminal. State required tools, including test-only jq for the
   observation checks; do not install dependencies or change image tags silently.
2. Create a fresh unique `/tmp/pi-docker-resume.XXXXXXXX/` deployment. Copy only
   allowlisted deployment resources, never real `data/`, `.git/`, `.env`, auth or
   host Git config. Use empty auth/private settings plus the guarded fixture
   provider copied into the private config extension directory and its sentinel.
3. Use a Compose `extends` wrapper over an unchanged copy of production Compose.
   Preserve the real image entrypoint/command, interactive stdin and TTY. Use
   network none, temporary HOME/scratch, read-only root, resource bounds and a
   unique project/run label as in the existing offline test wrapper. Launcher
   mounts/config/session binds must point only to these fresh fixture resources.
4. Use the actual copied `bin/pi` with `--no-herdr --no-host-gitconfig`, offline
   provider/model, tools/MCP/context/resources disabled as appropriate. Let the
   launcher select custom/base afresh; record selected image ID and input hashes.
5. Seed Alpha and Beta conversations with different Pi display titles in the
   same exact project directory and launcher storage name (`backend`). Seed a
   third conversation under `reviewer` and a fourth under a selected subdirectory.
   Print mode may seed them; it cannot count as interactive resume evidence.
6. Launch **without `--print`**, using `--resume`. Inspect the default/local
   picker list; select the older Alpha rather than just the latest Beta. Verify
   original history, enter a finite `phase3-*` prompt, wait for its matching
   `offline-fixture:...` response, then `/quit`. Repeat for Beta, reviewer and
   the subdirectory. Do not confuse global/all-session browsing with default
   local storage scoping. Capture any unexpected visibility as a finding.
7. Save `phase3-result.json` immediately after each seed/run under distinct
   evidence filenames. Assert stable session ID/file/title/cwd/header cwd,
   expected user AND assistant history, settled stage and `hasHerdr: false`.
   Ordinary/subdirectory mounts may both use container `/workspace`; verify
   directory/name isolation through distinct storage files/IDs, not cwd alone.
8. Ask for short visual picker/history observations and sanitized saved evidence.
   Check for retained run-labelled containers. Stop on ambiguous results; no
   automatic retries, repair, deletion or cleanup. Keep fixtures until reviewed.

This test needs neither a live model provider nor a Herdr session/socket.
Native restore, base/cross-image continuity, actual Docker layout transitions,
failure paths and lifecycle semantics remain later gates. Phase 3 remains open.

### Earlier handoff: remaining Phase 3 restore and interactive gates

**Phases 1 and 2 mounting and the first Phase 3 offline persistence host gate
have passed. Native Herdr restore and the remaining interactive/transition gates
are still pending; Phase 3 is not complete.**

**End-of-session handoff:** the user reports that cleanup was inspected and is
OK. No further cleanup is requested; do not recreate old run fixtures, rerun
cleanup or infer that any previous Docker/Herdr context is still available.
The reviewed reports are the durable evidence. Existing staged work was left
in place; this handoff update is not staged or committed by the agent.

For the next session:

1. Inspect current Git status and preserve the user's staged/unstaged changes.
   Read this handoff and `tests/session/README.md`; do not repeat completed host
   gates merely to reconstruct disposable artifacts.
2. Continue Phase 3, not Phase 4: the offline cwd-transition and explicit-session
   probes below are implemented. Preserve the user's decision to document
   layout-changing continuity as unsupported, without changing settled
   mount/history semantics or adding migration/historical state. Actual Docker
   transition behavior and interactive malformed-session handling remain gates.
3. Plan interactive resume and official native Herdr restore validation. Obtain
   explicit consent for a genuinely disposable Herdr session/live socket before
   using it; the approved offline provider is not consent for live APIs or real
   shared-session exposure. Use the prescribed Herdr skills/adapters and genuine
   inherited context, never fabricated pane/session IDs.
4. Keep base-image runtime and cross-image continuity explicit remaining gates.
   Do not mark Phase 3 complete or begin helper lifecycle orchestration yet.
### Follow-up: offline transitions and unusable requested sessions

The local real installed Pi 1.5.2 suite now has **12 passing tests** (six added):

- Replacement directory at the identical header cwd reopens the same ID/file and
  history; no checkout-identity check is performed by Pi.
- Different startup cwd with the same storage and `--continue` creates separate
  history, leaving the original untouched. Storage identity alone does not ensure
  layout-changing continuity.
- Explicit reopen after the old cwd disappears fails in print mode without
  replacement or file mutation. Existing-cwd reopen still uses the original cwd.
- Nonempty malformed JSON and non-session entries fail without mutation or
  provider activation. This is not strict validation of all damaged history.
- Empty explicit files are initialized and missing explicit paths are created by
  upstream Pi. These are characterization tests, not accepted native-restore
  behavior.

**Explicit user decision:** preserve current policy and document layout-changing
continuity as a limitation. No mount changes, historical state, migration, header
rewriting or pointer repair. Linked-to-ordinary rediscovery can pass host checks
but still fail old-history reopening; an interactive missing-header-cwd UI may
appear even when the selected host directory exists. These private absolute-path
probes are **not actual Docker layout transitions or native Herdr evidence**.

`herdr_validate_session_file` now additionally rejects empty or host-unreadable
native-restore files, satisfying the existing no-replacement requirement without
adding a session parser. Missing/out-of-storage file checks remain. The new
fake-Docker regression verifies the empty file is rejected before Compose launch
or reporter preparation, without session/record mutation (read-only image probes
may run first). Positive fake-Docker fixtures now contain nonempty sentinels;
they still do not certify Pi parsing/readiness. Nonempty parsing remains Pi's
responsibility; container-user readability and interactive failure modes still
need integration evidence.

Current local validation: **136 tests discovered: 117 passed, 19 skipped** because
test-only jq is absent (13 contract-driver and 6 session-host-driver checks).
All 12 real-Pi CLI tests and 60 launcher tests pass. Bash syntax and current
`git diff --check` pass. No dependency was installed, live Herdr socket contacted,
Docker run attempted, host cleanup executed or Git commit/staging performed.
See `tests/session/README.md` and `docs/HERDR_INTEGRATION.md` for the limitation.
Next gates remain interactive resume, consented disposable native Herdr restore,
base/cross-image continuity and real host transition/failure evidence.

### Earlier production mount and persistence evidence

The production launcher now adopts the tested mount contract, selects images
freshly, ignores inherited image preferences, rejects obsolete `--image`, and
validates Compose configuration before launch. Source creation is disabled for
all project/configuration/session/security binds. Exact selected-directory/name
storage and host helper metadata are preserved.

The returned production run `/tmp/pi-docker-production.SMNf86J3/` passed **23
checks** on custom image
`sha256:4fbac6482177e793a7d622c92d11cbdc0dcd3fd3523d63755c440f265bf6623b`.
Saved report: `tests/host/production-mount-report-pi-1.5.2.txt`, SHA256
`e6184dc52946056844f14dbd7b9aa78df2d63bf07c6297dda6b10b3a80f326a3`.
Host: Git 2.53.0, Bash 5.3.9, Compose 5.7.1, Docker client/server 29.10.0.
Runtime: Pi 1.5.2, Node 24.22.3, Git 2.39.5. All 23 raw check logs agree with
the sanitized report. All 13 distinct receipt names and per-container Compose
artifacts were reviewed for cwd, fixture-only private sources, missing-source
creation disabled, no duplicate mounts and no Herdr socket. Concurrent writers
met the barrier, preserved the main index/staged file and used distinct worktrees.
The two missing-source errors are expected negatives, not suite failures.

The suite uses the actual deployment Compose service plus read-only test code,
fixture-only private/config/GitHub/Git-config binds, a Node entrypoint, and
network/rootfs/resource-limit test overrides. It does not load real credentials
or conversations, start Pi/Herdr, or mount a live Herdr socket. It validates
exact effective mount sources/targets/modes/cwd and concurrent Git writes; each
container gets its own config artifact. Host Herdr overlay/socket behavior,
actual Pi readiness and full persistence/restore remain later integration gates.
No host Node/Python/jq is required for this production mount suite.

The actual production mount gate is reviewed and passed. The user explicitly
chose a deterministic **in-process offline fixture provider**, rather than real
credential/API access, for Phase 3's first persistence tests. New test code:

- `tests/session/fixture-provider.ts`: guarded private-fixture extension; no
  transport/tools/credentials, finite synthetic responses, actual Pi turn storage
  and observations of session ID/file/cwd/name/history. Never a deployed resource.
- `tests/test_session_fixture.py`: **6 real installed Pi 1.5.2 CLI regressions**
  pass locally with isolated config/HOME/auth/storage and no inherited provider
  or Herdr environment. Covers genuine persistence, continue ID/file/history,
  explicit session reopen and recorded cwd, storage separation, missing cwd
  without replacement, and activation guard. This is not Docker evidence.
- Five new fake-Docker launcher regressions cover current replacement checkout,
  surviving marker-free directory, exact missing subdirectory, invalid discovered
  metadata and exact directory/name `--continue`/`--resume` forwarding. No new
  historical identity/type fields, registry, migration or pointer repair.
- `tests/host/verify-session-persistence.sh` provides read-only `--preflight`
  and a **14-check** `--run` host gate. A copied allowlisted deployment, fresh
  private data, guarded provider and a Compose `extends` test wrapper exercise
  actual `bin/pi` and the image entrypoint. The wrapper changes batch transport,
  HOME/scratch/network/rootfs/resources, not image entrypoint/command. No live
  socket, credentials, host Git config, pulls, retags or cleanup. Test-only jq is
  required; no host Node/Python. Input hashes, raw logs, per-turn observations,
  container hostname receipts and exact project/label are retained.
- `tests/test_session_host.py`: **6 fake-Docker driver regressions** cover
  custom/base selection paths, preflight/help, and false-observation/configuration
  failure without retries. This does not certify actual Compose or Pi readiness.
- Local cumulative validation: **129 Python tests pass without skips** (including
  6 actual-Pi CLI tests), **48 production discovery checks**, **10 fake-Docker
  preflight checks**, Bash/JS syntax, and current source-diff whitespace checks.
  Test-only jq 1.8.1 was checksum-verified in a temporary directory, not installed
  globally. The full staged whitespace check flags only the earlier checksum-
  pinned production report's Docker trailing spaces; its bytes are preserved.

On the supported host, from this checkout:

```bash
bash tests/host/verify-session-persistence.sh --preflight
bash tests/host/verify-session-persistence.sh --run
```

The user supplied `tests/host/persistance-report-pi-1.5.2.txt` (spelling preserved):
**14 checks passed** on the real custom-image entrypoint, image
`sha256:4fbac6482177e793a7d622c92d11cbdc0dcd3fd3523d63755c440f265bf6623b`.
Report SHA256: `401f73378a4d77d6d42e517ec411906491f35ea4d917995a4ae85760e54c54d1`.
Report review confirms 11 distinct container hostname receipts and six distinct
conversation identities; ordinary continue/reopen, linked canonical alias/reopen
and deep-selection continue retain their expected IDs/files. Raw per-turn JSONL,
observations and Compose artifacts were not supplied for independent inspection;
the reviewed report records the driver's automated assertions. The finish handler
reported PASS only after finding no run-labelled containers.

No additional cleanup script is needed for this successful run: all retained
fixture checkouts/common Git metadata/config/conversations/logs are inside its
original `/tmp/pi-docker-persistence.XXXXXXXX/` tree. No Docker networks/volumes
or Herdr resources were created, and images were not changed. Preserve the durable
report; optional cleanup on the original host is deletion of that exact run tree
only after confirming no matching containers/concurrent users or nested mounts.
Do not derive its case-sensitive suffix from the lowercased Compose project
`pipersist-pi-docker-persistence-vqnjnism`. No deletion was executed by the agent.
The user subsequently confirmed cleanup was inspected and OK; no further cleanup
is pending from this handoff.

Read `tests/session/README.md` for exact scope/retained resources. Do not mark
Phase 3 complete from this print-mode gate. Interactive `--resume` and
native Herdr restore require their own explicitly consented disposable session.
Also probe actual session-header cwd behavior across replacement layout changes:
Pi stores immutable container cwd, so host-only acceptance of linked→ordinary
`/workspace` rediscovery does not prove the old conversation opens correctly.
Validate malformed/unusable requested sessions without replacement and missing
checkout/metadata failures before Pi's fallback UI. Keep cross-image continuity,
close-versus-removal semantics and a separate base-image integration explicit.
Do not change settled mount/history policy or add historical flags/migration to
hide a discovered issue. Any actual provider access or live Herdr exposure must
be explicit. Do not start Phase 4 before this persistence/restore milestone.

The earlier SMNf86J3 one-off cleanup script had **19** passing safety checks;
that script/test and raw artifact copy are no longer in the current checkout.
The durable report and `production-mount-containers-SMNf86J3.txt` remain. Do not
infer original host fixture/container state or reuse an old cleanup for Phase 3.
No host resources were cleaned by this agent and no generic cleanup manager is
added. The checksum-pinned staged Phase 2 report retains Docker's trailing spaces;
do not silently normalize its evidence/checksum to satisfy whitespace checks.

A run-specific cleanup script was provided for the completed Phase 1 Docker run,
but it and its test were not committed in the Phase 1 handoff. Do not assume they
or copied fixtures still exist. No general cleanup utility is added. Never
reuse a prior run's cleanup for new resources, assume Docker context, delete
resources automatically, or expose the Docker socket to this agent.
The Herdr suite's `jq` dependency is test-only, not a launcher prerequisite.

The implemented Herdr harness follows this contract:

1. Provide read-only preflight/version checks and exact user instructions for
   running inside a real pane of an **explicitly created disposable Herdr
   session**. Inspect host `pi` resolution without launching Pi. Never use the
   user's existing work session for mutation tests, fabricate caller context,
   upgrade/restart a server, or infer host paths from container `/workspace`.
2. Create only disposable fixture repositories/resources and call the official
   Herdr CLI. Verify create returns checkout/workspace/tab/root-pane records and
   already opens/groups the workspace without a second open/split.
3. Verify read-only parent-source discovery from a linked checkout, explicit
   parent selection for create/open, focus preservation, existing-workspace
   reuse/`already_open`, and detection of occupied returned panes. No agent
   replacement or unrequested extra topology.
4. Verify workspace close retains its checkout; verify dirty removal is refused
   without force and explicit clean removal uses the exact open linked workspace
   ID, removes that checkout/workspace, and retains the branch. All destructive
   assertions must concern test-created resources only.
5. Record identities immediately and emit per-step receipts, sanitized output,
   and a final report suitable for the user to copy back into the shared checkout.
   A timeout or partial failure stops mutation and reports known/uncertain state;
   no retries, rollback, automatic cleanup, force, or branch deletion. Explicitly
   requested removal assertions are test steps, not failure cleanup.

Both user-run host reports are reviewed and agree with the consolidated contract.
Docker and Herdr context remain unavailable to this agent. Do not request Docker-
socket exposure. Phases 2–3 can now proceed; production Compose merging still
requires its own host test after implementation.

### Durable evidence and local checks

- `tests/host/report.txt`: reviewed **PASS (22 checks)** from the user's host;
  fixture/report origin was `/tmp/pi-docker-mount.XFlrlif5/`. It validates the
  standalone custom-image mount prototype, not production or Herdr behavior.
- `tests/host/mount-report-pi-1.5.2.txt`: reviewed **PASS (23 checks)** from
  `/tmp/pi-docker-mount.dKOURTXx/`, with actual Pi 1.5.2 runtime metadata. A
  full copied artifact directory was supplied at
  `tests/host/pi-docker-mount.dKOURTXx/`; it contains raw local paths and fixture
  Git metadata with absolute pointers to the original host `/tmp` layout.
  Preserve the sanitized report, not the copied tree, in version control.
- `tests/host/herdr-report.txt`: reviewed **PASS (26 assertions)** from the
  disposable host run at `/tmp/pi-herdr-contract.fuBotUWA/`. Expected refusals
  are confirmed failures at linked-create, linked-open, and dirty-remove; the
  overall run passed. Parent `w2` and occupied worktree workspace `w5` were
  intentionally retained. Initial child `w3` was closed without removing its
  checkout; reopened child `w4` was explicitly removed cleanly, retaining its
  branch. The fixture process emitted its completion marker. These IDs belong
  only to that disposable server/session; never reuse them against another one.
- `tests/host/mount-contract.sh`: experimental Bash/Git discovery, ancestor scan,
  reserved-path/pointer checks. `compose.probe.yaml` and `compose.metadata.yaml`
  use static long-form binds; no host Node or generated YAML is needed so far.
- `tests/host/container-command.sh`: batch execution with `-T`,
  `--interactive=false`, stdin from `/dev/null`, and bounded local timeout. Keep
  this fix: the first host attempt stopped timeout/Compose on terminal input.
  Do not copy this batch-only behavior into interactive Pi launches unchanged.
- The earlier, uncommitted run-specific cleanup script had **11** passing
  offline fake-Docker regressions in Phase 1. Those one-off files are absent
  from the committed checkout and are not current test commands.
- Phase 2 local checks passed: **112 Python unittests**, **48 discovery assertions
  against the production helper**, **10 fake-Docker preflight/batch assertions**,
  Bash/JavaScript syntax checks, and `git diff --check`. Python coverage includes
  linked/separate/contained layouts, subdirectory/symlink selection, invalid
  metadata/no-Git behavior, inherited Git/Compose overrides, fresh image selection,
  v3 records/old-record rejection and configuration validation failure. Canonical
  control-character paths are rejected without command-substitution newline
  truncation accidentally selecting another existing directory/deployment/socket.
  Literal pointer walks cannot rely on unrelated unmounted directories before
  `..`; administrative `commondir`/reverse `gitdir` files cannot hide external
  symlink dependencies. Complete pointer-file reads reject embedded controls,
  NULs and additional lines; a single line with or without a final LF is accepted.
  Native restore uses the same lossless path capture for early validation.
  The **13**
  Herdr-harness regressions require test-only jq; the full run used a checksum-
  verified temporary jq 1.8.1, not a global installation. No real Docker/Herdr
  integration was run by this agent. Re-run as appropriate after edits:

  ```bash
  bash tests/host/test-mount-contract.sh
  bash tests/host/test-preflight.sh
  MOUNT_CONTRACT_IMPL="$PWD/tests/host/production-mount-contract.sh" bash tests/host/test-mount-contract.sh
  bash -n bin/pi lib/*.sh tests/host/*.sh
  node --check tests/host/container-probe.js
  python3 -m unittest discover -s tests -p 'test_*.py'
  git diff --check
  ```

  Node/Python above are development/test tools in the agent environment, not
  new prerequisites for host launching or either host integration suite. `jq`
  is required only by the Herdr harness and its development regressions.

### Working-tree and resource preservation

The earlier handoff and Docker report were committed by the user. The current
Phase 1 harness/review changes may still be uncommitted: inspect `git status`
before resuming and preserve them. Both the Herdr and refreshed Docker reports
are present and reviewed; Phase 1 is complete.
Keep transitional status/instructions in this plan and harness-local docs, not
the durable root `README.md`. Phase 2 changes now include the production launcher,
deployment Compose files, and shared-helper adapter image handling; isolated-
worktree lifecycle orchestration remains unimplemented.

The Herdr mutation harness passed its user-run disposable host test. Its fixture
origin is `/tmp/pi-herdr-contract.fuBotUWA/`; successful test resources were
intentionally retained, not scheduled for cleanup. Do not assume its session is
still running or reuse its IDs without verifying the same inherited context.
Temporary upstream-schema/source downloads are not durable inputs; use the versioned
references above if needed. Host test fixtures were deliberately retained; do
not automatically delete them or assume a failed run's processes/resources have
exited. The first attempt used `/tmp/pi-docker-mount.7BF9ROj9/`; inspect recorded
state before any explicitly requested cleanup.

## Phase 1: Verify interfaces and define mount behavior

**Complete.** See the reviewed host evidence and consolidated contract above.
Production integration and its validation remain in subsequent phases.

1. Check the supported host/server Herdr versions and the pinned container CLI.
   Inspect installed help/API schema and upstream documentation for worktree
   create/open responses, workspace/root-pane IDs, checkout paths, and removal
   semantics. Do not guess JSON field names or upgrade/restart a live server.
2. Inspect the existing launcher, Compose configuration, restore records, helper
   script, and tests before changing them.
3. Define checkout discovery using Git on the host: selected directory, checkout
   root, per-worktree Git directory, and Git common directory. Resolve paths
   explicitly; do not infer linked worktrees from directory names. Include
   separate-Git-directory layouts and the conservative no-Git ancestor scan
   specified above. Recognized but invalid/inaccessible Git metadata must not
   silently become a non-Git launch.
4. Use path-preserving mounts when external Git metadata requires them: mount
   the entire selected checkout and Git common directory read/write at their
   actual absolute host paths inside the container. Do not mount the original
   checkout's source files merely to expose its `.git` directory. Mount additional
   metadata paths only if discovery shows they are necessary; the usual
   per-worktree Git directory is already inside the common directory.
5. Validate this design against Git's forward and reverse worktree pointers.
   Resolve symlinks and verify literal metadata pointers remain reachable.
   Reserve known conflicting/unsafe container paths, not an allowlist of host
   project prefixes. Reject component-aware exact, ancestor, and descendant
   overlaps with configuration, session, socket, credentials, deployment, and
   essential runtime paths (including `/pi`, `/run`, `/opt/pi-docker`, and runtime
   trees such as `/usr`, `/bin`, and `/home/node`). Define the full list from the
   image/layout contract. Reject unsafe layouts with actionable errors rather
   than remapping paths, mounting broad host directories, or rewriting metadata.
   Deduplicate metadata already reachable at the correct path within a required
   mount; reject unsafe checkout/metadata overlaps. Do not rely on mount order.
6. Keep the existing `/workspace` layout for ordinary directories and
   self-contained checkouts. For a selected subdirectory of a linked/external-
   metadata checkout, mount the whole checkout at its host path but start Pi in
   the exact canonical selected subdirectory. Preserve selected-directory/name
   storage and exact-directory conversation matching; do not aggregate history
   from the checkout root, parents, children, or sibling subdirectories.

Deliverable: a tested mount contract and confirmed Herdr API contract.

## Phase 2: Launch existing linked worktrees correctly

**Complete for the production mount contract: implementation plus reviewed
23-check host run `SMNf86J3`.** Actual Pi startup/conversation/native-restore
validation remains Phase 3, not a claim made by this Node-entrypoint suite.
The Phase 3 image-independent record/key prerequisite is included to avoid
retaining an image-aware intermediate format after removing image replay.
The Bash/Git/static-Compose approach remains small enough; no host-Node fallback
was needed. `--production-preflight` / `--production-run` provide the host gate.

1. Add host-side discovery and mount preparation in a small dedicated Bash/Git
   helper rather than expanding Herdr-specific code. Keep Git optional under
   the conservative ancestor-scan policy. Keep host Node optional unless the
   Bash prototype fails the simplicity/safety assessment; then report and use
   the agreed Node-built-ins-only host fallback. Do not add host Python or
   custom-image tool dependencies. Host mount preparation is distinct from
   container-side Herdr orchestration; do not duplicate lifecycle policy.
2. Make Compose working-directory and mount selection configurable. Use safe
   argument/structured configuration handling for paths; do not interpolate
   untrusted paths into shell commands or hand-built YAML. Replace the default
   `/workspace` project mount for path-preserving launches, while preserving
   existing deployment/security mounts. Use bind mounts with source creation
   disabled so missing or disappearing sources fail instead of creating host
   directories. Validate the effective merged mount configuration.
3. Preserve host workspace metadata passed to helpers and the existing
   path/name-based Pi session storage selection.
4. Update agent instructions and deployment documentation: `/workspace` is the
   ordinary default, not a universal project path; use the actual working
   directory and supplied host workspace metadata.
5. Fail clearly on missing or inaccessible metadata. Do not repair, relocate,
   or recreate worktrees implicitly.
6. Remove launcher image overrides (`--image` and inherited
   `PI_DOCKER_IMAGE` as an input), helper image propagation, and image
   recording/replay. Reject obsolete `--image` invocations with a clear error.
   Select local custom if available, otherwise base; pass that freshly selected
   result internally to Compose, not as a persisted preference. Distinguish
   custom-image absence from Docker/daemon inspection failure and report
   operational failures rather than treating them as evidence of absence.
   Update launcher help, tests, and documentation accordingly.

Deliverable: a manually created or Herdr-created linked worktree can be launched
with the existing `pi <workspace> --name <name>` interface and normal Git works
inside the container.

## Phase 3: Validate persistence and Herdr restore

**In progress.** The image-independent v3 prerequisite landed in Phase 2. Local
real-Pi fixture tests and the first offline real-entrypoint host driver are now
implemented; its real custom-image host report passed all 14 checks. The real
interactive picker gate also passed and was reviewed from rerun `nhtANrCS`:
Alpha/Beta selection, storage-name/subdirectory isolation and stable history.
Official native managed-path reopen now also passes for BOTH ordinary and
linked-subdirectory selections in reviewed shell-boundary run `0rXTuSjw`.
Automatic restoration after a real Herdr server restart remains untested, as do
base/cross-image runtime continuity and remaining actual Docker transition,
native failure-path and integrated lifecycle gates. Offline cwd-transition
probes establish an upstream continuity limitation, which the user chose to
document without policy changes. Empty native-restore files are rejected before
container launch.
See the handoff and
`tests/session/README.md`; no Phase 3 completion claim is made.

1. Retain the exact canonical selected directory (including any selected
   subdirectory) in the new launch records, not just the checkout root. Rediscover
   the checkout root/metadata when needed; avoid duplicating Herdr's workspace
   grouping or worktree registry.
2. On restore, validate only what currently exists at the recorded path and
   rebuild the required mounts. Do not record a launch-type flag or historical
   checkout identity. A valid replacement checkout at the same path is accepted;
   a directory no longer recognized as Git is treated as an ordinary directory,
   accepting that deleted worktree metadata may go undetected. If discovery
   identifies Git metadata but required paths are invalid or inaccessible, fail
   clearly rather than repair or ignore the discovered mount requirements.
3. Use image-independent conversation storage identity for the current
   base/custom image pattern. Resume/restore must select custom if locally
   available, otherwise base, without replaying a recorded image. Adding or
   removing the custom image must not change which conversation is resumed.
   Replace the current image-aware Herdr storage keys and launch records with
   an image-agnostic format. Backward compatibility with older conversations,
   launch records, and restore references is explicitly out of scope; do not
   implement migration, aliases, or compatibility loaders. Reject unsupported
   old restore references clearly rather than silently starting replacements.
   This change does not require deleting old conversation files or introducing
   a separate physical storage namespace to isolate them. The sole current
   user accepts the transient risk that discovery in reused session directories
   may encounter older conversations. Do not add migration or isolation
   machinery to address this transition.
4. A missing workspace directory or invalid/inaccessible discovered Git metadata
   must produce an actionable error, not a new checkout or replacement
   conversation. A surviving directory with no recognized Git metadata may
   launch as an ordinary directory, as described above.
5. Verify that closing Pi or its container leaves the worktree intact and that
   Herdr workspace close versus worktree removal retains Herdr's own semantics.

Deliverable: continuation and native Herdr restore use the same worktree and
conversation reliably.

## Phase 4: Add thin isolated-helper orchestration

1. Extend the deployment-owned `pi-docker-herdr` skill and its existing Node
   adapter (`skills/pi-docker-herdr/scripts/herdr-helper.js`) with explicit
   shared-checkout and isolated-worktree modes. Keep shared sibling helpers as
   the default unless isolation is requested.
2. For isolated helpers, call Herdr's worktree create/open interface with an
   explicit parent source workspace or host checkout path. If the caller is in
   a linked worktree, obtain the parent through Herdr list/provenance first.
   Preserve caller context; never substitute container `/workspace` for a host
   path. Create already opens/groups the workspace and supplies a root pane;
   do not add a redundant open or sibling split.
3. Delegate branch/base defaults, dirty-checkout handling, detached/unborn HEAD
   behavior, branch collisions, and existing-worktree reuse semantics to Herdr.
   Pass explicit user choices through its verified supported interface;
   otherwise use Herdr's defaults. Do not independently resolve a base commit
   or implement parallel Git creation/recovery policy. Surface Herdr's errors
   and required user decisions; never automatically force, stash, commit,
   transfer edits, reset, or switch an existing worktree.
4. Use the workspace, checkout path, and root pane returned/discovered through
   Herdr. Inspect availability, especially when open returns `already_open`;
   never assume its root pane is an empty shell or replace an occupant. Start
   the host Docker-Pi launcher through `agent start --kind pi` in an available
   returned/discovered pane, passing the selected host directory. Stop and report
   if no suitable pane is available rather than inventing extra topology. The
   host `pi` command must resolve to this launcher.
5. Preserve focus. Explain that Herdr-managed worktrees open as grouped
   workspaces rather than sibling panes; reject conflicting topology options
   clearly instead of silently ignoring them.
6. Let the host launcher select custom if locally available, otherwise base;
   do not forward an image choice from the caller. Reuse existing readiness
   checks and prompt/read/wait behavior.
7. Use lightweight per-step receipts for create, open, start/resume, and remove,
   distinguishing not attempted, uncertain, confirmed success, and confirmed
   failure. Retain returned worktree/workspace identities, checkout path, pane
   identity, and agent identity immediately when known. On any failure or
   timeout, stop and report confirmed results and uncertain outcomes, leaving
   successful resources available. No automatic recovery, retries, rollback,
   resource deletion, or agent replacement; inspect known state before an
   explicitly requested recovery.
8. Never automatically retry ambiguous mutations, force repository trust,
   replace agents, close workspaces, or remove worktrees. Inspect known state
   before recovery. No automatic cleanup or branch deletion.
9. Provide a skill-driven open/resume workflow for an existing worktree. Unless
   the user specifies a conversation, resume the most recently updated
   conversation across all storage names for the exact canonical selected
   directory; if none exists, start a fresh conversation. For a root selection,
   exclude conversations launched in subdirectories; for a subdirectory selection,
   exclude root, parent, child, and sibling-directory conversations. Discover
   history independently of the new helper's agent name and reuse the selected
   conversation's original storage location. `--name` remains a storage selector, not a worktree selector.
   Use best-effort discovery: accept Pi's behavior of skipping unusable history
   and starting fresh if no usable conversation is found, even when unreadable
   or invalid history exists. Do not add strict history validation machinery.
   An explicitly requested missing/unusable conversation or an invalid checkout
   must still fail clearly rather than silently select another conversation.
   Use the launcher's image-agnostic storage and automatic custom/base selection.
10. For an explicit user request to remove a worktree, identify the exact target
   and its open Herdr-managed linked-worktree workspace ID; removal takes that
   ID, not a checkout path. If a closed target must be opened first, treat that
   as an explicit receipted step under the requested removal workflow. Check
   Herdr's documented safety requirements. Report its result without adding
   forced removal, branch deletion, or Docker-Pi conversation/launch-record
   cleanup. Do not
   retry an ambiguous removal automatically.

Deliverable: the `pi-docker-herdr` skill orchestrates worktree create/open,
Docker-Pi start/resume, and explicit removal through Herdr without duplicating
Herdr lifecycle management. Manual commands remain a fallback, not the normal
user workflow.

## Phase 5: Tests and documentation

### Automated tests

- Preserve launcher, layout, helper, diagnostics, and restore coverage for the
  supported base/custom workflows. Replace tests for intentionally removed
  image overrides, image propagation/replay, and older conversation formats;
  those behaviors are not compatibility requirements.
- Test rejection of obsolete `--image` inputs, ignoring inherited image
  preferences, and differentiation of custom absence from Docker inspection
  failures. Verify launch/helper changes need neither host Python nor
  custom-image-only tools.
- Test custom-if-available/base-otherwise selection for ordinary launches,
  helpers, and resume/restore. Verify that image metadata is neither propagated
  from callers nor replayed from launch records.
- Test image-independent conversation identity when custom becomes available or
  is removed. Test clear rejection of unsupported old restore references;
  backward compatibility and migration of older conversations are not required.
- Use real temporary Git repositories for checkout discovery and Git-pointer
  tests, including regular checkouts, linked worktrees, separate Git directories,
  subdirectories, spaces, symlinks, and a main checkout outside the selected
  worktree directory. Cover nested worktrees, metadata deduplication, and literal
  pointer paths that differ from canonical discovery paths.
- Without host Git, test ordinary-directory launch/restore success and rejection
  of `.git` files/directories/symlinks in any ancestor, including dangling markers
  and inspection failures. Apply the same rules with and without Herdr. Verify
  help/local diagnostics need no Git and the preferred path needs no host Node.
- Test reserved destination equality/ancestor/descendant checks, runtime and
  deployment collisions, and component boundaries (`/runaway` is not `/run`).
- Test missing metadata, unsupported path collisions, and invalid restore paths.
  Verify restore accepts a valid checkout recreated at the recorded path and
  treats a surviving directory with no recognized Git metadata as ordinary,
  and rejects invalid/inaccessible discovered metadata. No launch-type flag or
  historical identity checks are required.
- Test generated mount configuration and working-directory selection.
- With Pi 1.5.2, ensure Docker-Pi restore rejects a missing recorded checkout
  before Pi can offer its missing-cwd Continue/Fork/Cancel fallback. Never
  implicitly continue elsewhere or fork a replacement conversation. Pi's own
  user-invoked interactive session recovery is distinct from Docker-Pi restore.
- Smoke-test ask-user/Herdr blocked and unblocked transitions against the pinned
  extensions: Pi 1.5.1 changed custom-overlay blocked-status handling. Preserve
  existing readiness/wait semantics; do not infer agent readiness from an overlay.
- Test rewind capture/restore in two distinct linked worktrees using custom:
  restoring one must not change the other's files or either real Git index.
  Verify index preservation during capture as well as restore, with staged,
  unstaged, and untracked files. Exercise concurrent snapshot creation against
  the shared rewind store ref and surface bounded-retry exhaustion clearly.
  Test the actual hook version shipped in the image; account for its documented
  snapshot-domain limits rather than promising coverage of ignored files, empty
  directories, or unsupported submodule states.
- Test rewind metadata across conversation resume and custom/base/custom
  launches; base must resume the same conversation without requiring the hook.
  Verify still-available checkpoints can be restored after returning to custom.
  Exercise configured retention in disposable settings, including shared-ref
  effects across worktrees and missing/pruned checkpoints: resume must still
  work, and unavailable rewind points must not be offered as successful restores.
  Do not silently edit shared user configuration or require indefinite snapshot
  preservation.
- Test helper create/open success, parent-source discovery from linked callers,
  create's combined checkout/open behavior without redundant mutations, supported
  branch/base options, and existing-checkout reuse through open (not an invented
  reuse flag). Cover occupied already-open panes, Herdr defaults/errors, unavailable
  API features, partial startup failures, ambiguous timeouts, and preservation of
  returned identities without parallel Git policy or forced recovery.
- Test open/resume selects the most recently updated conversation across all
  storage names for the exact selected directory when none is specified, including
  a reopened helper whose agent name differs from the original. Assert that root,
  parent, child, and sibling-directory history is not pooled. Verify reuse of
  the selected conversation's original storage location, explicit selection,
  and fresh start when no usable conversation is found. Cover best-effort
  fallback with unreadable/invalid history; explicit missing/unusable
  conversations must fail clearly rather than silently select another.
- Test per-step receipts for create/open/start/resume/remove, retaining returned
  identities immediately and distinguishing confirmed failures from uncertain
  outcomes. Assert stop-and-report behavior without retries, rollback, cleanup,
  or replacement after partial failure or timeout.
- Assert no unintended mutation during help/diagnostics, no implicit worktree
  recreation/removal, and no automatic resend/retry after ambiguous delivery.
- Test explicit removal delegation to Herdr, retention of conversations and
  launch records, and clear restore failure for a removed checkout. Verify no
  added force/branch-deletion behavior or automatic retry after ambiguous removal.

### Host-side integration checks

Docker is unavailable inside the agent container. Run Docker integration checks
on a Linux host with the deployment launcher and a compatible Herdr server.
Use an explicitly created disposable test session, not the user's live work.

- Verify host Herdr CLI/server versions and host `pi` launcher resolution. Exercise
  create/open/remove in a disposable Herdr session, including linked-source parent
  discovery, focus preservation, already-open occupied panes, and dirty-removal
  refusal without force.
- Validate effective merged Compose mounts, missing-source failure without source
  creation, reserved-path rejection, and selected-subdirectory working directories.
- In a linked-worktree container, verify `git status`, diff, add, commit, log,
  and worktree listing with Git metadata paths accessible. Verify separate-Git-dir
  support and that the original checkout's source files need not be exposed.
- Run two writing agents in separate worktrees; verify working files and indexes
  remain separate and both branches are visible for deliberate integration.
- Verify ordinary launches and read-only/shared-checkout helper workflows.
- Verify continuation, exit/relaunch, and native restore; test a missing checkout
  without silently creating a replacement.
- Confirm container exit does not delete a worktree. Leave removal and branch
  lifecycle to Herdr/user actions.
- With custom, run two agents in distinct worktrees, create checkpoints
  concurrently, restore available checkpoints independently, and verify real
  indexes remain unchanged. Exercise configured retention and verify clear
  handling of unavailable checkpoints without breaking conversation resume.
  Verify custom/base/custom switching preserves the conversation; in the
  image-owned setup, turns run in base have no newly captured rewind checkpoints.

### Documentation

Update `README.md`, `docs/USAGE.md`, `docs/SETUP.md`,
`docs/CUSTOMIZATION.md`, `docs/HERDR_INTEGRATION.md`, `docs/AGENTS.md`,
image-owned agent instructions as applicable, and
`skills/pi-docker-herdr/SKILL.md`. Document:

- Skill-driven worktree create/open/start/resume/remove as the normal workflow;
  manual Herdr creation and Docker-Pi launch as fallback/debugging steps.
- Automatic custom-if-available/base-otherwise selection, with no image
  overrides, caller-image propagation, or recorded-image replay.
- Image-independent conversation identity, no backward compatibility with older
  formats, latest usable conversation across all names for the exact canonical
  selected directory (not the whole worktree), and best-effort fallback to fresh
  when no usable conversation is found.
- Partial-success receipts and explicit recovery after inspecting known state;
  no automatic recovery or cleanup.
- Shared versus isolated helpers and their different topology.
- Actual container working directories, whole-checkout mounts for selected
  subdirectories, required Git metadata mounts, and the reserved-path policy.
- Optional host Git and conservative no-Git ancestor scanning; detected Git
  markers require Git, regardless of Herdr mode. Bash/Git host preparation is
  preferred; document a host Node prerequisite only if the agreed fallback is used.
- Image-owned rewind support in custom and absence in base. Rewind is intended
  for recent conversations, and configured retention may clean up snapshots,
  including those referenced by other worktrees. Saved conversation history does
  not guarantee snapshot availability. Snapshot objects live in shared Git
  metadata; worktree removal does not perform additional snapshot cleanup.
- Restore prerequisites and explicit worktree removal through Herdr. Saved
  conversations and launch records remain after removal; restore fails clearly
  while the recorded checkout is missing.
- Shared Git metadata/refs and credentials are not security-isolated; host ports
  and other external resources still require coordination.
- One coordinator/user should deliberately merge or cherry-pick agent commits;
  worktrees prevent edit collisions, not semantic merge conflicts.

## Acceptance criteria

1. Docker-Pi can run in an existing linked worktree without rewriting Git
   metadata or requiring the original checkout's source files to be mounted.
2. Normal Git operations work inside the container. Distinct selected worktrees
   have separate working files and Git indexes under the supported mount layout.
   This is not security isolation and does not prevent shared-checkout helpers,
   deliberate access, or two launches selecting the same checkout; Git refs,
   metadata, credentials, and configuration remain shared.
3. Herdr remains the only automated worktree lifecycle manager.
4. Ordinary launches, session naming, and shared helpers work with automatic
   custom/base selection and image-independent conversation identity. Removed
   image-selection behavior and older conversation formats need not be preserved.
5. Explicit Pi conversation resume and native Herdr restore use the recorded
   workspace path and intended conversation or fail clearly when required state
   is missing. Validate only the current directory/Git state, without historical
   identity or launch-type checks. Unqualified resume uses the best-effort
   conversation-selection policy below.
6. Isolated helper startup preserves focus and reports durable identities after
   partial failure, with no destructive cleanup or blind retries.
7. The skill provides create/open/start/resume/remove workflows. Unqualified
   resume selects the latest usable conversation across all storage names for
   the exact canonical selected directory, without pooling history from other
   directories in that worktree, with best-effort fallback to a fresh conversation
   when none is found. An explicit missing/unusable conversation or invalid
   checkout fails clearly. Explicit removal delegates to Herdr and retains saved
   conversations and launch records.
8. Host Git is not a universal launch prerequisite: non-Git directories may launch
   without it only after a successful marker-free ancestor scan. Git-marked or
   uninspectable selections fail clearly without Git, with or without Herdr and
   on restore. Host preparation remains simple Bash/Git or uses the agreed,
   explicitly reported host-Node fallback; neither path requires host Python.

## Recommended delivery order

Implement and validate existing-worktree mounting and restore first (Phases
1–3), using manual Herdr launches as an integration milestone. Then implement
skill-driven lifecycle orchestration (Phase 4). This ordering is an engineering
sequence, not a reduction in scope: create/open/start/resume/remove automation
is required to complete the plan, and manual commands are only a fallback.
Phase 5 tests and documentation accompany each increment rather than waiting
until the end. Subdirectory semantics, exact-directory history scope, shared Git
permissions, reserved-path policy, optional host Git, and the Bash-first/Node-
fallback approach are settled above. Phase 1 has delivered the verified Herdr
contract and host-tested standalone mount contract. Phase 2 has adopted them in
production code and passed the reviewed 23-check production Compose host run.
Do not confuse this Node-entrypoint mount evidence with live Pi readiness,
conversations, Herdr socket integration, restore or rewind; those host-only gates
remain explicit.
