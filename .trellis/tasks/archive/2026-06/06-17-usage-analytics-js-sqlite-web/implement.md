# Implementation Plan: JS Usage Analytics with SQLite and Local Web Viewer

## Ordered Checklist

- [x] Update the relevant Trellis specs so they no longer describe this repo as
      "Python runtime only", "no database", and "no browser UI".
- [x] Add a JavaScript classification module that preserves the current
      interruption buckets and detection rules.
- [x] Add a shared SQLite store module that:
      - resolves the DB path
      - bootstraps schema v1
      - reads/writes `hook_state`
      - appends `stop_events`
      - lazily imports legacy JSON session state
- [x] Replace the Python hook runtime with a JavaScript hook runtime and wire
      `hooks/hooks.json` to `node`.
- [x] Port the existing behavior tests from Python to Node test coverage,
      preserving the current fixture families and transcript-rotation check.
- [x] Add new tests for:
      - SQLite bootstrap
      - legacy JSON import
      - analytics event insertion
      - summary/event query helpers
- [x] Add a tiny local HTTP server for read-only analytics APIs.
- [x] Add a static HTML/CSS/JS viewer for filterable summary and event display.
- [x] Update README documentation to describe:
      - Node runtime prerequisite
      - new JS hook entrypoint
      - SQLite state location
      - how to start and use the local analytics viewer
- [x] Run the agreed validation commands and review the resulting UX.

## Execution Order and Verification Gates

1. Spec alignment
   - Update backend/frontend spec language first so Phase 2 work is no longer
     fighting stale repo rules.
   - Verify: spec files clearly mention JS runtime, SQLite persistence, and the
     local viewer surface.

2. Runtime parity layer
   - Implement classifier and hook logic in JS before adding the viewer.
   - Verify: Node tests reproduce current behavior for the existing fixtures.

3. Persistence migration
   - Add SQLite schema and legacy JSON compatibility import.
   - Verify: a legacy JSON fixture/state sample becomes a valid `hook_state`
     row without losing counters.

4. Viewer/API layer
   - Add read-only server endpoints, then the static UI.
   - Verify: manual browser/server smoke test plus API response checks.

5. Docs and cleanup
   - Update README surfaces only after the runtime shape is stable.
   - Verify: docs match the final commands and file paths.

## Validation Commands

Hook/runtime parity:

```powershell
node --test codex-next/tests/*.test.mjs
```

Fixture smoke check:

```powershell
Get-Content codex-next/tests/fixtures/stop-transient-429.json | node codex-next/scripts/auto-recover-stop.mjs
```

```powershell
Get-Content codex-next/tests/fixtures/stop-usage-limit.json | node codex-next/scripts/auto-recover-stop.mjs
```

Server smoke check:

```powershell
node codex-next/scripts/usage-analytics-server.mjs --host 127.0.0.1 --port 3210
```

```powershell
Invoke-WebRequest http://127.0.0.1:3210/api/summary | Select-Object -ExpandProperty Content
```

Static API/query smoke check:

```powershell
Invoke-WebRequest "http://127.0.0.1:3210/api/events?limit=20" | Select-Object -ExpandProperty Content
```

Manifest/JSON sanity:

```powershell
node -e "JSON.parse(require('node:fs').readFileSync('codex-next/.codex-plugin/plugin.json', 'utf8')); JSON.parse(require('node:fs').readFileSync('codex-next/hooks/hooks.json', 'utf8')); console.log('json ok')"
```

## Risky Files

- `codex-next/hooks/hooks.json`
  - wrong command wiring disables the plugin entrypoint
- `codex-next/scripts/auto-recover-stop.mjs`
  - behavior drift here can create false retries or missed retries
- `codex-next/scripts/lib/analytics-store.mjs`
  - bad schema/bootstrap logic can break both the hook and the viewer
- `codex-next/sql/schema.sql`
  - schema mistakes show up late if not exercised by tests
- `codex-next/web/usage-analytics.js`
  - UI filters can drift from API query contracts
- `README.md` and `README.zh-CN.md`
  - easy place for runtime/docs mismatch after the migration

## Rollback Points

- Before switching `hooks/hooks.json`, keep the current Python runtime untouched
  so behavior parity can be proven first.
- If the SQLite migration is unstable, revert to the last commit before the
  hook wiring changes rather than trying to run mixed Python/JS persistence.
- If viewer work destabilizes the runtime, keep the hook + SQLite slice and
  defer the browser UI to a follow-up child task only if the diff proves the UI
  is the blocker.

## Follow-up Checks Before `task.py start`

- Confirm `prd.md`, `design.md`, and `implement.md` stay aligned on scope:
  plugin usage analytics only, not token/cost analytics.
- Confirm the design still avoids transcript-text persistence.
- Confirm the plan still uses Node built-ins and does not quietly grow a bundler
  or native addon dependency.
