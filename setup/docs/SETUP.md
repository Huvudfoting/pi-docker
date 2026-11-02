# Pi Docker setup

Pi uses host networking to reach externally managed model APIs at host-accessible
URLs. Local model serving, installation, storage, and lifecycle management are
outside this project's scope. Starting or restarting Pi does not manage a model
server.

**All commands below run on the host from the repository root unless stated otherwise.**
The repository root is the directory containing `setup/` and `data/`.

For everyday commands see [README.md](../README.md); for extension policy, resource
paths, and reload/rebuild rules see [CUSTOMIZATION.md](CUSTOMIZATION.md).
For OpenAI/provider login and GitHub credentials, see
[AUTHENTICATION.md](AUTHENTICATION.md).

## Requirements

- Docker Engine on Linux and the Compose plugin. Docker Desktop requires
  host networking support to be enabled (version 4.34 or later).
- Bash, GNU `realpath`, and `sha256sum` for the launchers.
- A reachable model API and any required provider authentication for agent use.
- Optional Herdr integration: host Herdr and `flock` (util-linux). Images always
  include the container CLI and skill; host Herdr is needed only for integration.
- Optional host `~/.gitconfig`: mounted read-only when it exists and is readable.
  Use `--no-host-gitconfig` to skip it. Git itself is included in the image;
  host Git, Pi, Node.js, and Python are not required to launch.

Python 3 is needed on the host only to run the repository's automated tests.

## Directory layout and persistence

| Host path | Container path | Purpose |
|---|---|---|
| `setup/` | `/opt/pi-docker` | Read-only, non-secret deployment source and guides |
| `data/config/` | `/pi/agent` | Shared writable settings, models, credentials, and resources |
| `data/gh-config/` | `/run/gh-config` (read-only) | Optional GitHub CLI credentials, shared across instances |
| `data/sessions/<name>-<path-hash>/` | `/pi/sessions` (Herdr: `/pi/herdr-sessions/<key>`) | Writable session storage selected by the launcher |
| `data/herdr-launches/` | Not separately mounted | Private workspace/storage records for optional Herdr restore |
| Selected project | `/workspace` | Writable project files |
| `~/.gitconfig` (if readable and enabled) | `/home/node/.gitconfig` | Optional read-only Git settings |

`data/` is ignored by Git. Keep credentials, sessions, and real environment files
there, never under `setup/`. The Pi image build context is `setup/`, with a
Dockerfile-only allowlist in `setup/.dockerignore`; deployment guides and resources
are mounted at runtime, not copied into the image.
The setup mount exposes current host source, which may be newer than the image.
Missing deployment mount sources fail rather than being created silently.

The launcher appends `/opt/pi-docker/AGENTS.md` to the system prompt, making
these guides discoverable even when `/workspace` is a different repository.
Direct `docker run` invocations do not provide the mount or those instructions.

## Local model endpoints

If you use local models, an API compatible with your configured Pi provider must
already be available at a URL reachable from the host. Configure the provider's
base URL, model IDs, and any required authentication as described in
[AUTHENTICATION.md](AUTHENTICATION.md).

Pi uses host networking, so a host-local endpoint can use `127.0.0.1`; remote
endpoints use their host-accessible URL. Include any API path required by your
provider. The launcher does not discover model servers or configure provider
URLs automatically. No model service, GPU runtime, or model storage is bundled.

## 1. Build Pi

Build the Pi image before running the launcher:

```bash
chmod +x setup/bin/pi
./setup/bin/build
```

Every image includes the Herdr CLI and skill, without needing Herdr on the host
to build or run standalone Pi. Integration is selected only at launch time;
use `--no-herdr` to disable it. Builds replace `pi-agent:latest`; existing
containers are unaffected.

The launcher checks for this image and prints the build command if it is missing.
After building, follow [AUTHENTICATION.md](AUTHENTICATION.md) for OpenAI/provider
login, model configuration, and optional GitHub CLI credentials.

## 2. Install the host launcher symlink

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

Build the image with `./setup/bin/build` and install Herdr on the host,
then launch `pi /absolute/path/to/project` inside a Herdr pane. Eligible interactive launches automatically install/update its
official Pi reporter in this deployment's shared configuration and enable support.
To install/update the reporter explicitly instead:

```bash
./setup/bin/herdr-extension install
```

Reporter preparation needs no image rebuild; the container CLI and operating
skill are image-managed. Enabled launches print a socket-access notice.
Use `--no-herdr` to prevent installation and socket exposure, or `--herdr` to
require integration rather than warn and fall back on preparation failure. See
[Herdr integration](HERDR_INTEGRATION.md) for skill loading, version management,
updates/removal, restore, diagnostics, and socket security.

## Security and concurrency

- Pi, extensions, and shell tools share permissions and can read mounted
  credentials, including `auth.json`. Review third-party code; npm installation
  and instructions not to disclose secrets are not security boundaries.
- Read-only prevents modification through `/opt/pi-docker`, not disclosure.
  Do not put private files in `setup/`, even if Git ignores them.
- Choosing the repository root as `/workspace` exposes `data/` through that
  writable project mount. For setup-only inspection, choose `setup/` instead.
- When mounted, the host's `.gitconfig` is readable, including any sensitive
  values stored in it. Use `--no-host-gitconfig` to omit it. Host-only include
  paths or credential helpers may not work in the container. Missing host
  configuration does not prevent launch; configure a project-local Git identity
  if needed for commits.
- For credential persistence, OAuth refresh concurrency, and token rotation, see
  [AUTHENTICATION.md](AUTHENTICATION.md).
- Containers and session directories do not isolate simultaneous edits to the
  same checkout. Use separate Git worktrees for concurrent writing agents.
- This is process/filesystem isolation, not a hardened sandbox. Agents can modify
  mounted projects. Host networking also lets them reach host-local services
  (including loopback listeners) and bind host ports; there is no network
  isolation from the host.
- Optional [Herdr mode](HERDR_INTEGRATION.md) exposes Herdr's full local control
  socket, including control of other panes. Use it only with trusted containers;
  eligible interactive launches inside Herdr enable it automatically with a
  notice. Use `--no-herdr` to prevent installation and socket exposure.
- No Docker socket is mounted and Docker is not installed in the Pi image.
  Rebuilds and container management are host-side operations.
- Provider compatibility and OAuth availability depend on upstream releases and
  account terms. Test remote and local providers after image updates.

## Diagnostics

For local model connectivity, check your configured provider URL from the host
and from Pi's shell tool using the API's documented health or model-list route
and required authentication. Model server diagnostics and management are outside
this project's scope.

To render the Pi Compose configuration, provide the variables normally supplied
by the launcher:

```bash
PI_CONFIG="$PWD/data/config" \
GH_CONFIG="$PWD/data/gh-config" \
PI_SESSIONS="$PWD/data/sessions/login" \
PI_WORKSPACE="$PWD/setup" \
PI_UID="$(id -u)" PI_GID="$(id -g)" \
  docker compose -f setup/compose.yaml config
```

Diagnostic output can include local paths or configured environment values;
review before sharing.

## Removal

Exit Pi to remove its disposable container. Remove the host launcher symlink if
it is no longer needed. Configuration and sessions remain in `data/`; remove
private data only deliberately, after backing up anything you need. Externally
managed model servers and their storage are unaffected.
