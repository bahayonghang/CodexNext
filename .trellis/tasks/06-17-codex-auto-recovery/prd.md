# Add Codex auto-recovery for 429 503 and usage limits

## Goal

Add a Codex-side recovery path, modeled after `ref/ClaudeNext`, that handles
transient stop conditions caused by rate limits or temporary service overload
without creating runaway resume loops, and that also retries model-limit /
usage-limit style interruptions under a strict max-attempt policy.

## Confirmed Facts

- `ref/ClaudeNext` solves Claude-side 429 interruption handling with a `Stop`
  hook plus transcript-delta scanning because Claude has no dedicated 429 hook.
- Codex has a native `Stop` hook and exposes `stop_hook_active`,
  `last_assistant_message`, and `transcript_path` to hooks.
- Codex supports plugin-bundled hooks, so the deliverable can live as a
  root-level plugin package instead of repository `.codex/` runtime config.
- OpenAI's official guidance treats `429` as rate limiting and recommends
  exponential backoff; unsuccessful requests still count against per-minute
  limits.
- OpenAI's official guidance treats `500` / `503` as temporary server issues
  that should be retried later.
- Codex usage-limit states are not equivalent to transient `429` / `503`
  failures. Official docs point users to `/status`, lower-cost models, extra
  credits, or waiting for reset instead of blind retries.

## Requirements

- Add a root-level `codex-next/` plugin folder that bundles a `Stop` hook for
  auto-recovery.
- Detect transient interruption classes from hook-visible evidence:
  - rate-limit / 429 style failures
  - temporary overload / 5xx / 503 style failures
  - usage-limit / quota / credit-exhaustion / model-cap style failures
- Auto-continue for all three failure classes above, including model-limit
  cases, but always under explicit max retry counts.
- When a retry class reaches its configured cap, stop retrying and show a clear
  next-step message instead of looping.
- Add loop guards at least equivalent to the Claude reference:
  - honor `stop_hook_active`
  - scan only new transcript content
  - dedupe repeated triggers
  - cap auto-continue count per class and per session
- Keep the implementation repo-local and compatible with the Codex plugin
  format; do not require patching Codex itself or modifying this repository's
  own `.codex/` runtime config.
- Persist the research and implementation plan in task artifacts before
  starting implementation.

## Acceptance Criteria

- [x] A root-level `codex-next/` plugin exists with
      `.codex-plugin/plugin.json`, `hooks/hooks.json`, and the recovery
      script.
- [x] The recovery script continues exactly once per qualifying stop event and
      never re-triggers forever on the same transcript content.
- [x] Fixture-driven validation covers:
      - transient 429 / rate-limit wording
      - transient 503 / overload wording
      - usage-limit / quota wording
      - non-matching ordinary stops
      - `stop_hook_active=true`
      - max-retry exhaustion for at least one retry class
- [x] Each retry class produces actionable guidance after its configured retry
      cap is exhausted and does not loop further.
- [x] Usage-limit / model-cap failures auto-continue until their cap is hit,
      then switch to actionable guidance without looping.
- [x] The plugin manifest validates successfully.
- [x] The task contains persisted research, design, and implementation
      artifacts sufficient to start execution later with no additional
      discovery pass.

## Out of Scope

- Background timers that wake Codex up minutes or hours later after a reset.
- Global user-level Codex plugins or marketplace packaging.
- Changes to OpenAI service behavior, account quotas, or server-side retry
  policies.
- Solving unrelated runtime config issues in this repository's `.codex/`
  folder.

## Open Questions

- None. User decision on 2026-06-17: model-limit / usage-limit cases must also
  enter the retry flow, with explicit retry caps.

## Assumptions

- MVP scope is a root-level local Codex plugin package, not a patch to the
  repository's own `.codex/` runtime config.
- Python is the right implementation language for the new hook because the
  hook command needs predictable Windows UTF-8 behavior and can rely on the
  local Python environment.
