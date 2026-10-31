# Implementation slices

Parent: [spec](spec.md). All three slices ready; no external blockers.

1. **Desktop catalog** — `project/list` discovery, selected-root import, persistent
   authorization and labeled UI. Verify HTTP catalog/import/list/history boundaries.
2. **Delivered files** — confined directory listing and streaming downloads, file
   cards and assistant local links. Verify content, auth, traversal and private paths.
3. **Permissions** — effective per-chat snapshot and idle update UI, including full
   access confirmation. Verify upstream settings events, reconnect and busy guards.

All three slices implemented and boundary checks passed. Real desktop protocol
probe verified 14 saved projects, effective settings, model file delivery and
permissions after restart. Browser checked at 390px and 1280px, including a real
53 MB PDF download and a read-only permission update. Documentation synchronized;
all 13 tests and the production build passed. CI runs the same checks on Windows
and Ubuntu for the final commit.
