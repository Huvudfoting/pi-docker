# Disposable Herdr restart — host procedure for review

**Implementation complete; host execution NOT authorized by this document or by
“finish the work.” No live restart has been run.** Review a newly prepared plan
and obtain separate explicit approval before any command bearing
`--execute-reviewed-procedure`. This is a test-only harness, not a production
launcher, shutdown utility, or general session manager.

## Scope and hard stops

- Supported: normal-user interactive terminals on the original local Linux Docker
  Engine host; host Herdr **0.9.5**, existing selected base/custom image with Pi
  **1.5.2**, host Node, Bash, Git, Docker Compose, flock and ordinary core tools.
  No installs, builds, pulls, retags, global configuration edits or root/sudo.
- Two normal host terminals, **A** and **B**, initially outside Herdr. Never unset
  inherited context to pass a guard. Inside-pane helpers require genuine context.
- Exactly one new named disposable session, workspace, tab and pane per case.
  Never `default` or an existing working session. No helper/peer orchestration.
- **Ordinary first.** Any uncertainty/failure stops the procedure. Linked entry
  requires the original completed ordinary fixture, its final client receipt,
  strict publication ledger and public assessment; this cannot be bypassed by
  answering a question. Prepare/review/approve linked only after ordinary passes.
- No automatic retries, force-kill, socket/container deletion, metadata repair,
  history replacement, handoff, extra restored detach/reattach, manual restored
  `pi --session`, Continue/Fork recovery, or automatic cleanup. Preserve partial
  files and resources on STOP. A failed fixture is not reusable by this harness.
- Keep the reviewed files/configuration/tools/image selection unchanged between
  lifetimes. Do not concurrently edit shared configuration or this fixture.
  Live execution refuses a copied/rebased evidence directory.

The source/version observations and evidence trust limits are in
`HERDR_SERVER_RESTART_DESIGN.md` and `HERDR_SERVER_RESTART_EVIDENCE.md`. Saved
artifacts and human observations are trusted evidence, not adversarial attestation.

## 1. Prepare and review — NO live tools or server probes

From your actual deployment checkout on the host (not the container's `/workspace`):

```bash
node tests/host/prepare-server-restart.mjs --prepare --case ordinary
```

This creates a new mode-0700 fixture under the host temporary directory and prints
its actual absolute path. No Herdr/Docker/Pi/version/image query is executed.
Retain that path as **ROOT**, do not invent one or reuse a previous test root.
Read `ROOT/control/INSTRUCTIONS.txt`. Use its exact absolute Node/entry paths to
print the **offline** plan:

```text
<recorded-node> ROOT/control/server-restart-live.mjs --plan ROOT
```

Do not literally execute placeholders. The plan supplies shell-quoted actual
commands and records the exact session name, selection, expected container cwd,
private HOME/XDG config/state, Docker config *path only*, and input-manifest hash.
Review those paths, `ROOT/control/runbook.md`, frozen modules, configuration and
`inputs.sha256` with the user. Docker configuration contents/credentials are not
copied or mounted into Pi. The Pi config is fixture-only; network is disabled and
its provider returns exact local text without transport/model/tool requests.

**Approval checkpoint:** obtain explicit approval for this exact fixture/name,
private environment, read-only preflight, private official reporter installation,
first entry, separate exact named stop, fresh automatic entry, visual and exit
collection. Approval of code or offline preparation is not execution approval.
The flag is an operator acknowledgement, not a means to infer user consent.

## 2. Terminal A — first entry and separate foreground seed

After approval only, run the plan's `terminalA.seedEntry`. It requires the review
flag and typed exact session name plus a nonblank verification note. It performs
local version/image/empty-inventory preflight, records immutable host-tool
identities, installs the official reporter via the copied `bin/herdr-extension
install` into **only** `ROOT/data/config`, pins its bytes, and opens only the
private named Herdr session. No upstream substitute reporter is installed.
The first entry stays blocked while the UI is attached.

In its single shell pane:

1. Run the plan's `terminalA.paneSetup` (`cd` to the exact selection and source the
   frozen ready helper). This is not Pi or a waiting driver.
2. At a new prompt, run `restart_ready`. Its builtins capture the actual foreground
   shell stat before spawning Node. The controller verifies inherited context,
   ancestry, the same-user private socket and one empty selected shell. Only after
   the full public entry check does it arm the seed and reserve its checkpoint.
3. At another prompt, run the plan's **exact**
   `terminalA.seedLaunchSeparateForegroundJob`. Do not put it inside a script,
   command substitution, subshell, chained driver or waiting function. The
   transparent shim records argv/cwd/parent identity and execs the copied launcher.
4. In Pi enter the plan's three `terminalA.seedUi` lines separately:
   `/name Phase3 Restart ordinary`, the seed marker, then after its exact
   `offline-fixture:...` response and idle state, `/phase3-restart-checkpoint`.
   `/name` is a Pi UI command, not an extra seed launch argument.
5. **LEAVE PI RUNNING. Do not /quit.** Terminal B now collects while it is visible.

Do not detach before terminal B confirms the seed capture succeeded.

## 3. Terminal B — open seed, then separately approved stop

Terminal B stays outside Herdr and runs `terminalB.collectSeed`. It independently
validates the frozen inputs/reporter, host tools/daemon, live official snapshot,
actual recorded process ancestry, running labelled container, history and v3
record. Full pending validation precedes publication; the saved-directory gate
and publication proof must then pass.

