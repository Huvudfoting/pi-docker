# Homemade extensions only

Add `.ts`/`.js` files or subdirectories with `index.ts`/`index.js`. Both launchers
load this folder at `/opt/pi-docker/extensions` (read-only). Run `/reload` in each
affected session after edits; no rebuild needed.

Keep `package.json`: its Pi manifest makes this folder a loadable package,
including when it contains no extensions. It discovers top-level `.ts`/`.js`
files and immediate subdirectories with `index.ts`/`index.js`.

Downloaded extensions belong in the image as npm `@latest` dependencies, not here.
See [extension policy](../CUSTOMIZATION.md#extension-architecture-decision).
