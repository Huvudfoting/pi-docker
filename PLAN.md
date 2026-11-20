# Archived: Docker-Pi worktrees in Herdr

**Status: shelved by user decision. This is a conclusions record, not an active
plan or instruction to continue implementation.** Keep the branch for a possible
future attempt. Shared-checkout helpers remain the established workflow.

All repository tests, experiment harnesses, fixtures, raw reports and procedural
runbooks were removed at the user's request. The findings below summarize prior
review; their underlying artifacts remain in Git history, not in the working tree.
No new runtime verification or host cleanup is implied by this archive.

## Main conclusion

Herdr can own worktree creation, opening, grouping and removal. Docker-Pi needs
only to discover/mount the returned checkout and start the host `pi` launcher in
Herdr's returned available pane. There is no need for a second worktree manager,
registry, host Docker access from the agent container, or separate discovery
container to start a fresh isolated helper.

Herdr's worktree API opens a **grouped workspace with a root pane**, not a sibling
split in the caller's tab. This topology distinction should be explicit to users.
Resuming old helper conversations is a separate problem; it must not block
starting fresh helpers in isolated worktrees.

## Implementation retained on this branch

- Bash/Git checkout and metadata discovery in `lib/workspace-mounts.sh`, with
  static long-form Compose binds and `create_host_path: false`.
- Ordinary selections use `/workspace`; linked/external-metadata checkouts use
  canonical host paths and the exact selected-directory cwd. Required common Git
  metadata is mounted separately only when outside the checkout.
- Image-independent v3 Herdr launch records and native managed-session reopen.
  Each launch/helper/restore freshly selects local custom, otherwise base.
- Existing shared-checkout sibling-helper startup, readiness, prompt/read and
  bounded receipts.
- Experimental worktree create/open/start and explicit open-workspace removal
  in `skills/pi-docker-herdr/scripts/herdr-helper.js`, including parent provenance,
  focus preservation, returned-pane occupancy checks and mutation receipts.
  Worktree open currently requires `--fresh`; helper conversation discovery and
  resume across storage names were not implemented.

Implementation retention is not a recommendation to merge the branch unchanged.
The latest isolated-helper workflows were checked offline, not exercised live.

## Herdr contract established during the attempt

These findings are version-specific: Herdr 0.9.5 and Pi 1.5.2.

- `worktree create` creates the checkout and opens/groups its workspace in one
  request. Use returned workspace, checkout and root-pane identities; do not
  add a redundant open or split.
- `worktree open` can return an already-open, occupied pane. Never replace an
  occupant; inspect it and let `agent start` enforce interactive-shell readiness.
- Create/open reject linked-worktree sources. Obtain the parent through
  `worktree list` provenance (`source.source_checkout_path` and related identity),
  rather than guessing a path or using another client's focused workspace.
- Explicit removal takes an open linked-worktree workspace ID, not a checkout
  path. Herdr refuses unsafe removal and retains the branch on success. Docker-Pi
  must not add force, delete conversations or recreate removed checkouts.
- Preserve inherited pane/socket context and use explicit identities and
  `--no-focus`. Mutations can succeed despite a timeout/lost response: retain
  known identities, report uncertainty, and do not automatically retry/clean up.
- Shared Git objects, refs and configuration remain writable across worktrees.
  Worktrees isolate working files/indexes, not permissions or external resources.

## Mount and conversation conclusions

- Host Git is required when any enclosing `.git` marker exists, including a
  dangling symlink. Without Git, allow only successfully inspected marker-free
  ordinary directories. Invalid/inaccessible metadata must fail clearly.
- Resolve metadata with Git and validate literal forward/common/reverse pointers.
  Canonically equal endpoints do not guarantee that symlink traversal paths are
  available inside the container. Direct represented `.git` symlinks are supported;
  additional pointer aliases are conservatively rejected rather than repaired.
- Reject checkout/metadata mounts overlapping deployment, runtime, system or
  credential destinations. Do not widen mounts to arbitrary ancestor trees.
- `--name` selects conversation storage, not a branch or worktree. The desired
  future discovery scope is the exact canonical selected directory, across storage
  names, reusing the chosen conversation's original storage.
- Pi session-header cwd is immutable. Stable storage alone does not preserve
  continuity when the container cwd changes, such as linked-to-ordinary layout
  transitions. No header rewriting, historical-layout repair or migration was
  implemented. Same-cwd replacement was characterized in local Pi checks only.
- Pi can initialize missing/empty explicit session paths as new history; native
  restore must reject these before startup. Nonempty session parsing remains
  Pi's responsibility; its loader is permissive, not a general integrity checker.

## What was observed, and what was not

Prior reviewed host runs exercised production mounts/Git operations, separate
indexes and concurrent worktree writes, persistence, interactive resume, and
ordinary plus linked-subdirectory native managed-session reopen. These results
apply to the images/versions exercised, not every rebuild or the untested helper
orchestration added later.

An apparent stale-agent reference in a same-pane test did not establish a
production lifecycle defect. The test driver kept launches in one foreground
process group. Separate foreground jobs with actual shell returns cleared the
old identity and passed ordinary/linked native reopen. No reporter patch or
production lifecycle reset was indicated; the exact earlier server branch was
not traced.

Actual automatic restore after a Herdr server restart was **not verified**. Two
attempts stopped on initialization writes: Herdr added `onboarding = false`; Pi
added `lastChangelogVersion: "1.5.2"` and reserialized settings. Disposable frozen
fixtures would need those defaults initialized before hashing, including Pi's
two-space JSON serialization without a final newline. Those were fixture
preparation failures, not successful restart results.

Separate base-image runtime, real custom/base/custom continuity, integrated
layout/lifecycle/failure cases, and multi-worktree rewind/retention were not fully
verified. The rewind hook shares repository-wide state; snapshots are best-effort,
not durable cross-worktree history. No claim of complete worktree support is made.

## Unresolved design discussion (no decision or implementation)

Cross-storage latest-conversation discovery must read session data somewhere.
Host Bash/file timestamps alone are inadequate. A second discovery container was
explicitly rejected. Host Node was allowed only if no suitable alternative exists.
A possible alternative is a single-container startup wrapper using Pi's installed
SDK, with broader session-storage mounts and revised storage/restore handling.
That design was explained, not approved. Do not infer a host Node requirement,
storage redesign or implementation authorization from this archive.

## If the effort is explicitly reopened

Recheck the current Herdr API and image versions. Start from the user's simple
create-worktree → start-helper → prompt workflow, with a short disposable live
smoke check; do not reconstruct the former test-gated program. Treat existing
conversation resume as a separate feature. No legacy-data compatibility or
migration is required. Keep documentation and validation proportional to useful
functionality, and obtain fresh approval for any host session/image mutation.

This cleanup touched repository scaffolding only. Runtime `data/`, Git history,
worktrees and host processes/containers/sessions were not cleaned up or verified.
Previous host fixture cleanup completion remains unconfirmed; do not infer that
those resources still exist or silently target them in a future session.
