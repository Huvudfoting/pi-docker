# Using Pi with Docker

Run Pi in disposable containers with persistent projects, configuration, and
sessions. Local inference uses the shared Ollama service; starting Pi does not
start another model server.

- [Initial installation and authentication](SETUP.md)
- [Extensions, resource paths, and maintenance](CUSTOMIZATION.md)

## Launching

Build the image once before launching Pi:

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
| `pi -- --version` | Forward a Pi CLI argument without selecting a workspace |

`--name` is a launcher option; put it before Pi arguments. Use `--` to pass
remaining arguments directly to Pi.

## Sessions and parallel work

The launcher stores sessions under `data/sessions/<name>-<path-hash>/`. The name
defaults to the workspace directory name; the hash distinguishes absolute paths.
Run the same command again to access that storage, then use Pi's session commands
to resume a conversation. `--name` selects storage, not a conversation title.

Multiple terminals can run separate containers. Each has its own session storage
selection, but all share `data/config/` for settings, models, resources, and
authentication, plus the host's read-only `.gitconfig`.

Use separate Git worktrees for concurrent writing agents. See
[security and concurrency](SETUP.md#security-and-concurrency) for shared-state risks.

## Inside Pi

- `/model`: select a configured local or cloud model independently per instance.
- `/exit`: exit Pi and remove its temporary container, retaining host data.
- `/reload`: reload changed settings and mounted resources in that session.

Deployment guides and source are readable at `/opt/pi-docker` inside the container.
For reload/rebuild rules, see [applying changes](CUSTOMIZATION.md#applying-changes).
