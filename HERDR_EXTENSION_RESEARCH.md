# Pi–Herdr extension research and handoff

**Decision unchanged: focused Docker-Pi skill + Python script, now implemented
and offline-tested as recorded in [AGENT_COMMUNICATION_PLAN.md](AGENT_COMMUNICATION_PLAN.md).
Direct-script host steps 1–5 passed (user-reported), including controlled
failures and regressions. Natural-language agent-operated acceptance is still
model-dependent: cloud `gpt-5.6-luna` passed the supplied prompts (user-reported),
and eager loading now works with Qwen3.8 but not Qwen3.6 (user-reported and
accepted as success). This review remains research
only: no candidate installed, loaded, executed, or adopted.**

## Discovery and ranking method

Searched npm (`herdr`, expanded registry search) and GitHub for Pi/Herdr control
and delegation projects, plus varied web queries. Many more than one alternative
exist. Excluded mobile clients, review viewers, title/status-only integrations,
and generic Herdr plugins from the main comparison.

Popularity below is an observed GitHub star snapshot, not a quality or reliability
score. The first entry is a **monorepo total**, not package-specific popularity.
The list is a ranked shortlist of discovered relevant projects, not a claim to
exhaustively rank every Pi package. npm's `last-month` downloads endpoint returned
2026-06-02 through 2026-07-01, older than many candidate releases, so its zeros
were not used to rank adoption. Search-result order was not treated as popularity.

## Ranked shortlist

