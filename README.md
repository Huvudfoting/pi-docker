# Pi Docker + Ollama

Run Pi in disposable Docker containers with persistent configuration and sessions.

- [Everyday usage](setup/README.md)
- [Installation, configuration, and maintenance](setup/SETUP.md)
- [Agent setup-discovery instructions](setup/AGENTS.md)

## Repository layout

```text
setup/                   # Non-secret deployment source; mounted read-only in Pi
  README.md
  SETUP.md
  AGENTS.md
  bin/pi
  bin/pi-login
  pi/Dockerfile
  pi/compose.yaml
  ollama/compose.yaml
  ollama/.env.example
data/                    # Private local state; ignored by Git; never mount as setup
  config/
  sessions/
  ollama.env
```

Only put files safe for every Pi workspace under `setup/`. Read-only does not
mean confidential: every agent can read that directory at `/opt/pi-docker`.
The existing `/pi/agent` mount still gives Pi access to its authentication.

Run host commands in the linked guides from this repository root unless stated
otherwise.
