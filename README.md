<p align="center">
  <img src="docs/img/pi-docker-herdr-synthwave.svg" width="440" alt="Pi, Docker, and Herdr in synthwave style">
</p>

# Pi + Docker + Herdr

Love Pi in Herdr — spawning new instances in separate panes,
detaching without stopping work? But also hate a swarm of agents
running loose on your system with your user privileges?

pi-docker gives each Pi instance its own Docker container. Pi runs
as you — but only inside the container. Your system is out of reach
except for the project and the shared configuration you mount in.
Customize the image to fit your workflow: tools, skills, extensions,
system prompts.

Runs on any Linux system with Docker Engine and Compose; Herdr
integration is optional. Pi does not even need to be installed on
the host.

## Quick start

On a Linux host with Docker Engine and Compose, from this repository:

```bash
./bin/build          # base image
# ./bin/build custom # optional development image; requires base
mkdir -p ~/.local/bin
ln -sfn "$(pwd)/bin/pi" ~/.local/bin/pi
# Ensure ~/.local/bin is on PATH, then choose an existing project:
pi ~/repos/project
```

Inside Pi, use `/login` and `/model`. Model APIs must already be running and
reachable; this project does not manage model servers.

Without `--image` or `PI_DOCKER_IMAGE`, the launcher prefers local
`pi-docker:custom`, otherwise `pi-docker:base`. See [usage](docs/USAGE.md#launching)
for image-selection options. Base includes Pi, Node.js, and
Herdr/GitHub tooling; custom demonstrates extending it with a toolchain and
runtime settings, optional extensions, instructions, and a skill.
See [image customization](docs/CUSTOMIZATION.md#two-images).

**Security:** This is not a hardened sandbox. Containers can write the project
and read mounted credentials; networking is shared with the host. Eligible
launches inside Herdr automatically gain control of the whole connected session.
Use `--no-herdr` to disable integration. Read [setup and security](docs/SETUP.md).

## Guides

- [Setup](docs/SETUP.md): requirements, installation, mounts, security.
- [Usage](docs/USAGE.md): launcher options and conversations.
- [Authentication](docs/AUTHENTICATION.md): providers and GitHub credentials.
- [Herdr](docs/HERDR_INTEGRATION.md): helpers, restore, diagnostics.
- [Customization](docs/CUSTOMIZATION.md): images, resources, updates.
- [Container instructions](docs/AGENTS.md): compact agent orientation.

Guide commands run on the host from this repository root unless marked otherwise.

## Repository and tests

Host tooling lives in `bin/` and `lib/`, build recipes in `images/`, and shared
resources in `extensions/` and `skills/`. Builds use only `images/`; containers
mount allowlisted deployment paths at `/opt/pi-docker`, not the repository root.
Private state lives in ignored `data/`: **back it up privately; never publish it.**

Run offline checks with Python 3 and Node.js; no live Docker or Herdr is needed:

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
```

Adapter tests skip without Node.js. Neither runtime is needed on the host to launch Pi.

Licensed under the MIT License; see `LICENSE`.
