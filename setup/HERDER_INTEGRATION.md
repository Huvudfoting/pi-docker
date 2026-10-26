# Herdr integration

Run Docker-Pi inside Herdr with agent status reporting, conversation restore,
and upstream CLI/skill support for pane-to-pane communication.
For general installation and usage, see [SETUP.md](SETUP.md) and
[README.md](README.md).

## Scope and installation

Supported with **local Linux Docker Engine and trusted containers**. The mounted
Herdr socket grants control of the **entire connected session**, including other
panes; the pane ID is not an access restriction. Docker Desktop, remote Docker,
and Windows are not supported.

Install Herdr on the host, put this deployment's [Pi launcher on PATH](SETUP.md#3-install-the-host-launcher-symlink),
and ensure `flock` (util-linux) is available. Inside a Herdr pane, run:

```bash
pi /absolute/path/to/project --name backend
```

Eligible interactive launches automatically prepare the official Pi extension in
`data/config/extensions/` and the official operating skill in
`data/config/skills/herdr/SKILL.md`, then enable integration with a clear
socket-access notice. An integrated launch authorizes Herdr features, including
agent communication; no separate collaboration confirmation is required.

The image includes the official Linux Herdr CLI (amd64 or arm64) at the version
pinned in `setup/pi/build-pi-docker.sh`, alongside the Pi pin. Build with
`./setup/pi/build-pi-docker.sh` on the host; after changing pins, rebuild and
start new containers. The launcher does not install, upgrade, or enforce version
alignment with host Herdr. Potential host/server/container mismatches are accepted
in favor of upstream compatibility.

One preparation lock protects both shared resources. Extension updates follow
upstream integration status; the skill is generated with the selected host
binary's `herdr --skill` only when missing/empty or its `herdr --version` changes.
The adjacent `.herdr-version` records the installed skill version. Failed skill
generation preserves the previous copy and version. Pi discovers the shared
skill at `/pi/agent/skills/herdr/SKILL.md`; no project-trust change is needed.
Host and image versions may differ until the next rebuild; this slice relies on
upstream CLI/server compatibility, without a custom compatibility layer.

## Launch modes

Put the workspace first, then launcher options, before any Pi arguments.

| Mode | Behavior |
|---|---|
| Default (auto) | Enable in an interactive Herdr pane; warn and launch without integration if preparation fails |
| `--herdr` | Require integration; abort if context or preparation is invalid |
| `--no-herdr` | Skip integration preparation and socket exposure |

Integration requires terminal stdin/stdout, current Herdr pane context, and an
existing same-user Unix socket. Headless, maintenance, and incompatible session
options do not auto-enable it. Outside Herdr, launches remain ordinary Pi sessions.

To manage both upstream resources manually, run on the host from this repository root:

```bash
./setup/bin/herdr-extension install     # Install/update extension; ensure skill
./setup/bin/herdr-extension ensure      # Prepare both only when needed
./setup/bin/herdr-extension uninstall   # Remove managed extension and skill
```

The helper uses the host Herdr executable and targets this deployment's shared
configuration, not the host's default Pi configuration. Credentials, sessions,
and launch records are retained. Start a new container after changing the
extension; use `/reload` in active Pi sessions to refresh skill discovery.
Use `--no-herdr` to prevent reinstallation after removal. It also disables socket
exposure; a previously installed shared skill can remain discoverable but its
upstream context guard prevents operation outside Herdr.

## Agent communication with an existing peer

**Validated on the host (user-reported):** shared skill discovery, CLI access to
the connected session, peer prompt delivery/execution, bounded wait, and response
retrieval all passed. The smoke task was `Answer only ok`; Agent A retrieved
Agent B's `ok` response. This confirms existing-agent communication, not automatic
helper creation or every failure path.

For normal use, ask Pi to use the `docker-pi-herdr` skill to contact a specific
idle agent and collect its answer. Its deterministic Python `ask` workflow wraps
the official CLI with bounded waits/reads and staged receipts. The unchanged
official skill remains the general inspection/control manual. No new extension,
reporter, or confirmation is added.

