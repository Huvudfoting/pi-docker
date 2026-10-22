## Using Pi with Docker

Pi runs inside isolated Docker containers, allowing you to work on multiple projects simultaneously without installing Pi directly on your host.
Extensions are built into the image, loaded by the launcher and avvailable in all instances.

Each Pi instance has:
- **Its own workspace** — the project directory Pi can access and modify.
- **Its own session storage** — conversations and their history are kept separate.
- **Shared configuration** — all instances use the same models, settings, skills, cloud model authentication and .gitconfig
- **Access to Ollama** — local models run through the shared Ollama container.

Containers are temporary. Your projects, configuration, and sessions persist on the host.

> **New to pi-docker?** See [SETUP.md](SETUP.md) for instructions on installing and configuring pi-docker, including Docker, authentication, and Ollama integration.
>
> This guide covers everyday usage: starting Pi, managing workspaces and sessions, running multiple instances, and switching models.


### Starting Pi

Open a terminal in any project directory and run:

```bash
cd ~/repos/my-project
pi
```

Pi starts in a new Docker container with the current directory mounted as `/workspace`.

You can also specify a workspace explicitly:

```bash
pi ~/repos/my-project
```

Both commands start Pi with access to the same project files.

### Working with sessions

By default, Pi uses the workspace directory name to identify its session storage.

For example:

```bash
pi ~/repos/project-a
pi ~/repos/project-b
```

Each project gets independent session storage, so conversations from one project won't interfere with another.

**Sessions are persistent.** Exiting Pi removes its Docker container but does not delete its conversation history.

Running the same command again gives Pi access to the same session storage. 
Use Pi's built-in session commands to resume previous conversations.

### Running multiple Pi instances

You can run several Pi instances simultaneously, each in its own terminal.

For example:

**Terminal 1:**
```bash
pi ~/repos/project-a
```

**Terminal 2:**
```bash
pi ~/repos/project-b
```

Each instance runs in a separate Docker container with its own workspace and sessions.

Both share the same model configuration and authentication, so you can use ChatGPT or Ollama independently in either instance.

### Named sessions

Use `--name` to create separate session storage for different tasks within the same project:

```bash
pi ~/repos/my-project --name backend
pi ~/repos/my-project --name frontend
```

This creates two independent Pi environments:

| Instance | Workspace | Session storage |
|---|---|---|
| backend | my-project | backend |
| frontend | my-project | frontend |

The `--name` option selects the launcher's session directory. It does not rename a conversation inside Pi.

You can restart either instance later using the same command.

**Important:** Named instances still share the same project files. If both agents modify the same files simultaneously, 
their changes may conflict. Use separate Git worktrees when running multiple agents that write to the same repository.

### Switching models

Inside Pi, use:

```text
/model
```

Select any configured model, including:

- Local Ollama models.
- ChatGPT models available through your authenticated subscription.

All Pi instances share the same model configuration, but each can select and use models independently.

Local inference is handled by the existing Ollama container. Starting additional Pi containers does not start additional Ollama servers.

### Exiting Pi

Exit Pi normally using:

```text
/exit
```

The Pi container is automatically removed.

Your workspace files, configuration, authentication, and session history remain intact.

### Quick reference

| Command | Description |
|---|---|
| `pi` | Start Pi in the current directory |
| `pi ~/repos/project-a` | Start Pi in a specific workspace |
| `pi --name backend` | Use a named session directory in the current workspace |
| `pi ~/repos/project-a --name frontend` | Use a named session directory in a specific workspace |
| `/model` | Switch between available AI models |
| `/exit` | Exit Pi and remove its temporary container |

**In short:** Navigate to a project, type `pi`, and start working. Use `--name` when you want independent sessions 
for different tasks, and separate workspaces or Git worktrees when you want multiple agents working concurrently.
