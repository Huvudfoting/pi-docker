# Pi Docker + Ollama setup

Pi and Ollama are independent Compose projects sharing the explicitly named
`pi-ollama` network. Ollama creates it; Pi joins it as an external network.
Restarting Pi does not restart the GPU inference server.

**All commands below run on the host from the repository root unless stated otherwise.**
The repository root is the directory containing `setup/` and `data/`.

For everyday commands see [README.md](README.md); for extension policy, resource
paths, and reload/rebuild rules see [CUSTOMIZATION.md](CUSTOMIZATION.md).
For OpenAI/provider login and GitHub credentials, see
[AUTHENTICATION.md](AUTHENTICATION.md).

## Requirements

- Docker Engine and the Compose plugin.
- NVIDIA Container Toolkit for the configured Ollama GPU service.
- Bash, GNU `realpath`, and `sha256sum` for the launchers.
- Optional Herdr integration: host Herdr and `flock` (util-linux).
- A host `~/.gitconfig` file (mounted read-only for Git identity and settings).

## Directory layout and persistence

| Host path | Container path | Purpose |
|---|---|---|
| `setup/` | `/opt/pi-docker` | Read-only, non-secret deployment source and guides |
| `data/config/` | `/pi/agent` | Shared writable settings, models, credentials, and resources |
| `data/gh-config/` | `/run/gh-config` (read-only) | Optional GitHub CLI credentials, shared across instances |
| `data/sessions/<name>-<path-hash>/` | `/pi/sessions` (Herdr: `/pi/herdr-sessions/<key>`) | Writable session storage selected by the launcher |
| `data/herdr-launches/` | Not separately mounted | Private workspace/storage records for optional Herdr restore |
| Selected project | `/workspace` | Writable project files |
| `~/.gitconfig` | `/home/node/.gitconfig` | Read-only Git settings |
| Model store selected in `data/ollama.env` | `/models` in Ollama | Persistent model files |

`data/` is ignored by Git. Keep credentials, sessions, and real environment files
there, never under `setup/`. The Pi image build context is only `setup/pi/`.
The setup mount exposes current host source, which may be newer than the image.
Missing deployment mount sources fail rather than being created silently.

The launcher appends `/opt/pi-docker/AGENTS.md` to the system prompt, making
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
localhost port 11434 is published.

If you change `OLLAMA_NETWORK` in `data/ollama.env`, also export that same value
in the host shell before using `pi`. The launcher does not source the Ollama
environment file.

## 2. Build Pi

Build the Pi image before running the launcher:

```bash
chmod +x setup/bin/pi
./setup/pi/build-pi-docker.sh
```

The launcher checks for this image and prints the build command if it is missing.
After building, follow [AUTHENTICATION.md](AUTHENTICATION.md) for OpenAI/provider
login, model configuration, and optional GitHub CLI credentials.

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
current workspace. `pi --help` shows launcher usage without requiring Docker;
`pi -- --help` opens Pi's own help through Docker.

### Optional Herdr integration

Install Herdr on the host, then launch `pi /absolute/path/to/project` inside a
Herdr pane. Eligible interactive launches automatically install/update its
official Pi extension and bundled operating skill in this deployment's shared
configuration and enable support.
To install/update explicitly instead:

```bash
./setup/bin/herdr-extension install
```

Extension/skill preparation needs no image rebuild. The container Herdr CLI is
installed from the version pinned in `setup/pi/build-pi-docker.sh`; rebuild and
start new containers when updating the pin. Potential host/server/container
version mismatches are accepted without a runtime synchronization check. Enabled launches print a socket-access notice.
Use `--no-herdr` to prevent installation and socket exposure, or `--herdr` to
require integration rather than warn and fall back on preparation failure. See
[Herdr integration](HERDER_INTEGRATION.md) for requirements, updates/removal,
restore, diagnostics, and socket security.

## Security and concurrency

- Pi, extensions, and shell tools share permissions and can read mounted
  credentials, including `auth.json`. Review third-party code; npm installation
  and instructions not to disclose secrets are not security boundaries.
- Read-only prevents modification through `/opt/pi-docker`, not disclosure.
  Do not put private files in `setup/`, even if Git ignores them.
- Choosing the repository root as `/workspace` exposes `data/` through that
  writable project mount. For setup-only inspection, choose `setup/` instead.
- The host's `.gitconfig` is readable, including any sensitive values stored in
  it. Host-only include paths or credential helpers may not work in the container.
- For credential persistence, OAuth refresh concurrency, and token rotation, see
  [AUTHENTICATION.md](AUTHENTICATION.md).
- Containers and session directories do not isolate simultaneous edits to the
  same checkout. Use separate Git worktrees for concurrent writing agents.
- This is process/filesystem isolation, not a hardened sandbox. Agents can modify
  mounted projects and reach services on the shared Docker network.
- Optional [Herdr mode](HERDER_INTEGRATION.md) exposes Herdr's full local control
  socket, including control of other panes. Use it only with trusted containers;
  eligible interactive launches inside Herdr enable it automatically with a
  notice. Use `--no-herdr` to prevent installation and socket exposure.
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
GH_CONFIG="$PWD/data/gh-config" \
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
