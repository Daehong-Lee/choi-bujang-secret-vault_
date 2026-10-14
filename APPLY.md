# Stage 8 login separation and ID-based memo CRUD patch

This is a selective patch, not a complete repository. Copy the included files into the project root at the same relative paths. Review `git diff` before committing and preserve unrelated working-tree changes.

## Changes
- Login status stays in the login panel. Memo lookup/create/update/delete errors appear separately in the memo panel.
- Removed the UI's ID-less `GET /api/notes` call. Users look up one memo by its ID; a newly created memo displays its ID and can be edited/deleted.
- `POST /api/notes` remains available to any successfully verified login. The server sets `owner_id` from the verified token; the request body cannot select the owner.
- Item `GET`, `PUT`, and `DELETE` check the persisted row's `resource_type=memo` and `owner_id` against the verified identity. A foreign or non-memo ID returns 404 without returning content.
- A signed engine context, when present, is additionally verified and must allow the route. The browser never creates that signature. Without engine context, the API still applies login and database ownership checks so ordinary signed-in CRUD can work; this does not claim that the decider was invoked for that request.
- Stage 8 config, decider contract, engine-context docs, README, and regression tests are aligned.

## Tests run in the source working copy
- `node --test test/*.test.mjs` — 28 passed.
- `npm run decider:test` — 4 virtual scenarios passed; this is not a judge result.
- `npm run build -- --local` — passed.
- `git diff --check` on the selected Stage 8 files — passed.

The CRUD tests use an in-memory fake store and a mocked verified identity for the `a@example.com` scenario. They prove the route logic in isolation, not that the real Supabase account exists, its password works, or production CRUD succeeded. No live Supabase request, commit, push, or deployment was performed.

## Manual verification after applying and deploying
1. Sign in with the intended account; confirm the status appears only in the login panel.
2. Create a harmless virtual memo. Confirm its ID appears.
3. Use that ID to read the memo, edit it, and delete it.
4. Try the same ID under a different account. It must return 404 and never reveal the memo body.
5. `GET /api/notes` without an ID must remain denied (403).
