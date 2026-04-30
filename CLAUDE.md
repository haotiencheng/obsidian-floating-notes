# Floating Notes — Project Notes

## Releasing

Bump version with `npm run version` wrapper (alias: `npm version <patch|minor|major>`).

The `version` script in `package.json` runs `version-bump.mjs` which syncs `manifest.json` + `versions.json` to match `package.json`, then stages them. `npm version` then creates the version commit and tag automatically.

Tag convention: **no `v` prefix** (e.g. `1.1.0`, not `v1.1.0`). `.npmrc` pins `tag-version-prefix=""` so this stays consistent.

When to bump:
- patch — bug fixes, doc/tooling only
- minor — new user-facing setting or capture mode
- major — breaking changes to settings schema or external trigger contract
