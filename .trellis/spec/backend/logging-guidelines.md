# Logging Guidelines

> Logging is intentionally minimal because stdout is part of the hook protocol.

---

## Overview

The current runtime does not use a logging library. `auto-recover-stop.py`
communicates with Codex through stdout JSON, so casual prints are dangerous.
Most debugging should happen through unit tests and fixtures, not live runtime
logs.

## Log Levels

- Normal operation: no logs.
- Temporary local debugging: prefer assertions or targeted test cases.
- Emergency diagnostics while developing: use stderr only, remove it before the
  change is considered complete.

## Structured Logging

- There is no structured runtime logging format today.
- If the plugin eventually needs diagnostics, introduce them behind an explicit
  opt-in path and keep stdout reserved for the hook response object only.

## What to Log

- In committed code, nothing by default.
- In tests, encode expected situations as fixtures and assertions rather than
  transient console output.

## What NOT to Log

- Do not print Stop-hook payloads to stdout.
- Do not log transcript content, session keys, filesystem paths, or full state
  payloads in committed runtime code.
- Do not emit stack traces from exception handlers unless the user explicitly
  asked for a temporary debugging build.
