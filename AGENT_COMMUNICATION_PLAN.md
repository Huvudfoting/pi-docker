# Agent-to-agent communication through Herdr

**Status: existing-agent communication implemented and host acceptance passed
(user-reported). Sibling creation succeeded on retry (user-reported), but the
recipe alone was not dependable enough. Focused Docker-Pi skill + script now
implemented and offline-tested; direct-script host acceptance steps 1–5 passed
(user-reported, with five happy-path receipts reviewed). Agent-operated
natural-language prompts passed with cloud `gpt-5.6-luna` and, after eager
loading, local **Qwen3.8** (user-reported). **Qwen3.6 did not work**; the user
accepts this model-specific result as success for the focused slice. Shutdown invocation
clarified as direct execution or Node.js, not Python.**

This extends [PLAN.md](PLAN.md). Durable usage instructions live in
[the Herdr guide](setup/HERDER_INTEGRATION.md). Herdr Git worktree integration
remains a subsequent, separate step.

## Completed slice

Use Herdr's official CLI plus operating skill, not a Pi subagent extension,
message bus, replacement CLI, or second lifecycle reporter. A narrow
Docker-specific workflow adapter is now implemented below.

- `setup/pi/build-pi-docker.sh` pins Pi **1.4.0** and Herdr **0.9.5** and passes
  both versions into the Dockerfile. The official Linux CLI supports amd64 and
  arm64. The executable build script resolves its own directory as build context.
- Existing `setup/bin/herdr-extension` preparation ensures both upstream
  resources under one lock: the official Pi integration and the host binary's
  `herdr --skill` output.
- The skill lives in shared `data/config/skills/herdr/SKILL.md`, discovered at
  `/pi/agent/skills/herdr/SKILL.md`. Its adjacent `.herdr-version` marker avoids
  rewriting it unless the selected host Herdr version changes or the skill
  needs installation. Failed generation preserves the previous copy.
- An integrated launch authorizes Herdr features, including peer communication.
  `--no-herdr` still bypasses preparation and socket exposure.
- The upstream CLI uses the existing mounted `HERDR_SOCKET_PATH` directly.
  No extra mounts, host shell bridge, or Docker socket are needed.

### Settled version policy

Pins make the image version explicit; they do not synchronize it with host or
running-server versions. Potential mismatches are accepted in favor of upstream
compatibility. Do not add host-version environment forwarding, runtime mismatch
gates, automatic host updates/restarts, or another version-synchronization layer.
The shared skill marker tracks skill preparation only, not the running server or
an individual container's version.

### Validation completed

- **31 local tests pass:** launcher/preparation, skill version refresh and no-op,
  concurrent preparation, failure-safe skill publication, removal, disabled
  launches, build-wrapper pins/path quoting/argument forwarding/exit status,
  restore logic, and shutdown protocol fixtures.
- Shell syntax and diff whitespace checks passed.
- The official Linux Herdr 0.9.5 binary was smoke-tested for version and bundled
  skill output during implementation.
- **The user reported all live host acceptance criteria passed** after the build
  and fresh-container test: skill discovery, CLI access to the connected session,
  peer prompt delivery and execution, bounded wait, and response retrieval.
  Agent A asked an existing idle Agent B `Answer only ok`, and read back `ok`.

The initial live exchange did not establish helper creation. The subsequent
sibling test succeeded on retry, as recorded below. Neither test establishes
worktree support, exhaustive timeout/replacement/exit behavior, or every core regression.
It is not a review-workflow or file-isolation test. Exact host/server versions
and terminal logs were not recorded in this handoff; image pins are not evidence
of the running server version.

## Sibling Docker-Pi helper slice: recipe implemented, success reported on retry

A "helper" is another ordinary Docker-Pi instance in a sibling Herdr pane,
started by the calling agent instead of manually by the user. It is not an
in-process subagent, nested Docker container, or new messaging abstraction.

### Target acceptance

From an existing integrated Agent A:

1. Inspect current layout and create one sibling pane without stealing focus.
2. Start this deployment's Docker-Pi launcher in that pane, in the intended host
   project with explicit workspace/storage selection.
