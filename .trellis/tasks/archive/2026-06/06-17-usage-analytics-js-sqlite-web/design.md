# Design: JS Usage Analytics with SQLite and Local Web Viewer

## Problem Summary

Codex Next currently does one narrow job well: a Python Stop hook classifies
interrupted turns, keeps bounded retry state in JSON files, and asks Codex to
continue when the interruption matches the supported error families.

That design has two hard limits for the current TODO item:

1. It has no queryable cross-session history.
2. It has no browser-visible surface.

Because the user also wants to move away from Python, the clean approach is not
to bolt a JS viewer onto the current Python hook. The clean approach is to
consolidate the runtime around Node/JS, move durable state into SQLite, and add
a separate local read-only viewer that reads the same SQLite data.

## Primary Design Decisions

### 1. Single-runtime migration

Use JavaScript for both the Stop hook and the local viewer/server. Do not keep
a long-term Python runtime for the hook while adding a second JS runtime for
analytics.

Reasoning:

- one classification implementation instead of two
- one persistence implementation instead of JSON plus SQLite
- lower long-term maintenance cost
- aligns with the user's explicit preference

### 2. SQLite in the plugin state directory

Store analytics and per-session state in one SQLite database located alongside
the plugin's existing state directory:

- installed plugin: `${PLUGIN_DATA}/codex-next.sqlite`
- repo-local fallback: `${PLUGIN_ROOT}/.local-state/codex-next.sqlite`

Reasoning:

- keeps persistence inside the existing plugin state boundary
- avoids a new service dependency
- makes cross-session querying trivial
- works with `node:sqlite` and no extra package install

### 3. Manual localhost viewer, not hook-launched UI

The Stop hook remains a short-lived command. The browser UI runs through a
separate manual command that starts a tiny local HTTP server when the user
wants to inspect analytics.

Reasoning:

- the hook must stay fast and predictable
- long-lived UI/server concerns should not execute inside the hook path
- avoids spawning background processes during interruption handling

### 4. Metadata-only analytics

Persist only derived metadata about the hook decision. Do not store transcript
content, prompt text, or assistant message bodies in SQLite.

Reasoning:

- avoids turning analytics into a shadow conversation archive
- keeps the schema small and safer
- still fully supports the requested summary/query use cases

## Proposed File Layout

The implementation should stay close to the existing plugin structure and add
only the surfaces required by the new architecture:

```text
codex-next/
├── .codex-plugin/
│   └── plugin.json
├── hooks/
│   └── hooks.json
├── scripts/
│   ├── auto-recover-stop.mjs
│   ├── usage-analytics-server.mjs
│   └── lib/
│       ├── analytics-store.mjs
│       └── classify-stop.mjs
├── sql/
│   └── schema.sql
├── web/
│   ├── usage-analytics.html
│   ├── usage-analytics.js
│   └── usage-analytics.css
└── tests/
    ├── auto-recover-stop.test.mjs
    ├── usage-analytics-server.test.mjs
    └── fixtures/
```

Notes:

- No frontend framework or bundler is required.
- No `package.json` should be added unless implementation proves it is needed
  for a concrete test or launch workflow. Node can run `.mjs` files directly.

## Architecture and Responsibilities

### Hook runtime: `auto-recover-stop.mjs`

Responsibilities:

- read and parse Stop-hook stdin JSON
- derive the stable session key
- open/bootstrap SQLite through shared store helpers
- lazily import legacy JSON state for the current session when needed
- build the signal text from `last_assistant_message` plus transcript delta
- classify the interruption
- decide whether to continue, stop, or allow the stop through
- update live session state
- append an analytics event row
- emit the hook JSON response

Important rule:

- if durable state cannot be opened safely, fail open and allow the stop rather
  than risk an unbounded retry loop with non-persistent counters

### Shared store: `analytics-store.mjs`

Responsibilities:

- resolve the SQLite path from `PLUGIN_DATA` / fallback root
- open the database and apply bootstrap schema
- enable WAL mode for concurrent hook writes and viewer reads
- expose helpers for:
  - get / upsert session state
  - append analytics event
  - import legacy JSON state
  - query summary data
  - query paginated event rows

This module is the single owner of:

- SQLite schema initialization
- state row shape
- analytics query SQL
- legacy JSON compatibility import

That avoids duplicating DB logic between the hook and the local web server.

### Classifier module: `classify-stop.mjs`

Responsibilities:

- own the regex families and classification rules now embedded in the Python
  script
- export the same semantic buckets:
  - `transient_rate_limit`
  - `transient_overload`
  - `usage_limit`
  - `no_match`

This keeps the behavior testable without forcing DB or HTTP setup into every
classifier test.

### Local server: `usage-analytics-server.mjs`

Responsibilities:

- serve static assets from `codex-next/web/`
- expose a small read-only JSON API backed by SQLite
- print the localhost URL on startup

Recommended API surface:

- `GET /api/health`
- `GET /api/summary`
- `GET /api/events`
- `GET /api/facets`

The API must stay read-only in MVP.

### Browser UI: `web/usage-analytics.*`

Responsibilities:

- render summary counts and per-kind breakdowns
- provide the agreed filter controls
- fetch filtered data from the local API
- render paginated event rows

The UI should remain plain HTML/CSS/JS:

- no framework
- no build step
- no client-side routing

## Data Flow

### Stop-hook path