### Historical direct-CLI smoke test

After rebuilding on the host, use a disposable named Herdr session with two
existing, idle Docker-Pi agents in separate panes. Do not create helpers or change
real work for this check. In Agent A's container, verify `herdr --version` and
`/skill:herdr` discovery, then use the official CLI directly with its inherited socket:

```bash
herdr agent list
# Set target to the actual helper pane ID or unique live name from that response.
herdr agent get "$target"
herdr agent prompt "$target" "Answer only ok" --wait --timeout 120000
herdr agent read "$target" --source recent-unwrapped --lines 40
```

Pass: Agent B executes a turn, responds `ok`, and Agent A retrieves that response.
Keep the target explicit and the wait/read bounded. A timeout does not prove the
prompt was not delivered: inspect before retrying. No wrapper, message bus,
review workflow, or helper creation is part of this slice. Follow the official
skill for normal CLI operation. Also smoke-test reporting, native restore,
ordinary launches, and `--no-herdr` after rebuilding; the successful `ok` exchange
does not establish those regressions passed. For the new supported workflow and
repeated acceptance, use the script below rather than reconstructing this recipe.

## Creating a sibling Docker-Pi helper

**Focused skill + script implemented; direct-script host steps 1–5 passed
(user-reported). Natural-language prompts passed with cloud `gpt-5.6-luna` and
local Qwen3.8 after eager loading; Qwen3.6 did not work. The user accepts this
model-specific result as success.**
Five happy-path receipts were reviewed; remaining script results are user-reported
without additional receipts. Running Python manually does not validate whether
the agent chooses and executes the workflow from a user request.
A helper is another ordinary Docker-Pi instance in a sibling Herdr pane, not a
Pi subagent extension or nested Docker launch. The Python adapter invokes only
the official CLI via argument arrays; it adds no lifecycle authority.

Integrated launches explicitly pass `--skill /opt/pi-docker/skills/docker-pi-herdr`
to Pi and also append the **same** skill file via
`--append-system-prompt /opt/pi-docker/skills/docker-pi-herdr/SKILL.md`, using the
existing read-only deployment mount. The full instructions are present from
startup, not just advertised for a model-selected read. This adds prompt tokens
but removes the discovery dependency; it does not guarantee model compliance.
Installed Pi documentation confirms repeatable append arguments and explicit
skills even with `--no-skills`, without granting project trust. Ordinary/opt-out/
fallback launches get neither this skill argument nor its eager prompt content. Shared
official skill preparation and reporting remain unchanged. No configuration copy
or additional dependency is required.

### Host workspace and prerequisites

New integrated containers receive `PI_DOCKER_HOST_WORKSPACE` from the launcher's
resolved `PI_WORKSPACE`. Native restore uses the recovered project root. The
variable is forwarded only by the Herdr Compose override; ordinary and
`--no-herdr` containers do not receive it. This adds no mounts or record access.
It is the **selected host project root**, not a translation of the agent's current
subdirectory. Never use container `$PWD` or `/workspace` as the host path, or test
that the host path exists inside the container. If the variable is missing,
start a fresh integrated container; do not guess a path.

Host `pi` must resolve to this deployment's `setup/bin/pi` launcher in newly
created shell panes, just as native restore requires. Check the launcher symlink
on the host and account for shell startup files changing PATH. `--kind pi` alone
cannot distinguish Docker-Pi from a host-native Pi installation. Verify this
prerequisite before startup; do not silently fall back to a different executable.

### Ask the agent in ordinary language

The intended interface is a request to the agent, not a Python command for the
user to execute. In a fresh integrated Docker-Pi caller, say for example:

- “Split right and start a Docker-Pi helper named reviewer.”
- “Ask reviewer to summarize the README and bring back its answer.”
- “Open a Docker-Pi helper below me, ask it to reply with hello, and show me the response.”

The agent should load `docker-pi-herdr`, run the script itself through its shell
tool, inspect the receipt, and report the name/pane, actual response and any
uncertainty. Combined requests mean start once, check success, then ask once using
the returned identity. The user need not mention Python or a skill command.
An unnamed helper gets a fresh name; unspecified direction uses caller geometry.
An ambiguous target/task needs clarification, not a guessed focused pane.

