# Database Guidelines

> Persistence conventions for this project. There is no database.

---

## Overview

Codex Next does not use SQLite, Postgres, an ORM, or migrations. The only
persistent data is per-session JSON state written by the Stop hook so retries
stay bounded across interrupted turns.

Reference implementation:

- `codex-next/scripts/auto-recover-stop.py::default_state_dir`
- `codex-next/scripts/auto-recover-stop.py::stable_session_key`
- `codex-next/scripts/auto-recover-stop.py::load_state`
- `codex-next/scripts/auto-recover-stop.py::save_state`

## Query Patterns

- Treat state reads and writes as whole-document JSON operations.
- Read one state file per session key. Do not introduce cross-session scans,
  indexes, or directory-wide reconciliation logic unless the plugin gains a
  real management surface.
- Keep state access behind small helpers (`state_file_path`, `load_state`,
  `save_state`) instead of sprinkling raw filesystem reads through the hook.

## Migrations

- There are no migrations today.
- When the state schema changes, preserve backward compatibility by defaulting
  missing keys in `load_state(...)` rather than writing a migration system.
- Add or adjust tests that exercise old or partial state payloads before
  changing the stored shape.

## Naming Conventions

- State files are named from a stable session key:
  `transcript-<hash>.json` when `transcript_path` is known, otherwise
  `fallback-<hash>.json`.
- Persisted JSON fields use snake_case to match Python naming:
  `attempts_total`, `attempts_by_kind`, `last_processed_turn_id`,
  `transcript_prefix_hash`.
- Retry classes are string enums, not free-form labels:
  `transient_rate_limit`, `transient_overload`, `usage_limit`.

## Common Mistakes

- Do not add a new persistence layer just to store a few counters.
- Do not key state by raw message text; use session identity as the existing
  code does.
- Do not assume the state file is complete or valid JSON. `load_state(...)`
  must keep tolerating missing or malformed files.
- Do not write state anywhere except `PLUGIN_DATA` or the plugin-local fallback
  directory.
