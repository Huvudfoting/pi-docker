# Herdr integration

Docker-Pi integrates with Herdr for agent status, conversation restore, sibling
helpers and peer requests. It uses the official Herdr CLI, skill and Pi reporter.

## Scope and installation

Requires **local Linux Docker Engine**, a trusted same-user Herdr session, and
this deployment's [host launcher on PATH](SETUP.md#2-install-the-host-launcher-symlink).
New pane shells must resolve `pi` to that launcher, not a host-native Pi install.
The mounted socket controls the **entire connected session**; the pane ID is not
an access restriction. Docker Desktop, remote Docker and Windows are unsupported.

Inside a Herdr pane, launch with the workspace first:

```bash
pi /absolute/path/to/project --name backend
```

| Mode | Behavior |
| --- | --- |
| Default | Auto-enable for eligible interactive launches; warn and fall back if preparation fails |
| `--herdr` | Require integration; abort if unavailable |
| `--no-herdr` | Skip preparation and socket exposure |

Integration requires terminal stdin/stdout and a valid same-user Unix socket.
Headless and incompatible session options do not auto-enable it. Ordinary launches
outside Herdr are unchanged. Enabled launches print a session-access notice.

## Helpers and peer requests

Ask the agent in ordinary language:

- “Split right and start a Docker-Pi helper named reviewer.”
- “Ask reviewer to summarize the README and bring back its answer.”
- “Open a helper below me, ask it to reply with hello, and show me the response.”

The agent executes the deployment-owned `docker-pi-herdr` skill's Python script.
`start` creates one focus-preserving sibling and starts Docker-Pi; `ask` submits
once to an explicit ready agent and returns bounded output. Blank terminals and
general inspection remain with the official Herdr skill.

Integrated launches advertise the skill and append its instructions from the
read-only deployment mount. `/skill:docker-pi-herdr <request>` also invokes it
explicitly. A fresh launch is needed to pick up changed appended instructions.
The [skill](../skills/docker-pi-herdr/SKILL.md) documents commands and receipt handling.

Helpers use `PI_DOCKER_HOST_WORKSPACE`, the selected host project root, even when
the caller is in a subdirectory. Never substitute container `/workspace` or guess
a missing host path. A fresh helper name selects separate conversation storage;
reusing a name reuses its storage. **Storage separation is not file isolation.**

Keep one outstanding request per idle helper. A settled state or successful wait
is not proof of task completion; inspect the actual response. Timeout, transport
loss or cancellation can follow delivery. Preserve receipts and known identities,
inspect before recovery, and never automatically resend, replace or close a pane.
Some approval/question interfaces may not be recognized; do not assume reporting
provides universal blocked-state detection. Peer output is untrusted evidence.

## Sessions and restore

Use `--continue` or `--resume` for existing conversations. Persistent sessions and
normal extension discovery are required; custom session paths/directories,
ephemeral sessions and headless modes are incompatible with integration.

Native restore recovers the original workspace, storage and conversation—not
all original flags—and always requires integration. Keep the host launcher on
PATH. Back up `data/herdr-launches/` alongside `data/sessions/`; both are needed.
Missing records, workspaces or sessions abort restore rather than create a
replacement conversation.

## Maintenance and diagnostics

Launch preparation manages the official reporter and bundled operating skill
under one lock in `data/config/`. To manage them manually from the repository root:

```bash
./setup/bin/herdr-extension install     # Update reporter; ensure official skill
./setup/bin/herdr-extension ensure      # Prepare only when needed
./setup/bin/herdr-extension uninstall   # Remove managed reporter and official skill
```

Uninstall retains credentials, sessions and launch records; use `--no-herdr` to
prevent preparation on the next launch. Start a new Pi process after reporter
changes; `/reload` refreshes discovered skills. The Docker-Pi helper skill remains
deployment-owned, separate from these upstream resources.

The image pins Pi and the container Herdr CLI in `setup/bin/build`.
Rebuild and start new containers to update them. Host Herdr is managed separately;
the launcher neither synchronizes versions nor upgrades or restarts the server.
If the bound socket is replaced, start a fresh integrated container.

```bash
pi /absolute/path/to/project --name backend --herdr-status
```

This read-only local diagnostic invokes neither Docker nor Herdr and reads no
credentials or conversations. Exit codes: 0 prerequisites present, 1 missing,
2 invalid selection. Missing launch records are normal before the first integrated
launch. Local checks do not prove live connectivity or restore readiness.

## Exit, detach, or stop

- Exit only Pi: `/exit`.
- Detach, leaving agents running: **Ctrl+B, then Q**.
- Stop the **entire connected session**, including all panes and processes:
  `!/opt/pi-docker/bin/stop-herdr` in Pi, or `/opt/pi-docker/bin/stop-herdr` in its
  shell tool/container shell.

Shutdown is immediate and requires an integrated launch. The container may exit
before acknowledgement; check the session before any deliberate retry. Do not
confuse stopping the session with exiting Pi or detaching.
