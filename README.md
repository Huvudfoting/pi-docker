# Pi Docker + Ollama + Herdr

Run Pi in disposable Docker containers with persistent projects, configuration,
and sessions. Use a shared Ollama service for local inference or configured
cloud providers.

Inside Herdr, eligible interactive launches enable agent reporting, conversation
restore and a focused skill for sibling helpers and peer requests. Use
`--no-herdr` to disable integration or `--herdr` to require it. See the
[Herdr guide](setup/HERDER_INTEGRATION.md) for usage and session-wide socket access.

## Get started

Follow [installation](setup/SETUP.md), then run on the host:

```bash
pi ~/repos/project
```

`pi --help` gives an overview of available options.

## Guides

- [Everyday usage and sessions](setup/README.md)
- [Herdr integration and diagnostics](setup/HERDER_INTEGRATION.md)
- [Provider login and GitHub authentication](setup/AUTHENTICATION.md)
- [Extensions, configuration, and maintenance](setup/CUSTOMIZATION.md)
- [Container agent instructions](setup/AGENTS.md)

## Repository layout

- **`setup/`** — non-secret launchers, deployment files, extensions, and guides;
  mounted read-only at `/opt/pi-docker` inside Pi.
- **`data/`** — private configuration, credentials, sessions, and service settings;
  ignored by Git. Never put secrets under `setup/`.

Containers share configuration and credentials; use separate Git worktrees for
concurrent writing agents. See [security and concurrency](setup/SETUP.md#security-and-concurrency).

Run host commands in the guides from this repository root unless stated otherwise.
