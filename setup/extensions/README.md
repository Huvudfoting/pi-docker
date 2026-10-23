# Homemade extensions only

Add `.ts`/`.js` files or subdirectories with `index.ts`/`index.js`. Both launchers
load this folder at `/opt/pi-docker/extensions` (read-only). Run `/reload` in each
affected session after edits; no rebuild needed.

Downloaded extensions belong in the image as npm `@latest` dependencies, not here.
See [extension policy](../CUSTOMIZATION.md#extension-architecture-decision).