| Order | Candidate | Observed stars | Scope / inspection depth |
|---|---|---:|---|
| 1* | [`@ogulcancelik/pi-herdr` 0.4.1](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-herdr) | 564* | Generic layout/pane/agent tools; published README and relevant published implementation reviewed, current repository tests inspected |
| 2 | [`pi-herdsman` 0.33.1](https://github.com/boadij/pi-herdsman) | 209 | Full delegation/fleet/ownership runtime; architecture and container-deployment docs screened |
| 3 | [`pi-subagents`](https://github.com/edxeth/pi-subagents) | 133 | Multi-multiplexer framework including Herdr; README architecture screened; repository package version 2.9.2 |
| 4 | [`@joelhooks/pi-bellwether`](https://github.com/joelhooks/pi-bellwether) | 88 | Generic runtime control plus watch/mail integration; README screened; repository package version 1.5.0 |
| 5 | [`pi-cowboy`](https://github.com/electric-dragon-80000v/pi-cowboy) | 61 | Worktree-based multi-agent orchestrator; README architecture screened |
| 6 | [`pi-herdr-agents` 3.3.1](https://github.com/giuseppecrj/pi-herdr-agents) | 60 | Asynchronous child supervision, results, persistent specialists, worktrees; README architecture screened |
| 7 | [`modem-dev/pi-herdr-subagents`](https://github.com/modem-dev/pi-herdr-subagents) | 45 | Herdr plugin argv launch and socket lifecycle events; README architecture screened; do not conflate with similarly named npm packages |
| 8 | [`@andrewjacop/pi-herdr` 0.6.0](https://github.com/AndrewJacop/pi-herdr) | 34 | CLI-backed visible-agent orchestration; README architecture screened |

*564 is the whole `ogulcancelik/pi-extensions` repository. The author labels this
particular extension experimental. Repository documentation may differ from a
published package; only the first entry's npm implementation was reviewed here.
No candidate received a live Docker-Pi acceptance test or a complete security audit.

## Findings, in the ranked order above

### 1. @ogulcancelik/pi-herdr: strongest narrow reference

Published version **0.4.1** separates three primitives into tools:
`herdr_layout`, `herdr_pane`, and `herdr_agent`. The agent tool directly invokes
upstream `agent start`, `prompt --wait`, `wait`, and `read` through argument arrays.
It passes `agentArgs` unchanged after `--`; startup timeout range is validated.
Layout defaults preserve focus and choose split direction from geometry. It does
not replace the official skill or reporting integration.

This is materially closer to our design than `@weshipwork/pi-herdr` 0.1.0.
Its current repository tests cover activation, primitive separation, geometry,
focus/cwd, pane waits, agent start/prompt/read, and refusing caller-pane close.
Those tests were inspected, not run; they are not proof of Docker-Pi compatibility.

Still not our complete adapter:

- Split/start/prompt/read remain separate model-selected operations, not one
  deterministic Docker-Pi workflow.
- No `PI_DOCKER_HOST_WORKSPACE` or explicit Docker-Pi storage/start policy.
  Layout can fall back to `process.cwd()`; that must not become host `/workspace`.
- Prompt/wait timeout may be omitted; no enforced bounded workflow default.
- No idle-only one-outstanding-request restriction for our supported exchange.
- Errors are thrown as ordinary strings rather than our proposed staged,
  structured partial-success/delivery-uncertainty receipt.

Learn: strict layout/pane/agent separation, upstream readiness/wait semantics,
argument arrays, geometry tests, and no extra lifecycle manager. Do not replace
our skill + script plan or add this as another active control surface yet.

### 2. pi-herdsman

A substantial ownership/supervision framework (Chief/Manager/Lead/Agent), durable
project coordination, and peer communication. Its container guide runs Herdr,
Pi, tools, and persistent home inside an SSH-accessible environment. That is a
different topology from our caller container controlling a host Herdr session.
The documentation does not establish support for our split host/container paths.

Learn: explicit ownership and authority, bounded delegation, durable work versus
session identity. Adopting the runtime is far beyond this slice. Source-level
startup/recovery review would be the next audit if investigating it further.

### 3. edxeth/pi-subagents

A broad named-agent framework supporting interactive mux children and headless
background children, async results, nested/parent communication, and optional
orchestrator tool restriction. Its scope changes more than terminal control.

Learn: invocation policy and the distinction between visible process placement
and synchronous/asynchronous execution. Not a drop-in Docker-Pi adapter; no
container-boundary behavior was established by this README screen.

### 4. pi-bellwether

Most useful reliability ideas in its documented error contract: preserve primary
error codes, stage and submission state, keep diagnostics small and untrusted,
do not replace the primary failure if diagnostics fail, preserve absolute
operation deadlines, and do not resend after uncertain submission.

However, it directly uses the socket API and adds watch actors, wake records,
and Rat King/Muster routing for Pi prompts. Its documented prompt behavior
changes the transport/workflow rather than simply wrapping upstream CLI prompts.
Do not adopt this dependency stack for the focused adapter. These findings are
README claims, not a source or runtime audit.

### 5. pi-cowboy

An orchestrator with isolated worktrees, multi-harness agents, queuing, merge and
cleanup operations. Useful later for studying explicit cleanup outcomes and
working-tree safety, not for the current narrow communication slice. No change
to our deferred worktree/cleanup scope is justified by its popularity.

### 6. pi-herdr-agents

Provides real asynchronous child supervision, bounded result delivery, persistent
specialists that accept one task at a time, and explicit distinctions between
interrupt, cancel, and stop. Documented ordinary children may be auto-closed after
result delivery; workspaces/tabs and retained session paths are part of its model.
That is more ownership and lifecycle machinery than we currently want.

Learn: busy-target rejection, one-request-at-a-time policy, and honest
`unconfirmed` outcomes when termination cannot be established. Do not copy its
automatic cleanup or filesystem/session assumptions into this slice.

### 7. modem-dev/pi-herdr-subagents

Interesting alternate reliability approach: a host Herdr plugin launches a fixed
argv dispatcher directly, avoiding typing into an initializing interactive shell;
socket events identify exited/closed children. This requires installing a host
plugin and host-readable launch scripts. A script created only in our container
would not automatically exist on the host. This is a different deployment and
lifecycle design, not a free improvement to our existing `agent start` workflow.

Learn: distinguish shell-readiness races from command-delivery uncertainty. Keep
this as a future alternative only if the upstream startup contract proves inadequate.

### 8. @andrewjacop/pi-herdr

Published metadata is **0.6.0**. Documentation describes CLI invocation with
`shell: false`, agent startup/result/message/resume tools, a runtime widget, and
explicit PATH-related startup failures. Linux is described as expected but not
verified; macOS/Windows are the stated tested platforms. It introduces fleet and
result-harvesting policy beyond the narrow adapter.

Learn: explicit launch-environment diagnostics. Do not copy documentation's
host-service stop/restart instructions into agent automation. Docker-Pi support
is unestablished; source review is needed before any adoption claim.

## Other confirmed candidates for a later pass

Names below were returned by npm metadata/search; they were not source-audited
or popularity-ranked in this pass:

- `@sfroment/pi-herdr` — typed official-CLI control surface.
- `@henryqw/pi-herdr` and `@henryqw/pi-herdr-tools` — client plus separate tools.
- `@piewf/herdr` — workflow-runtime integration.
- `@asermax/pi-herdr-subagents`, `@zzjcool/pi-herdr-subagents`,
  `@maxiaochao/pi-herdr-subagents`, `@itc-steve/pi-herdr` — delegation runtimes.
- `@yunosukeyoshino/pi-herdr` — role-based helpers.
- `pi-herdr-flock`, `pi-megagem` — skill-oriented coordination candidates.
- `@sting8k/pi-peer`, `pi-herdr-chat-relay` — communication-oriented candidates;
  assess whether they add a mailbox/protocol outside our accepted scope.
- `@evoclock/pi-agentic-driver` — advertised bounded communication/guarded lifecycle.

`@weshipwork/pi-herdr` 0.1.0 was previously reviewed separately; its findings
remain in the communication plan. Status/reporting-only integrations are not
replacements for helper creation and are deliberately excluded from adoption.

## Next-session handoff

The skill + script is now **implemented; direct-script host steps 1–5 passed
(user-reported); natural-language workflow accepted with cloud `gpt-5.6-luna`
and local Qwen3.8, but not working with Qwen3.6 (user-reported)**. Five
happy-path receipts were reviewed; remaining script results are user-reported
without additional receipts. Skill and AGENTS routing have been strengthened to
make the agent execute open/split-helper/ask/contact requests itself. Routing
wording alone failed locally, while forced skill invocation worked. The launcher
now appends the same skill file to the integrated system prompt, avoiding
model-selected discovery without adding a tool/extension. The user reports this
works with Qwen3.8, not Qwen3.6, and accepts the focused slice as successful.
Model labels are as supplied; this is not model-independent validation. No broader
runtime is justified, and worktrees remain a separate follow-up.
No dependency or configuration changes were made during the original research.
Implementation reconsulted the published 0.4.1 source/contract tests and Bellwether
failure/deadline/diagnostic contract; revision observations and offline results
are recorded in
[the implementation handoff](AGENT_COMMUNICATION_PLAN.md#implementation-validation-and-handoff).
The best narrow source reference is `@ogulcancelik/pi-herdr` 0.4.1; Bellwether's
documented partial-failure receipts are the best reliability-design reference
from this screen. Preserve the official CLI/skill/reporting and keep broader
fleet, mailbox, watch, worktree, cleanup, and server-management systems out.
