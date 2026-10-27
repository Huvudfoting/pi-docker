# Pi Docker + Herdr

Run Pi in disposable Docker containers with persistent projects, configuration,
and sessions. Use configured cloud providers or local models available at a
host-accessible API URL. Setting up and managing model servers is outside this
project's scope.

Inside Herdr, eligible interactive launches enable agent reporting, conversation
restore and a focused skill for sibling helpers and peer requests. Use
`--no-herdr` to disable integration or `--herdr` to require it. See the
[Herdr guide](setup/docs/HERDR_INTEGRATION.md) for usage and session-wide socket access.

## Get started

Follow [installation](setup/docs/SETUP.md), then run on the host:

```bash
pi ~/repos/project
```

`pi --help` gives an overview of available options.

## Guides

- [Everyday usage and sessions](setup/README.md)
- [Herdr integration and diagnostics](setup/docs/HERDR_INTEGRATION.md)
- [Provider login and GitHub authentication](setup/docs/AUTHENTICATION.md)
- [Extensions, configuration, and maintenance](setup/docs/CUSTOMIZATION.md)
- [Container agent instructions](setup/AGENTS.md)

## Repository layout

- **`setup/`** — non-secret deployment source; mounted read-only at
  `/opt/pi-docker` inside Pi. Dockerfile and Compose files are at its root;
  `bin/` holds commands, `lib/` launcher internals, `docs/` detailed guides,
  and `extensions/` and `skills/` agent resources. Start at
  [`setup/AGENTS.md`](setup/AGENTS.md) for the agent guide index.
- **`tests/`** — automated checks; run with
  `python3 -m unittest discover -s tests -p 'test_*.py'`.
- **`data/`** — private configuration, credentials, sessions, and provider settings;
  ignored by Git. Never put secrets under `setup/`.

Containers share configuration and credentials; use separate Git worktrees for
concurrent writing agents. See [security and concurrency](setup/docs/SETUP.md#security-and-concurrency).

Run host commands in the guides from this repository root unless stated otherwise.
