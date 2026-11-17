# Pi Docker + Herdr

Run Pi in disposable Docker containers while keeping projects, configuration,
credentials, and conversations on the host. Optional Herdr integration adds
reporting, conversation restore, and helper/peer workflows.

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

Every launch/helper/restore prefers local `pi-docker:custom`, otherwise
`pi-docker:base`. Image overrides and recorded image replay are unsupported;
see [usage](docs/USAGE.md#launching). Base includes Pi, Node.js, and
Herdr/GitHub tooling; custom adds Python, uv, nano, and optional extensions.
See [image customization](docs/CUSTOMIZATION.md#two-images).

Existing linked worktrees use path-preserving checkout/Git-metadata mounts;
ordinary directories keep `/workspace`. Host Git is required for Git-marked
selections, but not marker-free ordinary directories. See
[mount policy](docs/SETUP.md#worktree-mount-policy).

**Security:** This is not a hardened sandbox. Containers can write the project
and read mounted credentials; networking is shared with the host. Eligible
launches inside Herdr automatically gain control of the whole connected session.
Use `--no-herdr` to disable integration. Read [setup and security](docs/SETUP.md).

## Guides

- [Setup](docs/SETUP.md): requirements, installation, mounts, security, migration.
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

Adapter tests skip without Node.js; Herdr contract-harness tests need test-only
`jq`. Neither Python nor Node is needed on the host to launch Pi.
