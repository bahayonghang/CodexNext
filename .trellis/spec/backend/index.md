# Backend Development Guidelines

> Backend here means the local Stop-hook runtime, its SQLite-backed state, and the small local analytics server.

---

## Overview

Codex Next does not have a remote service or hosted API. The backend surface is
the local hook/runtime code under `codex-next/scripts/`, its on-disk state in
`PLUGIN_DATA` or the plugin-local fallback state directory, and the local-only
analytics query server used by the web viewer. Keep backend changes narrow,
dependency-light, and compatible with the Stop hook's JSON input/output
contract.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Runtime module layout and file ownership | Active |
| [Database Guidelines](./database-guidelines.md) | SQLite-backed runtime state and analytics persistence | Active |
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
      or analytics-query change.
- [ ] Read [Logging Guidelines](./logging-guidelines.md) before adding any
      diagnostic output.
- [ ] Read [Quality Guidelines](./quality-guidelines.md) before modifying tests
      or retry behavior.

## Reference Files

- `codex-next/scripts/auto-recover-stop.mjs`
- `codex-next/scripts/usage-analytics-server.mjs`
- `codex-next/tests/*.test.mjs`
- `codex-next/tests/fixtures/*.json`
- `codex-next/hooks/hooks.json`
- `README.md`

---

**Language**: All documentation in this directory stays in English.
