# Pi Docker customization and maintenance

Use this guide for resource locations, package management, and reload/rebuild
rules. For first-time installation see [SETUP.md](SETUP.md); for everyday
launcher usage see [README.md](README.md). Read only the guide relevant to the task.

**Shell commands run on the host from the deployment repository root unless
explicitly marked as container commands.**

## Quick reference

`PI_CODING_AGENT_DIR=/pi/agent` overrides upstream Pi's usual `~/.pi/agent`
location. Shared resources persist across containers and affect all instances.

| Resource | Host location | Container location |
|---|---|---|
| Settings | `data/config/settings.json` | `/pi/agent/settings.json` |
| Extension | `data/config/extensions/example.ts` | `/pi/agent/extensions/example.ts` |
| Skill | `data/config/skills/example/SKILL.md` | `/pi/agent/skills/example/SKILL.md` |
| Global instructions | `data/config/AGENTS.md` | `/pi/agent/AGENTS.md` |
| Project settings | `<project>/.pi/settings.json` | `/workspace/.pi/settings.json` |
| Project extension | `<project>/.pi/extensions/example.ts` | `/workspace/.pi/extensions/example.ts` |
| Project skill | `<project>/.pi/skills/example/SKILL.md` | `/workspace/.pi/skills/example/SKILL.md` |

| Change | Action |
|---|---|
| User/project settings, extensions, or skills | `/reload` in each affected active session; no rebuild |
| Documentation under `setup/` | Immediately readable through the bind mount |
| Appended `setup/AGENTS.md` instructions | Start a new Pi process to ensure fresh prompt text |
| Launcher or Compose changes | Start a new container |
| Dockerfile, Pi version, global npm or OS packages | Rebuild image, then start a new container |

## User-managed resources and packages

A skill is a directory containing `SKILL.md` with `name` and `description`
frontmatter. Extensions are executable TypeScript or JavaScript modules.
Review third-party code and supporting scripts before installing.

Install a Pi package from the host through the wrapper:

```bash
pi -- install npm:<package-name>@<version>
pi -- list
pi -- remove npm:<package-name>@<version>
```

Inside a container shell, use `pi install ...`, `pi list`, or `pi remove ...`
directly. Host `pi install ...` without `--` treats `install` as a workspace path.
Package declarations and managed installations use the persistent agent directory.
Avoid simultaneous package or configuration changes from multiple instances.

Project resources persist with the project rather than the image and are subject
to Pi's project-trust handling. To declare a project-local package from the host:

```bash
pi -- install --local npm:<package-name>@<version>
```

Grant project trust only after reviewing unfamiliar resources. Run `/reload`
in an active Pi session after manually changing settings or resources. Other
running instances need their own reload to pick up shared changes.

## Image-managed components

Pi and `pi-rewind-hook` are installed globally in `setup/pi/Dockerfile`.
Both launchers explicitly load the rewind extension using `--extension`.
A global npm install alone does not make an arbitrary extension load.

Change the Dockerfile for Pi updates, image-managed extensions, or OS packages,
and change both launchers if a new extension needs an explicit load argument.
Rebuild on the host and start new containers; existing containers keep their
original image. Do not update the root-owned global installation from Pi tools.
Docker and its socket are unavailable in the Pi container.

```bash
docker build --no-cache -t pi-agent:latest ./setup/pi
docker run --rm pi-agent:latest --version
```

The Dockerfile currently uses `@latest`. Pin tested package versions for
reproducibility. A regular cached rebuild may not refresh those packages;
`--no-cache` forces the install step to run again.

Deployment source at `/opt/pi-docker` reflects current host files, which may
differ from the source used to build the running image. See the
[security and concurrency notes](SETUP.md#security-and-concurrency) when reviewing
mount access or running multiple instances.

## Upstream documentation

Inside the image, version-matched Pi documentation and extension examples are at:

```text
/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/
/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/
```

Read the document relevant to the change: `configuration.md`, `settings.md`,
`extensions.md`, `skills.md`, or `packages.md`. Follow additional references only
when needed for the task; there is no requirement to read every linked guide.
Use `npm list -g --depth=0` inside the container to inspect actual installed
versions. Session model metadata is exposed through `PI_MODEL`, `PI_PROVIDER`,
and `PI_REASONING_LEVEL` in agent shell-tool commands.
