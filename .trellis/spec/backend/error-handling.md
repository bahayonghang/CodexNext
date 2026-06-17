# Error Handling

> How errors are handled in this project.

---

## Overview

The Stop hook is defensive and fail-open. If payload parsing, transcript I/O, or
state loading fails, the plugin should usually return no JSON and let Codex stop
normally instead of crashing or emitting malformed output.

Primary reference:

- `codex-next/scripts/auto-recover-stop.py`
- `codex-next/tests/test_auto_recover_stop.py`

---

## Error Types

There are no custom exception classes. Error classification is data-driven:

- `transient_rate_limit`
- `transient_overload`
- `usage_limit`

Each class maps to:

- a continue prompt in `CONTINUE_MESSAGES`
- a capped-stop message in `STOP_MESSAGES`
- a per-kind retry cap in `MAX_ATTEMPTS_BY_KIND`

## Error Handling Patterns

- Wrap untrusted boundaries in broad `try/except` blocks and fall back to safe
  defaults:
  - `read_stdin()` -> `""`
  - `parse_payload(...)` -> `{}`
  - `load_state(...)` -> normalized empty state
  - transcript reads -> empty chunk / preserved offset behavior
- Keep helper return values structured so `process_stop(...)` can decide whether
  to continue, stop with guidance, or no-op without throwing.
- Use `None` as the "allow normal stop" signal. The caller emits JSON only when
  a hook decision must be sent back to Codex.
- Preserve Windows UTF-8 setup at process start. Hook output must stay valid
  UTF-8 JSON on Windows shells.

## API Error Responses

The hook has two output contracts:

- Continue the task:
  `{"decision": "block", "reason": "<continue prompt>"}`
- Stop auto-retrying after a cap:
  `{"continue": false, "stopReason": "...", "systemMessage": "..."}`

Anything else is a bug. Do not print plain text, stack traces, or mixed stdout
content because Codex expects machine-readable JSON when the hook blocks.

## Common Mistakes

- Treating every error-like message as retriable. The script requires both
  signal words and class-specific context.
- Throwing from helper functions that can safely degrade to a no-op.
- Writing debug output to stdout, which corrupts the hook contract.
- Removing duplicate-turn or `stop_hook_active` guards and reintroducing loops.

## Scenario: Codex Stop Hook Auto-Recovery

### 1. Scope / Trigger

- Trigger: root-level Codex plugins that bundle `Stop` hooks to classify
  OpenAI-side failures and decide whether to auto-continue or stop with
  guidance.

### 2. Signatures

- Hook config entry:
  - `codex-next/hooks/hooks.json` -> `hooks.Stop[].hooks[].command`
- Hook script:
  - `codex-next/scripts/auto-recover-stop.py`
- Test entrypoint:
  - `python -m unittest discover -s codex-next/tests -p "test_*.py"`

### 3. Contracts

- Input fields consumed from the Stop hook payload:
  - `turn_id: string | null`
  - `stop_hook_active: boolean`
  - `last_assistant_message: string | null`
  - `transcript_path: string | null`
  - `cwd: string | null`
  - `model: string | null`
- State file location:
  - `${PLUGIN_DATA}/<session-key>.json` when installed
  - plugin-local fallback directory during direct repo execution
- State fields:
  - `offset`
  - `attempts_total`
  - `attempts_by_kind.transient_rate_limit`
  - `attempts_by_kind.transient_overload`
  - `attempts_by_kind.usage_limit`
  - `last_processed_turn_id`
  - `transcript_prefix_hash`
- Continue output contract:
  - `{"decision": "block", "reason": "<continue prompt>"}`
- Capped-stop output contract:
  - `{"continue": false, "stopReason": "...", "systemMessage": "..."}`

### 4. Validation & Error Matrix

- `stop_hook_active == true` -> do nothing, allow normal stop
- same `turn_id` as the last processed stop -> do nothing, avoid double-trigger
- transcript file missing or unreadable -> fall back to `last_assistant_message`
- transcript prefix changed or file shrank -> reset offset to `0`
- `429` + error/interruption wording -> `transient_rate_limit`
- `503`/overload wording + error/interruption wording -> `transient_overload`
- usage-limit/model-cap wording + failure/limit context -> `usage_limit`
- class cap exhausted or global cap exhausted -> stop auto-retrying, return
  guidance

### 5. Good/Base/Bad Cases

- Good:
  - a genuine `429` stop returns one continue decision and advances state
  - a repeated usage-limit stop retries until its cap, then returns guidance
- Base:
  - a successful ordinary stop returns no JSON and leaves Codex behavior
    unchanged
- Bad:
  - retrying forever on the same stop content
  - treating usage-limit wording as unbounded transient retry
  - keying session state only by raw message text

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

### 7. Wrong vs Correct

#### Wrong

- Read the full transcript on every stop
- Retry every matched error forever
- Treat usage-limit errors exactly like generic `429` without a cap

#### Correct

- Read only new transcript bytes, plus `last_assistant_message`
- Track per-session state in `PLUGIN_DATA`
- Enforce per-class and global retry caps
- Switch to guidance output after the cap is exhausted
