# Pi Docker

Disposable container; host-persistent mounts:
- `/workspace`: writable selected project.
- `/pi/agent`: shared writable configuration, resources, and credentials.
- `/pi/sessions`: launcher-selected session storage.
- `/opt/pi-docker`: read-only deployment source; may be newer than the image.

Read only the relevant mounted guide; do not search `/workspace` for these docs:
- Installation/authentication: `/opt/pi-docker/SETUP.md`.
- Resource paths, extension policy, maintenance: `/opt/pi-docker/CUSTOMIZATION.md`.
- Launcher and session usage: `/opt/pi-docker/README.md`.

Deployment policy:
- Downloaded extensions: npm `@latest` in `setup/pi/Dockerfile`, baked into the
  image and explicitly loaded by both launchers. No vendoring or runtime installs.
- Homemade extensions: `/opt/pi-docker/extensions/`, `/pi/agent/extensions/`, or
  `/workspace/.pi/extensions/`. Shared/project skills use sibling `skills/` folders.
- Settings and mounted resources: `/reload` per affected session; no rebuild.
- Image/npm/OS updates: host no-cache rebuild, then new containers. Docker/socket
  are unavailable here; do not update global Pi or packages in-container.
- Launcher/Compose changes need new containers; appended instructions need a new Pi process.

Shared edits affect other instances; avoid concurrent configuration changes.
Do not inspect or disclose credentials or real environment files during routine setup.
Mounts and instructions do not isolate credentials from tools or extensions.
