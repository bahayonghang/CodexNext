# Directory Structure

> How the JS Stop-hook runtime, SQLite store, and local analytics server are organized in this project.

---

## Overview

Codex Next keeps backend logic inside the plugin package itself. There is still
no `src/` tree, service layer, or framework router, but the runtime surface now
has two entrypoints:

- a short-lived Stop hook
- a manual local analytics server

Keep boundaries directory-based and explicit.

---

## Directory Layout

```text
codex-next/
├── hooks/
│   └── hooks.json
├── scripts/
│   ├── auto-recover-stop.mjs
│   ├── usage-analytics-server.mjs
│   └── lib/
│       ├── analytics-store.mjs
│       └── classify-stop.mjs
├── sql/
│   └── schema.sql
├── tests/
│   ├── fixtures/
│   │   ├── stop-non-matching.json
│   │   ├── stop-transient-429.json
│   │   ├── stop-transient-503.json
│   │   └── stop-usage-limit.json
│   ├── analytics-store.test.mjs
│   ├── auto-recover-stop.test.mjs
│   └── usage-analytics-server.test.mjs
└── .local-state/
    └── codex-next.sqlite
```

---

## Module Organization

- `scripts/auto-recover-stop.mjs` is the Stop-hook entrypoint only. Keep hook
  stdin parsing, decision orchestration, and stdout response shaping here.
- `scripts/lib/classify-stop.mjs` owns retry-class enums, regex families,
  prompts, and caps.
- `scripts/lib/analytics-store.mjs` owns SQLite path resolution, bootstrap,
  legacy JSON compatibility import, and query helpers for both runtime
  entrypoints.
- `scripts/usage-analytics-server.mjs` owns HTTP routing and static-file
  serving. Do not move hook decision logic into the server.
- `sql/schema.sql` is the only schema source of truth. Do not duplicate table
  definitions in ad hoc strings outside migration/bootstrap code.
- Put test-only helpers or fixtures inside `tests/`, not at repo root.

## Naming Conventions

- Runtime entrypoints use lowercase kebab-case `.mjs` filenames.
- Shared runtime helpers live under `scripts/lib/` and stay noun- or verb-led:
  `analytics-store.mjs`, `classify-stop.mjs`.
- Tests use `*.test.mjs` so `node --test` can run the suite without extra
  tooling.
- Fixture names describe the stop class being modeled.
- State files and databases are machine-owned; do not hand-author files under
  `.local-state/`.

## Examples

- `codex-next/scripts/auto-recover-stop.mjs` composes shared helpers but keeps
  the hook contract readable in one file.
- `codex-next/scripts/lib/analytics-store.mjs` is shared by both the hook and
  the local server instead of duplicating DB bootstrap/query logic.
