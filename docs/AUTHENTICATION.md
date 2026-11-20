# Authentication

Run host commands from the repository root after [setup](SETUP.md). Provider and
GitHub credentials are separate; never bake either into an image or publish `data/`.

## OpenAI and other Pi providers

```bash
pi /absolute/path/to/project --no-herdr
```

Inside Pi, use `/login`, complete the provider's flow, then select with `/model`.
If prompted for a manual OAuth callback, paste it into Pi. Available providers
and account requirements depend on the installed upstream version.

Credentials persist in `data/config/auth.json` → `/pi/agent/auth.json`. This is
shared and writable for OAuth refresh. Avoid concurrent refresh/configuration
writes; keep a private backup and re-login if needed.

For custom/local APIs, configure provider URLs and model IDs in
`data/config/models.json` → `/pi/agent/models.json`. The API must already be
running. With host networking, host-local URLs can use `127.0.0.1`; include the
correct port and API path. Consult [installed Pi docs](CUSTOMIZATION.md#upstream-documentation)
for model schemas and API-key options. The launcher does not configure providers
or manage model servers.

## GitHub CLI (optional)

Both images include `gh`. The launcher always mounts `data/gh-config/` read-only
at `/run/gh-config` and sets `GH_CONFIG_DIR`; leave it empty for unauthenticated
use. There is no separate GitHub enable flag. This does not configure Git pushes.

Create a fine-grained GitHub token restricted to the required repositories and
permissions. Start read-only; grant write access only for intended mutations.
On the host:

```bash
(umask 077; mkdir -p data/gh-config; touch data/gh-config/hosts.yml)
chmod 700 data/gh-config
chmod 600 data/gh-config/hosts.yml
```

Edit that file locally; never paste real tokens into conversations or commands:

```yaml
github.com:
    user: YOUR_GITHUB_USERNAME
    oauth_token: YOUR_FINE_GRAINED_TOKEN
    git_protocol: https
```

Inside a new Pi container, check `gh auth status` (never `--show-token`), then
`gh issue list` in an authorized repository. Do not run `gh auth login`, logout,
or configuration updates inside the read-only mount. Rotate tokens by editing
the host file and revoking old tokens on GitHub.

All instances can read mounted credentials. Read-only does not prevent disclosure
or GitHub API writes; token permissions control remote access. Confirm remote
mutations first. If the repository root is the project mount, `data/` is also
reachable through writable `/workspace`. See [security](SETUP.md#security-and-concurrency).
