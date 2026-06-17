# Quality Guidelines

> Code quality standards for the JS hook runtime, SQLite store, and local analytics server.

---

## Overview

Backend changes in this repo are small but high leverage: a broken Stop hook
can either do nothing or trap Codex in a loop, and a bad store/server change
can make analytics misleading. Favor small edits, behavioral coverage, and no
speculative architecture.

## Forbidden Patterns

- Unbounded retries or removing the global/per-kind caps.
- Printing anything except the hook response JSON to stdout.
- Adding third-party dependencies for parsing, logging, or persistence when the
  standard library already covers the need.
- Reading the entire transcript on every stop when the current offset-based
  delta scan is enough.
- Writing runtime state outside `PLUGIN_DATA` or the plugin-local fallback dir.
- Storing transcript text, prompt text, or assistant message bodies in SQLite.
- Starting a long-running server from the Stop-hook path.

## Required Patterns

- Keep classification/store behavior behind reusable helpers when practical so
  tests can call it directly, as `processStop(...)`, `querySummary(...)`, and
  `queryEvents(...)` do now.
- Preserve normalized return shapes for dynamic JSON input and DB rows.
- Keep regex/classification changes paired with fixture-backed tests.
- Match existing repo guidance: minimal code, no speculative abstractions, and
  changes scoped to the requested behavior.

## Testing Requirements

- Run:
  `node --test codex-next/tests/*.test.mjs`
- When manifest-facing metadata changes, also run:
  `node -e "JSON.parse(require('node:fs').readFileSync('codex-next/.codex-plugin/plugin.json', 'utf8')); JSON.parse(require('node:fs').readFileSync('codex-next/hooks/hooks.json', 'utf8')); console.log('json ok')"`
- When server/query behavior changes, smoke test:
  `node codex-next/scripts/usage-analytics-server.mjs --host 127.0.0.1 --port 3210`
- Add or update fixtures for every new stop class, retry rule, or transcript
  parsing edge case.
- Prefer behavioral tests over asserting private helper internals.

## Code Review Checklist

- Does the change preserve the JSON output contract for blocked stops?
- Are retry caps still enforced per class and globally?
- Does the code still no-op safely on malformed input and I/O failure?
- Does SQLite remain the durable source of truth for hook state and analytics?
- Are docs and tests updated when user-visible behavior or hook wiring changes?
- Is the change still smaller than the problem, or did it introduce a needless
  abstraction?
