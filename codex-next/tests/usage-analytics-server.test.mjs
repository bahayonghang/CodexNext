import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendStopEvent, openAnalyticsDatabase } from "../scripts/lib/analytics-store.mjs";
import { createAnalyticsServer } from "../scripts/usage-analytics-server.mjs";

function makeStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codex-next-server-"));
}

test("analytics server exposes health, summary, events, facets, and viewer html", async () => {
  const stateDir = makeStateDir();
  const runtime = openAnalyticsDatabase({ stateDir });
  const dbPath = runtime.dbPath;

  try {
    appendStopEvent(runtime.db, {
      occurred_at: "2026-06-17T10:00:00.000Z",
      session_key: "s1",
      turn_id: "turn-1",
      model: "gpt-5-codex",
      cwd: "D:/repo",
      transcript_present: true,
      matched_kind: "transient_overload",
      decision: "continue",
      attempts_total_after: 1,
      attempts_kind_after: 1,
      exhausted: false,
    });
  } finally {
    runtime.db.close();
  }

  const app = createAnalyticsServer({ host: "127.0.0.1", port: 0, dbPath });
  const { url } = await app.listen();

  try {
    const health = await fetch(`${url}/api/health`).then((response) => response.json());
    assert.equal(health.ok, true);

    const summary = await fetch(`${url}/api/summary`).then((response) => response.json());
    assert.equal(summary.total, 1);
    assert.equal(summary.kindCounts.transient_overload, 1);

    const events = await fetch(`${url}/api/events?limit=20`).then((response) => response.json());
    assert.equal(events.total, 1);
    assert.equal(events.rows[0].turn_id, "turn-1");

    const facets = await fetch(`${url}/api/facets`).then((response) => response.json());
    assert.deepEqual(facets.models, ["gpt-5-codex"]);

    const html = await fetch(`${url}/`).then((response) => response.text());
    assert.match(html, /Usage Analytics/);
  } finally {
    await app.close();
  }
});
