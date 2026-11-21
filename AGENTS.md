# Project stage

Pre-release: no users, production data, or external consumers.

- Breaking changes are free. Change schemas, APIs, formats, and flags directly.
- No backwards compatibility: no migrations, shims, aliases, versioned fields, or fallback readers. Old data is disposable. If you write compat code, delete it.

# Repo hygiene

Public GitHub repo. Keep it lean.

- Only product files. No scratch, experiments, logs, or notes.
- Use `.scratch/` (gitignored) only when a tool needs the project filesystem.
- Docs stay brief and durable: explain why, not what; no versions, counts, or dates that go stale; update or delete them in the same change as the code.
- The custom image is only an example of extending base: document how to add extensions to it, never individual extensions or their usage.
- No new `.md` files without asking. The README summarises the project for a human reader and links to `docs/` for detail.
- Merge pull requests with squash merges, so main history stays one commit per PR.
- Never commit secrets, local paths, or personal data.