```text
Stop payload
-> parse JSON
-> resolve session key
-> open SQLite + bootstrap schema
-> lazy-load legacy JSON session state if no SQLite row exists
-> read transcript delta
-> classify interruption
-> compute decision
-> transaction:
   - update hook_state
   - insert stop_events row
-> emit hook response JSON
```

### Viewer path

```text
Browser filter input
-> local HTTP request
-> server validates query params
-> SQLite aggregate / list query
-> JSON response
-> browser renders summary + rows
```

## SQLite Schema

The database should separate operational state from analytics history.

### Table 1: `hook_state`

Purpose:

- the authoritative live state for bounded retry behavior

Recommended columns:

- `session_key TEXT PRIMARY KEY`
- `offset INTEGER NOT NULL`
- `attempts_total INTEGER NOT NULL`
- `attempts_rate_limit INTEGER NOT NULL`
- `attempts_overload INTEGER NOT NULL`
- `attempts_usage_limit INTEGER NOT NULL`
- `last_processed_turn_id TEXT NOT NULL`
- `transcript_prefix_hash TEXT NOT NULL`
- `migrated_from_json INTEGER NOT NULL DEFAULT 0`
- `updated_at TEXT NOT NULL`

Why column-per-counter instead of JSON:

- simpler SQL queries
- easier viewer summaries
- easier migration verification
- no need for JSON1 features

### Table 2: `stop_events`

Purpose:

- append-only analytics history for query and display

Recommended columns:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `occurred_at TEXT NOT NULL`
- `session_key TEXT NOT NULL`
- `turn_id TEXT`
- `model TEXT`
- `cwd TEXT`
- `transcript_present INTEGER NOT NULL`
- `matched_kind TEXT NOT NULL`
- `decision TEXT NOT NULL`
- `attempts_total_after INTEGER NOT NULL`
- `attempts_kind_after INTEGER NOT NULL`
- `exhausted INTEGER NOT NULL`

Recommended enum values:

- `matched_kind`
  - `transient_rate_limit`
  - `transient_overload`
  - `usage_limit`
  - `no_match`
- `decision`
  - `continue`
  - `stop_capped`
  - `skip_active_hook`
  - `skip_duplicate_turn`
  - `allow_stop`

What we intentionally do not store:

- transcript text
- assistant message text
- prompt text
- stack traces

### Schema versioning

Use `PRAGMA user_version` for lightweight schema versioning.

MVP expectation:

- bootstrap version 1 schema
- no generalized migration framework yet
- if later schema changes are needed, add explicit upgrade steps in the shared
  store module

## Legacy JSON Compatibility

Current users may already have per-session JSON state files. Replacing the hook
runtime without a compatibility path would silently reset retry counters.

Recommended strategy: lazy per-session import.

On hook invocation:

1. derive the session key
2. check `hook_state` for that session
3. if missing, look for the legacy JSON file at the old path
4. normalize known keys
5. insert the state into SQLite with `migrated_from_json = 1`
6. leave the JSON file untouched in MVP for rollback safety

Why not bulk-migrate everything:

- avoids scanning unrelated sessions up front
- keeps migration tied to real usage
- avoids building a second management command before it is needed

## Query and Viewer Design

### Required filters

- time range
- stop kind
- decision
- model
- workspace path substring

### Required displays

- total event count in range
- continue vs capped-stop counts
- per-kind counts
- recent or paginated event table

### Recommended API contracts

`GET /api/summary`

- returns aggregate counts for the current filter set

`GET /api/events`

- returns paginated rows with:
  - timestamp
  - matched kind
  - decision
  - model
  - cwd
  - turn id
  - retry counters

`GET /api/facets`

- returns distinct models and known enum values for filter controls

### Pagination

Do not load the full event history into the browser. Use server-side limits and
offsets or cursor-based pagination.

## Operational Constraints

### Hook reliability

The hook contract remains the highest-priority boundary. That means:

- stdout stays reserved for hook JSON output
- no debug logging to stdout
- database writes must stay short
- errors should degrade to safe non-looping behavior

### Concurrent reads and writes

The hook and viewer can touch the same DB at the same time. WAL mode plus short
transactions should be enough for this local single-user workload.

### Dependency policy

Prefer Node built-ins only:

- `node:sqlite`
- `node:http`
- `node:fs`
- `node:path`
- `node:url`

This avoids native addon install problems on Windows.

## Main Risks and Tradeoffs

### Risk: Node becomes a new runtime prerequisite

Tradeoff accepted. The user explicitly prefers JS, and this repo is a local
plugin package rather than a broadly published consumer plugin.

Mitigation:

- document Node 25+ clearly in README
- keep the implementation dependency-free beyond Node built-ins

### Risk: SQLite failure breaks retry safety

Mitigation:

- if SQLite cannot be opened or updated safely, fail open instead of retrying
  without durable counters

### Risk: analytics design drifts into sensitive transcript storage

Mitigation:

- enforce metadata-only schema
- avoid storing raw signal text anywhere in the DB

### Risk: adding a web stack bloats a minimal repo

Mitigation:

- keep the viewer as static files plus a tiny read-only server
- no framework, no bundler, no build pipeline in MVP

## Rejected Alternatives

### Keep Python hook and add a separate JS viewer

Rejected because:

- two runtimes
- duplicated persistence concerns
- works against the user's stated preference

### Keep JSON files and scan them for analytics

Rejected because:

- awkward cross-session querying
- expensive directory scans
- brittle filter logic
- poor fit for browser-backed reporting

### Add a heavy frontend framework

Rejected because:

- no existing frontend stack in the repo
- unnecessary build/setup cost for a local internal viewer
