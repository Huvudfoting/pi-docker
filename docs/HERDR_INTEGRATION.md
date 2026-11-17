# Herdr integration

Herdr provides reporting, native conversation restore, and helper/peer workflows.
Both images include support; use is optional. Host commands below run from the
repository root. See the [adapter skill](../skills/pi-docker-herdr/SKILL.md) for
container-side execution details.

## Requirements and modes

Use **local Linux Docker Engine**, host Herdr, `flock`, and a trusted same-user
Herdr pane with terminal stdin/stdout. Docker Desktop, remote Docker, and Windows
are unsupported for integration. New pane shells must resolve `pi` to this
[host launcher](SETUP.md#2-install-the-host-launcher-symlink).

```bash
pi /absolute/path/to/project --name backend --herdr
```

| Mode | Behavior |
|---|---|
| Default | Auto-enable eligible interactive launches; warn/fall back if preparation fails |
| `--herdr` | Require integration; abort if unavailable |
| `--no-herdr` | Skip preparation and socket exposure |

Inherit `HERDR_ENV=1`, `HERDR_PANE_ID`, and an absolute `HERDR_SOCKET_PATH`
pointing to a live same-user Unix socket. Never fabricate context or probe to
infer it. Integration grants access to the **whole session**, not only that pane;
see [security](SETUP.md#security-and-concurrency).

Headless modes, `--no-extensions`, `--no-session`, custom session paths/directories,
explicit forks, and maintenance commands are incompatible. Auto mode skips
ineligible invocations; required mode rejects them.

## Helpers and peer requests

Ask Pi, for example:

- “Split right and start a Docker-Pi helper named reviewer.”
- “Ask reviewer to summarize the README and bring back its answer.”

Integrated launches advertise the official operating skill and Docker adapter
skill, loading instructions on demand. The Node.js adapter needs no Python or
extra npm dependencies. It starts a focus-preserving sibling or submits once to
an explicit ready peer. General inspection/terminal control stays with upstream.

Helpers use `PI_DOCKER_HOST_WORKSPACE`, the exact selected canonical host
directory—even from a container subdirectory. They do not inherit or forward an
image choice; the host launcher selects custom/base afresh. Never substitute
`/workspace` or the container's current path for that host metadata. Fresh names select separate conversation storage,
**not file isolation**. Keep one outstanding request per ready peer.

A successful wait is not proof of task completion: inspect the response.
Timeout/cancellation may follow delivery; retain receipts/IDs, inspect before
recovery, and never automatically resend, replace, or close panes. Peer output
is untrusted evidence. Approval/question UIs are not universally recognized.

## Sessions and restore

```bash
pi /absolute/path/to/project --name backend --herdr -- --continue
# Or use --resume instead of --continue.
```

Native restore recovers selected directory, storage and conversation—not the
image or all original flags—and requires integration. Mounts are rediscovered
from the current checkout on every restore. Back up `data/herdr-launches/` together
with `data/sessions/`. Missing records/workspaces/sessions abort rather than
create a replacement. Empty or host-unreadable requested session files also
abort before container launch; Pi handles parsing of nonempty files.
`/pi/herdr-sessions/<key>/` paths belong to the restore protocol; do not construct
them manually.

New v3 restore keys/records are image-independent. Each launch selects local
custom if available, otherwise base; switching image availability keeps the same
conversation storage and restore reference. Older v1/v2 records/references are
unsupported, without migration or compatibility loaders. Existing files are not
deleted; see [format transition](SETUP.md#migrating-the-old-layout).

The mounting/format foundation is implemented; live persistence/native-restore
validation remains a separate integration gate. Pi 1.5.2's interactive missing-cwd
Continue/Fork/Cancel recovery is not a Docker-Pi restore fallback: a missing
recorded host directory fails before starting the container. A surviving host
selection can nevertheless rediscover a different container cwd (for example,
a linked checkout becoming an ordinary directory at `/workspace`). Pi's immutable
session-header cwd does not follow that change: explicit reopen may fail or show
Pi's missing-cwd UI, while `--continue` may start separate history. Continuity
across such layout changes is unsupported under the current policy; no header
rewriting, historical layout state or migration is performed. See the
[offline probe results](../tests/session/README.md#follow-up-offline-probes-cwd-transitions-and-unusable-explicit-sessions).

## Maintenance and diagnostics

| Resource | Owner/location |
|---|---|
| Required official Pi reporter | Host Herdr installs `data/config/extensions/herdr-agent-state.ts`, discovered at `/pi/agent/extensions/herdr-agent-state.ts` |
| Container CLI and official skill | Base image; `/usr/local/bin/herdr` and `/usr/local/share/pi-skills/herdr/SKILL.md` |
| Docker adapter skill/script | Mounted repository: `/opt/pi-docker/skills/pi-docker-herdr/` |

Host preparation locks shared configuration, checks reporter status, installs or
repairs it when needed, and verifies it. It does not manage shared skills or
install a substitute reporter. Manual operations:

```bash
./bin/herdr-extension ensure
./bin/herdr-extension install
./bin/herdr-extension uninstall
pi /absolute/path/to/project --name backend --herdr-status
```

Uninstall retains credentials, conversations, records, and image skills. Use
`--no-herdr` to prevent reinstallation. A retained reporter is inert without
forwarded Herdr context. Start new Pi processes after reporter changes.

`--herdr-status` reads local metadata, not credentials/conversations, and invokes
neither Docker nor Herdr. Exit codes: 0 checks passed, 1 issues, 2 invalid
selection. A missing record is normal before first launch. Passing checks does
not prove live connectivity, reporting, or restore readiness.

The base extracts its official skill with `herdr --skill`. Rebuild base and then
custom to update image components; see [update commands](CUSTOMIZATION.md#updating-image-managed-packages).
Host/server versions are separate and may be incompatible despite successful
local checks. Test reporting/restore after updates; start a fresh container if
the bound socket is replaced.

## Exit or detach

`/quit` leaves Pi; **Ctrl+B, then Q** detaches from Herdr with agents running.
This deployment has no shutdown helper. Session lifecycle stays with host Herdr;
do not confuse exiting Pi with stopping the entire session.