3. Resolve the newly started agent from current server responses.
4. Send `Answer only ok`, wait with a timeout, read `ok`, and report success.
5. Leave unrelated panes and the whole session untouched. Do not auto-close
   the helper as part of acceptance.

Keep this smoke task: no review instructions, editing workflow, new worktree,
workspace, or tab is required.

### Main implementation problem: host launch context

`herdr agent start` launches a process in the **host pane**, not in Agent A's
container. Container `$PWD` is typically `/workspace`; do not pass that blindly
as host `--cwd` or as the Docker-Pi workspace argument.

Implemented the narrow adaptation in `setup/pi/compose.herdr.yaml`:
`PI_DOCKER_HOST_WORKSPACE: "${PI_WORKSPACE:?}"`. The host launcher already exports
its resolved workspace; native restore recovers that value before launch. No
launcher changes, new mounts, files, or launch-record access were necessary. The
base service does not forward the variable, so ordinary/opt-out launches remain
unchanged. It is project-root metadata, not current-subdirectory translation.

The Docker-specific recipe lives in `setup/HERDER_INTEGRATION.md`, linked from
`setup/AGENTS.md`. It uses the host root for split cwd and the explicit first
launcher argument, a unique helper alias as `--name` for separate conversation
storage, and `--herdr` to require integration. It does not replay caller flags or
sessions. Host `pi` resolving to this deployment's launcher in new shell panes
remains an installation prerequisite and live acceptance check; no new host
execution bridge or executable-resolution enforcement was added.

### Use the upstream workflow

Recheck the installed CLI and bundled skill for syntax before implementation.
Never run bare `herdr` for discovery: it starts or attaches the TUI. Do not probe
mutating commands by omitting arguments.

- Inspect pane geometry; split right for a wide pane, down for a narrow/tall one.
- Use an explicit caller target or `--current`, a validated host cwd, and
  `--no-focus`. Capture `.result.pane.pane_id` from the creation response.
- Start only in an available shell pane. Use a unique live agent name.

```bash
herdr agent start <unique-name> --kind pi --pane <returned-pane-id> --timeout 120000 \
  -- "$PI_DOCKER_HOST_WORKSPACE" --name <unique-name> --herdr
herdr agent prompt <resolved-target> "Answer only ok" --wait --timeout 120000
herdr agent read <resolved-target> --source recent-unwrapped --lines 40
```

These are templates, not assumed existing identities. `--kind pi` selects host
`pi`; confirm it launches Docker-Pi, not a different host Pi installation.

### Tests and handoff checklist

- Local coverage added: Compose binding scoped to the Herdr override, resolved
  host root via a symlink and spaces/quotes, stale inherited metadata not used by
  the binding, distinct explicit helper storage, and restored root selection.
  Tests use fake Docker and assert the binding contract; they do not evaluate
  actual Compose interpolation or start a helper.
- The first attempt created a pane successfully, then added a host-shell
  verification command with `set -e` and an invalid path comparison. The pane
  subsequently disappeared. The likely cause was termination of its interactive
  shell; the captured result did not establish the exact exit cause.
- The user reported the retry worked perfectly after removing that added command.
  This demonstrates the upstream split/start/exchange can work, not that an
  agent-reconstructed recipe is reliable. The immediate next step is the
  deterministic adapter below, not worktrees.
- Inspect startup failures before retrying or creating another pane; the first
  operation may have partially succeeded. No automatic pane/session cleanup.
- Recheck reporting, native restore, and ordinary/`--no-herdr` launches when
  changing launcher behavior. Do not claim those passed from the `ok` test alone.
- Update this plan and durable instructions only with observed results.

The implementation is currently an uncommitted working-tree change set. Preserve
existing user changes, including the broader core plan. No further live session
control is implied by this documentation handoff.

## Focused skill + script: accepted with cloud model and Qwen3.8

The planning/research-only phase is complete. The narrow adapter is implemented;
one successful historical retry is still not a dependability claim. Worktree
integration remains a separate subsequent slice; this acceptance does not
establish worktree support.