For a blank terminal split rather than a Docker-Pi helper, the unchanged official
Herdr skill applies. Clarify if “open/split a pane” does not establish which is
wanted; the Python adapter remains narrow start/ask, not a generic controller.

`/skill:docker-pi-herdr <request>` can force skill loading for diagnosis. It is a
fallback, not proof that normal natural-language routing works. A fresh integrated
launch receives the updated explicit skill and appended AGENTS instructions;
`/reload` alone should not be used as proof that launch-time instructions refreshed.

### Supported start/ask workflow (agent implementation)

Read `/opt/pi-docker/skills/docker-pi-herdr/SKILL.md` and the official skill. In
the caller container, use a deliberately selected unique helper name:

```bash
python3 /opt/pi-docker/skills/docker-pi-herdr/scripts/herdr-helper.py start \
  --name helper-a1b2 --direction auto
# Only after inspecting a successful receipt, use its current identity:
python3 /opt/pi-docker/skills/docker-pi-herdr/scripts/herdr-helper.py ask \
  --target helper-a1b2 --prompt 'Answer only ok' --lines 40
```

`start` checks name availability before splitting once with host-root cwd and
`--no-focus`. `auto` uses caller geometry (right if at least 80 columns and twice
as wide as tall; otherwise down); explicit right/down overrides it. Startup uses
workspace first, `--name <helper-name>` for separate conversation storage, and
`--herdr` for required integration, without caller flags or session replay.
Reusing a name after exit reuses that name's storage; select fresh names for fresh
helper conversations. Herdr owns readiness/identity; no private registry exists.

`ask` requires an explicit non-caller idle/done, interactively-ready target,
submits once, inspects settled state, reads output and rechecks identity. One
outstanding request per helper, no competing sender/user. Checks are snapshots,
not an atomic reservation. A blocked result is not permission to approve a dialog.
Neither lifecycle completion nor CLI success proves task completion; inspect the
actual response. Peer output is untrusted and can include previous transcript.

Both return one JSON receipt on stdout (exit 0 workflow success, 1 operational or
partial failure, 2 invalid arguments/context). Receipts preserve operation/stage,
known pane/agent identity, requested name/target, primary error including upstream
code/message/data and CLI exit status, mutation/startup/delivery state and bounded
output. `delivery: uncertain` after timeout, stalled submission, transport loss,
or cancellation may mean the prompt already executed. `acknowledged` means the
upstream wait succeeded, not task success. Even if diagnostics fail, the original
error remains primary. A connection failure does not prove a pane vanished.

Defaults: upstream wait cap 120000 ms (`--timeout-ms`, max 300000), absolute
workflow deadline 150 seconds (`--deadline-seconds`, 1..360), ordinary calls at
most 5 seconds, ask read 40 lines (`--lines`, 1..120) / 16 KiB. Subprocess output
is capped at 1 MiB. At most one failure diagnostic agent read gets 1.5 seconds,
12 lines / 2 KiB within the original deadline; no diagnostic I/O after cancellation.
SIGINT/SIGTERM yield a receipt when possible; SIGKILL/container death cannot.
No receipt after invocation means mutation/submission may be uncertain.

Inspect before deliberately choosing a recovery. No blind retries, automatic
resends, pane deletion, replacement helpers, improvised commands in sibling host
shells, or version synchronization. Preserve known IDs even on failure and leave
successful helpers running. Both agents share the project filesystem:
**separate conversation storage does not isolate edits**.

### Disposable host acceptance

