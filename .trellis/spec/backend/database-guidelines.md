# Database Guidelines

> Persistence conventions for this project. SQLite is the durable source of truth for hook state and analytics history.

---

## Overview

Codex Next uses a local SQLite database for two concerns:

- per-session hook state needed for bounded retries
- append-only analytics history for local querying and display

The database is local-only. There is no ORM, remote database, or hosted
service.

Reference implementation:

- `codex-next/scripts/lib/analytics-store.mjs`
- `codex-next/sql/schema.sql`

## Query Patterns

- Keep SQLite access behind shared helpers instead of sprinkling raw SQL
  strings through the hook and server entrypoints.
- Separate live session state from analytics history so retry safety does not
  depend on scanning event rows.
- Treat transcript text and assistant message bodies as non-persisted inputs.
  Persist only derived metadata needed for runtime safety and analytics.

## Migrations

- Use lightweight schema versioning through SQLite metadata such as
  `PRAGMA user_version`.
- Preserve backward compatibility for legacy JSON session state through an
  explicit compatibility import path rather than silently resetting counters.
- Add or adjust tests that exercise old JSON state or prior schema assumptions
  before changing the stored shape.

## Naming Conventions

- The database file lives in `PLUGIN_DATA` when installed, otherwise in the
  plugin-local fallback state directory.
- Session identity stays derived from the stable session key:
  `transcript-<hash>` when `transcript_path` is known, otherwise
  `fallback-<hash>`.
- Persisted runtime fields use snake_case.
- Retry classes are string enums, not free-form labels:
  `transient_rate_limit`, `transient_overload`, `usage_limit`.

## Common Mistakes

- Do not key state by raw message text; use session identity as the existing
  code does.
- Do not store transcript contents or raw conversation text in SQLite.
- Do not bypass the shared store helper layer from multiple runtime entrypoints.
- Do not write persistent state anywhere except `PLUGIN_DATA` or the
  plugin-local fallback directory.

## Scenario: SQLite-backed Hook State and Recovery Analytics

### 1. Scope / Trigger

- Trigger: any change to `hook_state`, `stop_events`, legacy JSON import, DB
  location resolution, or query helpers used by the local analytics viewer.

### 2. Signatures

- Store bootstrap:
  - `openAnalyticsDatabase(options?) -> { db, dbPath, stateDir }`
- Session state:
  - `ensureHookState(db, payload, options?)`
  - `recordHookState(db, state)`
- Analytics writes:
  - `appendStopEvent(db, event)`
- Read-only queries:
  - `querySummary(db, filters?)`
  - `queryEvents(db, filters?)`
  - `queryFacets(db)`

### 3. Contracts

- DB file:
  - installed: `${PLUGIN_DATA}/codex-next.sqlite`
  - repo-local: `codex-next/.local-state/codex-next.sqlite`
- Schema version:
  - `PRAGMA user_version = 1`
- Persisted tables:
  - `hook_state(session_key, offset, attempts_total, attempts_rate_limit, attempts_overload, attempts_usage_limit, last_processed_turn_id, transcript_prefix_hash, migrated_from_json, updated_at)`
  - `stop_events(id, occurred_at, session_key, turn_id, model, cwd, transcript_present, matched_kind, decision, attempts_total_after, attempts_kind_after, exhausted)`
- Non-persisted inputs:
  - transcript text
  - assistant message text
  - prompt text

### 4. Validation & Error Matrix

- explicit `dbPath` provided -> use it
- no `dbPath`, `PLUGIN_DATA` set -> store DB in `PLUGIN_DATA`
- neither provided -> use plugin-local `.local-state`
- legacy JSON present, no SQLite row -> import once with `migrated_from_json = 1`
- legacy JSON malformed -> ignore it and use default normalized state
- unknown `matched_kind` or `decision` on write -> coerce to safe enum default
- `limit` or `offset` invalid -> coerce to bounded integers before query

### 5. Good/Base/Bad Cases

- Good:
  - hook writes one `hook_state` update and one `stop_events` row in a short
    transaction
  - viewer queries summary and paginated events without scanning transcript
    archives
- Base:
  - empty DB still boots and returns zero-count summary/query responses
- Bad:
  - storing raw conversation text in the DB
  - duplicating query SQL outside the shared store
  - resetting retry counters because the legacy JSON path was skipped

### 6. Tests Required

- DB bootstrap test that proves transcript text is not part of the schema
- legacy JSON import test
- summary/event/facet query tests
- server smoke test that exercises query helpers through HTTP

### 7. Wrong vs Correct

#### Wrong

- open ad hoc SQLite handles with copied schema logic in each entrypoint
- store entire transcript chunks for "future debugging"
- query all events into memory and filter them in the browser

#### Correct

- centralize bootstrap, writes, and query helpers in `analytics-store.mjs`
- persist only derived metadata needed for retry safety and local analytics
- keep filtering and pagination in the SQLite query layer