### Structure and ownership

Implemented deployment-owned layout in the existing read-only mount:

```text
setup/skills/docker-pi-herdr/
  SKILL.md
  scripts/herdr-helper.py
```

- The skill owns routing, required inputs, interpretation, and deliberate recovery.
- The Python script owns validated argument arrays, sequencing, bounded waits and
  reads, and structured success/partial-failure results. Use the official CLI,
  not a raw socket client, background supervisor, or new message protocol.
- The official Herdr CLI/server retains agent identity and lifecycle authority.
- Keep the shared official `herdr` skill and reporting extension unchanged.
- Integrated launches explicitly load the Docker-specific skill with `--skill`
  from the read-only deployment mount, including native restore. Installed Pi
  `skills.md`, `cli.md`, `settings.md`, `packages.md`, `configuration.md` and
  `security.md` confirm this does not require project trust and survives
  `--no-skills`. Ordinary/opt-out/auto-fallback launches get no explicit skill.
  Shared configuration, official skill, and reporting integration are unchanged.

The Docker-specific skill and a short `AGENTS.md` routing rule direct
Docker-Pi sibling startup and the supported peer exchange through the script,
not a reconstructed command recipe. General inspection remains with the official
Herdr skill/CLI. The skills are complementary, not competing operating manuals.
No Pi extension/tool yet; a future thin tool must reuse this implementation if
actual invocation problems justify it.

### Minimal executable surface

- **start**: validate integrated context, host-root metadata, name and direction;
  check alias availability before mutation; split with explicit host cwd and
  `--no-focus`; retain the returned pane ID immediately; start through upstream
  `agent start` with exact workspace/`--name`/`--herdr` arguments and a bounded
  startup timeout; return current agent identity and pane ID.
- **ask**: resolve an explicit live target, require idle/readiness for this
  workflow, submit once with upstream `agent prompt --wait --timeout`, inspect
  settled state, and read bounded output through the agent surface. Return state
  and output, not a fabricated task-level completion guarantee.

Host `pi` resolving to Docker-Pi in new shell panes remains a prerequisite.
Do not infer deployment location from the project root or assume container
metadata exists in the host shell. Do not run improvised verification, `set -e`,
`exit`, or other command strings in the sibling's interactive shell. The script
must not use `pane run`/raw key injection for ordinary startup or peer prompts.

### Failure contract

Return structured outcomes with operation/stage, known pane and agent identities,
upstream error code/message, and delivery uncertainty where applicable. Preserve
upstream distinctions; connection errors are not evidence that a pane vanished.
Bound subprocess execution as well as upstream waits. Cancellation/transport loss
after mutation or submission may leave partial success: report uncertainty.

No blind retries, automatic resend, pane deletion, replacement helpers, automatic
approvals, or host/server upgrades. Preserve created IDs on subsequent failures.
A timed-out/stalled prompt may already have been delivered. A lifecycle wait is
not task-scoped RPC; the caller must interpret returned state and response.

### Dependability acceptance before moving on

- Local command-contract tests: exact arguments/order, paths with spaces/quotes,
  invalid context/inputs, duplicate names, malformed responses, split/start/read
  failures, busy targets, timeout/cancellation, and partial/uncertain outcomes.
- Assert no focus theft, raw shell submission, automatic close, or duplicate
  prompt delivery. Persist no private pane-alias/lifecycle database by default.
- Repeated disposable-host start/ask cycles, both directions and quoted project
  paths, plus controlled failure cases and reporting/restore/opt-out regressions.
- Define success as predictable, bounded, recoverable behavior, not a promise
  that server/process failures can never occur. Record observed test results.

### Implementation validation and handoff

- Added `setup/skills/docker-pi-herdr/SKILL.md` and standard-library-only
  `scripts/herdr-helper.py`; `setup/bin/pi` passes the explicit skill only when
  integration actually enabled. No new package, mount, extension, or reporter.
