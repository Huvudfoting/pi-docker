# Everyday usage

Run on the **host** after [setup](SETUP.md). `pi` must resolve to this
repository's launcher, not a host-native Pi installation.

## Launching

```bash
pi ~/repos/project
pi ~/repos/project --name reviewer --herdr
pi ~/repos/project --no-herdr -- --continue
pi ~/repos/project -- --resume
pi ~/repos/project --no-herdr -- --version
```

An explicit existing workspace comes first; otherwise the current directory is
selected. Ordinary directories and conventional self-contained checkouts use
`/workspace`. Linked/external-metadata checkouts preserve absolute host paths,
mount the whole checkout plus required Git metadata, and start in the exact
selected subdirectory. Put launcher options before Pi arguments:

| Option | Effect |
|---|---|
| `--name NAME` | Select conversation storage, not the conversation title or Herdr agent name |
| `--no-host-gitconfig` | Omit the host's readable `~/.gitconfig` |
| `--herdr` | Require integration; abort if unavailable |
| `--no-herdr` | Skip integration preparation and socket exposure |
| `--herdr-status` | Read-only local diagnostics; no live API check |
| `--help` | Launcher help, without Docker |
| `--` | Forward remaining arguments unchanged to Pi |

`--name` accepts letters, digits, dots, underscores, and hyphens. It defaults to
the workspace basename; supply a name if that basename contains other characters.
Every launch, helper start, and restore selects local `pi-docker:custom` if
available, otherwise `pi-docker:base`. `--image` is rejected; inherited
`PI_DOCKER_IMAGE` is ignored. Image lookup/daemon errors abort, not silently fall
back. The launcher does not build or pull images. See
[image builds and customization](CUSTOMIZATION.md#two-images).

Host Git 2.31+ is required when a `.git` marker exists in any ancestor, including
a dangling symlink. Without Git, ordinary directories launch only after a
successful marker-free ancestor scan; help and local diagnostics need no Git.
Invalid metadata, unsafe mount destinations, and unavailable pointer paths fail
clearly without creating or repairing a checkout. See [mount policy](SETUP.md#worktree-mount-policy).

## Inside Pi

- `/login` authenticates; `/model` selects a model.
- `/reload` refreshes mounted extensions and skills.
- `/quit` exits Pi and removes its container, retaining host state.

Image-owned tools/resources need a rebuild, not just `/reload`.
See [change handling](CUSTOMIZATION.md#applying-changes).

## Conversations and concurrency

Storage is `data/sessions/<name>-<workspace-path-hash>/`. Launching again selects
that storage; `--continue` or `--resume` reopens a conversation. Different names
separate storage, **not files**. Changing images also does not isolate storage.
Use separate Git worktrees for concurrent writing agents. `--name` does not
create or select a worktree; select its directory explicitly. Container exit
never removes it. Unqualified cross-name conversation discovery/isolated-helper
creation is not implemented yet; the existing named storage remains in effect.

All images share configuration, credentials, extensions, and skills in
`data/config/`. Avoid concurrent configuration writes; see [mounts and security](SETUP.md).

## Herdr and GitHub

Eligible interactive launches inside Herdr auto-enable integration and print a
full-session-access notice. Ask, for example, “Start a helper named reviewer” or
“Ask reviewer to review the diff.” See [Herdr](HERDR_INTEGRATION.md) for
requirements, fallback behavior, and restore. Detach with **Ctrl+B, then Q** to
leave agents running; this deployment has no shutdown helper.

Use `gh` through Pi's shell tool; specify `--repo OWNER/REPO` outside a checkout.
Confirm remote mutations before posting, closing, or merging. GitHub credentials
are optional and do not automatically configure Git pushes; see [authentication](AUTHENTICATION.md).
