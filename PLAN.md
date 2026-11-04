# Plan: Herdr-managed worktrees for Docker-Pi

## Goal

Allow multiple Docker-sandboxed Pi agents to write concurrently in separate
Herdr-managed Git worktrees. Herdr owns worktree creation, opening, grouping, and
removal. Docker-Pi owns container mounts, Pi session persistence, restore, and a
thin helper-start orchestration layer.

## Scope and principles

- Support existing linked worktrees regardless of whether Herdr or Git created
  them; do not depend on Herdr's checkout directory layout.
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
- Worktrees isolate working files, not security permissions, Git refs, host
  ports, databases, credentials, or shared configuration.
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

## Phase 1: Verify interfaces and define mount behavior

1. Check the supported host/server Herdr versions and the pinned container CLI.
   Inspect installed help/API schema and upstream documentation for worktree
   create/open responses, workspace/root-pane IDs, checkout paths, and removal
   semantics. Do not guess JSON field names or upgrade/restart a live server.
2. Inspect the existing launcher, Compose configuration, restore records, helper
   script, and tests before changing them.
3. Define checkout discovery using Git on the host: checkout root, per-worktree
   Git directory, and Git common directory. Resolve paths explicitly; do not
   infer linked worktrees from directory names.
4. Use path-preserving mounts for linked-worktree launches: mount the selected
   checkout and Git common directory at their actual absolute host paths inside
   the container, and set the working directory to the selected workspace.
   Mount additional metadata paths only if discovery shows they are necessary.
5. Validate this design against Git's forward and reverse worktree pointers.
   Resolve symlinks and validate exact, ancestor, and descendant mount overlaps
   against reserved configuration, session, socket, and deployment targets
   (including `/pi`, `/run`, and `/opt/pi-docker`). Reject unsafe layouts with
   actionable errors rather than remapping paths, mounting broad host
   directories, or rewriting Git metadata. Deduplicate or reject checkout/Git
   metadata overlaps explicitly; do not rely on mount order.
6. Keep the existing `/workspace` layout for ordinary launches. Decide and
   document how an explicitly selected subdirectory of a linked worktree maps
   to the mounted checkout while preserving that selected working directory.

Deliverable: a tested mount contract and confirmed Herdr API contract.

## Phase 2: Launch existing linked worktrees correctly

1. Add host-side Git discovery and mount preparation to the launcher, preferably
   in a small dedicated helper rather than expanding Herdr-specific code.
   Do not add a host Python requirement or depend on custom-image tools;
   preserve minimal-base support. Extend the existing Node-built-ins-only
   adapter rather than introducing a parallel helper implementation.
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

1. Retain the actual selected checkout path in the new launch records; avoid
   duplicating Herdr's workspace grouping or worktree registry.
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
   explicit source workspace or host checkout path. Preserve caller context;
   never substitute container `/workspace` for a host path.
3. Delegate branch/base defaults, dirty-checkout handling, detached/unborn HEAD
   behavior, branch collisions, and existing-worktree reuse semantics to Herdr.
   Pass explicit user choices through its verified supported interface;
   otherwise use Herdr's defaults. Do not independently resolve a base commit
   or implement parallel Git creation/recovery policy. Surface Herdr's errors
   and required user decisions; never automatically force, stash, commit,
   transfer edits, reset, or switch an existing worktree.
4. Use the workspace, checkout path, and available root pane returned/discovered
   through Herdr, then start the host Docker-Pi launcher with `--kind pi` and the
   selected workspace. The host `pi` command must resolve to this launcher.
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
   conversation across all storage names for that exact worktree path; if none
   exists, start a fresh conversation. Discover history independently of the
   new helper's agent name and reuse the selected conversation's original
   storage location. `--name` remains a storage selector, not a worktree selector.
   Use best-effort discovery: accept Pi's behavior of skipping unusable history
   and starting fresh if no usable conversation is found, even when unreadable
   or invalid history exists. Do not add strict history validation machinery.
   An explicitly requested missing/unusable conversation or an invalid checkout
   must still fail clearly rather than silently select another conversation.
   Use the launcher's image-agnostic storage and automatic custom/base selection.
10. For an explicit user request to remove a worktree, use Herdr's removal
   interface after identifying the exact target and checking its documented
   safety requirements. Report Herdr's result without adding forced removal,
   branch deletion, or Docker-Pi conversation/launch-record cleanup. Do not
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
  tests, including regular checkouts, linked worktrees, subdirectories, spaces,
  symlinks, and a main checkout outside the selected worktree directory.
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
- Test helper create/open success, forwarding supported explicit branch/base
  and reuse choices, use of Herdr defaults, and clear propagation of Herdr
  errors without parallel Git policy or forced recovery. Cover unavailable API
  features, partial startup failures, ambiguous timeouts, and preservation of
  returned identities.
- Test open/resume selects the most recently updated conversation across all
  storage names for the exact worktree when none is specified, including a
  reopened helper whose agent name differs from the original. Verify reuse of
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

- In a linked-worktree container, verify `git status`, diff, add, commit, log,
  and worktree listing with Git metadata paths accessible.
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
  formats, latest usable conversation across all names for the exact worktree,
  and best-effort fallback to fresh when no usable conversation is found.
- Partial-success receipts and explicit recovery after inspecting known state;
  no automatic recovery or cleanup.
- Shared versus isolated helpers and their different topology.
- Actual container working directories and required Git metadata mounts.
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
   the exact worktree, with best-effort fallback to a fresh conversation when
   none is found. An explicit missing/unusable conversation or invalid checkout
   fails clearly. Explicit removal delegates to Herdr and retains saved conversations
   and launch records.

## Recommended delivery order

Implement and validate existing-worktree mounting and restore first (Phases
1–3), using manual Herdr launches as an integration milestone. Then implement
skill-driven lifecycle orchestration (Phase 4). This ordering is an engineering
sequence, not a reduction in scope: create/open/start/resume/remove automation
is required to complete the plan, and manual commands are only a fallback.
Phase 5 tests and documentation accompany each increment rather than waiting
until the end. Subdirectory-launch semantics and actual supported Herdr behavior
remain Phase 1 decisions based on verified interfaces.
