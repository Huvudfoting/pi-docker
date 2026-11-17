# Reviewed Phase 1 mount contract

**Phase 1 and Phase 2 mount validation are complete.** The Phase 1 contract was
adopted in production and separately host-tested; neither suite certifies live Pi
startup, Herdr socket behavior, persistence/restore or rewind. Reviewed evidence:

- `report.txt`: historical 22-check Docker pass on the earlier custom image.
- `mount-report-pi-1.5.2.txt`: refreshed **23-check Docker pass**, with runtime
  Pi 1.5.2, Node 24.22.3 and Git 2.39.5. It includes the expanded runtime-alias
  and pointer-symlink regressions plus direct `.git` symlink runtime coverage.
- `herdr-report.txt`: disposable Herdr 0.9.5 pass, **26 assertions**.
- `production-mount-report-pi-1.5.2.txt`: actual deployment Compose plus isolated
  Node/fixture overrides, **23 checks pass**, run `SMNf86J3`. Same custom image
  and Pi/Node/container-Git baseline as above; host Docker is now 29.10.0,
  Compose 5.7.1, Git 2.53.0 and Bash 5.3.9. Report SHA256:
  `e6184dc52946056844f14dbd7b9aa78df2d63bf07c6297dda6b10b3a80f326a3`.

The copied current logs and effective standalone Compose were also reviewed;
only the two intended missing-source probes failed. The new production run's
23 check logs also agree with its report; all 13 per-container Compose artifacts
and receipts were independently reviewed, including concurrent barriers,
fixture-only private binds, disabled source creation and exact cwd. The top-level
`effective-linked-compose.json` is only a prelaunch diagnostic snapshot (its
artifact bind can still name the previous probe); the authoritative artifacts
are `logs/<container-name>.compose.json`, each bound to its own container.
A separate base-image run, Pi startup, conversations, restore and rewind remain
later integration coverage.

Phase 2 now implements this contract in `lib/workspace-mounts.sh` and the
configurable production `compose.yaml` / `compose.metadata.yaml`. The launcher
clears inherited Git discovery overrides while honoring normal host Git config;
no trust is granted. Canonical paths are captured without silently stripping
trailing control characters into a different directory, deployment or socket.
Literal pointer traversal may use only represented bind trees and their parent
hierarchy: an unrelated directory visited before `..` is not available merely
because the normalized endpoint is valid. Administrative `commondir` and reverse
`gitdir` files themselves must not be symlink aliases. Complete pointer-file reads
reject NULs, control bytes and extra lines, rather than checking a misleading
first-line prefix; one conventional final LF is optional. These extra safety
cases have local launcher regression coverage, not new host runtime evidence.
The prototype remains as historical test code; its 48 discovery assertions are
also run against production through `production-mount-contract.sh`.

`verify-worktree-mounts.sh --production-run` passed the mount runtime gate using
actual production Compose/Git-config/metadata files plus isolated fixture data
and a Node test overlay. Phase 1 reports alone did not certify this integration;
the new production report closes that gap, not Pi startup or a live Herdr socket.
See `tests/host/README.md` for repeat-run and exact-run cleanup instructions.

## Discovery and mounts

- Canonicalize the exact selected directory; preserve it as the history/storage
  scope. Without host Git, inspect all ancestors and allow only a successfully
  inspected, marker-free ordinary directory. An enclosing `.git` entry, even a
  dangling symlink, requires Git. Recognized broken metadata fails closed.
- Ordinary directories and conventional self-contained `.git` directories keep
  the selected-directory bind and cwd at `/workspace`. Selecting a subdirectory
  does not widen conversation scope.
- Linked/external-metadata checkouts bind the whole physical checkout at its
  canonical absolute host path and start in the exact canonical selection.
  Bind the Git common directory separately at its physical host path only when
  it is not already contained in the checkout bind. The prototype and production helper support these
  two required binds, not an arbitrary number of additional metadata mounts.
- Resolve checkout root, per-worktree Git directory, and common directory through
  Git. Validate the literal `.git`, `commondir`, and reverse `gitdir` pointers.
  The per-worktree directory must be reachable within the represented mounts;
  reject extra/unrepresented pointer paths rather than rewriting metadata or
  exposing the main checkout's files. Reject metadata that contains the checkout
  and would therefore require a broader overlapping metadata mount.
- Symlinked **selection** paths resolve normally. A direct `.git` symlink to
  represented physical metadata is supported. Literal metadata pointers that
  traverse further symlink aliases are conservatively rejected, including aliases
  inside a bind and aliases hidden by `..`: matching canonical endpoints alone
  does not prove all traversal paths exist in the container. No implicit metadata
  repair or rewrite is permitted. More permissive alias layouts are not verified.
- Use static long-form Compose binds with `create_host_path: false`. Remove the
  ordinary `/workspace` project bind for path-preserving launches; retain the
  deployment/security mounts. Test the effective merged configuration in Phase 2.
- Mount required checkout and metadata read/write. This separates indexes/files,
  **not Git permissions**: refs, objects, configuration, credentials and other
  external resources remain shared.

## Reserved destinations: deployment/image audit

For every path-preserving checkout/common-metadata destination, reject equality,
ancestor, or descendant overlap on **path component boundaries** with:

| Paths | Resources protected |
| --- | --- |
| `/pi` | Shared configuration, sessions and Herdr-session storage |
| `/run`, `/var/run`, `/var/lock` | Herdr socket, GitHub configuration, runtime IPC and conventional aliases |
| `/opt/pi-docker` | Read-only deployment bin/lib/docs/extensions/skills/images/Compose resources |
| `/home/node` | Runtime HOME, optional Git config bind, caches and user state |
| `/usr`, `/bin`, `/sbin`, `/lib`, `/lib64` | Node, Pi, Herdr, Git, extension/skill resources, entrypoints and shared libraries |
| `/etc`, `/dev`, `/proc`, `/sys`, `/boot`, `/root` | Runtime configuration, kernel/device interfaces and protected system/home paths |

Additionally reject `/tmp` itself, because replacing the scratch directory breaks
runtime assumptions; allow projects below it. `/probe` is reserved only by the
standalone Docker test harness because it mounts test code there; it is **not** a
production deployment reservation.

This audit covers `compose.yaml`, `compose.git.yaml`, `compose.herdr.yaml`, both
image Dockerfiles and the custom entrypoint. Every current deployment bind falls
under `/pi`, `/run`, `/opt/pi-docker`, or `/home/node`; image resources fall under
`/usr`. `/workspace` is not globally reserved: the default project bind must be
replaced rather than layered beneath path-preserving mounts. `/tmp/project`,
`/var/tmp/project`, `/home/another-user/project`, and `/runaway/project` remain
allowed. This is a denylist, not an allowlist of project locations.

## Production-adoption assessment

Bash/Git discovery plus static long-form Compose remains viable: no generated
YAML, eval, host Python, or host Node is needed. The symlink fix is a small
fail-closed traversal check, not an alias-mount planner. Preserve this limited
contract; if safe production merging or additional pointer layouts require
fragile parsing/configuration, report that assessment before using the agreed
host-Node fallback. `jq` belongs only to the separate Herdr test harness.

Historical reports must not be relabelled as certification of a rebuilt image.
The current image baseline is Pi 1.5.2 / Herdr 0.9.5, with custom extensions pinned
in `images/custom/Dockerfile` (rewind remains 1.8.8).
