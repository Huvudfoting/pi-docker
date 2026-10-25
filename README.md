# Pi Docker + Ollama

Run Pi in disposable Docker containers with persistent configuration and sessions.

- [Everyday usage](setup/README.md)
- [Optional Herdr integration and host trial](setup/README.md#herdr)
- [Installation](setup/SETUP.md)
- [OpenAI/provider login and GitHub authentication](setup/AUTHENTICATION.md)
- [Extensions, configuration, and maintenance](setup/CUSTOMIZATION.md)
- [Agent setup-discovery instructions](setup/AGENTS.md)

## Repository layout

```text
setup/                   # Non-secret deployment source; mounted read-only in Pi
  README.md
  SETUP.md
  AUTHENTICATION.md
  CUSTOMIZATION.md
  AGENTS.md
  extensions/            # Homemade extensions only; downloaded ones are image npm packages
  bin/pi
  bin/add-herdr-integration
  lib/herdr.sh           # Launcher support for Herdr restore and diagnostics
  pi/Dockerfile
  pi/compose.yaml
  ollama/compose.yaml
  ollama/.env.example
data/                    # Private local state; ignored by Git; never mount as setup
  config/
  gh-config/             # Optional hosts.yml token; mounted read-only for gh
  sessions/
  ollama.env
```

Keep `setup/` non-secret. See [mounts and persistence](setup/SETUP.md#directory-layout-and-persistence)
and [security](setup/SETUP.md#security-and-concurrency) for access boundaries.

Run host commands in the linked guides from this repository root unless stated
otherwise.
