# Phase 3: real Pi persistence, offline fixture provider

## Scope and explicit test decision

The user chose an **in-process deterministic fixture provider**, not real API
calls. `fixture-provider.ts` is test code, not a deployment extension/package.
It activates only with an isolated `phase3-fixture` sentinel in the agent config,
accepts only `phase3-*` fixture prompts, emits finite synthetic text responses,
and never opens a transport, requests credentials or calls tools. Usage/cost are
zero because no model service is called. It does not certify provider protocol,
request instrumentation, network/authentication, or model quality.

Pi itself creates and persists the user/assistant turns; tests do not seed JSONL
or pretend mocked responses establish real Pi startup. The observer records only
fixture messages/IDs/cwd/name/container hostname, not prompts from other sessions
or provider configuration. It writes only inside the private test config.
**Do not install this provider in real/shared configuration.**

## Local real-CLI regressions

```bash
python3 -m unittest discover -s tests -p test_session_fixture.py -v
```

These tests run the installed Pi 1.5.2 Node CLI directly with a minimal environment,
private HOME/config/auth/session storage, `--offline`, no MCP or tools, and no
inherited credentials or Herdr context. They cover persisted turns, stable
continue IDs/files/history, explicit session reopen restoring its recorded cwd,
separate storage isolation, missing recorded cwd without a replacement, and
sentinel enforcement. They skip when Node/Pi is absent; `PI_PHASE3_CLI` can select
a reviewed installation outside the image's normal package path. No Python
packages or global installs are required. This is **not** a Docker/entrypoint or
native Herdr test.

`tests/test_herdr_launcher.py` also verifies host restore preparation against
current filesystem state, without a historical layout/checkout-identity registry:
valid replacement checkout, surviving marker-free directory, missing exact
subdirectory, recognized broken metadata and directory/name-scoped forwarding of
`--continue`/`--resume`. These fake-Docker checks are not conversation/UI evidence.

## Host integration: actual launcher and image entrypoint

From the supported original Linux Docker host checkout:

```bash
bash tests/host/verify-session-persistence.sh --preflight
bash tests/host/verify-session-persistence.sh --run
```

Requires the Phase 2 tools plus **test-only jq**, not host Node or Python. Preflight
is read-only. Run creates a unique `/tmp/pi-docker-persistence.XXXXXXXX/` and copies
only deployment source allowlist paths; it never copies real `data/`, `.git/`,
`.env`, credentials, conversations or host Git config. Agent auth is empty and
GitHub config is fresh. `--no-herdr --no-host-gitconfig` prevents socket integration
and host Git-config exposure, even inside an inherited Herdr pane.

The copied `compose.yaml` uses `extends` to inherit an unchanged production
Compose service (`compose.production.yaml`). Test-only overrides set batch
stdin/TTY, HOME/scratch, no network, read-only root and bounded memory/CPU/PIDs.
**No entrypoint or command is replaced.** Custom/base image selection is still
performed freshly by the copied real `bin/pi`; no image is built, pulled, retagged
or removed. Custom availability and the preflight image ID are checked before each turn;
unexpected availability/tag changes stop the run instead of silently overriding
launcher image selection.
The custom image's own extensions/resources still load through its real entrypoint.
This does not certify unmodified interactive terminal transport or host networking.

The 14-check corpus exercises:

- Fresh actual Pi turns, display title distinct from launcher storage name.
- Stable file/ID/history with `--continue` and explicit `--session` reopen.
- Independent storage names and ordinary/self-contained selections even though
  both use container `/workspace`.
- Linked worktree paths with spaces/quotes/dollar/colon, canonical symlink selection,
  independent root/deep-subdirectory histories and sibling-worktree separation.
- Host JSONL header/ID/cwd/user-and-assistant-message verification, including
  fixture provider identity and successful terminal responses, not just exits.
- Retained checkout after exit, missing selection and recognized invalid metadata
  refusing startup without modifying conversation files.

