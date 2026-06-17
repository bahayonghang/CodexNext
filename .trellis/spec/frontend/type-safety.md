# Type Safety

> Contract safety patterns for JSON manifests and dynamic Stop-hook payloads.

---

## Overview

There is no TypeScript in this repo. Type safety comes from:

- conservative JSON contracts in `plugin.json` and `hooks.json`
- defensive JS normalization on dynamic payload and query handling
- defensive runtime normalization instead of unchecked assumptions

## Type Organization

- Keep hook payload expectations close to the code that consumes them, as
  documented in `processStop(...)` and the backend error-handling spec.
- Use constant dictionaries and regex groups to centralize allowed retry kinds
  and messages instead of scattering magic strings.
- Use one whitelist for server query keys rather than passing arbitrary browser
  params through to SQL helpers.
- Treat fixture files under `codex-next/tests/fixtures/` as examples of the
  accepted payload shape.

## Validation

- `parsePayload(...)` must tolerate empty or malformed stdin and return `null`.
- Use `typeof value === "string"` or narrow helper functions before trusting
  payload fields such as `transcript_path`, `turn_id`, or
  `last_assistant_message`.
- Coerce numeric query params such as `limit` and `offset` to bounded integers
  before passing them into DB queries.
- Validate manifest changes with:
  `node -e "JSON.parse(require('node:fs').readFileSync('codex-next/.codex-plugin/plugin.json', 'utf8')); JSON.parse(require('node:fs').readFileSync('codex-next/hooks/hooks.json', 'utf8')); console.log('json ok')"`

## Common Patterns

- Normalize partially missing DB rows or legacy JSON state instead of assuming
  all keys exist.
- Use narrow helper functions for payload extraction and state shaping.
- Prefer explicit string keys that match the Codex plugin contract over local
  aliases.

## Forbidden Patterns

- Assuming a payload field exists because a fixture contains it.
- Renaming manifest keys or hook fields away from the platform contract.
- Passing raw browser input directly into SQL or query objects without
  normalization.
- Introducing handwritten schema copies in multiple files when one source of
  truth is enough.
