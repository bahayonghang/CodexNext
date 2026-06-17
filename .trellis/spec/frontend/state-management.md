# State Management

> How static plugin metadata and runtime session state are separated in this project.

---

## Overview

This repo has no frontend state library. Split state into three categories:

- static plugin metadata in JSON files
- browser-local viewer state in `usage-analytics.js`
- backend-owned persisted runtime/analytics state in SQLite

## State Categories

- Static metadata:
  - plugin name, descriptions, capabilities, default prompts
  - hook command wiring and timeout
- Browser-local viewer state:
  - current filter inputs
  - current page `limit`
  - current page `offset`
  - last known `total`
- Runtime persisted state:
  - retry counters
  - transcript offset
  - duplicate-turn protection
  - analytics events
- Test state:
  - fixtures that model representative Stop payloads

## When to Use Global State

- There is no frontend global state today.
- If a future feature needs richer shared state, justify the user-visible
  surface first. Do not promote backend counters into frontend-managed config
  without a real settings UI.

## Server State

- The browser does not keep a client-side copy of analytics history beyond the
  currently rendered page.
- Server state lives in SQLite and is queried on demand through the local API.
- OpenAI/Codex stop signals are consumed as one-shot payload input by the hook,
  not stored as a replicated browser cache.

## Common Mistakes

- Duplicating retry-policy constants across runtime code and docs without
  updating both.
- Treating manifest metadata as mutable runtime state.
- Mirroring backend retry counters into browser-local state.
- Moving runtime counters into ad hoc files outside the plugin state directory.
