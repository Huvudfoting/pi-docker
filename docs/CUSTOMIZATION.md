# Customization and maintenance

Commands run on the **host from the repository root** unless marked otherwise.

## Two images

| Image | Dockerfile | Contents |
|---|---|---|
| `pi-docker:base` — minimal base | `images/base/Dockerfile` | Node.js, Pi, Herdr CLI/skill, Git/GitHub/SSH, TLS/download support, ripgrep |
| `pi-docker:custom` — derived example | `images/custom/Dockerfile` | Base + example toolchain and runtime settings, optional extensions, instructions, skill |

```bash
./bin/build
./bin/build custom  # requires local base
pi ~/repos/project --image pi-docker:custom
```

For launch selection and defaults, see [usage](USAGE.md#launching).
The launcher checks availability but does not build or pull images. Helpers
preserve the selection; native restore uses the recorded image. Rebuilt tags
affect future containers; use a versioned tag or digest when a fixed image matters.

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
pi ~/repos/project --image my-pi:dev
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
entrypoint pattern—no launcher fork. Preserve Pi-argument forwarding,
`/home/node`, and base integration tools/paths.

### Adding tools and runtime settings

The custom Dockerfile shows the pattern: copy the toolchain from an official
source image (keeping distro/ABI compatibility), apt-install the runtime
libraries it needs, and set the tool's environment (`EDITOR`/`VISUAL`,
download-disabled interpreters, and similar belong here, not in shared
configuration). Verify the result in the Dockerfile before returning to
`USER node`. Install persistent global tools in images, not running
containers.

## Optional extensions

Extensions added as in the table above are **not required by Herdr**.

Do not vendor upstream extensions into homemade folders or use runtime
`pi install` for image-managed packages. Install a package whose `peerDependencies`
name host-supplied Pi packages with `npm install -g --legacy-peer-deps`; otherwise
npm bundles a duplicate Pi tree. Review third-party extension source first: it runs
inside Pi and can read credentials.

The required Herdr reporter is separate and host-managed; see
[resource ownership](HERDR_INTEGRATION.md#maintenance-and-diagnostics).

## Resource locations

| Host/source | Container | Loading/scope |
|---|---|---|
| `data/config/settings.json` | `/pi/agent/` | Shared settings; Pi auto-loads `AGENTS.md` there if present |
| `data/config/extensions/`, `data/config/skills/` | `/pi/agent/extensions/`, `/pi/agent/skills/` | Shared discovery |
| `extensions/` | `/opt/pi-docker/extensions/` | Common launcher; read-only |
| `<project>/.pi/` | `/workspace/.pi/` | Project settings/extensions/skills; subject to Pi trust |
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
# If using custom, pull its moving source images from its Dockerfile explicitly:
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
