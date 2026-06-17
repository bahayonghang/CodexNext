# Component Guidelines

> There is no component framework here; treat manifest metadata and user-facing copy as the interface surface.

---

## Overview

Codex Next now has two user-visible UI surfaces:

- textual/plugin surfaces:
  - `interface` fields in `codex-next/.codex-plugin/plugin.json`
  - hook descriptions implied by `hooks/hooks.json`
  - installation and behavior sections in the README files
- browser surfaces:
  - filter form
  - summary tiles
  - breakdown lists
  - paginated event table in `codex-next/web/usage-analytics.*`

These pieces should describe one narrow job consistently: bounded auto-recovery
for interrupted Codex turns plus local analytics for that recovery behavior.

## Component Structure

- `plugin.json` owns marketplace and in-product display metadata.
- `README.md` and `README.zh-CN.md` own longer explanations, setup steps, and
  developer commands.
- `usage-analytics.html` owns semantic layout.
- `usage-analytics.js` owns filter wiring, fetch calls, and pagination state.
- Runtime behavior stays in scripts; do not encode logic into descriptive text
  fields.

## Props Conventions

- Keep manifest fields literal and stable:
  - `name`
  - `version`
  - `description`
  - `interface.displayName`
  - `interface.shortDescription`
  - `interface.longDescription`
  - `interface.capabilities`
  - `interface.defaultPrompt`
- When a behavior change affects these fields, update the README copy in the
  same change so the user-facing story stays aligned.
- Keep viewer controls aligned with server-supported filters only:
  - `from`
  - `to`
  - `kind`
  - `decision`
  - `model`
  - `cwd`

## Styling Patterns

- There is no component framework or design-token system.
- Favor plain, direct wording over marketing language. The manifest and docs
  should explain the retry classes, caps, analytics scope, and safety guards
  without hype.
- Keep the viewer utilitarian: compact filters, clear tables, and no decorative
  chrome unrelated to querying recovery events.

## Accessibility

- Write short, concrete descriptions because the plugin is discovered through
  textual surfaces, not visuals.
- Keep capability lists and prompts readable in plain text without relying on
  formatting tricks.
- Keep viewer headings, labels, and empty states literal because the audience
  is inspecting operational behavior, not browsing marketing copy.

## Common Mistakes

- Expanding the manifest copy beyond the actual implementation.
- Letting README wording drift from retry caps or handled stop classes.
- Letting the viewer imply token/cost analytics when it only reports recovery
  events.
- Treating this repo like a future SPA and adding component abstractions that
  do not map to any current surface.
