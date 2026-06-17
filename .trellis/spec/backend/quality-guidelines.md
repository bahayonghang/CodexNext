# Quality Guidelines

> Code quality standards for the Python hook runtime.

---

## Overview

Backend changes in this repo are small but high leverage: a broken Stop hook
can either do nothing or trap Codex in a loop. Favor small edits, exhaustive
unit coverage for behavior changes, and no speculative architecture.

## Forbidden Patterns

- Unbounded retries or removing the global/per-kind caps.
- Printing anything except the hook response JSON to stdout.
- Adding third-party dependencies for parsing, logging, or persistence when the
  standard library already covers the need.
- Reading the entire transcript on every stop when the current offset-based
  delta scan is enough.
- Writing runtime state outside `PLUGIN_DATA` or the plugin-local fallback dir.

## Required Patterns

- Keep new behavior behind pure helpers when practical so tests can call it
  directly, as `process_stop(...)` does now.
- Preserve type hints and normalized return shapes for dynamic JSON input.
- Keep regex/classification changes paired with fixture-backed tests.
- Match existing repo guidance: minimal code, no speculative abstractions, and
  changes scoped to the requested behavior.

## Testing Requirements

- Run:
  `python -m unittest discover -s codex-next/tests -p "test_*.py"`
- When manifest-facing metadata changes, also run:
  `python C:\Users\lyh\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py codex-next`
- Add or update fixtures for every new stop class, retry rule, or transcript
  parsing edge case.
- Prefer behavioral tests over asserting private helper internals.

## Code Review Checklist

- Does the change preserve the JSON output contract for blocked stops?
- Are retry caps still enforced per class and globally?
- Does the code still no-op safely on malformed input and I/O failure?
- Are docs and tests updated when user-visible behavior or hook wiring changes?
- Is the change still smaller than the problem, or did it introduce a needless
  abstraction?
