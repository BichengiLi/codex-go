# Implementation slices

Parent: [spec](spec.md). All three slices ready; no external blockers.

1. **Desktop catalog** — `project/list` discovery, selected-root import, persistent
   authorization and labeled UI. Verify HTTP catalog/import/list/history boundaries.
2. **Delivered files** — confined directory listing and streaming downloads, file
   cards and assistant local links. Verify content, auth, traversal and private paths.
3. **Permissions** — effective per-chat snapshot and idle update UI, including full
   access confirmation. Verify upstream settings events, reconnect and busy guards.

Close each slice after its boundary checks pass; finish with real desktop protocol
validation, responsive browser QA, documentation sync, build and CI.
