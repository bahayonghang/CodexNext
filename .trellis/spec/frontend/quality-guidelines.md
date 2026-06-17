# Quality Guidelines

> Quality standards for plugin metadata, hook wiring, and user-facing docs.

---

## Overview

The plugin surface is small enough that most quality failures are consistency
failures: manifest says one thing, README says another, or hook wiring points at
the wrong script. Keep frontend-surface changes synchronized and verifiable.

## Forbidden Patterns

- User-facing descriptions that promise behavior the Python script does not
  implement.
- Hook commands with absolute machine-specific paths.
- README changes that update only one language when the behavior changed for all
  users.
- Adding UI-framework conventions or files that the repo does not actually use.

## Required Patterns

- Keep `plugin.json`, `hooks.json`, and README behavior descriptions aligned in
  the same change.
- Preserve the plugin's narrow scope: interrupted-turn recovery with bounded
  retries.
- Keep install steps concrete and repository-valid.

## Testing Requirements

- Run unit tests when the surface change affects behavior:
  `python -m unittest discover -s codex-next/tests -p "test_*.py"`
- Validate the manifest on manifest or hook-surface changes:
  `python C:\Users\lyh\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py codex-next`
- Manually re-read README install and usage steps when paths or plugin names
  change.

## Code Review Checklist

- Does `plugin.json` still describe the actual retry classes and guardrails?
- Does `hooks/hooks.json` still point at the right script via `${PLUGIN_ROOT}`?
- Are README examples still correct for this repository layout?
- Did the change stay within the current non-UI plugin model?
