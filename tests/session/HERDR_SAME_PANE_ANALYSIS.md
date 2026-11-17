# Phase 3: same-pane lifecycle analysis (Herdr 0.9.5)

## Reviewed full native gate: ordinary and linked reopen PASS

Follow-up run `0rXTuSjw` passes the full four-launch native managed-path reopen
workflow with verified shell returns. Ordinary/linked IDs, paths, history, cwd,
v3 records, official checkpoints and all visual confirmations agree. The copy
includes the final marker and completed assessment; all five steps exit 0 and
all prelaunch/assessment snapshots show cleared prior identity. No exception or
production lifecycle workaround is needed. See
`../host/native-boundary-restore-report-pi-1.5.2.txt` for the integrity and raw
review. Automatic server-restart restore and remaining Phase 3 gates stay open.
No live API request, host rerun or cleanup was made during this review.

## Earlier preparation: full native harness adaptation

At the user's request, `verify-native-restore.sh --run --prepare-native-boundary
--confirm-disposable-session` now prepares independent ordinary/linked seed and
native-reopen commands with shell-return markers. The subsequent host result is
recorded above.
`native-boundary.sh` preserves strict capture and official-reference consumption,
requires empty official prelaunch state rather than clearing it, and saves
per-step process/context/input/container evidence. See `README.md` for exact
host instructions. No production lifecycle remedy was introduced.
Local suites: 40 pass, 1 skip (test-only jq absent); PTY/transport guard tests use
inert substitutes and are not Docker/Herdr integration proof.

## Reviewed host follow-up: shell boundaries clear A and accept B

The user supplied run `Z8likvIQ`; review confirms distinct A/B foreground jobs
with returns to the same interactive shell. The **pre-B official snapshot has
no agents and no session reference**. B's checkpoint then reports its own exact
path, with both histories and visual confirmations correct. Integrity hashes,
storage/v3 records and saved empty container queries verify. See
`../host/shell-boundary-handover-report-pi-1.5.2.txt` for the durable review.

This supports a driver-boundary explanation of the earlier finding, not a
production lifecycle reset/patch. The old run's PGIDs and exact internal server
branch/timing remain unknown. No linked layout, native reopen or automatic
server restart was tested. Next recommended work is a reviewed adaptation of
the native harness to explicit shell boundaries. No production change or live
request was made during evidence review. The analysis below records the source
reasoning and pre-run decision, rather than claiming it alone proved host cause.

## Status at initial source investigation

The saved ordinary A→B finding is real: Herdr still publishes A while Pi B has
its own correct persisted history. It does **not yet establish a production
launcher defect**. Source review identifies a plausible driver-specific cause:
one foreground job spans both conversations and all intervening driver prompts.
No live Herdr requests, production changes, resets, upgrades or host reruns were
made for this analysis. Phase 3 remains open.

Evidence remains `../host/ordinary-handover-stale-reference-pi-1.5.2.txt` and its
raw copied run `../host/pi-docker-native.7LIAX9Ww/`. The original result remains
FAIL/INTERRUPTED, with B visual confirmation **no**, not a native restore pass.

## Pinned sources

Herdr tag `v0.9.5`, resolved Git tree identifier
`2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01` (GitHub recursive tree response).
All Herdr links below use that tag, not the moving default branch.

The official reporter at
[`src/integration/assets/pi/herdr-agent-state.ts`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/integration/assets/pi/herdr-agent-state.ts)
has SHA256
`2c5272d732b475bbf91a027203b1f98d25fe43d2c1402530a442b288aeaca1e4`.
This equals the copied reporter in the focused host evidence. Its integration
version is 9. Downloaded source under `/tmp/pi-herdr-phase3-source/` is disposable;
this report and upstream links are the durable inputs.

### 1. Official reporter: startup is not a replacement event

Reporter lines 114–147 send `pane.report_agent_session` and `pane.report_agent`
with the actual session path (ID only as a fallback), source `herdr:pi`, and a
monotonically increasing sequence seeded from the clock.

Lines 227–260 register `session_start`, `agent_start`, and `agent_settled`:

- On TUI `session_start`, forward `event.reason` and publish current state.
- On `agent_start`, report the session again **without a replacement reason**.
- On settled, report idle. There is **no shutdown/release handler**.

The installed Pi 1.5.2 `dist/core/agent-session.js` defaults its initial event to
`{ type: "session_start", reason: "startup" }` (line 226).
`dist/core/agent-session-runtime.js` supplies `new`, `resume`, and `fork` for
in-process runtime transitions. Do not relabel a new process startup as an
in-process `/new` or `/resume` to bypass authority checks.

### 2. Herdr intentionally protects an existing live Pi authority

[`src/detect/mod.rs` lines 330–340](https://github.com/herdrdev/herdr/blob/v0.9.5/src/detect/mod.rs#L330-L340)
classifies `herdr:pi` as a full-lifecycle integration.

[`src/terminal/state.rs`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/terminal/state.rs):

- Lines 1385–1417 allow same-owner Pi replacement for `new`, `resume`, `fork`,
  **not** `startup`.
- Lines 1629–1646 reject replacement of a live same-owner full-lifecycle hook
  session unless that replacement is permitted. This applies to **path** refs.
  The earlier `conflicting_same_owner_session_ref` helper at lines 1337–1363
  checks **ID** refs only; it is not itself the managed-path rejection branch.
- Lines 940–1062 gate state reports on process/session anchoring. A different
  path does not simply adopt the old live authority; reports can be buffered.
  Lines 1106–1126 also reject a differing live full-lifecycle session.
- The upstream test `pi_non_replacement_reports_preserve_full_lifecycle_authority`
  (lines 3048–3095) explicitly asserts that another path with reason `startup`
  and its following working report leave the old idle path intact.
- `pi_startup_adopts_persisted_session_without_live_authority` (3015–3045)
  shows that **persisted metadata alone is not the same conflict**.

These are source-reviewed upstream tests, **not tests run here**; Rust/Cargo are
not installed. The static branches explain the observed old-path/idle result
if A's live authority was never cleared, but saved snapshots do not expose the
server's exact internal branch or process tracker.

The official reporter also cannot detect semantic rejection: it treats receipt
of any socket data as delivery. In
[`src/app/api/panes.rs` lines 1599–1681](https://github.com/herdrdev/herdr/blob/v0.9.5/src/app/api/panes.rs#L1599-L1681),
a report with no `resume_argv` can return success even when the session did not
become current. A successful socket write/response is not readiness evidence.

### 3. Docker wrapper identity is supported, not inherently invisible

The actual `bin/pi` exports `HERDR_AGENT=pi` for Herdr launches, then execs
`env ... docker compose ... run`. The marker is limited to that wrapper and its
children; it is not an instruction to mark the surrounding shell or driver.

[`src/pane.rs` lines 805–923](https://github.com/herdrdev/herdr/blob/v0.9.5/src/pane.rs#L805-L923)
reads process hints from foreground-job members, including nonleaders, before
falling back to process-name detection.
[`src/platform/linux.rs` at `process_agent_hint`](https://github.com/herdrdev/herdr/blob/v0.9.5/src/platform/linux.rs#L786)
reads `/proc/<pid>/environ`; `src/platform/mod.rs` parses `HERDR_AGENT`.

Thus "Docker masks Pi, therefore Herdr cannot observe the wrapper" is too broad.
The hinted host wrapper can supply process identity. Whether/when that identity
was actually observed in the saved host run is not recorded.

### 4. New candidate mechanism: the driver preserves one foreground group

[`src/pane.rs` lines 645–702](https://github.com/herdrdev/herdr/blob/v0.9.5/src/pane.rs#L645-L702):
`should_skip_process_probe_for_lifecycle_authority` returns true when lifecycle
authority is active, a foreground PGID exists, a probe has occurred, the PGID is
unchanged, and neither pending shell-clear nor suppression overrides it.
Routine elapsed time does **not** override this predicate.

The Linux runtime loop at lines 2940–3060 still observes the foreground PGID,
but runs the expensive process probe through this predicate. Without a new
foreground group, it can retain A's authority while a child process exits and
another child starts inside the same job.

Both `run_case` and `run_focused_handover` in `verify-native-restore.sh` invoke
the launcher synchronously from noninteractive Bash, without job control. The
driver stays alive and foreground while the user answers its prompts. Child
launcher A, driver prompts, and child launcher B normally share one PGID.
There is no return to the **pane's interactive shell** between them.

An additional fallback does not solve this:
`TerminalState::self_reported_agent_active` (state.rs 1877–1883) applies only to
agent labels that Herdr **cannot parse**. `pi` is a known label, so the custom/
unknown-agent shell-return mechanism is not a general cleanup path for Pi.

This means the original focused test isolated worktrees, **but did not isolate
the long-lived driver's foreground job from ordinary shell→launcher→shell use**.
No waiting-only retry can be assumed to cure an unchanged-group probe skip.

## Offline check added here

`test-driver-process-groups.mjs` uses util-linux `script` to create a fresh local
PTY and an interactive Bash parent, then a non-job-control Bash driver with
three sequential child probes (`a`, `between`, `b`). Linux `/proc/self/stat`
confirms distinct child PIDs, the same parent, one unchanged process group, and
that group owning the controlling terminal throughout.

This test has no Docker, Herdr, socket, network, credentials or Pi launches. It
proves the local Bash/PTY property, **not** historical host PGIDs, server state,
report delivery or production recovery. It removes only its own temporary tree.

```bash
node --test tests/session/test-driver-process-groups.mjs \
  tests/session/test-native-checkpoint.mjs \
  tests/session/test-session-handover.mjs