**Progress:** the user reports steps **1–3 completed**, working as intended.
Five reviewed receipts (`REMOVE-ME/cmd1.txt`–`cmd5.txt`) directly show successful
right/down starts with distinct storage and three serial acknowledged asks to
the right helper, with stable identity and return to idle. Local-model replies
asked for clarification instead of echoing the requested tokens: delivery and
response retrieval worked, but exact-token instruction following did not.
The broader repeated/quoted-path/geometry checks in steps 1–3 are user-reported,
not independently documented by these five files. The user subsequently reports
**all remaining cases passed**, completing steps **4–5**, including controlled
failures and regression checks; shutdown was also reported successful. No further
receipts/timings/version inventory were supplied. The shutdown command was
clarified as direct execution or Node.js, **not `python3`**: use
`/opt/pi-docker/bin/stop-herdr` or `node /opt/pi-docker/bin/stop-herdr`, only when
intentionally stopping the entire connected session. No code change was needed.
See the communication plan for the durable evidence summary. The checklist below
is retained for future regression runs; passing it is not a universal reliability
guarantee.

The user subsequently clarified that these were direct Python invocations.
They validate the script, not natural-language agent routing. Subsequent cloud
and local-model results are recorded below; do not generalize cloud success to
other models. The eager-loading retest below passed with Qwen3.8, not Qwen3.6;
worktrees remain a separate follow-up.

No image rebuild is needed if the current image has Python 3 and Herdr CLI.
Use a **fresh integrated caller** to receive the metadata, explicit skill, and
updated instructions. Do not run these checks against real work. No single `ok`
exchange establishes dependability.

1. On a disposable host/project, verify the launcher symlink and new-shell PATH
   **before** starting helpers (`command -v pi`, resolve the symlink on the host).
   Record host CLI, container CLI, Pi and server versions as observations, not a
   synchronization gate. Start a uniquely named disposable session, e.g.
   `herdr --session docker-pi-acceptance`. Launch a caller using this deployment's
   `pi /absolute/disposable/project --name acceptance-caller --herdr`.
2. Confirm `/skill:docker-pi-herdr` discovery, unchanged official skill, and normal
   working/idle reports. Record caller identity and focused pane. In the caller
   container, run the following **one command at a time**, saving each stdout JSON
   and exit status in the disposable project. Replace names with fresh run-specific
   names (do not reuse these examples blindly):

   ```bash
   python3 /opt/pi-docker/skills/docker-pi-herdr/scripts/herdr-helper.py start --name trial-r-001 --direction right
   python3 /opt/pi-docker/skills/docker-pi-herdr/scripts/herdr-helper.py ask --target trial-r-001 --prompt 'Answer only cycle-r-1'
   python3 /opt/pi-docker/skills/docker-pi-herdr/scripts/herdr-helper.py ask --target trial-r-001 --prompt 'Answer only cycle-r-2'
   python3 /opt/pi-docker/skills/docker-pi-herdr/scripts/herdr-helper.py ask --target trial-r-001 --prompt 'Answer only cycle-r-3'
   python3 /opt/pi-docker/skills/docker-pi-herdr/scripts/herdr-helper.py start --name trial-d-001 --direction down
   python3 /opt/pi-docker/skills/docker-pi-herdr/scripts/herdr-helper.py ask --target trial-d-001 --prompt 'Answer only cycle-d-1'
   ```

   Repeat two more asks to the down helper with distinct response tokens. Stop
   this sequence on **any** failure; do not retry or continue creating helpers.
   Inspect each receipt and actual response, not merely exit 0 or an old `ok`.
   Confirm exactly one split/start per successful start, stable current identities,
   distinct storage, same selected project, no focus theft, no unrelated changes,
   and no automatic closing. Inspect Docker identity on the host, not by injecting
   a verification command into the sibling shell.
3. Repeat step 2 from a fresh caller launched in a second disposable project whose
   absolute path contains spaces, a single quote and double quotes. Include an
   `auto` start in a wide and a narrow/tall caller to check geometry. Record exact
   paths/directions/receipts. Keep pane count manageable by explicit **human**
   cleanup between batches, after retaining IDs/evidence; the adapter must never
   clean up. Minimum baseline: four starts and twelve serial asks across the two
   roots, both explicit directions, plus the auto geometry observations.
