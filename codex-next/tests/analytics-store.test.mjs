import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendStopEvent,
  ensureHookState,
  openAnalyticsDatabase,
  queryEvents,
  queryFacets,
  queryHookState,
  querySummary,
  resolveLegacyStatePath,
  stableSessionKey,
} from "../scripts/lib/analytics-store.mjs";

function makeStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codex-next-store-"));
}

test("database bootstrap creates schema v1 without transcript text columns", () => {
  const stateDir = makeStateDir();
  const runtime = openAnalyticsDatabase({ stateDir });
  try {
    const version = runtime.db.prepare("PRAGMA user_version").get();
    assert.equal(version.user_version, 1);

    const columns = runtime.db
      .prepare("SELECT name FROM pragma_table_info('stop_events') ORDER BY cid")
      .all()
      .map((row) => row.name);

    assert(columns.includes("matched_kind"));
    assert(!columns.includes("transcript_text"));
    assert(!columns.includes("assistant_message"));
  } finally {
    runtime.db.close();
  }
});

test("ensureHookState imports legacy JSON state lazily", () => {
  const stateDir = makeStateDir();
  const payload = {
    turn_id: "turn-legacy",
    stop_hook_active: false,
    last_assistant_message: "",
    transcript_path: null,
    cwd: "D:/legacy",
    model: "gpt-5-codex",
  };
  const sessionKey = stableSessionKey(payload);

  fs.writeFileSync(
    resolveLegacyStatePath(sessionKey, { stateDir }),
    JSON.stringify(
      {
        offset: 12,
        attempts_total: 4,
        attempts_by_kind: {
          transient_rate_limit: 2,
          transient_overload: 1,
          usage_limit: 1,
        },
        last_processed_turn_id: "old-turn",
        transcript_prefix_hash: "abc123",
      },
      null,
      2
    ),
    "utf8"
  );

  const runtime = openAnalyticsDatabase({ stateDir });
  try {
    const state = ensureHookState(runtime.db, payload, { stateDir });
    assert.equal(state.offset, 12);
    assert.equal(state.attempts_total, 4);
    assert.equal(state.attempts_rate_limit, 2);
    assert.equal(state.attempts_overload, 1);
    assert.equal(state.attempts_usage_limit, 1);
    assert.equal(state.last_processed_turn_id, "old-turn");
    assert.equal(state.transcript_prefix_hash, "abc123");
    assert.equal(state.migrated_from_json, 1);
  } finally {
    runtime.db.close();
  }
});

test("summary, events, and facets queries reflect inserted analytics rows", () => {
  const stateDir = makeStateDir();
  const runtime = openAnalyticsDatabase({ stateDir });
  try {
    appendStopEvent(runtime.db, {
      occurred_at: "2026-06-17T08:00:00.000Z",
      session_key: "s1",
      turn_id: "t1",
      model: "gpt-5-codex",
      cwd: "D:/repo/a",
      transcript_present: true,
      matched_kind: "transient_rate_limit",
      decision: "continue",
      attempts_total_after: 1,
      attempts_kind_after: 1,
      exhausted: false,
    });
    appendStopEvent(runtime.db, {
      occurred_at: "2026-06-17T09:00:00.000Z",
      session_key: "s2",
      turn_id: "t2",
      model: "gpt-5-codex",
      cwd: "D:/repo/b",
      transcript_present: false,
      matched_kind: "usage_limit",
      decision: "stop_capped",
      attempts_total_after: 2,
      attempts_kind_after: 2,
      exhausted: true,
    });

    const summary = querySummary(runtime.db, { model: "gpt-5-codex" });
    assert.equal(summary.total, 2);
    assert.equal(summary.continueCount, 1);
    assert.equal(summary.stopCappedCount, 1);
    assert.equal(summary.kindCounts.transient_rate_limit, 1);
    assert.equal(summary.kindCounts.usage_limit, 1);

    const events = queryEvents(runtime.db, { limit: 1, offset: 0 });
    assert.equal(events.total, 2);
    assert.equal(events.rows.length, 1);
    assert.equal(events.rows[0].turn_id, "t2");

    const facets = queryFacets(runtime.db);
    assert.deepEqual(facets.models, ["gpt-5-codex"]);
    assert(facets.kinds.includes("usage_limit"));
    assert(facets.decisions.includes("stop_capped"));
  } finally {
    runtime.db.close();
  }
});