After B reports seed capture succeeded, terminal A detaches with **Ctrl+B, then Q**
without quitting Pi. Wait for A's original host entry command to return success.
This archives its actual named client exit receipt; premature detach is a STOP,
not permission to reattach.

B now runs the plan's `terminalB.separatelyApprovedStop`. This is **not chained**
from collection. It rechecks the actual old server, official settled identity,
exact current history/record, sole running run/project container and image bytes,
then displays the exact private target and asks for the session name and note.
Only that confirmation permits **one** `herdr session stop <exact-name>` under
the fixture's private XDG environment. No broad/default/focused stop is available.

The controller saves the real bounded stop result, waits boundedly for the old
process lifetime and both private sockets to disappear, requires empty run and
project inventories, copies stopped persistence/history/record, validates the
proposed stop receipt, publishes it, runs public `validateStop`, then saves the
publication proof. It does **not** start another server. Timeout, nonzero result,
retained container, permissions error or missing evidence permanently blocks
further steps; no automatic retry/cleanup/repair is attempted.

## 4. Terminal A — fresh entry, AUTOMATIC Pi only

After successful stop and separate fresh-entry approval, run
`terminalA.restoredEntry` from the same ordinary host terminal. The controller
requires the public saved stop gate and strict ledger, fresh absence probes,
empty inventories, unchanged local daemon/tool/image identities, and a new typed
name/note. It then arms restored observation and opens the same private named
session once, with the same established environment.

**Herdr must automatically launch Pi. Do not type any Pi shell launch command.**
Wait for the original title and complete original conversation to appear. No old
pane exports are replayed; the configured private shell reestablishes PATH/HOME/
XDG for the new lifetime. A blocked UI, restore error, missing history, unexpected
startup or missing automatic Pi is a STOP. The operator observation window is
**60 seconds**; expiry means interrupt/report uncertainty, not reattach/retry.
An interactive attach has no automated kill timer; the operator owns this bound.

Send the plan's restored marker in Pi, wait for its exact local response and idle
state, then `/phase3-restart-checkpoint`. Do not `/name` again or alter history.
Keep this restored UI visible. Terminal B collects without another detach.

## 5. Terminal B — restored capture and visual confirmation

Run `terminalB.collectRestoredAndVisual`. Restored entry remains uncertain until
the automatic-launch/startup and continued-turn evidence is captured. The full
public entry gate then confirms it; the restored checkpoint is separately
reserved, pending-validated, published and saved-validated. Both lifetimes must
have the same official ref/ID/title/cwd/storage/v3 bytes, a retained seed byte
prefix, new server/shell/container identities and exact native restore argv.

Inspect terminal A and answer **yes** only if the full original history and one
new turn are visible and all no-manual-reopen/no-recovery/no-retry statements are
true. A nonblank factual observation is required. Anything else stops; do not
answer optimistically to proceed. After success B explicitly reserves finish.

## 6. Terminal A — /quit and IMMEDIATE builtin source marker

Only after B says finish is reserved, enter `/quit` in Pi. At the returned shell,
the **very first command** must be exactly the `source ROOT/control/finish.sh`
line shown in the plan (use its actual quoted path).

Do NOT `echo $?`, `cd`, source another helper, run a diagnostic, detach, or enter
any other command first. The finish file's first assignment captures the real
`$?`; a shell builtin reads `/proc/$$/stat` before any child changes the foreground
job. Node then binds it to the actual Bash parent, inherited restored pane and
server, requires exit 0, empty final inventories and the unchanged conversation/
record, then performs pending and ordinary full final assessment.

If the immediate status was lost, report INTERRUPTED. Do not synthesize it or
reuse a previous marker. On success retain `ROOT/logs/assessment.json`; no
Phase 3-wide completion or cleanup is asserted. A may now detach (Ctrl+B, Q);
wait for the original restored-entry host command to return successfully too.
The named empty-shell server/state is deliberately retained; stopping/deleting
it requires a separate explicit request and is not part of this procedure.

## 7. Linked case and final offline review

Review the ordinary assessment, publication ledger and final client return first.
Only then prepare a fresh linked fixture with `--case linked`, print its own
plan, substitute the **actual completed ordinary ROOT** in its seed command's
`--ordinary-evidence` argument, and obtain separate explicit execution approval.
Repeat the same two-terminal procedure once with that plan's linked cwd/title/
markers. No production worktree is used or removed; Git metadata is fixture-local.

After both completed clients return, the read-only pair assessor is:

```text
<recorded-node> <frozen-live-module> --assess-pair <ordinary-ROOT> <linked-ROOT>
```

It validates both public assessments, strict publication ledgers, final client
receipts, independent identities and the linked prerequisite binding. It can also
read retained copies; recorded selections/refs are never rewritten. The result
is `saved_restart_pair_evidence_validated`, with `liveStateInspected: false` and
`phase3Complete: false`. Host evidence still needs human review. Other Phase 3
image/failure/lifecycle gates and Phase 4 are not completed by this test.

## Local tests and evidence limits

`node --test tests/session/test-*.mjs` never executes this live host procedure.
The new integration tests use injected command/process/socket/TTY adapters only.
For full-input positive simulations, optionally supply
`PI_RESTART_TEST_REPORTER_SOURCE=/absolute/path/to/reviewed/upstream/src/integration/assets/pi/herdr-agent-state.ts`.
The file is read as data, must match the independently pinned SHA256, is never
executed or vendored, and is copied only into test-owned synthetic fixtures by an
inert installer stand-in. Without it those ten cases skip explicitly. Their
public saved-evidence success is **not** an official installer run, a real Herdr
restart, a live inherited-context assertion or a host execution approval.
