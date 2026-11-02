# Everyday usage

Run on the **host** after [setup](SETUP.md). `pi` must resolve to this
repository's launcher, not a host-native Pi installation.

## Launching

```bash
pi ~/repos/project
pi ~/repos/project --image pi-docker:custom --name reviewer --herdr
pi ~/repos/project --no-herdr -- --continue
pi ~/repos/project -- --resume
pi ~/repos/project --no-herdr -- --version
```

An explicit existing workspace comes first; otherwise the current directory is
mounted at `/workspace`. Put launcher options before Pi arguments:

| Option | Effect |
|---|---|
| `--name NAME` | Select conversation storage, not the conversation title or Herdr agent name |
| `--image IMAGE` | Override `PI_DOCKER_IMAGE` and automatic selection; use `--image pi-docker:base` to force base |
| `--no-host-gitconfig` | Omit the host's readable `~/.gitconfig` |
| `--herdr` | Require integration; abort if unavailable |
| `--no-herdr` | Skip integration preparation and socket exposure |
| `--herdr-status` | Read-only local diagnostics; no live API check |
| `--help` | Launcher help, without Docker |
| `--` | Forward remaining arguments unchanged to Pi |

`--name` accepts letters, digits, dots, underscores, and hyphens. It defaults to
the workspace basename; supply a name if that basename contains other characters.
Without an override, the launcher uses local `pi-docker:custom` if available,
otherwise `pi-docker:base`. Select only built images; the launcher does not build
or pull them. To pin the default:

```bash
export PI_DOCKER_IMAGE=pi-docker:custom
```

See [image builds and customization](CUSTOMIZATION.md#two-images).

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
Use separate Git worktrees for concurrent writing agents.

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
