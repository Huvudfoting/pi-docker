# Authentication

**Commands run on the host from the deployment repository root unless marked as
container commands.** Build the image and start the required services first; see
[SETUP.md](SETUP.md). For everyday launcher usage, see [README.md](README.md).

## OpenAI and other Pi providers

Launch Pi using the repository launcher:

```bash
./setup/bin/pi
```

Inside Pi, run `/login`, choose OpenAI (or your desired provider), and complete
its browser flow. For a manual OAuth callback, paste the callback URL into Pi
when prompted. Provider compatibility and OAuth availability depend on upstream
releases and account terms.

Authentication persists in `data/config/auth.json`, mounted at
`/pi/agent/auth.json` and shared across instances. Never commit or publish that
file. This mount is writable, not read-only: OAuth credentials may need refreshing.
Shared OAuth refresh writes can race; keep a secure backup and re-login if
necessary. Avoid concurrent changes to shared configuration.

Configure compatible endpoints and local model IDs in `data/config/models.json`.
Use the installed Pi documentation for the schema supported by your version;
see [upstream documentation paths](CUSTOMIZATION.md#upstream-documentation).
Inside Pi, `/model` selects an available model.

### Subscription usage extension

`@specode/pi-subscription-usage` requires an **Openai Codex (Legacy)** provider
in addition to the usual OpenAI token in order to authorize API access.

## GitHub CLI (optional)

The image includes `gh`. The launcher creates `data/gh-config/` with restrictive
permissions if missing and mounts it read-only at `/run/gh-config`, with
`GH_CONFIG_DIR` pointing there. An empty directory is fine if you do not need
GitHub authentication. Git credentials and GitHub API credentials are separate;
this does not change the host's Git credential setup.

To enable private repository access, create a fine-grained personal access token
on GitHub, restricted to the required repositories and permissions. For example,
start with read-only Issues and Pull requests permissions; grant write access
only if you want Pi to modify those resources. Additional operations may need
additional permissions or organization approval.

On the host, from the deployment repository root:

```bash
(umask 077; mkdir -p data/gh-config; touch data/gh-config/hosts.yml)
chmod 700 data/gh-config
chmod 600 data/gh-config/hosts.yml
nano data/gh-config/hosts.yml
```

Enter the following structure, replacing both placeholders locally. Do not paste
real tokens into Pi conversations or shell commands:

```yaml
github.com:
    user: YOUR_GITHUB_USERNAME
    oauth_token: YOUR_FINE_GRAINED_TOKEN
    git_protocol: https
```

Validate inside a newly launched Pi container using `gh auth status` (do not use
`--show-token`), then `gh issue list` in an authorized repository. Do not run
`gh auth login`, `gh auth logout`, or credential/configuration updates inside the
container: the configuration directory is intentionally read-only. Rotate tokens
by editing the host file, and revoke old tokens on GitHub. Never bake credentials
into the image. No real credential file is supplied by this repository.

All Pi instances can read this token. Read-only prevents changes through this
mount, not disclosure or GitHub API writes; token permissions control remote
access. Ask for confirmation before remote mutations. If the deployment root is
itself mounted as `/workspace`, the same file is also reachable through the
writable `data/` path, so this is not a universal write-protection boundary.

## Credential security

Keep credentials under ignored `data/`, never under `setup/`. Pi, extensions,
and shell tools can read mounted credentials; a read-only mount does not prevent
disclosure. See [security and concurrency](SETUP.md#security-and-concurrency)
for the deployment's shared-state and isolation boundaries.
