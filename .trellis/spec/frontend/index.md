# Frontend Development Guidelines

> Frontend here means the user-facing plugin surface: manifest metadata, hook wiring, install/use docs, and the local analytics viewer.

---

## Overview

Codex Next ships a small local browser UI in addition to its declarative plugin
surface. The user-facing surface includes:

- plugin metadata in `codex-next/.codex-plugin/plugin.json`
- hook wiring in `codex-next/hooks/hooks.json`
- local viewer assets under `codex-next/web/`
- install and usage copy in `README.md` and `README.zh-CN.md`

Use the frontend spec files to keep that surface coherent without forcing a
framework-heavy app model onto a small local viewer.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | User-facing file ownership and docs layout | Active |
| [Component Guidelines](./component-guidelines.md) | How manifest surface and copy act as the "UI" | Active |
| [Hook Guidelines](./hook-guidelines.md) | Declarative hook wiring conventions | Active |
| [State Management](./state-management.md) | Static metadata vs runtime state boundaries | Active |
| [Quality Guidelines](./quality-guidelines.md) | Validation, copy consistency, and review checks | Active |
| [Type Safety](./type-safety.md) | JSON contract safety for manifests and payload fields | Active |

---

## Pre-Development Checklist

- [ ] Read [Directory Structure](./directory-structure.md) before changing
      manifest, hook, or docs locations.
- [ ] Read [Component Guidelines](./component-guidelines.md) before editing
      display strings, descriptions, or capability declarations.
- [ ] Read [Hook Guidelines](./hook-guidelines.md) before changing
      `hooks/hooks.json`.
- [ ] Read [Type Safety](./type-safety.md) before changing JSON keys, payload
      assumptions, or manifest validation behavior.
- [ ] Read [Quality Guidelines](./quality-guidelines.md) before shipping a
      plugin-surface change.

## Reference Files

- `codex-next/.codex-plugin/plugin.json`
- `codex-next/hooks/hooks.json`
- `codex-next/web/*`
- `README.md`
- `README.zh-CN.md`
- `codex-next/scripts/auto-recover-stop.mjs`
- `codex-next/scripts/usage-analytics-server.mjs`

---

**Language**: All documentation in this directory stays in English.
