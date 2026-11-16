# Reviewed Phase 1 mount contract

**Phase 1 is complete.** This contract is finalized for Phase 2 adoption, **not
production implementation or certification**. Reviewed evidence:

- `report.txt`: historical 22-check Docker pass on the earlier custom image.
- `mount-report-pi-1.5.2.txt`: refreshed **23-check Docker pass**, with runtime
  Pi 1.5.2, Node 24.22.3 and Git 2.39.5. It includes the expanded runtime-alias
  and pointer-symlink regressions plus direct `.git` symlink runtime coverage.
- `herdr-report.txt`: disposable Herdr 0.9.5 pass, **26 assertions**.

The copied current logs and effective standalone Compose were also reviewed;
only the two intended missing-source probes failed. Production Compose merging
remains a Phase 2 host integration gate. A separate base-image run, Pi startup,
conversation restore and rewind remain later integration coverage.

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
  it is not already contained in the checkout bind. The prototype supports these
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