Return the **reviewed/sanitized** report as
`tests/host/persistence-report-pi-1.5.2.txt`; retain Phase 1/2 reports. Each launch
has `logs/state-<check>.json` and raw logs. `inputs.sha256` records copied launcher,
mount/restore helpers, Compose and fixture-provider inputs. `containers.txt` records the unique
Compose project/label and observed container hostnames; on failure the finish
handler also lists any remaining containers for that exact label. Success
requires no matching retained containers. Inspect ambiguous outcomes without
retrying. Per-launch deadlines are bounded; there is no automatic cleanup,
rollback, checkout/branch deletion or container removal by the driver (Compose's
normal `run --rm` still applies). The final negative intentionally leaves one
fixture gitfile invalid; it is not repaired. Later cleanup must be explicitly
requested and scoped to that run.

Driver regressions use fake Docker and private Git/data trees:

```bash
python3 -m unittest discover -s tests -p test_session_host.py -v
```

They require jq/Git and otherwise skip explicitly. They verify read-only
preflight/help, all 14 driver checks, stop-on-incorrect-history and configuration
failure without false readiness. They do **not** replace host evidence.

## Reviewed first host gate

The user supplied `../host/persistance-report-pi-1.5.2.txt` (filename spelling
preserved): **14 checks passed** with the real custom-image entrypoint. Report
SHA256 is `401f73378a4d77d6d42e517ec411906491f35ea4d917995a4ae85760e54c54d1`.
The report records 11 distinct container hostnames, six conversation identities,
and the expected stable IDs/files on ordinary, linked and deep continues/reopens.
Raw observations/JSONL/Compose artifacts were not supplied for independent review;
this is the user-run report of the automated driver assertions, not an additional
Docker run by the coding agent.

### Cleanup for this successful run

**Handoff status:** the user confirmed cleanup was inspected and OK. No further
cleanup is requested. The instructions below document the run's cleanup boundary;
they are not a request to repeat cleanup or recreate removed fixtures.

Only the original exact `/tmp/pi-docker-persistence.XXXXXXXX/` tree remains to
be deleted if no longer wanted; preserve the report in this checkout. Nested Git
worktrees and their common metadata are all fixture-local. There is no external
Git registration, Herdr workspace/socket, Docker volume/network or modified image
to remove. Normal `run --rm` removes containers; the successful finish handler
also checked that no run-labelled containers remained. No cleanup script or
`docker compose down`/prune/image deletion is needed.

Optionally recheck **on the same original Docker host/context** before removing
files, while no processes/containers/mounts are using or changing the fixtures:

```bash
docker ps --all \
  --filter 'label=pi-docker.phase3-run=pipersist-pi-docker-persistence-vqnjnism' \
  --format '{{.ID}} {{.Names}} {{.Status}}'
docker ps --all \
  --filter 'label=com.docker.compose.project=pipersist-pi-docker-persistence-vqnjnism' \
  --format '{{.ID}} {{.Names}} {{.Status}}'
```

Both commands must succeed with no output. On errors or matches, stop and inspect;
do not remove containers or retry automatically. Use the **exact case-sensitive
path printed by the run**, confirmed by its `containers.txt` project receipt.
The report lowercases the project suffix and redacts paths, so it does not reveal
that exact path; do not guess it or use a wildcard deletion. Check for nested
mounts before deletion. No cleanup has been executed by the coding agent.

## Still required before Phase 3 is complete

- Real interactive `--resume` picker, title/name and cwd/history selection checks.
  `--session` reopen in print mode is **not** that picker and **not** native restore.
- Real official extension and native `pi --session /pi/herdr-sessions/<key>/...`
  restore in a genuinely disposable, explicitly consented Herdr session. Never
  fabricate inherited context, mount a live socket here or borrow a real session.
- Validate freshly selected custom/base continuity without automatic tag changes;
  current image-switch coverage is fake-Docker only, with this host run using the
  image currently available. A base-only integration run remains separate.
- Probe replacement-layout/session-header cwd transitions: host rediscovery is
  tested, but Pi 1.5.2 stores immutable container cwd in session headers. A linked
  absolute cwd becoming ordinary `/workspace` is **not** established by host-only
  acceptance tests. Do not add historical flags, migration, pointer repair or
  mount policy changes without reviewing actual behavior and the agreed contract.
- Native missing checkout/metadata failures must occur before Pi's interactive
  Continue/Fork/Cancel fallback; closing Pi versus Herdr workspace close/removal
  retains the verified upstream semantics. Validate malformed/unusable session
  files without silently creating replacement conversations.
- Live provider connectivity, rewind and helper/worktree orchestration remain
  separate coverage; Phase 4 must not be declared implemented by these tests.
