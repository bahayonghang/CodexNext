# State Management

> How static plugin metadata and runtime session state are separated in this project.

---

## Overview

This repo has no frontend state library. Split state into two categories only:

- Static plugin metadata in JSON files (`plugin.json`, `hooks.json`)
- Runtime retry state in backend-owned JSON files under `PLUGIN_DATA` or
  `.local-state/`

## State Categories

- Static metadata:
  - plugin name, descriptions, capabilities, default prompts
  - hook command wiring and timeout
- Runtime session state:
  - retry counters
  - transcript offset
  - duplicate-turn protection
- Test state:
  - fixtures that model representative Stop payloads

## When to Use Global State

- There is no frontend global state today.
- If a future feature needs richer shared state, justify the user-visible
  surface first. Do not promote backend counters into frontend-managed config
  without a real settings UI.

## Server State

- There is no server-state cache.
- OpenAI/Codex stop signals are consumed as one-shot payload input by the hook,
  not stored as a replicated client cache.

## Common Mistakes

- Duplicating retry-policy constants across runtime code and docs without
  updating both.
- Treating manifest metadata as mutable runtime state.
- Moving runtime counters into ad hoc files outside the plugin state directory.
