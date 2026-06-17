# Component Guidelines

> There is no component framework here; treat manifest metadata and user-facing copy as the interface surface.

---

## Overview

Codex Next does not render UI components. The closest equivalent to a component
is a user-visible contract block such as:

- `interface` fields in `codex-next/.codex-plugin/plugin.json`
- hook descriptions implied by `hooks/hooks.json`
- installation and behavior sections in the README files

These pieces should describe one narrow job consistently: bounded auto-recovery
for interrupted Codex turns.

## Component Structure

- `plugin.json` owns marketplace and in-product display metadata.
- `README.md` and `README.zh-CN.md` own longer explanations, setup steps, and
  developer commands.
- Runtime behavior stays in `scripts/auto-recover-stop.py`; do not encode logic
  into descriptive text fields.

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

## Styling Patterns

- There is no styling system.
- Favor plain, direct wording over marketing language. The manifest and docs
  should explain the retry classes, caps, and safety guards without hype.

## Accessibility

- Write short, concrete descriptions because the plugin is discovered through
  textual surfaces, not visuals.
- Keep capability lists and prompts readable in plain text without relying on
  formatting tricks.

## Common Mistakes

- Expanding the manifest copy beyond the actual implementation.
- Letting README wording drift from retry caps or handled stop classes.
- Treating this repo like a future UI app and adding component abstractions that
  do not map to any current surface.
