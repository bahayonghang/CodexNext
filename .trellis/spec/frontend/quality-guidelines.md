# Quality Guidelines

> Quality standards for plugin metadata, hook wiring, and user-facing docs.

---

## Overview

The plugin surface is small enough that most quality failures are consistency
failures: manifest says one thing, README says another, or hook wiring points at
the wrong script. The local viewer adds one more failure mode: UI controls can
drift from API capabilities. Keep frontend-surface changes synchronized and
verifiable.

## Forbidden Patterns

- User-facing descriptions that promise behavior the JS runtime or viewer does
  not implement.
- Hook commands with absolute machine-specific paths.
- README changes that update only one language when the behavior changed for all
  users.
- Adding UI-framework conventions or files that the repo does not actually use.
- Adding viewer filters or labels that do not map to the real API/query layer.

## Required Patterns

- Keep `plugin.json`, `hooks.json`, and README behavior descriptions aligned in
  the same change.
- Preserve the plugin's narrow scope: interrupted-turn recovery with bounded
  retries plus local recovery analytics.
- Keep install steps concrete and repository-valid.
- Keep viewer labels and empty states literal, with no implication of token,
  billing, or account-usage analytics.

## Testing Requirements

- Run unit tests when the surface change affects behavior:
  `node --test codex-next/tests/*.test.mjs`
- Validate the manifest on manifest or hook-surface changes:
  `node -e "JSON.parse(require('node:fs').readFileSync('codex-next/.codex-plugin/plugin.json', 'utf8')); JSON.parse(require('node:fs').readFileSync('codex-next/hooks/hooks.json', 'utf8')); console.log('json ok')"`
- Smoke the server/UI path when the viewer changes:
  - `GET /api/health`
  - `GET /api/summary`
  - `GET /api/events`
  - `GET /`
- Manually re-read README install and usage steps when paths or plugin names
  change.

## Code Review Checklist

- Does `plugin.json` still describe the actual retry classes and guardrails?
- Does `hooks/hooks.json` still point at the right script via `${PLUGIN_ROOT}`?
- Are README examples still correct for this repository layout?
- Does the viewer still match the documented filters and event semantics?
- Did the change stay within the current lightweight local-viewer model?