- The script invokes only official CLI argument arrays. Start validates local
  context/host-root/name/direction, checks live aliases, selects explicit or
  geometry-based direction, splits once without focus, captures the pane ID,
  starts Docker-Pi with exact workspace/storage/required-integration args, then
  resolves current identity/readiness. Ask resolves an explicit ready target,
  pins subsequent calls to its returned pane, submits once, inspects state,
  reads bounded plaintext agent output, and verifies identity again.
- A single monotonic deadline bounds the workflow, individual CLI processes,
  and best-effort diagnostics. Receipts retain primary upstream errors/data and
  CLI exit status, known and conflicting observed identities, mutation/startup/
  delivery state, and untrusted bounded evidence. Cancellation never triggers
  diagnostics. Local CLI termination is not remote cleanup/cancellation.
- Snapshot checks do not reserve aliases or lock a helper against other senders;
  the skill explicitly requires one outstanding request and no competing sender.
  Upstream lifecycle waits remain non-task-scoped. No proof of task completion
  or process-generation identity is manufactured.
- Reference consultation: published `@ogulcancelik/pi-herdr` **0.4.1** implementation
  and repository `index.test.ts` (HEAD observed
  `e34f816ec8234f9b012bf6e19f9b94c19d123d03`): primitive separation, geometry,
  CLI start/prompt/plaintext-read arrays, contract-test style. Bellwether README
  (HEAD observed `becba850b59105e1934f62dd61098d31cde70f13`): staged receipts,
  original errors, uncertainty, absolute deadlines, and bounded untrusted failure
  evidence that cannot replace the primary failure. Neither runtime was installed
  or adopted. Checked Herdr **v0.9.5** CLI help and agent/schema source for exact
  envelopes, `terminal_id`, readiness, startup wait and plaintext read contracts;
  no version-synchronization gate was added.
- Offline tests exercise the real script subprocess against a temporary fake CLI
  and Unix socket, never live panes: exact arrays/order/host paths with quotes,
  geometry/directions, local guards, duplicates, malformed responses/identities,
  missing CLI, split/start/prompt/read failures, busy/blocked/self targets,
  replacement, upstream codes, uncertainty, absolute/client/diagnostic deadlines,
  bounded output, SIGINT/SIGTERM, no resends or cleanup. Launcher tests assert
  integrated-only skill selection, including fallback/opt-out and native restore.
- **Validation:** **52 local tests passed** with
  `python3 -m unittest discover -s tests -p 'test_*.py'` (including 21 new adapter
  tests); `bash -n setup/bin/pi`, Python compilation, and `git diff --check`
  passed. The installed Pi skill loader discovered exactly one new skill with
  zero diagnostics, using only the deployment-owned skill directory (no model
  invocation or shared configuration access). No live Herdr pane was inspected
  or controlled during implementation. Existing user work was retained, not reset
  or staged by this implementation; the initial staged/planning baseline became
  commit `163a5a9` externally while implementation was in progress.
- **Host progress:** the user reports acceptance steps **1–3 completed**, with
  everything working as intended despite confused replies from simple local
  models. Reviewed `REMOVE-ME/cmd1.txt` through `cmd5.txt` without controlling
  live panes. The five receipts directly show:
  - `cmd1`: successful right start, `trial-r-001`, pane `w1:p2`, ready/idle,
    startup acknowledged and `focused: false`.
  - `cmd2`–`cmd4`: three successful serial asks to that helper; delivery
    acknowledged, stable pane/terminal/session identity, returned idle, and
    increasing completion sequences (6, 10, 12). Reads contain the successive
    prompts and model responses, not just an old response.
  - `cmd5`: successful down start, `trial-d-001`, pane `w1:p4`, ready/idle,
    startup acknowledged and `focused: false`. Its session storage differs
    from the right helper's; both starts select the same host project root.
  - The local model asked for clarification instead of echoing the exact tokens.
    This validates the observed delivery/turn/read workflow, **not** exact-token
    instruction following or task-level success. `task_completion: not_asserted`
    correctly distinguishes those contracts.
  - These five files do not independently document the full step-3 repeat count,
    quoted-root/auto-geometry checks, caller focus continuity, elapsed timings or
    deployed versions; completion of steps 1–3 beyond their contents is the
    user's report. Keep the evidence distinction rather than inventing results.
    Temporary receipt files are left untouched; this summary is durable.
