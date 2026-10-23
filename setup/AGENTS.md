# Pi Docker

Disposable container: `/workspace` is the writable project, `/pi/agent` is shared
configuration/credentials, `/pi/sessions` is session storage, and `/opt/pi-docker`
is read-only deployment source (possibly newer than the image).

Read only the relevant mounted guide; do not search `/workspace` for these docs:
- Installation/authentication and security: `/opt/pi-docker/SETUP.md`.
- Runtimes, resources, extension policy, maintenance: `/opt/pi-docker/CUSTOMIZATION.md`.
- Launcher and session usage: `/opt/pi-docker/README.md`.

Essential rules:
- Node.js and Python are available. Prefer uv with project-local `.venv`
  environments; automatic Python downloads are disabled. No global installs.
- Downloaded extensions belong in the Dockerfile as npm `@latest`, explicitly
  loaded by both launchers; homemade extensions use mounted resource folders.
- Image/package updates require a host rebuild and new containers; Docker is
  unavailable here. See the maintenance guide for reload/restart rules.
- Shared edits affect other instances; avoid concurrent configuration changes.
- Do not inspect or disclose credentials or real environment files during routine
  setup. Mounts and instructions do not isolate credentials from tools/extensions.
