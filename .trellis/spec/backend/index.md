# Backend Development Guidelines

> Backend here means the Python Stop-hook runtime and its file-based session state.

---

## Overview

Codex Next does not have a server, API layer, or service container. The
"backend" surface is the Python hook runtime under `codex-next/scripts/` plus
its on-disk session state in `PLUGIN_DATA` or the plugin-local fallback state
directory. Keep backend changes narrow, dependency-light, and compatible with
the Stop hook's JSON input/output contract.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Runtime module layout and file ownership | Active |
| [Database Guidelines](./database-guidelines.md) | File-based state instead of a database | Active |
| [Error Handling](./error-handling.md) | Fail-open behavior and hook output contracts | Active |
| [Quality Guidelines](./quality-guidelines.md) | Testing, review, and forbidden runtime changes | Active |
| [Logging Guidelines](./logging-guidelines.md) | Why stdout is reserved and logging stays minimal | Active |

---

## Pre-Development Checklist

- [ ] Read [Directory Structure](./directory-structure.md) before moving files
      or adding helpers.
- [ ] Read [Error Handling](./error-handling.md) before changing stop
      classification or output JSON.
- [ ] Read [Database Guidelines](./database-guidelines.md) for any persistence
      change, even though the project does not use a database.
- [ ] Read [Logging Guidelines](./logging-guidelines.md) before adding any
      diagnostic output.
- [ ] Read [Quality Guidelines](./quality-guidelines.md) before modifying tests
      or retry behavior.

## Reference Files

- `codex-next/scripts/auto-recover-stop.py`
- `codex-next/tests/test_auto_recover_stop.py`
- `codex-next/tests/fixtures/*.json`
- `codex-next/hooks/hooks.json`
- `README.md`

---

**Language**: All documentation in this directory stays in English.
