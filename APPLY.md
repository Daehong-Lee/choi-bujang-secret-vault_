# Stage 8 integrated patch: config, contract, README, and API alignment

This is a selective patch ZIP, not a complete project archive. Copy the files at the same relative paths into the project and review the diff before committing. Preserve all unrelated working-tree changes.

## Included changes
- Set `aleph.config.json` step to 8 and list only routes allowed by the decider.
- Align `docs/DECIDER_REQUEST.md`, `docs/ENGINE_CONTEXT.md`, and the Stage 8 README record with opaque virtual IDs, API-layer ownership checks, and announcement-write denial by the decider.
- Deny ID-less `GET /api/notes` collection reads.
- Keep announcement writes in the separate server management API path, with verified judge identity and persisted resource ownership checks, rather than asking the decider to authorize those writes.
- Add/update route, ownership, configuration, and resource-type regression tests.

## Important integration limitation
The existing browser UI still calls `GET /api/notes` to populate its memo list. This patch intentionally denies that collection read under the Stage 8 rule, so the current UI list flow needs a separate design/update before the stage can be considered fully complete. The memo item API also requires a signed server engine context; the browser must not create that context itself. Do not claim production or judge success from these local tests.

## Tests run in the source working copy
- `node --test test/*.test.mjs` — 24 passed.
- `npm run decider:test` — 4 virtual scenarios passed; not a judge result.
- Syntax checks for changed JavaScript files — passed.
- `git diff --check` on the selected Stage 8 files — passed.

No commit, push, deployment, database migration, or live API test was performed.
