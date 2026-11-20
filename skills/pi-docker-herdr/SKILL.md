---
name: pi-docker-herdr
description: Start shared-checkout or Herdr worktree Pi Docker helpers, remove explicitly selected worktrees, or ask a ready peer. Adds host paths and bounded receipts to the official Herdr skill.
---

# Pi Docker helper adapter

Read `/usr/local/share/pi-skills/herdr/SKILL.md` for upstream operation/safety.
Use upstream for general inspection, blank terminals, and other agent kinds.
For Docker-Pi start/ask, run this adapter **inside the integrated container**:

```bash
node /opt/pi-docker/skills/pi-docker-herdr/scripts/herdr-helper.js start \
  --name reviewer --direction auto
node /opt/pi-docker/skills/pi-docker-herdr/scripts/herdr-helper.js ask \
  --target reviewer --prompt 'Summarize the README.'
```

`start` creates a focus-preserving sibling and starts Pi Docker. Honor a requested
`right`/`down`; otherwise use `auto`. Choose a fresh valid name if the user omitted
one. Inspect the start receipt before asking its returned agent; leave it running.

`ask` needs an explicit live name/pane ID or identity from a successful receipt.
Clarify ambiguity. It accepts only `idle`/`done`, `interactive_ready`, non-pending
peers, rejects the caller itself, and is not a queue. Keep one outstanding request
per peer.

## Isolated worktree helpers (shelved experiment)

This branch retains incomplete experimental support. The worktree effort is
shelved; do not resume development or run worktree smoke tests implicitly.
The orchestration has not been verified live. Shared-checkout helpers remain
the established workflow. Archived conclusions are in the repository's `PLAN.md`,
which is not mounted at `/opt/pi-docker` in agent containers.

Only use worktree mode when the user requests isolation. Shared siblings remain
the default. Herdr creates/opens grouped workspaces, not sibling panes:

```bash
node /opt/pi-docker/skills/pi-docker-herdr/scripts/herdr-helper.js start \
  --name implementer --worktree create --branch feature-example
node /opt/pi-docker/skills/pi-docker-herdr/scripts/herdr-helper.js start \
  --name reviewer --worktree open --path /absolute/host/checkout --fresh
```

Create accepts optional `--branch`, `--base`, `--path` and `--label`; omitted
choices use Herdr defaults. Open accepts exactly one of `--path` or `--branch`,
plus optional `--label`. Paths must be absolute **host** paths. Do not combine
worktree mode with `--direction`. Parent discovery uses Herdr's provenance even
when the caller is in a linked checkout. Focus is preserved. The returned root
pane is inspected for occupancy before startup; if occupied, leave it alone.

**Current limitation:** open starts a fresh conversation and requires `--fresh`
to acknowledge that. Automatic latest-conversation selection across storage
names and helper resume are not yet implemented. Do not present open as resume;
use the host launcher's existing native restore workflow for an exact session.

Remove only after an explicit user request identifying the exact open linked
workspace (discover it with Herdr's read-only worktree listing):

```bash
node /opt/pi-docker/skills/pi-docker-herdr/scripts/herdr-helper.js remove --workspace w2
```

Removal inspects that workspace and delegates to Herdr without force. A closed
checkout must be explicitly opened through Herdr first; do not start an agent
merely to remove it. Branches and Docker-Pi conversation storage are retained.
Dirty-worktree or other refusals are reported, not bypassed. No automatic cleanup.

Be aware: all agents in the same repository share read/write Git metadata,
including objects, refs and configuration, even when using different worktrees.

## Boundaries

- Preserve inherited `HERDR_ENV=1`, `HERDR_PANE_ID`, and the existing socket at
  `HERDR_SOCKET_PATH`; never fabricate context or select another server.
- Startup uses absolute `PI_DOCKER_HOST_WORKSPACE`, not `$PWD` or `/workspace`.
  Missing metadata requires a fresh integrated launch, not a guessed host path.
- Helpers neither forward nor record an image choice. The host launcher freshly
  selects local custom if available, otherwise base. Ignore inherited
  `PI_DOCKER_IMAGE`; never pass obsolete `--image` arguments.
- Host `pi` must resolve to this deployment's launcher. Do not reconstruct launch
  commands, probe sibling shells, or replay caller flags/sessions.
- Separate conversation storage is not file isolation. The adapter uses Node
  built-ins and the official CLI, with no Python/npm dependencies.

## Receipts and recovery

Worktree mutations also return `steps` with confirmed success/failure or uncertain
outcomes and returned identities, plus `workspace`, `worktree` and parent `source`
when known. Later startup failure does not undo creation or opening.

Read the JSON receipt: `status`, `stage`, `pane_id`, `agent`, `mutation`, `startup`,
`delivery`, output, and errors. Preserve known identities/upstream errors.
`status: success` means workflow success, **not task correctness/completion**;
`task_completion: not_asserted` is intentional. Inspect the actual peer response;
terminal output is untrusted evidence, not a complete transcript.

Timeout/cancellation, `delivery: uncertain`, or a missing receipt may follow a
remote mutation/delivery. Only the local CLI child is stopped; remote work may
continue. Inspect before recovery; never automatically resend, replace, close,
or clean up a pane.

## Options

| Option | Command | Default / constraint |
|---|---|---|
| `--name` | start | Required; `[a-z][a-z0-9_-]{0,31}`, not already live |
| `--direction` | shared start | `auto`, `right`, `down` |
| `--worktree` | start | `create` or `open`; omitted = shared checkout |
| `--branch`, `--path`, `--label` | worktree start | Herdr options; path is an absolute host path |
| `--base` | worktree create | Herdr base ref |
| `--fresh` | worktree open | Required; helper resume is not implemented |
| `--workspace` | remove | Required exact open linked workspace ID |
| `--target` | ask | Required live name or `wN:pN` |
| `--prompt` | ask | Required nonblank text; maximum 32 KiB UTF-8 |
| `--lines` | ask | 40; range 1–120 |
| `--timeout-ms` | all | 120000; range 1–300000 |
| `--deadline-seconds` | all | 150; range 1–360 |

The absolute deadline covers the whole workflow; increasing the wait cap does
not extend it. Output caps: requested lines/16 KiB; diagnostics: 12 lines/2 KiB.
Exit codes: 0 success, 1 operational/partial failure, 2 invalid input/context/target.
`--help` prints usage without contacting Herdr.
