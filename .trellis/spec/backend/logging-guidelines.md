# Logging Guidelines

> Logging is intentionally minimal because stdout is part of the hook protocol.

---

## Overview

The current runtime does not use a logging library. The Stop hook communicates
with Codex through stdout JSON, so casual prints are dangerous. Most debugging
should happen through tests and fixtures, not live runtime logs.

## Log Levels

- Hook normal operation: no logs.
- Server normal operation: one startup URL line from the CLI entrypoint is
  acceptable; request handlers should otherwise stay quiet.
- Temporary local debugging: prefer assertions or targeted test cases.
- Emergency diagnostics while developing: use stderr only, remove it before the
  change is considered complete.

## Structured Logging

- There is no structured runtime logging format today.
- If the plugin eventually needs diagnostics, introduce them behind an explicit
  opt-in path and keep hook stdout reserved for the response object only.

## What to Log

- In committed hook code, nothing by default.
- In the manual server CLI path, printing the startup URL is fine.
- In tests, encode expected situations as fixtures and assertions rather than
  transient console output.

## What NOT to Log

- Do not print Stop-hook payloads to stdout.
- Do not log transcript content, session keys, filesystem paths, or full state
  payloads in committed runtime code.
- Do not emit stack traces from exception handlers unless the user explicitly
  asked for a temporary debugging build.
