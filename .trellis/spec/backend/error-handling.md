# Error Handling

> How errors are handled in this project.

---

## Overview

The Stop hook is defensive and fail-open. If payload parsing, transcript I/O,
SQLite open/write, or legacy-state import fails, the plugin should usually
return no JSON and let Codex stop normally instead of crashing or emitting
malformed output.

Primary reference:

- `codex-next/scripts/auto-recover-stop.mjs`
- `codex-next/scripts/lib/analytics-store.mjs`
- `codex-next/tests/auto-recover-stop.test.mjs`

---

## Error Types

There are no custom exception classes. Stop classification is data-driven:

- `transient_rate_limit`
- `transient_overload`
- `usage_limit`

Each class maps to:

- a continue prompt in `CONTINUE_MESSAGES`
- a capped-stop message in `STOP_MESSAGES`
- a per-kind retry cap in `MAX_ATTEMPTS_BY_KIND`

## Error Handling Patterns

- Wrap untrusted boundaries in broad `try/catch` blocks and fall back to safe
  defaults:
  - stdin reads -> `""`
  - payload parse -> `null`
  - transcript reads -> empty chunk / preserved offset behavior
  - legacy JSON import -> ignore invalid file and start from normalized defaults
- Treat SQLite as required for durable retry safety, but not as a reason to
  block Codex. If DB open or write fails, the hook returns `null` and allows
  the normal stop path.
- Keep helper return values structured so `processStop(...)` can decide whether
  to continue, stop with guidance, or no-op without throwing.
- Use `null` as the "allow normal stop" signal. The caller emits JSON only when
  a hook decision must be sent back to Codex.
- Preserve Windows UTF-8 setup at process start. Hook output must stay valid
  UTF-8 JSON on Windows shells.

## Output Contracts

The hook has two output contracts:

- Continue the task:
  `{"decision": "block", "reason": "<continue prompt>"}`
- Stop auto-retrying after a cap:
  `{"continue": false, "stopReason": "...", "systemMessage": "..."}`

Anything else is a bug. Do not print plain text, stack traces, or mixed stdout
content because Codex expects machine-readable JSON when the hook blocks.

The local analytics server has separate HTTP error contracts:

- `405` plain text for non-`GET` requests
- `404` plain text for unknown routes
- `500` plain text with a short message when a request handler throws

## Common Mistakes

- Treating every error-like message as retriable. The classifier requires both
  signal words and class-specific context.
- Throwing from helper functions that can safely degrade to a no-op.
- Writing debug output to stdout, which corrupts the hook contract.
- Removing duplicate-turn or `stop_hook_active` guards and reintroducing loops.
- Converting a DB failure into a retry decision with non-persistent counters.

## Scenario: SQLite-backed Codex Stop Hook Auto-Recovery

### 1. Scope / Trigger

- Trigger: root-level Codex plugins that bundle `Stop` hooks to classify
  OpenAI-side failures, persist bounded-retry state, and optionally expose
  read-only local analytics.

### 2. Signatures

- Hook config entry:
  - `codex-next/hooks/hooks.json` -> `hooks.Stop[].hooks[].command`
- Hook script:
  - `codex-next/scripts/auto-recover-stop.mjs`
- Shared store:
  - `codex-next/scripts/lib/analytics-store.mjs`
- Local server:
  - `codex-next/scripts/usage-analytics-server.mjs`
- Test entrypoint:
  - `node --test codex-next/tests/*.test.mjs`

### 3. Contracts

- Input fields consumed from the Stop hook payload:
  - `turn_id: string | null`
  - `stop_hook_active: boolean`
  - `last_assistant_message: string | null`
  - `transcript_path: string | null`
  - `cwd: string | null`
  - `model: string | null`
- SQLite location:
  - `${PLUGIN_DATA}/codex-next.sqlite` when installed
  - `codex-next/.local-state/codex-next.sqlite` during repo-local execution
- Legacy compatibility file:
  - `${stateDir}/<session-key>.json` when it already exists from the old
    runtime
- `hook_state` fields:
  - `offset`
  - `attempts_total`
  - `attempts_rate_limit`
  - `attempts_overload`
  - `attempts_usage_limit`
  - `last_processed_turn_id`
  - `transcript_prefix_hash`
  - `migrated_from_json`
- Continue output contract:
  - `{"decision": "block", "reason": "<continue prompt>"}`
- Capped-stop output contract:
  - `{"continue": false, "stopReason": "...", "systemMessage": "..."}`
- Read-only HTTP routes:
  - `GET /api/health`
  - `GET /api/facets`
  - `GET /api/summary`
  - `GET /api/events`

### 4. Validation & Error Matrix

- `stop_hook_active == true` -> do nothing, allow normal stop
- same `turn_id` as the last processed stop -> do nothing, avoid double-trigger
- transcript file missing or unreadable -> fall back to `last_assistant_message`
- transcript prefix changed or file shrank -> reset offset to `0`
- SQLite open/bootstrap fails -> do nothing, allow normal stop
- hook-state query/import/write fails -> do nothing, allow normal stop
- `429` + error/interruption wording -> `transient_rate_limit`
- `503`/overload wording + error/interruption wording -> `transient_overload`
- usage-limit/model-cap wording + failure/limit context -> `usage_limit`
- class cap exhausted or global cap exhausted -> stop auto-retrying, return
  guidance
- server request uses unsupported method -> `405`
- server route not found -> `404`

### 5. Good/Base/Bad Cases

- Good:
  - a genuine `429` stop returns one continue decision, advances SQLite state,
    and appends one analytics event
  - a repeated usage-limit stop retries until its cap, then returns guidance
  - the viewer can query summary and paginated events while the hook keeps
    writing to the same DB
- Base:
  - a successful ordinary stop returns no JSON and leaves Codex behavior
    unchanged
- Bad:
  - retrying forever on the same stop content
  - silently resetting counters because legacy JSON was ignored
  - treating usage-limit wording as unbounded transient retry
  - keying session state only by raw message text
  - storing transcript or assistant message text in the DB

### 6. Tests Required

- Unit tests for:
  - `429` classification
  - `503` classification
  - `usage_limit` classification
  - non-matching stop
  - `stop_hook_active`
  - duplicate `turn_id`
  - transcript rotation/reset handling
  - retry-cap exhaustion
  - SQLite bootstrap without transcript-text columns
  - lazy legacy JSON import
  - summary/event/facet queries
  - local server health/summary/events/facets/static HTML routes

### 7. Wrong vs Correct

#### Wrong

- Read the full transcript on every stop
- Retry every matched error forever
- Treat usage-limit errors exactly like generic `429` without a cap
- Fail closed when SQLite is unavailable

#### Correct

- Read only new transcript bytes, plus `last_assistant_message`
- Track per-session state in SQLite under `PLUGIN_DATA`
- Enforce per-class and global retry caps
- Switch to guidance output after the cap is exhausted
- Fail open when durable state cannot be trusted