4. Controlled failures, one at a time (retain primary receipts and inspect before
   any new attempt):
   - Start with an already-live name: `duplicate_name`, no split. Invalid name,
     missing host metadata, missing/invalid socket context: fail before CLI mutation.
     For local guards only, unset metadata on **one script invocation**; do not
     manufacture an alternate pane/session context or alter the caller globally.
   - Ask an actual busy or blocked helper: `target_not_ready`, no prompt. To test
     busy safely, have the human initiate a bounded slow task, observe `working`,
     then ask; do not race two script senders. Never approve a dialog automatically.
   - Ask an idle helper with `--timeout-ms 1`: whether rejection, completion, or
     timeout occurs, receipt must match the observed result. On timeout/stall,
     delivery is uncertain; inspect state/output and count submissions, **no resend**.
     A fast exchange may win this race; it is not a timeout test unless observed.
   - During a slow start/wait in a test-only shell, send SIGINT/SIGTERM to the
     **local script PID**, not Herdr/Pi. Expect bounded cancellation, retained
     pane/agent identity if already known, and no diagnostics/resend/cleanup.
     Check whether startup or delivery happened despite loss of acknowledgement.
   - In a separate disposable deployment, deliberately make Docker startup fail
     (e.g. unavailable test image/daemon). Expect the created pane ID plus startup
     failure/uncertainty, not a replacement pane. Restore the prerequisite manually.
     Use offline fake-CLI tests for deterministic malformed responses, read failure,
     transport-loss-after-submission, and diagnostic failure; do not corrupt a live
     socket or kill the server merely to force those cases.
5. Recheck ordinary and `--no-herdr` launches (no explicit Docker skill/context),
   automatic-preparation failure fallback, and native restore into the same project,
   storage and conversation with the new skill present. Check working/idle reporting
   during repeated asks and restored conversations. Shutdown acceptance remains a
   separate explicit whole-disposable-session operation; never infer it passed here.

Record counts, timings, receipts, observed response tokens, focus/storage checks,
and controlled-failure outcomes. Success means bounded, predictable, recoverable
behavior over repetition—not absence of possible server/process failure. Report
untested cases explicitly. Local tests do not establish real Compose interpolation,
new-shell PATH, terminal readiness/focus, or live reporting/restore. See
[the implementation handoff](../AGENT_COMMUNICATION_PLAN.md) for progress.

### Agent-facing acceptance (accepted with cloud model and Qwen3.8)

**Observed progress (user-reported):** cloud `gpt-5.6-luna` panes successfully
completed all supplied natural-language prompts. The second request asked for
clarification about the helper name (“reviwer” in the report); no transcript was
supplied to establish whether the name was misspelled or prior context was lost.
An unresolved target should be clarified, not guessed. An exact name from a prior
successful start receipt should be reused and resolved live, not reintroduced.

A weaker local model searched tools/extensions and failed to discover the skill.
The user reports that stronger routing wording still fails, while explicit
`/skill:docker-pi-herdr` **works**. This isolates automatic discovery from execution
of the loaded skill; it is distinct from script or transport failure.

Integrated launches now eagerly append the full existing skill file into the
system prompt, while retaining skill advertisement/slash invocation. This avoids
requiring the local model to discover/read it. **The user reports this version
worked with Qwen3.8 but not Qwen3.6, and accepts that as success.** No additional
traces, receipts or model settings were supplied for that retest; names are
recorded as reported. Qwen3.6 is a known non-working model for this tested
natural-language workflow, not a reason to add retries or a new runtime.

For future regression/model checks, start a fresh integrated caller and repeat
the ordinary-language prompts without a slash command. No image rebuild is needed
if the current image already provides Python/Herdr; `/reload` does not apply a
new launcher argument to an existing process. Capture tool calls/receipts rather
than assuming that loaded instructions guarantee execution. No tool/extension,
new permission or shared-configuration change is added.
The cloud report establishes the supplied prompts, not every case in the broader
checklist below; retain model-specific traces for cases actually exercised.

Use a fresh integrated agent in a disposable session. **Type natural-language
requests into Pi**, not Python into a shell. Do not force the skill by name on
the initial run; we need to test ordinary-language routing/execution with eagerly
loaded instructions, not merely forced-skill execution. Choose fresh helper names.