- **Remaining host acceptance passed (user-reported):** the user subsequently
  reported that all remaining test cases passed, completing steps **4–5** of
  [the durable checklist](setup/HERDER_INTEGRATION.md#disposable-host-acceptance):
  controlled failures and reporting/restore/ordinary/opt-out regressions. Shutdown
  also passed per the report. An initial `python3 .../stop-herdr` reference was
  clarified as **direct execution or Node.js**; the repository helper is a Node.js
  script, so no interpreter/path fix is required. No additional failure receipts,
  timings or version inventory were supplied or independently reviewed. These
  results are user-reported, not new agent-controlled live tests.
- **Correction / next:** the user clarified that acceptance so far exercised
  Python calls, not asking the agent in natural language to open/split/contact
  helper panes. Direct-script success does **not** complete the agent-facing
  workflow. Do not move on to worktrees yet.
- Strengthened the skill's advertised description and `setup/AGENTS.md` routing
  for ordinary-language requests. The skill now explicitly tells the agent to
  execute start/ask itself, not hand Python commands back to the user. Added
  intent mappings for open/helper, split right/down, ask/contact/call, and combined
  start-then-ask; preserve receipt identity and stop on any partial failure.
  Blank-shell requests remain with the official skill; genuinely ambiguous intent
  requires clarification, not a new generic script operation.
- **Agent-facing result (user-reported):** panes using cloud model
  `gpt-5.6-luna` successfully completed all supplied natural-language prompts.
  The second request elicited clarification about the helper name (reported as
  “reviwer”). Without the transcript, do not assume whether this was a typo,
  lost prior context, or a genuinely ambiguous target. Clarification is safe
  when unresolved; an exact helper name from the prior successful receipt should
  not require reintroduction. No new tool traces or receipts were supplied.
- A weaker local model searched only tools/extensions and failed to find the
  skill. This is a **discovery/routing failure**, not evidence that the script
  or Herdr transport failed. AGENTS now explicitly says this capability lives
  in a skill/script, uses existing read/shell tools, and must be checked before
  declaring the capability unavailable. The skill reinforces receipt-based
  follow-up targeting without silent fuzzy matching. No extension/tool was added.
- **Discovery diagnosis (user-reported):** strengthened routing text still did
  not fix the local model, but explicit `/skill:docker-pi-herdr` **works**. The
  failing layer is automatic discovery, not ability to execute the loaded skill.
- **Loading change:** `setup/bin/pi` now also appends the existing deployment-owned
  `SKILL.md` through Pi's documented repeatable `--append-system-prompt` argument
  on integrated launches, including restore. `--skill` remains for advertisement
  and forced invocation. The full instructions are therefore present without
  requiring a model-selected read. This uses one source file, not another runtime,
  tool, extension, copied configuration or upstream-skill change. It intentionally
  trades additional system-prompt tokens for removal of the discovery dependency.
  Ordinary/opt-out/preparation-fallback launches receive no eager skill content.
- **Eager-loading host result (user-reported):** the latest ordinary-language
  workflow **worked with Qwen3.8, but not Qwen3.6**. Model labels are recorded as
  supplied; no additional model configuration, quantization, tool traces or
  receipts were provided for this retest. The user explicitly accepts this result
  as success. This closes the focused slice for the demonstrated models without
  claiming model-independent reliability or every agent-driven failure case.
- **Disposition:** retain eager loading and the existing narrow script; no further
  runtime change is needed. Qwen3.6 is a known non-working model for this tested
  natural-language workflow, not proof of a transport defect. Future model
  changes should recheck the retained acceptance checklist. Worktree integration
  is a separate possible follow-up, not implemented or implicitly authorized here.

### External package review

`@weshipwork/pi-herdr` **0.1.0** was inspected, not installed. It demonstrates a
small official-CLI client, argument arrays, structured tool results, cancellation,
focus-preserving splits, and bounded reads. It is not a drop-in adapter: no
Docker host-path/storage/start adaptation, no agent prompt/start operations,
raw pane command submission, pane-status polling, and some CLI syntax differs
from Herdr 0.9.5 (`wait output`, `pane read --raw`). Its visible repository test
coverage was metadata-only. It would not prevent the improvised verification
failure. Learn from its client/result structure; do not adopt it or switch the
skill + script plan on that basis.

Further research found multiple alternatives. See
[HERDR_EXTENSION_RESEARCH.md](HERDR_EXTENSION_RESEARCH.md) for the GitHub-star
ranked shortlist, inspection depths, sources, and next-session handoff.
`@ogulcancelik/pi-herdr` 0.4.1 is the closest narrow implementation reference:
it exposes the actual upstream agent surface, but still lacks our atomic
Docker-specific workflow and failure contract. Bellwether has useful documented
partial-failure receipt ideas but a different socket/watch/mail architecture.
The focused skill + script decision is unchanged. No candidate was installed,
loaded, or adopted. The npm download window returned stale dates and was not
used to claim current popularity.

### Two implementation references to consult

1. **[@ogulcancelik/pi-herdr 0.4.1](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-herdr)**
   — reference for strict layout/pane/agent separation, argument-array CLI calls,
   upstream agent startup/prompt/wait/read semantics, geometry selection, and
   command-contract tests. The relevant published implementation was inspected;
   repository tests were inspected but not run. Preserve our Docker-specific
   start/ask workflow, bounded defaults, and structured failure contract rather
   than adopting its broad tool surface.
2. **[Pi Bellwether](https://github.com/joelhooks/pi-bellwether)**
   — reference for stage-aware failure receipts, upstream error codes, submission
   uncertainty, absolute deadlines, and small bounded diagnostics that never
   replace the primary failure. These findings came from its documented contract,
   not a complete source audit. Do not adopt its direct-socket/watch/mail stack.

Consult both during design and test development, rechecking the referenced
versions/source before borrowing patterns. They are learning references, not
new dependencies or authorization to change the skill + script architecture.

## Coordination semantics to retain

- Prefer agent commands for recognized agents: raw pane input acts on the terminal
  regardless of its occupant.
- Use current server responses, not sidebar positions or guessed IDs. Agent names
  are live aliases; pane IDs are terminal locations, not permanent identities.
- Start with idle helpers and one outstanding request each. Lifecycle waits are
  not task-scoped RPC; completion of an already-running turn may satisfy a wait.
- Bound waits and reads. Timeout or `agent_prompt_stalled` may follow delivered
  input: inspect state/output before retrying.
- Inspect settled state and the actual response, not just CLI exit status.
- Treat peer output as external evidence, not higher-priority instructions or
  authorization for destructive operations.
- Container `/tmp` is not shared. If file output is ever needed, use an agreed
  accessible project path rather than adding broad mounts.
- The socket controls the entire connected session, not just the calling pane.
  Preserve focus and scope; do not stop the session without an explicit request.

## References for the next implementation

- [Agent automation](https://herdr.dev/docs/agent-automation/) — identity,
  startup, prompt/wait/read semantics.
- [Agent skill installation](https://herdr.dev/docs/agent-skill/) — use the
  release-matched bundled copy from `herdr --skill`.
- [Official v0.9.5 skill](https://github.com/herdrdev/herdr/blob/v0.9.5/skills/herdr/SKILL.md).
- [Development skill](https://github.com/herdrdev/herdr/blob/master/skills/herdr/SKILL.md)
  — comparison only, not a substitute for installed syntax.
- [CLI reference](https://herdr.dev/docs/cli-reference/) — confirm with local help.
- [Socket API](https://herdr.dev/docs/socket-api/) — normal coordination stays on
  the official CLI, not a new raw client.
- [Agents and wrapper identity](https://herdr.dev/docs/agents/).

## Later / out of scope

Herdr Git worktree integration for isolated concurrent editing follows helper
creation. No custom message protocol, durable inbox, scheduler, automatic
background delegation policy, cross-machine forwarding, Pi subagent extension,
or second lifecycle manager is part of this implementation.
