# Design: Codex Auto-Recovery for 429, 503, and Usage Limits

## Problem Summary

`ref/ClaudeNext` proves the general pattern: if the platform cannot surface a
dedicated "429 happened" event, a `Stop` hook can inspect the just-finished
turn and decide whether the agent should continue.

Codex changes the design space in two useful ways:

- Codex has a first-class `Stop` hook.
- The hook input includes `stop_hook_active`, `last_assistant_message`, and
  `transcript_path`, so the recovery logic can use hook-native data before
  falling back to transcript scanning.

The user also clarified the delivery shape: this must ship as a root-level
plugin package similar to `ref/ClaudeNext`, not as this repository's own
`.codex/` runtime config.

## Constraints From Official Sources

- `429` is retryable, but the recommended mitigation is exponential backoff and
  waiting for the relevant window to reset.
- `500` / `503` are temporary server-side failures and should be retried later.
- Usage-limit / quota problems are handled operationally, not with immediate
  blind retries: `/status`, extra credits, lower-cost models, or waiting for
  reset.
- Hook commands run locally and should not rely on patching Codex internals.
- Codex hook transcript JSONL is useful for incremental detection, but it is
  not a stable public schema. The implementation should consume as little of it
  as possible.
- Codex plugins support default `hooks/hooks.json` discovery and provide
  `${PLUGIN_ROOT}` and `PLUGIN_DATA` to hook commands.

## Recommended MVP

Implement a root-level `codex-next/` plugin package whose `Stop` hook
classifies the just-ended turn into one of four buckets:

1. `transient_rate_limit`
2. `transient_overload`
3. `usage_limit`
4. `no_match`

Recommended behavior:

- `transient_rate_limit` -> auto-continue with a focused resume prompt
- `transient_overload` -> auto-continue with a focused resume prompt
- `usage_limit` -> auto-continue with a focused resume prompt until its retry
  cap is hit, then stop with actionable guidance
- `no_match` -> allow stop normally

This keeps the first version compatible with Codex plugin distribution, while
avoiding a dependency on undocumented local app-server wiring.

## Architecture

### Files

- `codex-next/.codex-plugin/plugin.json`
  - plugin manifest
- `codex-next/README.md`
  - package-level behavior and usage notes
- `codex-next/hooks/hooks.json`
  - default plugin hook entrypoint
- `codex-next/scripts/auto-recover-stop.py`
  - recovery script
- `codex-next/tests/test_auto_recover_stop.py`
  - fixture-driven unit coverage using Python stdlib `unittest`
- `codex-next/tests/fixtures/*.json`
  - sample hook payloads and transcript snippets for reproducible checks

### Runtime Inputs

Primary inputs from the Codex `Stop` hook payload:

- `stop_hook_active`
- `last_assistant_message`
- `transcript_path`
- `cwd`
- `model`

The implementation should:

1. Exit immediately when `stop_hook_active` is true.
2. Start with `last_assistant_message` because it is the smallest stable input.
3. Read only the new transcript bytes since the last successful scan when
   `transcript_path` exists.
4. Classify on the combined text from those two sources.

### State Storage

Store per-session recovery state under `PLUGIN_DATA` when available. For direct
repo-local execution outside an installed plugin, fall back to a plugin-owned
local data directory.

Suggested state shape:

```json
{
  "offset": 0,
  "attempts_total": 0,
  "attempts_by_kind": {
    "transient_rate_limit": 0,
    "transient_overload": 0,
    "usage_limit": 0
  },
  "last_processed_turn_id": "",
  "transcript_prefix_hash": ""
}
```

Session key preference:

1. transcript path hash
2. cwd + model hash fallback

## Detection Strategy

### Text Sources

- `last_assistant_message`
- newly appended transcript chunk since stored offset

### Regex Families

Transient rate-limit indicators:

- `429`
- `rate limit`
- `too many requests`
- `retry after`
- `rate limited`

Transient overload indicators:

- `503`
- `service unavailable`
- `server error`
- `internal server error`
- `bad gateway`
- `gateway timeout`
- `overloaded`
- `temporarily unavailable`

Usage-limit indicators:

- `usage limit`
- `quota exceeded`
- `credits`
- `workspace usage limit`
- `model cap`
- `model limit`
- `monthly budget`
- `spending limit`

Support words that raise confidence the turn truly failed:

- `error`
- `failed`
- `interrupted`
- `aborted`
- `stopped`
- `unable`
- `cannot`

### Classification Rules

1. Usage-limit match wins over the transient retry buckets when both appear.
2. A transient bucket should require both:
   - an interruption/error signal
   - a rate-limit or overload signal
3. A usage-limit bucket should require both:
   - an interruption/error or limit-context signal
   - a usage-limit signal
4. Duplicate `turn_id` values must not retrigger.
5. Only newly appended transcript content can advance the detector.

## Hook Output Policy

### Packaging Notes

- `hooks/hooks.json` is the default plugin hook file.
- Hook commands should use `${PLUGIN_ROOT}` so installed plugin cache paths
  resolve correctly.
- The plugin manifest does not need repository `.codex/` wiring.

### Transient Retry

Use the documented Codex `Stop` hook continuation shape:

```json
{
  "decision": "block",
  "reason": "..."
}
```

Recommended resume prompt:

- tell Codex the previous turn appears to have been interrupted by a transient
  OpenAI rate/server limit or a usage-limit condition that may have cleared
- tell it to continue exactly where it left off
- explicitly say not to restart from scratch

### Retry-Cap Exhaustion

Use a non-continue response with actionable text:

```json
{
  "continue": false,
  "stopReason": "...",
  "systemMessage": "..."
}
```

Message goals:

- explain that the matched retry class has already hit its configured max
  retries
- for usage-limit text, mention that this looks like a usage-limit or quota
  issue
- do not auto-retry further in this session once capped
- point the user to `/status`
- mention the likely next actions from official docs:
  - wait for reset
  - add credits / enable auto-reload when applicable
  - switch to a lower-cost model if appropriate

## Guardrails

- global per-session continue cap
- per-class continue caps, including `usage_limit`
- optional stricter cap for `503` / overload or `usage_limit` than for `429`
- duplicate-turn suppression so identical stop events do not loop
- state cursor always advances after reading transcript bytes
- fail open: malformed input or unreadable transcript should allow normal stop

## Validation Plan

### Automated

Use stdlib `unittest` for the classifier and hook output decisions.

Coverage must include:

- transient 429
- transient 503
- usage-limit retry
- retry-cap exhaustion
- ordinary successful stop
- duplicate turn suppression
- `stop_hook_active`
- transcript truncation / rotation reset

### Manual

Smoke-check the hook command with fixture payloads piped to stdin and inspect
the JSON output.

## Risks and Follow-Ups

- Transcript JSONL structure is not a stable public schema. Keep transcript
  parsing minimal and text-oriented.
- Official docs mention richer usage-limit data through Codex app-server APIs,
  but that introduces a deeper integration surface and should stay out of MVP
  unless the first version cannot reliably distinguish usage-limit failures.
- If real-world Codex error strings differ from the fixture assumptions, update
  the classifier from observed transcripts before broadening behavior.
