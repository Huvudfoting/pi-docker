# Plan: Herdr-managed worktrees for Docker-Pi

## Goal

Allow multiple Docker-sandboxed Pi agents to write concurrently in separate
Herdr-managed Git worktrees. Herdr owns worktree creation, opening, grouping, and
removal. Docker-Pi owns container mounts, Pi session persistence, restore, and a
thin helper-start orchestration layer.

## Scope and principles

- Support existing linked worktrees regardless of whether Herdr or Git created
  them; do not depend on Herdr's checkout directory layout. Also support external
  Git metadata layouts such as `git init --separate-git-dir` through the same
  discovery and mount-safety rules; reject layouts that cannot be represented
  safely rather than treating them as self-contained checkouts.
- Host Git is optional globally, but required whenever the selected directory
  has an enclosing `.git` entry. Without Git, scan the selected directory and
  all ancestors: allow ordinary-directory launches only if inspection succeeds
  and no `.git` file, directory, or symlink (including a dangling one) is found.
  Fail clearly on a marker or an inspection failure, without interpreting Git
  metadata ourselves. Apply this policy with or without Herdr and on restore;
  keep help and local diagnostics independent of Git availability.
- Prefer small, readable Bash/Git host preparation with safe argument handling.
  Do not require host Node.js initially. If this needs fragile parsing,
  hand-built configuration, or excessive complexity, stop and report that
  assessment before using the agreed fallback: Node.js on the host. No host
  Python requirement or preliminary-container preparation workflow is planned.
  Keep Herdr orchestration in the existing container-side Node adapter.
- Do not introduce a Docker-Pi worktree registry, creation command, or cleanup
  manager.
- Keep session storage names separate from workspace selection. `--name` must
  continue to select conversation storage, not create or select a worktree.
- Preserve ordinary launches and shared-checkout helper workflows, except for
  the explicitly replaced image-selection and conversation-format behavior.
  Backward compatibility with older conversations is not required.
- Target only the current base/custom image pattern (`pi-docker:base` and
  `pi-docker:custom`). Legacy images and compatibility with their launch records
  or session-storage identities are out of scope.
- Select the image afresh on every launch, helper start, and resume/restore:
  use the local `pi-docker:custom` image if it exists, otherwise `pi-docker:base`.
  Do not ask users to choose an image, inherit the caller's image selection, or
  record an image for later replay. Conversation identity must not depend on
  which image is currently available.
- Worktrees isolate working files and indexes, not security permissions, Git
  refs, host ports, databases, credentials, or shared configuration. Shared
  read/write access to repository metadata is accepted; do not build a Git
  permissions-isolation system. Document: "Be aware: All agents working on the
  same repository share read/write access to its Git metadata, including objects,
  refs, and configuration, even when working in different worktrees."
- Conversation discovery matches the exact canonical selected directory, not
  every directory within a worktree. Mounting the whole checkout does not widen
  conversation scope; preserve selected-directory/name-based storage.
- Support `pi-rewind-hook` for recent-conversation rewind, allowing its
  configured retention policy to clean up snapshots. Do not disable retention
  or build a separate snapshot-retention manager. Snapshot availability is
  best-effort, not a durable-history guarantee: the shared repository-wide ref
  and checkout-scoped discovery can cause another worktree's checkpoints to
  lose reachability protection. Missing/pruned checkpoints must be reported
  clearly without blocking conversation resume or claiming a successful rewind.
  In the image-owned setup, custom loads the hook and base does not: switching
  to base retains conversation metadata but captures no new rewind checkpoints.
- Never delete a worktree on container exit, failed agent startup, or restore.
- For explicit worktree removal, delegate to Herdr's removal interface and
  retain Docker-Pi conversations and launch records. Do not add conversation
  cleanup machinery. Restoring a conversation whose checkout was removed must
  fail clearly rather than recreate the checkout or start a replacement.

## Discovery status and remaining prerequisites

### Verified so far

- The installed container CLI and running Herdr server report **0.9.5** with
  compatible protocols; `images/base/Dockerfile` also pins 0.9.5. The host CLI
  executable has not been separately checked. No live server was upgraded or
  restarted, and no live worktree/workspace mutation tests were performed.
