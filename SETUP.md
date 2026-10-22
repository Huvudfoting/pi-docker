
# Pi Docker + Ollama

Running isolated Pi instances against both remote and local models.

Two independent Compose projects share one explicitly named Docker network (`pi-ollama`).
The Ollama project **creates** the network. The Pi project **joins** it as an external network.
Both are kept separate so restarting Pi never restarts the GPU inference server.

## Requirements
- Docker Engine + Compose plugin.
- NVIDIA Container Toolkit.

## 1. Start Ollama

In the **ollama** directory After setting .env variables in the compose file (model store mount point etc.).

```bash
docker compose up -d
```

The container is named `ollama`, and other containers on the shared network resolve `http://ollama:11434`.
Only localhost port 11434 is published on the host, so ollama is reachable in for example a browser on the host.

## 2. Build Pi image and run the authentication flow

First ensure scripts are executable.

```bash
chmod +x bin/pi bin/pi-login
```

In the **pi** folder.
Run the pi-login script build image and authenticate to remote models.

```bash
./bin/pi-login
```

Example for ChatGPT Plus (OAuth, no api key):
Inside Pi use `/login`, choose OpenAI/ChatGPT OAuth and finish the browser flow manually by 
cutting and pasting the browser callback url into pi with shift + ctrl + v.

The login is persisted in `pi/config/auth.json` and shared with Pi instances.

## 3. Create a symlink for the executable

```bash
mkdir -p ~/.local/bin
ln -s "$(pwd)/bin/pi" ~/.local/bin/pi
```

Verify the symlink:

```bash
ls -l ~/.local/bin/pi
```

```bash
pi # Should now execute the pi container
```

### Examples 

Examples of ways to start your pi container

Run 
```bash
pi ~/repos/project-a
```

```bash
pi ~/repos/project-b --name worker2
```

```bash
pi ~/repos/project-a --name second
```

You can also run `pi` from the current directory.
Arguments after `--name NAME` or `--` are forwarded to Pi.
Inside Pi, use `/model` to choose Ollama or an OAuth-enabled OpenAI model.

## Configuration

- `pi/config` is shared across containers, including OAuth tokens, models and skills.
- `pi/sessions` is private per named workspace. Reusing the same workspace/name resumes the same session directory; choose different names for concurrent sessions.
- `/workspace` is the only host project mount.
- Ollama's network name can be overridden with `OLLAMA_NETWORK` for **both** stacks.
- The Ollama `models.json` is a starting example. Adjust context length, model IDs, and provider API settings for your installed Pi version.

### Extensions and tools

Pi and its extensions are installed globally in `pi/Dockerfile` during image build.
Extensions are loaded through the `--extension` argument in `bin/pi`.
To add or update extensions, modify the Dockerfile and rebuild

### Git configuration

The host's `~/.gitconfig` is mounted read-only at `/home/node/.gitconfig`.
The container uses `HOME=/home/node`, allowing Git to reuse the host's username, email, and other global settings.
No separate Git identity configuration is required inside the container.

## Important caveats

- Shared `auth.json` is a concurrency-sensitive credential store. Concurrent OAuth refresh writes may race; keep a backup and re-login if needed. Never commit or publish it.
- Sharing the agent directory also shares mutable settings/extensions. Avoid concurrent edits to global config.
- The launcher isolates containers and sessions, **not simultaneous edits to the same checkout**. Use Git worktrees for concurrent writing agents.
- This is filesystem/process isolation, not a hardened sandbox: the agent can modify the mounted workspace and reach services on its Docker network.
- Herdr process spawning from inside containers has **not** been validated. Herdr may need a different integration path; this project deliberately avoids claiming working Herdr orchestration.
- Pi/Ollama API compatibility and ChatGPT OAuth availability depend on upstream releases and account terms. Test both providers after building.
- The Pi npm package is installed at build time. Pin an exact version in `pi/Dockerfile` once tested.

## Diagnostics

```bash
docker network inspect pi-ollama
docker compose -f ollama/compose.yaml --env-file ollama/.env ps
docker compose -f ollama/compose.yaml --env-file ollama/.env logs -f ollama
docker compose -f pi/compose.yaml config
```

## Rebuilding the image

Use no-cache to force a Pi update if you make changes.
Currently the version is pi@latest.
You may want to pin this for a stable environment.

```bash
docker build --no-cache -t pi-agent:latest ./pi
```

### Check Pi version

To check Pi versioon inside container.

```bash
docker run --rm pi-agent:latest --version
```

## Removal

```bash
docker compose -f ollama/compose.yaml --env-file ollama/.env down
# Stop Pi containers first; then the shared network can be removed by Compose.
# Delete this project directory to remove local Pi config/sessions.
```
Existing model files live outside the project and are not deleted by `down`.
