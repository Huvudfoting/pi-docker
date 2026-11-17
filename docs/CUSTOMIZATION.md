# Customization and maintenance

Commands run on the **host from the repository root** unless marked otherwise.

## Two images

| Image | Dockerfile | Contents |
|---|---|---|
| `pi-docker:base` — fallback base | `images/base/Dockerfile` | Node.js, Pi, Herdr CLI/skill, Git/GitHub/SSH, TLS/download support, ripgrep |
| `pi-docker:custom` — derived example | `images/custom/Dockerfile` | Base + Python/pip/uv, nano, optional extensions, instructions, Python skill |

```bash
./bin/build
./bin/build custom  # requires local base
pi ~/repos/project  # automatically prefers local custom
```

For launch selection and defaults, see [usage](USAGE.md#launching).
The launcher checks availability but does not build or pull images. Launches,
helpers and native restore each select local custom if available, otherwise base;
no caller choice or historical image is replayed. `--image` is unsupported and
inherited `PI_DOCKER_IMAGE` is ignored. Rebuilt tags affect future containers;
configuration and conversation identity do not depend on the chosen image.

## Customize the example

Use `images/custom/` as the pattern for your own derived image:

| Add/change | Where |
|---|---|
| OS/npm packages | `images/custom/Dockerfile`; install as root, return to `USER node` |
| Pi extensions | npm-install in the Dockerfile; load paths in `images/custom/entrypoint` |
| Agent instructions | `images/custom/AGENTS.md`; entrypoint appends the baked-in copy |
| Skills | `images/custom/skills/<name>/SKILL.md`; entrypoint advertises that directory |
| Copied build inputs | Explicitly allow files/parent directories in `images/.dockerignore`; update layout tests |

Both recipes use `images/` as build context, not the repository root. `COPY`
sources are therefore relative to `images/` (for example, `custom/entrypoint`).
Never place credentials in image sources. Global npm installation alone does not
load a Pi extension.

```bash
./bin/build custom --tag my-pi:dev
pi ~/repos/project  # build also refreshed the standard pi-docker:custom tag
```

This also tags the result `pi-docker:custom`. To use another locally available
compatible base:

```bash
PI_DOCKER_BASE_IMAGE=my-base:tag ./bin/build custom
```

Build/pull that base explicitly first. The wrapper inspects it and owns
`BASE_IMAGE`; forwarded `--build-arg BASE_IMAGE=...` cannot override it. Other
Docker options are forwarded except `--pull`/`--pull=...`, which custom rejects.
A separate downstream Dockerfile can use `FROM pi-docker:base` and the same
entrypoint pattern; tag its reviewed result `pi-docker:custom` for automatic
launcher selection. Arbitrary launch-time image tags are unsupported. Preserve Pi-argument forwarding,
`/home/node`, and base integration tools/paths.

### Python and editor tooling

Custom copies stable Python 3 from the official Bookworm image, adds runtime
libraries, and sets `EDITOR`/`VISUAL` to nano. Base has neither Python nor an
editor default. `python` and `python3` share an interpreter. For the project-local
uv workflow, see the included `python-development` skill; interpreter downloads
are disabled. Install persistent global tools in images, not running containers.

## Optional extensions

Custom installs/loads `pi-rewind-hook`, `pi-web-access`, `pi-ask-user`, and
`@specode/pi-subscription-usage`. `pi-ask-user` provides the `ask_user` tool and
emits the managed `herdr:blocked` events while waiting for input.
They are **not required by Herdr**.
See [usage-extension authentication](AUTHENTICATION.md#subscription-usage-extension).
Do not vendor upstream extensions into homemade folders or use runtime
`pi install` for image-managed packages.

The common launcher loads repository-owned `extensions/`; keep its manifest.
The required Herdr reporter is separate and host-managed; see
[resource ownership](HERDR_INTEGRATION.md#maintenance-and-diagnostics).

## Resource locations

| Host/source | Container | Loading/scope |
|---|---|---|
| `data/config/settings.json`, `AGENTS.md` | `/pi/agent/` | Shared settings/instructions |
| `data/config/extensions/`, `data/config/skills/` | `/pi/agent/extensions/`, `/pi/agent/skills/` | Shared discovery |
| `extensions/` | `/opt/pi-docker/extensions/` | Common launcher; read-only |
| `<project>/.pi/` | Under actual project path (`/workspace` for ordinary launches) | Project settings/extensions/skills; subject to Pi trust |
| `images/custom/AGENTS.md`, `images/custom/skills/` | `/usr/local/share/pi-custom/` | Baked into custom; image entrypoint loads them |

`PI_CODING_AGENT_DIR=/pi/agent` replaces Pi's default `~/.pi/agent`.
Extensions use `.ts`/`.js` files or directories with `index.ts`/`index.js`;
skills use directories containing `SKILL.md`. Mounted `skills/` is not loaded
wholesale: the launcher explicitly selects integration skills.

**Images do not isolate shared configuration or conversations.** Optional
resources in `data/config/` can load with base too. Keep image-specific resources
in the derived image; do not remove the host-managed Herdr reporter.

## Applying changes

| Change | Action |
|---|---|
| Mounted extensions/skills | `/reload` in each affected Pi process |
| Mounted adapter script or documentation | Next invocation/read uses it |
| Appended `docs/AGENTS.md`, reporter, launcher, or Compose | Start new Pi containers |
| Settings | Restart if unsure whether the setting is reread live |
| Base packages or pinned Pi/Herdr | Rebuild base, then derived images; start new containers |
| Custom packages/entrypoint/instructions/skills | Rebuild custom; start new containers |

Mounted source may be newer than an image. Editing custom source does not
replace its baked-in resources; `/reload` alone cannot apply those host edits.
See [migration](SETUP.md#migrating-the-old-layout) for old paths and image tags.

## Updating image-managed packages

Update `PI_VERSION` and `HERDR_VERSION` in `images/base/Dockerfile`. Their pinned
defaults also apply to direct Docker builds; `bin/build` only selects the recipe
and tag. Host Herdr and its server are separate; no automatic alignment or restart.

Extension versions may be pinned in `images/custom/Dockerfile`; update them
there and rebuild, not in shared configuration.

Base sets `PI_SELF_UPDATE_COMMAND` to an image-local guard, inherited by custom.
When Pi would self-update, it refuses and prints host rebuild instructions with a
nonzero exit status. This does not block extension/catalog updates or manual
package commands; it is update policy, not a security boundary.

```bash
./bin/build --pull --no-cache
# If using custom, refresh its moving source images explicitly:
docker pull python:3-slim-bookworm
docker pull ghcr.io/astral-sh/uv:latest
./bin/build custom --no-cache
```

Smoke-test built images with `docker run --rm <image> --version`, then launch via
`pi` to test models, extensions, and Herdr reporting/restore. Direct Docker runs
omit launcher mounts/preparation. Docker is unavailable inside Pi.

## Upstream documentation

Read version-matched files under:

```text
/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/README.md
/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/
/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/
```

Start with `extensions.md`, `packages.md`, or `skills.md` for resource changes;
do not copy their API reference into deployment guides.