```

Result: **25 passed, 0 failed, 0 skipped** in this container.

## Approved next experiment: prepared, not host-run

After reviewing this analysis, the user explicitly selected preparation of the
shell-boundary diagnostic. `verify-native-restore.sh --run
--prepare-shell-boundary --confirm-disposable-session` now prepares independent
top-level commands and built-in interactive-shell markers. See the beginning of
`README.md` for exact disposable-session setup and the file-based workflow.
`../host/shell-boundary-handover.sh` holds the test-only functions. The existing
single-driver mode remains available and its original evidence is unchanged.
Shared assessment logic was extracted without weakening its assertions.

All four local Node suites now total **32 passing tests**, including generated
step execution under a local PTY with inert stubs. No Docker/Herdr/Pi calls occur
in those new tests. Preparation and actual host runtime remain unverified here.
No host rerun is claimed or requested against an existing working session.

The experiment follows this recommendation: before changing production, prepare
a **different, consented host diagnostic**
that records process-group transitions and distinguishes:

1. The existing single-driver foreground job.
2. Actual top-level interactive shell launches with a verified shell return
   between A and B, in the same pane and exact storage.

Record safe process identities/PGIDs and whether the wrapper marker is present,
not full environments or arbitrary command arguments. Preserve strict official
reference checks and separately record local history. If the existing driver is
instrumented, use fixture-only read-only observations and no lifecycle resets.
Changing test job control/shell boundaries is an explicit experimental variable,
not a silent correction or evidence that the earlier failure did not occur.

A real host test still requires a genuinely NEW disposable Herdr session and the
existing consent/context guards. Preparation is not permission to control an
existing session. Do not automatically rerun the old test or change topology,
patch the reporter, release authority, replay another event reason, restart or
upgrade Herdr, or weaken the exact-reference assertion.

If top-level shell launches clear A and accept B, revise the host harness to
respect the required shell/job boundary after explicit review. If they do not,
use the PGID/process evidence for a focused upstream report and only then select
a production lifecycle remedy. No production remedy is chosen by this report.
