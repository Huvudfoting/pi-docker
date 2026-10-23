# Pi Docker + Ollama setup

Pi and Ollama are independent Compose projects sharing the explicitly named
`pi-ollama` network. Ollama creates it; Pi joins it as an external network.
Restarting Pi does not restart the GPU inference server.

**All commands below run on the host from the repository root unless stated otherwise.**
The repository root is the directory containing `setup/` and `data/`.

## Quick reference

| Task | Guide |
|---|---|
| First-time installation and authentication | This guide |
| Shared/project resource paths, packages, reload/restart/rebuild rules | [CUSTOMIZATION.md](CUSTOMIZATION.md#quick-reference) |
| Everyday launcher, workspace, and session usage | [README.md](README.md) |

Read only the guide relevant to your task. Resource-location and lifecycle tables
are maintained in CUSTOMIZATION.md rather than duplicated here.

## Requirements

- Docker Engine and the Compose plugin.
- NVIDIA Container Toolkit for the configured Ollama GPU service.
- Bash, GNU `realpath`, and `sha256sum` for the launchers.
- A host `~/.gitconfig` file (mounted read-only for Git identity and settings).

## Directory layout and persistence

| Host path | Container path | Purpose |
|---|---|---|
| `setup/` | `/opt/pi-docker` | Read-only, non-secret deployment source and guides |
| `data/config/` | `/pi/agent` | Shared writable settings, models, credentials, and resources |
| `data/sessions/<name>-<path-hash>/` | `/pi/sessions` | Writable session storage selected by the launcher |
| Selected project | `/workspace` | Writable project files |
| `~/.gitconfig` | `/home/node/.gitconfig` | Read-only Git settings |
| Model store selected in `data/ollama.env` | `/models` in Ollama | Persistent model files |

`data/` is ignored by Git. Keep credentials, sessions, and real environment files
there, never under `setup/`. The Pi image build context is only `setup/pi/`.
The additional setup mount is one directory bind mount; it adds no image size.
It exposes current host source, which may differ from the source used to build
the running image. Missing mount sources fail rather than being created silently.

Both launchers append `/opt/pi-docker/AGENTS.md` to the system prompt, making
these guides discoverable even when `/workspace` is a different repository.
Direct `docker run` invocations do not provide the mount or those instructions.

## 1. Start Ollama

```bash
mkdir -p data
cp setup/ollama/.env.example data/ollama.env
```

Edit `data/ollama.env` and set `OLLAMA_MODELS` to an absolute host model-store
path. Create that directory before starting the service, then run:

```bash
docker compose --env-file data/ollama.env -f setup/ollama/compose.yaml up -d
```

Other containers on the shared network reach `http://ollama:11434`. Only host
localhost port 11434 is published. Pull the models you want to use, for example:

```bash
docker exec ollama ollama pull qwen3.5:9b-q4_K_M
```

If you change `OLLAMA_NETWORK` in `data/ollama.env`, also export that same value
in the host shell before using `pi` or `pi-login`. The Pi launchers do not source
the Ollama environment file.

## 2. Build Pi and authenticate

```bash
chmod +x setup/bin/pi setup/bin/pi-login
./setup/bin/pi-login
```

This builds the image and starts Pi with `setup/` as its workspace, shared
configuration, login session storage, setup instructions, and the rewind
extension. Both launchers forward remaining CLI arguments to Pi.

Inside Pi, run `/login`, choose your provider, and complete its browser flow.
For a manual OAuth callback, paste the callback URL into Pi when prompted.
Authentication persists in `data/config/auth.json`, shared across instances.
Never commit or publish that file.

Configure compatible endpoints and local model IDs in `data/config/models.json`.
Use the installed Pi documentation for the schema supported by your version;
see [upstream documentation paths](CUSTOMIZATION.md#upstream-documentation).
Inside Pi, `/model` selects an available model.

## 3. Install the host launcher symlink

```bash
mkdir -p ~/.local/bin
ln -sfn "$(pwd)/setup/bin/pi" ~/.local/bin/pi
```

Ensure `~/.local/bin` is on your host `PATH`. Verify with:

```bash
ls -l ~/.local/bin/pi
pi -- --version
```

The launcher resolves symlinks to find this repository, independently of the
current workspace. See [README.md](README.md) for everyday usage and
[CUSTOMIZATION.md](CUSTOMIZATION.md) for subsequent configuration or maintenance.

## Security and concurrency

- Read-only prevents modification through `/opt/pi-docker`; it does not hide its
  contents. Do not put private files in `setup/`, even if Git ignores them.
- This mount does not restrict the existing `/pi/agent` credential access.
  Pi, extensions, and agent shell tools run as the same user and can generally
  read `auth.json`. Instructions not to disclose credentials are not isolation.
- Choosing the repository root as `/workspace` exposes `data/` through that
  writable project mount. For setup-only inspection, choose `setup/` instead.
- The host's `.gitconfig` is readable, including any sensitive values stored in
  it. Host-only include paths or credential helpers may not work in the container.
- Shared OAuth refresh writes can race. Keep a secure backup and re-login if
  necessary. Shared settings and packages are also mutable global state.
- Containers and session directories do not isolate simultaneous edits to the
  same checkout. Use separate Git worktrees for concurrent writing agents.
- This is process/filesystem isolation, not a hardened sandbox. Agents can modify
  mounted projects and reach services on the shared Docker network.
- No Docker socket is mounted and Docker is not installed in the Pi image.
  Rebuilds and container management are host-side operations.
- Provider compatibility and OAuth availability depend on upstream releases and
  account terms. Test remote and local providers after image updates.

## Diagnostics

```bash
docker network inspect pi-ollama
docker compose --env-file data/ollama.env -f setup/ollama/compose.yaml config
docker compose --env-file data/ollama.env -f setup/ollama/compose.yaml ps
docker compose --env-file data/ollama.env -f setup/ollama/compose.yaml logs -f ollama
```

To render the Pi Compose configuration, provide the variables normally supplied
by the launcher:

```bash
PI_CONFIG="$PWD/data/config" \
PI_SESSIONS="$PWD/data/sessions/login" \
PI_WORKSPACE="$PWD/setup" \
PI_UID="$(id -u)" PI_GID="$(id -g)" \
  docker compose -f setup/pi/compose.yaml config
```

Diagnostic output can include local paths or configured environment values;
review before sharing. Use the network name you configured if not `pi-ollama`.

## Removal

Stop Pi containers first, then stop Ollama:

```bash
docker compose --env-file data/ollama.env -f setup/ollama/compose.yaml down
```

`down` does not delete the external model store or `data/`. Remove private data
only deliberately, after backing up any configuration and sessions you need.
