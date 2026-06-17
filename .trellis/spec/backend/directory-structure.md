# Directory Structure

> How the Python Stop-hook runtime is organized in this project.

---

## Overview

Codex Next keeps backend logic inside the plugin package itself. There is no
`src/` tree, service layer, or API routing. The runtime path is small enough
that feature boundaries are directory-based:

- `codex-next/scripts/` holds executable hook logic
- `codex-next/tests/` holds unit tests for that logic
- `codex-next/tests/fixtures/` holds captured Stop-hook payloads
- `codex-next/.local-state/` is fallback runtime state for local repo execution

---

## Directory Layout

```text
codex-next/
├── .codex-plugin/
│   └── plugin.json
├── hooks/
│   └── hooks.json
├── scripts/
│   └── auto-recover-stop.py
├── tests/
│   ├── fixtures/
│   │   ├── stop-non-matching.json
│   │   ├── stop-transient-429.json
│   │   ├── stop-transient-503.json
│   │   └── stop-usage-limit.json
│   └── test_auto_recover_stop.py
└── .local-state/
    └── *.json
```

---

## Module Organization

- Keep all Stop-hook decision logic in `scripts/auto-recover-stop.py` until
  there is proven repetition. The current project favors one readable script
  over a premature helper tree.
- Add a new module only when a second runtime entrypoint or a clearly reusable
  parsing/state component appears.
- Put test-only helpers inside `tests/` rather than importing from ad hoc files
  at repo root.
- Keep reference material under `ref/` isolated from production paths. Do not
  import code from `ref/`.

## Naming Conventions

- Runtime scripts use lowercase kebab-case filenames, matching
  `auto-recover-stop.py`.
- Tests use `test_*.py` so `unittest discover` can find them without extra
  configuration.
- Fixture names describe the stop class being modeled:
  `stop-transient-429.json`, `stop-usage-limit.json`, and so on.
- State files are derived from session identity and should stay machine-made;
  do not hand-author files in `.local-state/`.

## Examples

- `codex-next/scripts/auto-recover-stop.py` keeps classification, state I/O,
  and output shaping together because the runtime surface is still small.
- `codex-next/tests/test_auto_recover_stop.py` mirrors the public behavior of
  `process_stop(...)` instead of reaching into private implementation details.
