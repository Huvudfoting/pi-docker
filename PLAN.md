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
- Preserve ordinary launches and existing shared-checkout helpers.
- Worktrees isolate working files, not security permissions, Git refs, host
  ports, databases, credentials, or shared configuration.
- Never delete a worktree on container exit, failed agent startup, or restore.

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
   Account for mount overlap, symlinks, spaces, and collisions with reserved
   container paths. Reject unsupported layouts clearly rather than mounting
   broad host directories or rewriting Git metadata.
6. Keep the existing `/workspace` layout for ordinary launches. Decide and
   document how an explicitly selected subdirectory of a linked worktree maps
   to the mounted checkout while preserving that selected working directory.

Deliverable: a tested mount contract and confirmed Herdr API contract.

## Phase 2: Launch existing linked worktrees correctly

1. Add host-side Git discovery and mount preparation to the launcher, preferably
   in a small dedicated helper rather than expanding Herdr-specific code.
2. Make Compose working-directory and mount selection configurable. Use safe
   argument/structured configuration handling for paths; do not interpolate
   untrusted paths into shell commands or hand-built YAML.
3. Preserve host workspace metadata passed to helpers and the existing
   path/name-based Pi session storage selection.
4. Update agent instructions and deployment documentation: `/workspace` is the
   ordinary default, not a universal project path; use the actual working
   directory and supplied host workspace metadata.
5. Fail clearly on missing or inaccessible metadata. Do not repair, relocate,
   or recreate worktrees implicitly.

Deliverable: a manually created or Herdr-created linked worktree can be launched
with the existing `pi <workspace> --name <name>` interface and normal Git works
inside the container.

## Phase 3: Validate persistence and Herdr restore

1. Retain the actual selected checkout path in existing launch records; avoid
   duplicating Herdr's workspace grouping or worktree registry.
2. On restore, rediscover and validate Git metadata and rebuild the required
   mounts before starting Pi.
3. Preserve conversation storage identity and current continuation/resume
   behavior. Version restore records only if their format actually must change.
4. Missing checkout, invalid metadata, or removed worktree must produce an
   actionable error, not a new checkout or replacement conversation.
5. Verify that closing Pi or its container leaves the worktree intact and that
   Herdr workspace close versus worktree removal retains Herdr's own semantics.

Deliverable: continuation and native Herdr restore use the same worktree and
conversation reliably.

## Phase 4: Add thin isolated-helper orchestration

1. Extend the deployment-owned `docker-pi-herdr` helper workflow with explicit
   shared-checkout and isolated-worktree modes. Keep shared sibling helpers as
   the default unless isolation is requested.
2. For isolated helpers, call Herdr's worktree create/open interface with an
   explicit source workspace or host checkout path. Preserve caller context;
   never substitute container `/workspace` for a host path.
3. Expose branch/base selection and explicit existing-worktree reuse. Default
   new work to the caller checkout's committed `HEAD`, resolved explicitly.
   Explain that uncommitted edits are not copied; do not silently stash, commit,
   or transfer them. Never reset or switch an existing worktree implicitly.
4. Use the workspace, checkout path, and available root pane returned/discovered
   through Herdr, then start the host Docker-Pi launcher with `--kind pi` and the
   selected workspace. The host `pi` command must resolve to this launcher.
5. Preserve focus. Explain that Herdr-managed worktrees open as grouped
   workspaces rather than sibling panes; reject conflicting topology options
   clearly instead of silently ignoring them.
6. Reuse existing readiness checks and prompt/read/wait behavior.
7. Extend receipts to capture each successful stage: worktree/workspace identity,
   checkout path, pane identity, and agent identity when known. If startup fails,
   report partial success and leave the checkout/workspace available.
8. Never automatically retry ambiguous mutations, force repository trust,
   replace agents, close workspaces, or remove worktrees. Inspect known state
   before recovery. No automatic cleanup or branch deletion.

Deliverable: an explicitly requested isolated helper starts Docker-Pi in a
Herdr-managed worktree without duplicating Herdr lifecycle management.

## Phase 5: Tests and documentation

### Automated tests

- Preserve existing launcher, layout, helper, diagnostics, and restore tests.
- Use real temporary Git repositories for checkout discovery and Git-pointer
  tests, including regular checkouts, linked worktrees, subdirectories, spaces,
  symlinks, and a main checkout outside the selected worktree directory.
- Test missing metadata, unsupported path collisions, and invalid restore paths.
- Test generated mount configuration and working-directory selection.
- Test helper create/open success, existing-worktree reuse, explicit base
  selection, unavailable API features, partial startup failures, ambiguous
  timeouts, and preservation of returned identities.
- Assert no unintended mutation during help/diagnostics, no implicit worktree
  recreation/removal, and no automatic resend/retry after ambiguous delivery.

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

### Documentation

Update `README.md`, `setup/README.md`, `setup/docs/SETUP.md`,
`setup/docs/HERDR_INTEGRATION.md`, agent instructions, and the deployment-owned
helper skill as needed. Document:

- Manual Herdr worktree creation followed by Docker-Pi launch.
- Automated isolated-helper creation/opening and recovery from partial success.
- Shared versus isolated helpers and their different topology.
- Actual container working directories and required Git metadata mounts.
- Restore prerequisites and explicit cleanup through Herdr.
- Shared Git metadata/refs and credentials are not security-isolated; host ports
  and other external resources still require coordination.
- One coordinator/user should deliberately merge or cherry-pick agent commits;
  worktrees prevent edit collisions, not semantic merge conflicts.

## Acceptance criteria

1. Docker-Pi can run in an existing linked worktree without rewriting Git
   metadata or requiring the original checkout's source files to be mounted.
2. Normal Git operations work inside the container, and separate agents cannot
   accidentally edit the same working files through their selected checkouts.
3. Herdr remains the only automated worktree lifecycle manager.
4. Existing ordinary launches, session naming, and shared helpers still work.
5. Pi continuation and Herdr restore reopen the same checkout/conversation or
   fail clearly when required state is missing.
6. Isolated helper startup preserves focus and reports durable identities after
   partial failure, with no destructive cleanup or blind retries.

## Recommended delivery order

Ship existing-worktree mounting and manual Herdr usage first (Phases 1–3), with
the corresponding tests and documentation. Add isolated-helper convenience
(Phase 4) only after the mount and restore contract is validated. Phase 5 tests
and documentation accompany each increment rather than waiting until the end.