- Installed command help/API schema, tagged upstream documentation/source, and
  a live read-only worktree listing confirm the contract below. Response shapes
  for mutations are schema/source-verified, not yet integration-tested here.
- The launcher, Compose files, launch-record/restore implementation, helper,
  and relevant tests have been inspected. Current code still uses `/workspace`
  universally, propagates images, and supports image-aware/legacy records;
  these are implementation changes to make, not completed work.
- Disposable local Git checks passed for ordinary/linked checkouts, spaces,
  subdirectories, symlinked selection paths, forward/common/reverse Git pointers,
  separate Git directories, and a worktree nested beneath the main checkout.
  Linked Git operations worked with the main checkout's tracked source file
  absent. These checks do not establish Docker mount correctness and must become
  durable automated coverage.
- The installed rewind hook is 1.8.8; its shared store ref and bounded update
  retries were inspected. Multi-worktree rewind/retention behavior remains to
  be tested against the actual image version.

### Confirmed Herdr 0.9.5 contract

Evidence: installed `herdr --help`, `herdr worktree`, `herdr status`, and
`herdr api schema --json`; the tagged upstream
[CLI reference](https://github.com/herdrdev/herdr/blob/v0.9.5/docs/next/website/src/content/docs/cli-reference.mdx),
[socket API documentation](https://github.com/herdrdev/herdr/blob/v0.9.5/docs/next/website/src/content/docs/socket-api.mdx),
and [worktree implementation](https://github.com/herdrdev/herdr/blob/v0.9.5/src/app/api/worktrees.rs).

- `worktree list` accepts `--workspace ID` or `--cwd PATH`, including a linked
  checkout source. Its `.result.source` exposes `repo_root`,
  `source_checkout_path`, and optional `source_workspace_id`; `.result.worktrees`
  lists checkout paths and optional open workspace IDs.
- `worktree create` accepts a parent source plus optional branch, base, path,
  label, and focus choices. It creates the checkout **and opens/groups its
  workspace** in one request. `.result` contains `workspace`, `tab`, `root_pane`,
  and `worktree`; use `workspace.workspace_id`, `root_pane.pane_id`, and
  `worktree.path`. Do not add a redundant open request or pane split.
- `worktree open` accepts a parent source and exactly one of path or branch.
  It returns those same records plus `already_open`. A returned pane may already
  be occupied; inspect it before starting an agent, never replace an occupant.
- Create/open reject linked-worktree sources (`linked_worktree_source`). For
  callers in linked worktrees, discover the parent through Herdr's read-only
  listing/provenance before invoking create/open. Never guess the parent path
  or fall back to another client's focused workspace.
- There is no separate opaque worktree ID or explicit reuse flag. Retain paths,
  repository provenance, workspace/pane IDs, and agent identities as returned.
  Existing local branches are checked out by create; otherwise Herdr creates a
  branch from the supplied base or HEAD. An existing branch does not use base.
  Existing-checkout reuse belongs to open; surface conflicts rather than retry.
- `worktree remove --workspace ID` requires an open Herdr-managed linked-worktree
  workspace. It returns `workspace_id`, `path`, and `forced`, removes the checkout,
  closes its workspace on success, and retains the branch. Refuse to add force
  when Herdr/Git rejects removal. `workspace close` only closes Herdr state;
  closing a primary workspace with linked children requires explicit group intent.
- Use explicit source/target identities and `--no-focus`. The host `pi` command
  must resolve to this deployment's launcher. Herdr starts that command in its
  returned pane; the launcher starts Docker. Container-side Node talks to Herdr
  through inherited context/socket, not through Docker access.

### What is still needed to complete Phase 1

No further user policy decision is currently blocking Phase 1. Before advancing
into production launcher changes:

1. Prototype the Bash/Git discovery and safe Compose-selection approach in
   disposable fixtures. Confirm it stays simple; otherwise report why and use
   the agreed host-Node fallback rather than growing brittle shell machinery.
2. Define the concrete reserved destination list, including deployment/runtime
   resources, and test component-aware exact/ancestor/descendant comparisons.
   Check symlink/literal-pointer reachability and deduplication of nested mounts.
3. Check host Git and Compose capabilities needed by the implementation; inspect
   the host Herdr CLI version and verify host `pi` resolution when host access
   is available. Do not infer host executables from container installations.
4. Obtain a Linux Docker host and an explicitly created disposable Herdr test
   session for effective Compose/mount and create/open/remove integration checks.
   Docker is unavailable in this agent container; local discovery/unit work can
   proceed without that access, but host-only checks must remain marked pending.
5. Record the resulting tested mount contract and convert exploratory Git checks
   into repeatable tests. Do not mark Phase 1 complete from schema inspection or
   local Git experiments alone.

## Phase 1: Verify interfaces and define mount behavior

1. Check the supported host/server Herdr versions and the pinned container CLI.
   Inspect installed help/API schema and upstream documentation for worktree
   create/open responses, workspace/root-pane IDs, checkout paths, and removal
   semantics. Do not guess JSON field names or upgrade/restart a live server.
2. Inspect the existing launcher, Compose configuration, restore records, helper
   script, and tests before changing them.
3. Define checkout discovery using Git on the host: selected directory, checkout
   root, per-worktree Git directory, and Git common directory. Resolve paths
   explicitly; do not infer linked worktrees from directory names. Include
   separate-Git-directory layouts and the conservative no-Git ancestor scan
   specified above. Recognized but invalid/inaccessible Git metadata must not
   silently become a non-Git launch.
4. Use path-preserving mounts when external Git metadata requires them: mount
   the entire selected checkout and Git common directory read/write at their
   actual absolute host paths inside the container. Do not mount the original
   checkout's source files merely to expose its `.git` directory. Mount additional
   metadata paths only if discovery shows they are necessary; the usual
   per-worktree Git directory is already inside the common directory.
5. Validate this design against Git's forward and reverse worktree pointers.
   Resolve symlinks and verify literal metadata pointers remain reachable.
   Reserve known conflicting/unsafe container paths, not an allowlist of host
   project prefixes. Reject component-aware exact, ancestor, and descendant
   overlaps with configuration, session, socket, credentials, deployment, and
   essential runtime paths (including `/pi`, `/run`, `/opt/pi-docker`, and runtime
   trees such as `/usr`, `/bin`, and `/home/node`). Define the full list from the
   image/layout contract. Reject unsafe layouts with actionable errors rather
   than remapping paths, mounting broad host directories, or rewriting metadata.
   Deduplicate metadata already reachable at the correct path within a required
   mount; reject unsafe checkout/metadata overlaps. Do not rely on mount order.
6. Keep the existing `/workspace` layout for ordinary directories and
   self-contained checkouts. For a selected subdirectory of a linked/external-
   metadata checkout, mount the whole checkout at its host path but start Pi in
   the exact canonical selected subdirectory. Preserve selected-directory/name
   storage and exact-directory conversation matching; do not aggregate history
   from the checkout root, parents, children, or sibling subdirectories.

Deliverable: a tested mount contract and confirmed Herdr API contract.

## Phase 2: Launch existing linked worktrees correctly

1. Add host-side discovery and mount preparation in a small dedicated Bash/Git
   helper rather than expanding Herdr-specific code. Keep Git optional under
   the conservative ancestor-scan policy. Keep host Node optional unless the
   Bash prototype fails the simplicity/safety assessment; then report and use
   the agreed Node-built-ins-only host fallback. Do not add host Python or
   custom-image tool dependencies. Host mount preparation is distinct from
   container-side Herdr orchestration; do not duplicate lifecycle policy.
2. Make Compose working-directory and mount selection configurable. Use safe
   argument/structured configuration handling for paths; do not interpolate
   untrusted paths into shell commands or hand-built YAML. Replace the default
   `/workspace` project mount for path-preserving launches, while preserving
   existing deployment/security mounts. Use bind mounts with source creation
   disabled so missing or disappearing sources fail instead of creating host
   directories. Validate the effective merged mount configuration.
3. Preserve host workspace metadata passed to helpers and the existing
   path/name-based Pi session storage selection.
4. Update agent instructions and deployment documentation: `/workspace` is the
   ordinary default, not a universal project path; use the actual working
   directory and supplied host workspace metadata.
5. Fail clearly on missing or inaccessible metadata. Do not repair, relocate,
   or recreate worktrees implicitly.
6. Remove launcher image overrides (`--image` and inherited
   `PI_DOCKER_IMAGE` as an input), helper image propagation, and image
   recording/replay. Reject obsolete `--image` invocations with a clear error.
   Select local custom if available, otherwise base; pass that freshly selected
   result internally to Compose, not as a persisted preference. Distinguish
   custom-image absence from Docker/daemon inspection failure and report
   operational failures rather than treating them as evidence of absence.
   Update launcher help, tests, and documentation accordingly.

Deliverable: a manually created or Herdr-created linked worktree can be launched
with the existing `pi <workspace> --name <name>` interface and normal Git works
inside the container.

## Phase 3: Validate persistence and Herdr restore

1. Retain the exact canonical selected directory (including any selected
   subdirectory) in the new launch records, not just the checkout root. Rediscover
   the checkout root/metadata when needed; avoid duplicating Herdr's workspace
   grouping or worktree registry.
2. On restore, validate only what currently exists at the recorded path and
   rebuild the required mounts. Do not record a launch-type flag or historical
   checkout identity. A valid replacement checkout at the same path is accepted;
   a directory no longer recognized as Git is treated as an ordinary directory,
   accepting that deleted worktree metadata may go undetected. If discovery
   identifies Git metadata but required paths are invalid or inaccessible, fail
   clearly rather than repair or ignore the discovered mount requirements.
3. Use image-independent conversation storage identity for the current
   base/custom image pattern. Resume/restore must select custom if locally
   available, otherwise base, without replaying a recorded image. Adding or
   removing the custom image must not change which conversation is resumed.
   Replace the current image-aware Herdr storage keys and launch records with
   an image-agnostic format. Backward compatibility with older conversations,
   launch records, and restore references is explicitly out of scope; do not
   implement migration, aliases, or compatibility loaders. Reject unsupported
   old restore references clearly rather than silently starting replacements.
   This change does not require deleting old conversation files or introducing
   a separate physical storage namespace to isolate them. The sole current
   user accepts the transient risk that discovery in reused session directories
   may encounter older conversations. Do not add migration or isolation
   machinery to address this transition.
4. A missing workspace directory or invalid/inaccessible discovered Git metadata
   must produce an actionable error, not a new checkout or replacement
   conversation. A surviving directory with no recognized Git metadata may
   launch as an ordinary directory, as described above.
5. Verify that closing Pi or its container leaves the worktree intact and that
   Herdr workspace close versus worktree removal retains Herdr's own semantics.

Deliverable: continuation and native Herdr restore use the same worktree and
conversation reliably.

## Phase 4: Add thin isolated-helper orchestration

1. Extend the deployment-owned `pi-docker-herdr` skill and its existing Node
   adapter (`skills/pi-docker-herdr/scripts/herdr-helper.js`) with explicit
   shared-checkout and isolated-worktree modes. Keep shared sibling helpers as
   the default unless isolation is requested.
2. For isolated helpers, call Herdr's worktree create/open interface with an
   explicit parent source workspace or host checkout path. If the caller is in
   a linked worktree, obtain the parent through Herdr list/provenance first.
   Preserve caller context; never substitute container `/workspace` for a host
   path. Create already opens/groups the workspace and supplies a root pane;
   do not add a redundant open or sibling split.
3. Delegate branch/base defaults, dirty-checkout handling, detached/unborn HEAD
   behavior, branch collisions, and existing-worktree reuse semantics to Herdr.
   Pass explicit user choices through its verified supported interface;
   otherwise use Herdr's defaults. Do not independently resolve a base commit
   or implement parallel Git creation/recovery policy. Surface Herdr's errors
   and required user decisions; never automatically force, stash, commit,
   transfer edits, reset, or switch an existing worktree.
4. Use the workspace, checkout path, and root pane returned/discovered through
   Herdr. Inspect availability, especially when open returns `already_open`;
   never assume its root pane is an empty shell or replace an occupant. Start
   the host Docker-Pi launcher through `agent start --kind pi` in an available
   returned/discovered pane, passing the selected host directory. Stop and report
   if no suitable pane is available rather than inventing extra topology. The
   host `pi` command must resolve to this launcher.
5. Preserve focus. Explain that Herdr-managed worktrees open as grouped
   workspaces rather than sibling panes; reject conflicting topology options
   clearly instead of silently ignoring them.
6. Let the host launcher select custom if locally available, otherwise base;
   do not forward an image choice from the caller. Reuse existing readiness
   checks and prompt/read/wait behavior.
7. Use lightweight per-step receipts for create, open, start/resume, and remove,
   distinguishing not attempted, uncertain, confirmed success, and confirmed
   failure. Retain returned worktree/workspace identities, checkout path, pane
   identity, and agent identity immediately when known. On any failure or
   timeout, stop and report confirmed results and uncertain outcomes, leaving
   successful resources available. No automatic recovery, retries, rollback,
   resource deletion, or agent replacement; inspect known state before an
   explicitly requested recovery.
8. Never automatically retry ambiguous mutations, force repository trust,
   replace agents, close workspaces, or remove worktrees. Inspect known state
   before recovery. No automatic cleanup or branch deletion.
9. Provide a skill-driven open/resume workflow for an existing worktree. Unless
   the user specifies a conversation, resume the most recently updated
   conversation across all storage names for the exact canonical selected
   directory; if none exists, start a fresh conversation. For a root selection,
   exclude conversations launched in subdirectories; for a subdirectory selection,
   exclude root, parent, child, and sibling-directory conversations. Discover
   history independently of the new helper's agent name and reuse the selected
   conversation's original storage location. `--name` remains a storage selector, not a worktree selector.
   Use best-effort discovery: accept Pi's behavior of skipping unusable history
   and starting fresh if no usable conversation is found, even when unreadable
   or invalid history exists. Do not add strict history validation machinery.
   An explicitly requested missing/unusable conversation or an invalid checkout
   must still fail clearly rather than silently select another conversation.
   Use the launcher's image-agnostic storage and automatic custom/base selection.
10. For an explicit user request to remove a worktree, identify the exact target
   and its open Herdr-managed linked-worktree workspace ID; removal takes that
   ID, not a checkout path. If a closed target must be opened first, treat that
   as an explicit receipted step under the requested removal workflow. Check
   Herdr's documented safety requirements. Report its result without adding
   forced removal, branch deletion, or Docker-Pi conversation/launch-record
   cleanup. Do not
   retry an ambiguous removal automatically.

Deliverable: the `pi-docker-herdr` skill orchestrates worktree create/open,
Docker-Pi start/resume, and explicit removal through Herdr without duplicating
Herdr lifecycle management. Manual commands remain a fallback, not the normal
user workflow.

## Phase 5: Tests and documentation

### Automated tests

- Preserve launcher, layout, helper, diagnostics, and restore coverage for the
  supported base/custom workflows. Replace tests for intentionally removed
  image overrides, image propagation/replay, and older conversation formats;
  those behaviors are not compatibility requirements.
- Test rejection of obsolete `--image` inputs, ignoring inherited image
  preferences, and differentiation of custom absence from Docker inspection
  failures. Verify launch/helper changes need neither host Python nor
  custom-image-only tools.
- Test custom-if-available/base-otherwise selection for ordinary launches,
  helpers, and resume/restore. Verify that image metadata is neither propagated
  from callers nor replayed from launch records.
- Test image-independent conversation identity when custom becomes available or
  is removed. Test clear rejection of unsupported old restore references;
  backward compatibility and migration of older conversations are not required.
- Use real temporary Git repositories for checkout discovery and Git-pointer
  tests, including regular checkouts, linked worktrees, separate Git directories,
  subdirectories, spaces, symlinks, and a main checkout outside the selected
  worktree directory. Cover nested worktrees, metadata deduplication, and literal
  pointer paths that differ from canonical discovery paths.
- Without host Git, test ordinary-directory launch/restore success and rejection
  of `.git` files/directories/symlinks in any ancestor, including dangling markers
  and inspection failures. Apply the same rules with and without Herdr. Verify
  help/local diagnostics need no Git and the preferred path needs no host Node.
- Test reserved destination equality/ancestor/descendant checks, runtime and
  deployment collisions, and component boundaries (`/runaway` is not `/run`).
- Test missing metadata, unsupported path collisions, and invalid restore paths.
  Verify restore accepts a valid checkout recreated at the recorded path and
  treats a surviving directory with no recognized Git metadata as ordinary,
  and rejects invalid/inaccessible discovered metadata. No launch-type flag or
  historical identity checks are required.
- Test generated mount configuration and working-directory selection.
- Test rewind capture/restore in two distinct linked worktrees using custom:
  restoring one must not change the other's files or either real Git index.
  Verify index preservation during capture as well as restore, with staged,
  unstaged, and untracked files. Exercise concurrent snapshot creation against
  the shared rewind store ref and surface bounded-retry exhaustion clearly.
  Test the actual hook version shipped in the image; account for its documented
  snapshot-domain limits rather than promising coverage of ignored files, empty
  directories, or unsupported submodule states.
- Test rewind metadata across conversation resume and custom/base/custom
  launches; base must resume the same conversation without requiring the hook.
  Verify still-available checkpoints can be restored after returning to custom.
  Exercise configured retention in disposable settings, including shared-ref
  effects across worktrees and missing/pruned checkpoints: resume must still
  work, and unavailable rewind points must not be offered as successful restores.
  Do not silently edit shared user configuration or require indefinite snapshot
  preservation.
- Test helper create/open success, parent-source discovery from linked callers,
  create's combined checkout/open behavior without redundant mutations, supported
  branch/base options, and existing-checkout reuse through open (not an invented
  reuse flag). Cover occupied already-open panes, Herdr defaults/errors, unavailable
  API features, partial startup failures, ambiguous timeouts, and preservation of
  returned identities without parallel Git policy or forced recovery.
- Test open/resume selects the most recently updated conversation across all
  storage names for the exact selected directory when none is specified, including
  a reopened helper whose agent name differs from the original. Assert that root,
  parent, child, and sibling-directory history is not pooled. Verify reuse of
  the selected conversation's original storage location, explicit selection,
  and fresh start when no usable conversation is found. Cover best-effort
  fallback with unreadable/invalid history; explicit missing/unusable
  conversations must fail clearly rather than silently select another.
- Test per-step receipts for create/open/start/resume/remove, retaining returned
  identities immediately and distinguishing confirmed failures from uncertain
  outcomes. Assert stop-and-report behavior without retries, rollback, cleanup,
  or replacement after partial failure or timeout.
- Assert no unintended mutation during help/diagnostics, no implicit worktree
  recreation/removal, and no automatic resend/retry after ambiguous delivery.
- Test explicit removal delegation to Herdr, retention of conversations and
  launch records, and clear restore failure for a removed checkout. Verify no
  added force/branch-deletion behavior or automatic retry after ambiguous removal.

### Host-side integration checks

Docker is unavailable inside the agent container. Run Docker integration checks
on a Linux host with the deployment launcher and a compatible Herdr server.
Use an explicitly created disposable test session, not the user's live work.

- Verify host Herdr CLI/server versions and host `pi` launcher resolution. Exercise
  create/open/remove in a disposable Herdr session, including linked-source parent
  discovery, focus preservation, already-open occupied panes, and dirty-removal
  refusal without force.
- Validate effective merged Compose mounts, missing-source failure without source
  creation, reserved-path rejection, and selected-subdirectory working directories.
- In a linked-worktree container, verify `git status`, diff, add, commit, log,
  and worktree listing with Git metadata paths accessible. Verify separate-Git-dir
  support and that the original checkout's source files need not be exposed.
- Run two writing agents in separate worktrees; verify working files and indexes
  remain separate and both branches are visible for deliberate integration.
- Verify ordinary launches and read-only/shared-checkout helper workflows.
- Verify continuation, exit/relaunch, and native restore; test a missing checkout
  without silently creating a replacement.
- Confirm container exit does not delete a worktree. Leave removal and branch
  lifecycle to Herdr/user actions.
- With custom, run two agents in distinct worktrees, create checkpoints
  concurrently, restore available checkpoints independently, and verify real
  indexes remain unchanged. Exercise configured retention and verify clear
  handling of unavailable checkpoints without breaking conversation resume.
  Verify custom/base/custom switching preserves the conversation; in the
  image-owned setup, turns run in base have no newly captured rewind checkpoints.

### Documentation

Update `README.md`, `docs/USAGE.md`, `docs/SETUP.md`,
`docs/CUSTOMIZATION.md`, `docs/HERDR_INTEGRATION.md`, `docs/AGENTS.md`,
image-owned agent instructions as applicable, and
`skills/pi-docker-herdr/SKILL.md`. Document:

- Skill-driven worktree create/open/start/resume/remove as the normal workflow;
  manual Herdr creation and Docker-Pi launch as fallback/debugging steps.
- Automatic custom-if-available/base-otherwise selection, with no image
  overrides, caller-image propagation, or recorded-image replay.
- Image-independent conversation identity, no backward compatibility with older
  formats, latest usable conversation across all names for the exact canonical
  selected directory (not the whole worktree), and best-effort fallback to fresh
  when no usable conversation is found.
- Partial-success receipts and explicit recovery after inspecting known state;
  no automatic recovery or cleanup.
- Shared versus isolated helpers and their different topology.
- Actual container working directories, whole-checkout mounts for selected
  subdirectories, required Git metadata mounts, and the reserved-path policy.
- Optional host Git and conservative no-Git ancestor scanning; detected Git
  markers require Git, regardless of Herdr mode. Bash/Git host preparation is
  preferred; document a host Node prerequisite only if the agreed fallback is used.
- Image-owned rewind support in custom and absence in base. Rewind is intended
  for recent conversations, and configured retention may clean up snapshots,
  including those referenced by other worktrees. Saved conversation history does
  not guarantee snapshot availability. Snapshot objects live in shared Git
  metadata; worktree removal does not perform additional snapshot cleanup.
- Restore prerequisites and explicit worktree removal through Herdr. Saved
  conversations and launch records remain after removal; restore fails clearly
  while the recorded checkout is missing.
- Shared Git metadata/refs and credentials are not security-isolated; host ports
  and other external resources still require coordination.
- One coordinator/user should deliberately merge or cherry-pick agent commits;
  worktrees prevent edit collisions, not semantic merge conflicts.

## Acceptance criteria

1. Docker-Pi can run in an existing linked worktree without rewriting Git
   metadata or requiring the original checkout's source files to be mounted.
2. Normal Git operations work inside the container. Distinct selected worktrees
   have separate working files and Git indexes under the supported mount layout.
   This is not security isolation and does not prevent shared-checkout helpers,
   deliberate access, or two launches selecting the same checkout; Git refs,
   metadata, credentials, and configuration remain shared.
3. Herdr remains the only automated worktree lifecycle manager.
4. Ordinary launches, session naming, and shared helpers work with automatic
   custom/base selection and image-independent conversation identity. Removed
   image-selection behavior and older conversation formats need not be preserved.
5. Explicit Pi conversation resume and native Herdr restore use the recorded
   workspace path and intended conversation or fail clearly when required state
   is missing. Validate only the current directory/Git state, without historical
   identity or launch-type checks. Unqualified resume uses the best-effort
   conversation-selection policy below.
6. Isolated helper startup preserves focus and reports durable identities after
   partial failure, with no destructive cleanup or blind retries.
7. The skill provides create/open/start/resume/remove workflows. Unqualified
   resume selects the latest usable conversation across all storage names for
   the exact canonical selected directory, without pooling history from other
   directories in that worktree, with best-effort fallback to a fresh conversation
   when none is found. An explicit missing/unusable conversation or invalid
   checkout fails clearly. Explicit removal delegates to Herdr and retains saved
   conversations and launch records.
8. Host Git is not a universal launch prerequisite: non-Git directories may launch
   without it only after a successful marker-free ancestor scan. Git-marked or
   uninspectable selections fail clearly without Git, with or without Herdr and
   on restore. Host preparation remains simple Bash/Git or uses the agreed,
   explicitly reported host-Node fallback; neither path requires host Python.

## Recommended delivery order

Implement and validate existing-worktree mounting and restore first (Phases
1–3), using manual Herdr launches as an integration milestone. Then implement
skill-driven lifecycle orchestration (Phase 4). This ordering is an engineering
sequence, not a reduction in scope: create/open/start/resume/remove automation
is required to complete the plan, and manual commands are only a fallback.
Phase 5 tests and documentation accompany each increment rather than waiting
until the end. Subdirectory semantics, exact-directory history scope, shared Git
permissions, reserved-path policy, optional host Git, and the Bash-first/Node-
fallback approach are settled above. Phase 1 must turn the verified Herdr contract
and exploratory Git checks into a tested mount contract, with host-only checks
clearly tracked until a disposable Docker/Herdr environment is available.