1. Ask: “Split right and start a Docker-Pi helper named reviewer-a.” Inspect the
   agent tool trace: it should invoke the script's `start` once using the eagerly
   loaded instructions (no extra skill read required), not just print commands
   or rebuild the split/start recipe itself.
   Confirm the receipt, helper identity, focus preservation and correct project.
2. Ask: “Ask reviewer-a to reply with hello and show me its response.” The agent
   should run `ask` once, retrieve and interpret output, and report the actual
   answer—even if the local model misunderstands the task. Repeat with distinct
   short messages at least three times, one outstanding request at a time.
3. Ask: “Open a Docker-Pi helper below me, ask it to reply with hello, and show me
   the response.” Confirm one `start --direction down`, success inspection, then
   one `ask` against its returned identity. Repeat with a fresh unnamed helper
   and omitted direction to test name selection and `auto`. No separate split
   before `start`, and no caller-session replay or improvised sibling-shell checks.
4. Ask to start using a currently live helper's name. Confirm the agent reports
   `duplicate_name` without creating a replacement or retrying. Ask a busy helper
   while a human-started bounded task is running; confirm readiness rejection,
   no prompt and no automatic resend. Repeat a previously tested controlled
   timeout/cancellation through the agent and confirm it explains uncertainty
   without treating it as permission to resend or clean up.
5. Check clarification behavior: “Call a pane” without identifying a target/task
   must not submit guessed input. A clear blank-shell request should use the
   official skill, not start a Docker-Pi helper. Generic pane control remains
   outside this script's contract.

Save the user requests, skill-loading/tool trace, script receipts and final agent
summaries. Distinguish model routing failures, script errors and peer answer
quality. If automatic routing fails, test `/skill:docker-pi-herdr` separately to
locate the problem; that forced run does not pass automatic routing. Do not claim
model-independent reliability from discovery metadata or one successful exchange.
No live-pane execution of this new acceptance has been performed by the coding
agent during implementation.

## Sessions and restore

Use `--continue` or `--resume` to select an existing conversation at launch.
Pi's interactive `/new`, `/resume`, `/fork`, and `/clone` commands remain available.
Herdr mode requires persistent sessions and normal extension discovery; custom
CLI session/fork paths, session-directory overrides, and ephemeral sessions
are not supported.

Herdr restores the original workspace, storage selection, and conversation—not
all original CLI flags. The host `pi` on `PATH` must remain this launcher.
Back up `data/herdr-launches/` alongside `data/sessions/`: restore needs both.
Inside the container, Herdr sessions live under `/pi/herdr-sessions/<key>`.
Missing records, workspaces, or session files abort restore rather than create
a replacement conversation. Restore never falls back to an ordinary launch.

## Diagnostics

Run on the host with the same workspace and storage name used to launch:

```bash
pi /absolute/path/to/project --name backend --herdr-status
```

This checks local paths, extension and launch-record presence, pane/socket
context, and the launcher on `PATH`. It changes nothing, reads no credentials
or conversation contents, and invokes neither Docker nor Herdr. Exit codes are
`0` for prerequisites present, `1` for missing prerequisites, and `2` for invalid
arguments. A missing launch record is normal before the first integrated launch.

A successful check does not prove live connectivity, version compatibility, or
restore readiness. Output includes local paths and the pane ID; review before
sharing. If the host socket is replaced, start a new container rather than rely
on the existing mount reconnecting.

## Exit, detach, or stop

- **Exit only Pi:** `/exit`.
- **Detach while keeping agents running:** Herdr's default **Ctrl+B, then Q**.
- **Stop the entire connected Herdr session, including all panes and processes:**
  enter this in Pi:

  ```text
  !/opt/pi-docker/bin/stop-herdr
  ```

In Pi's shell tool or a container shell, omit the leading `!`. Shutdown requires
an integrated launch and its mounted socket, and runs **immediately without a
confirmation prompt**. The container may terminate before acknowledgement;
check Herdr before retrying an ambiguous result. The helper never retries
automatically. Use `--help` to inspect usage without contacting Herdr.
