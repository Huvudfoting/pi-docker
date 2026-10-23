# Pi Docker

Disposable container; persistent mounts:
- `/workspace`: writable host project.
- `/pi/agent`: shared writable config, resources, and credentials.
- `/pi/sessions`: launcher-selected sessions.
- `/opt/pi-docker`: read-only current deployment source, possibly newer than image.

Read only the guide relevant to the task (not every linked document):
- Initial installation/authentication: `/opt/pi-docker/SETUP.md`.
- Resources, packages, reload/rebuild rules: `/opt/pi-docker/CUSTOMIZATION.md`.
- Launcher/workspace usage: `/opt/pi-docker/README.md`.
Use these paths directly; do not search `/workspace` for deployment docs.

Shared extensions/skills: `/pi/agent/{extensions,skills}`; project: `/workspace/.pi/{extensions,skills}`.
Resource/settings changes: `/reload` per affected session; no rebuild.
Image/global-package/OS changes: rebuild on host, then create new containers.
Docker/socket are unavailable here; do not update global Pi in-container.
Host wrapper: `pi -- install ...`; container CLI: `pi install ...`.
Shared edits affect other instances; avoid concurrent configuration changes.
Do not inspect or disclose credentials or real environment files during routine setup.
Credential mounts are not a security boundary against tools or extensions.
