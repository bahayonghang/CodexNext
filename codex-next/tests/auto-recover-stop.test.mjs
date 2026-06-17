import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { processStop } from "../scripts/auto-recover-stop.mjs";

const FIXTURE_DIR = path.resolve("codex-next", "tests", "fixtures");

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
}

function makeStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codex-next-hook-"));
}

test("classifies and retries 429", () => {
  const stateDir = makeStateDir();
  const result = processStop(loadFixture("stop-transient-429.json"), { stateDir });
  assert.equal(result.decision, "block");
  assert.match(result.reason.toLowerCase(), /rate limit/);
});

test("classifies and retries 503", () => {
  const stateDir = makeStateDir();
  const result = processStop(loadFixture("stop-transient-503.json"), { stateDir });
  assert.equal(result.decision, "block");
  assert.match(result.reason.toLowerCase(), /server overload/);
});

test("classifies and retries usage limit", () => {
  const stateDir = makeStateDir();
  const result = processStop(loadFixture("stop-usage-limit.json"), { stateDir });
  assert.equal(result.decision, "block");
  assert.match(result.reason.toLowerCase(), /usage limit/);
});

test("ignores non-matching stops", () => {
  const stateDir = makeStateDir();
  const result = processStop(loadFixture("stop-non-matching.json"), { stateDir });
  assert.equal(result, null);
});

test("ignores active stop hook re-entry", () => {
  const stateDir = makeStateDir();
  const payload = loadFixture("stop-transient-429.json");
  payload.stop_hook_active = true;
  const result = processStop(payload, { stateDir });
  assert.equal(result, null);
});

test("usage-limit retries stop after the cap", () => {
  const stateDir = makeStateDir();
  for (const turnId of ["turn-1", "turn-2"]) {
    const payload = loadFixture("stop-usage-limit.json");
    payload.turn_id = turnId;
    const result = processStop(payload, { stateDir });
    assert.equal(result.decision, "block");
  }

  const payload = loadFixture("stop-usage-limit.json");
  payload.turn_id = "turn-3";
  const result = processStop(payload, { stateDir });
  assert.equal(result.continue, false);
  assert.match(result.systemMessage, /usage-limit interruptions/);
});

test("duplicate turn id does not retrigger", () => {
  const stateDir = makeStateDir();
  const first = processStop(loadFixture("stop-transient-429.json"), { stateDir });
  assert.equal(first.decision, "block");

  const second = processStop(loadFixture("stop-transient-429.json"), { stateDir });
  assert.equal(second, null);
});

test("transcript rotation resets offset", () => {
  const stateDir = makeStateDir();
  const transcript = path.join(stateDir, "transcript.jsonl");
  fs.writeFileSync(transcript, "error 429 too many requests interrupted\n", "utf8");

  const payload = {
    turn_id: "turn-429",
    stop_hook_active: false,
    last_assistant_message: "",
    transcript_path: transcript,
    cwd: "D:/repo",
    model: "gpt-5-codex",
  };

  const first = processStop(payload, { stateDir });
  assert.equal(first.decision, "block");

  fs.writeFileSync(transcript, "failed 503 service unavailable overloaded\n", "utf8");
  payload.turn_id = "turn-503";
  const second = processStop(payload, { stateDir });
  assert.equal(second.decision, "block");
  assert.match(second.reason.toLowerCase(), /server overload/);
});
