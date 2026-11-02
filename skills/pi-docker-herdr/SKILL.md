---
name: pi-docker-herdr
description: Start Pi Docker helpers or ask a ready peer in an integrated Herdr session. Adds host-path/image handling and bounded receipts to the official Herdr skill.
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

## Boundaries

- Preserve inherited `HERDR_ENV=1`, `HERDR_PANE_ID`, and the existing socket at
  `HERDR_SOCKET_PATH`; never fabricate context or select another server.
- Startup uses absolute `PI_DOCKER_HOST_WORKSPACE`, not `$PWD` or `/workspace`.
  Missing metadata requires a fresh integrated launch, not a guessed host path.
- Helpers preserve `PI_DOCKER_IMAGE`; absent metadata defaults to
  `pi-docker:base`. Invalid image references fail before splitting.
- Host `pi` must resolve to this deployment's launcher. Do not reconstruct launch
  commands, probe sibling shells, or replay caller flags/sessions.
- Separate conversation storage is not file isolation. The adapter uses Node
  built-ins and the official CLI, with no Python/npm dependencies.

## Receipts and recovery

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
| `--direction` | start | `auto`, `right`, `down` |
| `--target` | ask | Required live name or `wN:pN` |
| `--prompt` | ask | Required nonblank text; maximum 32 KiB UTF-8 |
| `--lines` | ask | 40; range 1–120 |
| `--timeout-ms` | both | 120000; range 1–300000 |
| `--deadline-seconds` | both | 150; range 1–360 |

The absolute deadline covers the whole workflow; increasing the wait cap does
not extend it. Output caps: requested lines/16 KiB; diagnostics: 12 lines/2 KiB.
Exit codes: 0 success, 1 operational/partial failure, 2 invalid input/context/target.
`--help` prints usage without contacting Herdr.
