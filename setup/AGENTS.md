# Pi Docker environment

This Pi instance runs inside a disposable Docker container. Before advising on
its installation, extensions, skills, configuration, or deployment, read
`/opt/pi-docker/SETUP.md`. Read `/opt/pi-docker/README.md` for everyday usage.

Deployment source is mounted read-only at `/opt/pi-docker`, independently of
`/workspace`. It reflects the current host files, not necessarily the revision
used to build this running image. Upstream Pi documentation and examples are at
`/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs` and
`/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/examples`.

- `/workspace`: writable host project.
- `/pi/agent`: shared, writable, persistent configuration and credentials.
- `/pi/sessions`: persistent session storage for this launcher instance.
- `/opt/pi-docker`: read-only deployment source; not private state.
- Image-installed packages and OS changes require a host-side rebuild and a new
  container. Do not try to update the global Pi installation in this container.
- User-managed resources under `/pi/agent` and project resources under
  `/workspace/.pi` can be changed without rebuilding; use `/reload` afterward.
- Distinguish the host Docker wrapper named `pi` from the upstream `pi` CLI
  inside the container. Use `pi -- install ...` to forward package commands on
  the host; inside the container use `pi install ...`.
- Global configuration changes affect other instances. Avoid concurrent edits.
- Do not read, print, or disclose `auth.json`, real environment files, or other
  credentials during routine setup inspection. The existing credential mount
  is not a security boundary against agent tools or loaded extensions.

Docker and its socket are not provided inside the container. Explain host-side
maintenance commands rather than assuming you can run them here.
