# Add JS usage analytics with SQLite and local web viewer

## Goal

Add plugin-local usage analytics for Codex Next so the user can inspect how
often the Stop hook runs, what it classifies, and when it auto-continues vs
stops, while replacing the current Python runtime with a JavaScript runtime and
providing a local browser UI for querying and viewing the collected data.

## Confirmed Facts

- `TODO.md` currently contains one explicit unfinished item: `加入使用统计`.
- The current hook entrypoint is a Python command in
  `codex-next/hooks/hooks.json`.
- The current runtime persists bounded-retry state as one JSON file per
  session under `PLUGIN_DATA` or the plugin-local fallback state directory.
- Current Stop-hook fixtures expose only hook/runtime metadata such as
  `turn_id`, `last_assistant_message`, `transcript_path`, `cwd`, and `model`;
  they do not expose token, cost, or billing payloads.
- The current repository has no JavaScript package baseline, no browser UI, and
  no database layer.
- The user approved this planning direction:
  - replace the Python runtime with JavaScript
  - use SQLite
  - support local web query and display
  - scope "usage analytics" to this plugin's own auto-recovery behavior rather
    than token or billing analytics
- The current development host has Node 25 available, and `node:sqlite` is
  available without adding a third-party SQLite binding.

## Requirements

- Replace the Python Stop-hook runtime with a JavaScript runtime. Do not add
  new Python runtime paths for normal plugin operation.
- Keep the existing auto-recovery behavior functionally equivalent for:
  - `transient_rate_limit`
  - `transient_overload`
  - `usage_limit`
  - duplicate-turn suppression
  - `stop_hook_active`
  - transcript rotation / shrink handling
- Persist both of these concerns in SQLite:
  - per-session operational state needed for safe bounded retries
  - append-only analytics history for querying and display
- Keep the analytics scope limited to plugin recovery usage:
  - stop classifications
  - continue vs capped-stop outcomes
  - model / workspace / session dimensions
  - retry counters and timestamps
- Do not treat this task as token, billing, or account-usage analytics.
- Provide a local read-only web viewer that supports query and display from the
  SQLite database.
- The web viewer must support filtering at least by:
  - time range
  - stop kind
  - decision / outcome
  - model
  - workspace path text match
- The viewer must show both summary data and event-level detail.
- Keep the hook path and the web-viewer path decoupled:
  - the Stop hook must not auto-start a long-running server
  - the viewer should be launched manually when needed
- Prefer Node built-ins and a no-build-step implementation over adding a
  frontend framework or native SQLite addon dependency.
- Avoid storing transcript contents, prompt text, or assistant message bodies
  in SQLite. Persist only derived metadata needed for analytics and debugging.
- Preserve compatibility with existing JSON session state by lazily importing or
  otherwise absorbing legacy state on first use, so the runtime migration does
  not silently reset active retry counters.
- Update user-facing docs to describe the Node/JS runtime, SQLite state, and
  local analytics viewer workflow.

## Acceptance Criteria

- [ ] `codex-next/hooks/hooks.json` points to a JavaScript hook entrypoint
      rather than the current Python script.
- [ ] The JavaScript hook reproduces the current retry decisions and guardrails
      for the existing fixture families and transcript-rotation behavior.
- [ ] SQLite becomes the durable source of truth for both live hook state and
      queryable analytics history.
- [ ] Legacy JSON state is preserved through a documented compatibility path
      instead of being silently discarded.
- [ ] A local read-only web viewer can query the SQLite data and render:
      - summary counts
      - per-kind breakdowns
      - filtered event rows
- [ ] The web viewer supports the agreed filter set: time range, stop kind,
      decision, model, and workspace text match.
- [ ] The SQLite schema and write path do not store transcript text or other
      raw conversation content.
- [ ] README documentation explains the new runtime and how to launch the local
      analytics viewer.
- [ ] The task contains `prd.md`, `design.md`, and `implement.md` with enough
      detail to start implementation without another discovery pass.

## Out of Scope

- Token, billing, quota-spend, or provider-cost analytics.
- Remote-hosted dashboards, authentication, or multi-user access control.
- Auto-opening a browser or auto-launching a daemon from the Stop hook.
- A React/Vite/Next frontend stack or any build-heavy web app scaffold.
- Historical backfill from raw transcript archives beyond legacy session-state
  compatibility.
- Publishing this plugin to a shared marketplace or adding cloud sync.

## Open Questions

- None for planning. The user approved the recommended direction to use a
  JavaScript runtime, SQLite storage, and a localhost viewer for plugin
  auto-recovery analytics.

## Assumptions

- Requiring Node 25+ for normal plugin operation is acceptable for this repo's
  local-plugin workflow.
- The MVP web viewer can remain local-only and read-only.
- `node:sqlite` is stable enough for this plugin's SQLite needs and is
  preferable to adding a third-party native binding.
- The right unit of analytics is the Stop-hook invocation and its resulting
  decision, not the broader Codex billing lifecycle.
