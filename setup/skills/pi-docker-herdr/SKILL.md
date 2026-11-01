---
name: pi-docker-herdr
description: Start pi-docker helpers or ask an idle peer in an integrated Herdr session using the deployment adapter. Complements the official herdr skill with host-path handling and bounded receipts.
---

# pi-docker adapter

Read the official `herdr` skill at
`/usr/local/share/pi-skills/herdr/SKILL.md` for Herdr operation and safety.
This adapter only adds pi-docker launch requirements and a bounded start/ask
workflow. Use upstream directly for inspection, blank terminals, ordinary
commands and other agent kinds.

## Start and ask

For requests such as "Create a new pi-docker helper in a pane to the right",
execute these scripts through the shell tool:

```bash
python3 /opt/pi-docker/skills/pi-docker-herdr/scripts/herdr-helper.py start \
  --name reviewer --direction auto
python3 /opt/pi-docker/skills/pi-docker-herdr/scripts/herdr-helper.py ask \
  --target reviewer --prompt 'Summarize the README.'
```

`start` creates a focus-preserving sibling and starts pi-docker. Honor a requested
`right`/`down` direction; otherwise use `auto`. Choose a fresh upstream-valid name
if omitted. For a combined request, inspect the start receipt, then ask the
returned agent once. Leave the helper running.

`ask` requires an explicit live name/pane ID or an identity from a successful
receipt in this conversation. Clarify missing or ambiguous targets/tasks.
The adapter accepts only ready peers; do not use it to queue competing requests.

## Docker-specific boundaries

- Preserve inherited `HERDR_ENV`, `HERDR_PANE_ID` and `HERDR_SOCKET_PATH`;
  integration requires `HERDR_ENV=1`, a pane ID and an existing Unix socket.
- Startup uses absolute `PI_DOCKER_HOST_WORKSPACE`, the selected host project
  root, not container `$PWD` or `/workspace`. Unlike upstream's native-agent
  default, pi-docker helpers intentionally start at that root, even from a
  container subdirectory. Missing metadata requires a fresh integrated launch.
- Host `pi` must resolve to this deployment's launcher. Use the adapter rather
  than reconstructing split/start commands or probing sibling host shells.
  Do not replay caller flags/sessions. Separate conversation storage is not
  file isolation.

## Adapter receipts

Inspect JSON receipts and report identity, state, actual output and errors.
Preserve known pane/agent IDs and upstream errors on partial failure.
`delivery: uncertain` or no receipt may mean delivery occurred: stop and inspect
before recovery, never automatically resend, replace or clean up a pane.
Acknowledgement and settled lifecycle states do not establish task completion.

Defaults: 120000 ms wait cap, 150-second absolute workflow deadline.
`--timeout-ms` and `--deadline-seconds` adjust them; `ask --lines` defaults to 40.
Exit codes: 0 success, 1 operational/partial failure, 2 invalid arguments/context.
