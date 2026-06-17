# Hook Guidelines

> How declarative Codex hook wiring is defined in this project.

---

## Overview

This project ships one hook surface: a Codex `Stop` hook defined in
`codex-next/hooks/hooks.json`. Keep hook files declarative and put all behavior
in the Python script they invoke.

## Custom Hook Patterns

- One hook file per plugin package.
- Use `${PLUGIN_ROOT}` in commands so the package remains relocatable.
- Keep shell commands short and explicit. Current convention:
  `python -X utf8 "${PLUGIN_ROOT}/scripts/auto-recover-stop.py"`
- Put timeout policy in `hooks.json`, not inside README prose.

## Data Fetching

- There is no network fetch logic in the hook configuration.
- If runtime code needs to read files or payload content, do it inside the
  script, not by complicating the hook declaration.

## Naming Conventions

- Hook matcher `"*"` is acceptable when the script self-filters based on the
  Stop payload, as this plugin does today.
- Keep script filenames descriptive about the stop they process.
- Avoid adding multiple near-duplicate hook commands for each error class; keep
  classification centralized in the runtime script.

## Common Mistakes

- Hardcoding absolute paths instead of `${PLUGIN_ROOT}`.
- Encoding business logic in hook JSON instead of the script.
- Adding multiple hooks that can race or duplicate retry decisions.
- Forgetting that `timeout` is part of the user-visible reliability contract.
