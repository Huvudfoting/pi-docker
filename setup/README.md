# Using Pi with Docker

Run Pi in disposable containers with persistent projects, configuration, and
sessions. Local inference uses the shared Ollama service; starting Pi does not
start another model server.

- [Initial installation](SETUP.md)
- [OpenAI/provider login and GitHub authentication](AUTHENTICATION.md)
- [Extensions, resource paths, and maintenance](CUSTOMIZATION.md)
- [Herdr integration and diagnostics](HERDER_INTEGRATION.md)

## Launching

After [initial setup](SETUP.md), build the image on the host from this
deployment's repository root:

```bash
docker build -t pi-agent:latest ./setup/pi
```

Run these commands on the host after installing the launcher. If the image is
missing, `pi` prints the build command and repository directory to use.

| Command | Action |
|---|---|
| `pi` | Mount the current directory as `/workspace` |
| `pi ~/repos/project-a` | Mount a specific project |
| `pi --name backend` | Use separate session storage in the current project |
| `pi ~/repos/project-a --name frontend` | Select both project and session storage name |
| `pi --help` | Show launcher usage without Docker |
| `pi -- --help` | Show Pi's own help (not launcher help) |
| `pi -- --version` | Show Pi's version through Docker using the current workspace |
| `pi --no-herdr` | Launch without Herdr preparation or socket access |
| `pi --herdr` | Require Herdr support; fail if preparation fails |
| `pi --herdr-status` | Read-only local Herdr diagnostics without Docker or installation |

Put an explicit workspace first, then launcher options (`--name`, `--herdr`,
`--no-herdr`, or `--herdr-status`), before Pi arguments. Use `--` to pass remaining
arguments directly to Pi.

## Sessions and parallel work

The launcher stores sessions under `data/sessions/<name>-<path-hash>/`. The name
defaults to the workspace directory name; the hash distinguishes absolute paths.
Run the same command again to access that storage, then use Pi's session commands
to resume a conversation. `--name` selects storage, not a conversation title.

Multiple terminals can run separate containers. Identical workspace/name
selections share session storage; use different names for separate storage.
All containers share `data/config/` for settings, models, resources, and
authentication, plus the host's read-only `.gitconfig` and read-only
`data/gh-config/` GitHub CLI configuration.

Use separate Git worktrees for concurrent writing agents. See
[security and concurrency](SETUP.md#security-and-concurrency) for shared-state risks.

## Herdr

Eligible interactive launches inside a local Linux Herdr pane automatically
enable reporting/native restore and install/update the official integration when
needed. Enabled launches print a notice: the socket grants control of the entire
connected Herdr session, including other panes. Use only with trusted containers.

Use `--no-herdr` to disable preparation and socket access, or `--herdr` to require
support rather than warn and fall back if preparation fails. Headless and
maintenance invocations do not auto-enable support. See
[Herdr integration](HERDER_INTEGRATION.md) for requirements, restore, and diagnostics.

## GitHub CLI

`gh` is available through Pi's shell tool for issues, PRs, and GitHub API queries.
Optional private repository authentication uses a read-only mount of
`data/gh-config/`; see [GitHub authentication](AUTHENTICATION.md#github-cli-optional).
For example, ask Pi to run `gh issue list`, `gh issue view 123`, or `gh pr checks`.
Agree on confirmation rules before allowing remote changes such as posting
comments, closing issues, or merging PRs. Installing `gh` does not automatically
configure Git pushes.

## Inside Pi

- `/model`: select a configured local or cloud model independently per instance.
- `/exit`: exit Pi and remove its temporary container, retaining host data.
- `/reload`: reload changed settings and mounted resources in that session.

Deployment guides and source are readable at `/opt/pi-docker` inside the container.
For reload/rebuild rules, see [applying changes](CUSTOMIZATION.md#applying-changes).
