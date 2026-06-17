# Codex / OpenAI Research Notes for 429, 503, and Usage Limits

Date: 2026-06-17

## Goal

Understand which parts of ClaudeNext's 429 auto-continue design can be ported
to Codex, and where Codex or OpenAI docs require a different policy.

## Local Reference

### `ref/ClaudeNext`

- `README.md` states Claude has no dedicated 429 hook event, so the plugin uses
  the `Stop` hook plus transcript-delta scanning.
- `scripts/check-429.js` uses four loop guards:
  - `stop_hook_active`
  - scan only new transcript bytes
  - require both an error marker and a rate-limit marker
  - cap continues per session

Implication for Codex:

- The Claude strategy is portable in spirit.
- Codex does not need the same workaround for missing `Stop` hooks, because the
  platform documents them directly.
- The user wants the Codex result packaged like `ref/ClaudeNext`: as a root
  plugin folder rather than repository-local runtime config.

## Official OpenAI / Codex Sources

### 1. Codex Hooks

Source:
- https://developers.openai.com/codex/hooks

Key facts:

- Codex documents a `Stop` hook event.
- The `Stop` payload exposes `stop_hook_active` and
  `last_assistant_message`.
- Official docs also mention `transcript_path` as a common hook input field.
- For continuation, the docs show a `decision: "block"` response with a
  `reason`.
- For non-continuation, the docs show `continue: false` plus user-facing
  message fields.

Planning impact:

- Codex can implement a plugin-bundled stop-time recovery hook directly.
- We can keep the continuation prompt within the documented hook protocol.

### 2. OpenAI Rate-Limit Guidance

Source:
- https://developers.openai.com/api/docs/guides/rate-limits

Key facts:

- OpenAI recommends exponential backoff for `429` handling.
- Unsuccessful requests still count toward per-minute limits.

Planning impact:

- Auto-recovery must cap retries and avoid hammering the same failure in a
  tight loop.
- The hook should treat transient retries as best-effort, not infinite.

### 3. OpenAI Error Code Guidance

Source:
- https://developers.openai.com/api/docs/guides/error-codes

Key facts:

- `429` is documented as "Too Many Requests" / rate limiting.
- `500`, `503`, and `504` are documented as internal/server overload classes.

Planning impact:

- `429` and `503` belong in the retryable bucket.
- The copy shown to the user should reflect that these are temporary service
  issues, not necessarily prompt or repository problems.

### 4. Codex Usage-Limit Guidance

Source:
- https://developers.openai.com/codex/pricing

Key facts:

- Codex docs tell users to check `/status` for remaining limits and reset time.
- Official guidance for exhausted limits is operational:
  - wait for reset
  - add credits / enable auto-reload where supported
  - use a smaller model or API-key-backed setup when applicable

Planning impact:

- Official guidance suggests operational handling rather than blind retries.
- User decision for this task overrides that default: usage-limit / model-cap
  failures should still be retried, but only under explicit retry caps and
  with post-cap guidance.

### 5. Codex Plugin Build Docs

Source:
- https://developers.openai.com/codex/plugins/build

Key facts:

- Codex documents plugin packaging with `.codex-plugin/plugin.json`.
- Plugin hooks live in the default `hooks/hooks.json` path.
- Hook commands can use `${PLUGIN_ROOT}` and writable plugin data can live
  under `PLUGIN_DATA`.

Planning impact:

- The deliverable should be a root-level `codex-next/` plugin package.
- Hook state should live with plugin runtime data instead of repository
  `.trellis/.runtime/`.

## Recommended MVP Policy

- Retry automatically for:
  - 429 / rate limit wording
  - 503 / overload wording
  - quota exhausted
  - usage-limit reached
  - credits depleted
  - model-cap / workspace-cap style wording
- Stop after per-class or global retry caps are exhausted and show guidance.

## Open Risk

Official docs define the hook protocol, but they do not enumerate every exact
error string that Codex emits for these cases. The first implementation should
therefore rely on fixture coverage plus real transcript samples gathered during
manual testing.
