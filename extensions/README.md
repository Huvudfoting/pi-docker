# Repository-owned extensions

The common launcher loads this folder read-only at `/opt/pi-docker/extensions`
in both images. Add top-level `.ts`/`.js` files or immediate subdirectories with
`index.ts`/`index.js`. Keep `package.json`: its manifest supports an empty folder
and selects those entry points, not arbitrary nested files.

Run `/reload` in affected Pi processes after edits; no rebuild. Never store secrets
here. Changes affect all containers using this deployment.

Put image-specific npm extensions/skills/instructions in the derived image
(`images/custom/` demonstrates it), not shared configuration if they should stay
out of base. The required Herdr reporter is host-installed in shared configuration,
not here. See [extension ownership](../docs/CUSTOMIZATION.md#optional-extensions).
