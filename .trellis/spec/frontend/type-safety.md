# Type Safety

> Contract safety patterns for JSON manifests and dynamic Stop-hook payloads.

---

## Overview

There is no TypeScript in this repo. Type safety comes from:

- conservative JSON contracts in `plugin.json` and `hooks.json`
- Python type hints on dynamic payload handling
- defensive runtime normalization instead of unchecked assumptions

## Type Organization

- Keep hook payload expectations close to the code that consumes them, as
  documented in `process_stop(...)` and the backend error-handling spec.
- Use constant dictionaries and regex groups to centralize allowed retry kinds
  and messages instead of scattering magic strings.
- Treat fixture files under `codex-next/tests/fixtures/` as examples of the
  accepted payload shape.

## Validation

- `parse_payload(...)` must tolerate empty or malformed stdin and return `{}`.
- Use `isinstance(...)` checks before trusting payload fields such as
  `transcript_path`, `turn_id`, or `last_assistant_message`.
- Validate manifest changes with:
  `python C:\Users\lyh\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py codex-next`

## Common Patterns

- Normalize partially missing state in `load_state(...)` instead of assuming all
  keys exist.
- Use narrow helper functions for payload extraction and state shaping.
- Prefer explicit string keys that match the Codex plugin contract over local
  aliases.

## Forbidden Patterns

- Assuming a payload field exists because a fixture contains it.
- Renaming manifest keys or hook fields away from the platform contract.
- Introducing handwritten schema copies in multiple files when one source of
  truth is enough.
