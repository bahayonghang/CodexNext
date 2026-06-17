import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendStopEvent,
  ensureHookState,
  openAnalyticsDatabase,
  queryHookState,
  recordHookState,
  stableSessionKey,
} from "./lib/analytics-store.mjs";
import {
  CONTINUE_MESSAGES,
  MAX_ATTEMPTS_BY_KIND,
  MAX_ATTEMPTS_TOTAL,
  STOP_MESSAGES,
  classifyStopText,
} from "./lib/classify-stop.mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const WINDOWS_UTF8_DONE = process.platform === "win32";

function safeReconfigure(streamName) {
  const stream = process[streamName];
  if (!stream) {
    return;
  }

  if (typeof stream.reconfigure === "function") {
    try {
      stream.reconfigure({ encoding: "utf8", errors: "replace" });
    } catch {
      // ignore
    }
  }
}

if (WINDOWS_UTF8_DONE) {
  safeReconfigure("stdin");
  safeReconfigure("stdout");
  safeReconfigure("stderr");
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parsePayload(raw) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isString(value) {
  return typeof value === "string" && value.length > 0;
}

function defaultString(value) {
  return isString(value) ? value : "";
}

function readTranscriptDelta(transcriptPath, offset, knownPrefixHash = "") {
  if (!isString(transcriptPath)) {
    return { text: "", nextOffset: offset, prefixHash: "" };
  }

  try {
    const stats = fs.statSync(transcriptPath);
    const size = stats.size;
    const prefixBuffer = Buffer.alloc(Math.min(128, size));
    const handle = fs.openSync(transcriptPath, "r");

    try {
      let prefixBytes = 0;
      if (prefixBuffer.length > 0) {
        prefixBytes = fs.readSync(handle, prefixBuffer, 0, prefixBuffer.length, 0);
      }

      const prefixHash =
        prefixBytes > 0
          ? crypto.createHash("sha256").update(prefixBuffer.subarray(0, prefixBytes)).digest("hex")
          : "";
      const rotated = Boolean(knownPrefixHash && prefixHash && prefixHash !== knownPrefixHash);
      const start = rotated || size < offset ? 0 : offset;
      if (size === start) {
        return { text: "", nextOffset: size, prefixHash };
      }

      const deltaSize = size - start;
      const deltaBuffer = Buffer.alloc(deltaSize);
      const readBytes = fs.readSync(handle, deltaBuffer, 0, deltaSize, start);
      const text = deltaBuffer.subarray(0, readBytes).toString("utf8");
      return { text, nextOffset: size, prefixHash };
    } finally {
      fs.closeSync(handle);
    }
  } catch {
    return { text: "", nextOffset: offset, prefixHash: knownPrefixHash };
  }
}

function buildSignalText(payload, state) {
  const parts = [];
  if (isString(payload.last_assistant_message)) {
    parts.push(payload.last_assistant_message);
  }

  const transcriptPath = isString(payload.transcript_path) ? payload.transcript_path : null;
  const { text, nextOffset, prefixHash } = readTranscriptDelta(transcriptPath, state.offset, state.transcript_prefix_hash);
  if (text) {
    parts.push(text);
  }

  return {
    text: parts.join("\n"),
    nextOffset,
    prefixHash,
  };
}

function responseForContinue(kind) {
  return { decision: "block", reason: CONTINUE_MESSAGES[kind] };
}

function responseForCap(kind, state) {
  const used = kind === "transient_rate_limit"
    ? state.attempts_rate_limit
    : kind === "transient_overload"
      ? state.attempts_overload
      : state.attempts_usage_limit;
  const cap = MAX_ATTEMPTS_BY_KIND[kind];
  return {
    continue: false,
    stopReason: `${kind} retries exhausted (${used}/${cap}; total ${state.attempts_total}/${MAX_ATTEMPTS_TOTAL}).`,
    systemMessage: STOP_MESSAGES[kind],
  };
}

function buildEventBase(payload, sessionKey, state) {
  return {
    occurred_at: new Date().toISOString(),
    session_key: sessionKey,
    turn_id: isString(payload.turn_id) ? payload.turn_id : null,
    model: isString(payload.model) ? payload.model : null,
    cwd: isString(payload.cwd) ? payload.cwd : null,
    transcript_present: isString(payload.transcript_path),
    attempts_total_after: state.attempts_total,
    attempts_kind_after:
      state.last_matched_kind === "transient_rate_limit"
        ? state.attempts_rate_limit
        : state.last_matched_kind === "transient_overload"
          ? state.attempts_overload
          : state.attempts_usage_limit,
  };
}

function updateStateForKind(state, kind) {
  const next = { ...state, last_matched_kind: kind };
  if (kind === "transient_rate_limit") {
    next.attempts_rate_limit += 1;
    next.attempts_total += 1;
  } else if (kind === "transient_overload") {
    next.attempts_overload += 1;
    next.attempts_total += 1;
  } else if (kind === "usage_limit") {
    next.attempts_usage_limit += 1;
    next.attempts_total += 1;
  }
  return next;
}

function persistStateAndEvent(db, state, event) {
  db.exec("BEGIN IMMEDIATE;");
  try {
    if (state) {
      recordHookState(db, state);
    }
    appendStopEvent(db, event);
    db.exec("COMMIT;");
  } catch (error) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      // ignore
    }
    throw error;
  }
}

function coerceState(row) {
  return {
    session_key: row.session_key,
    offset: row.offset,
    attempts_total: row.attempts_total,
    attempts_rate_limit: row.attempts_rate_limit,
    attempts_overload: row.attempts_overload,
    attempts_usage_limit: row.attempts_usage_limit,
    last_processed_turn_id: row.last_processed_turn_id ?? "",
    transcript_prefix_hash: row.transcript_prefix_hash ?? "",
    migrated_from_json: row.migrated_from_json ?? 0,
    updated_at: row.updated_at,
    last_matched_kind: "no_match",
  };
}

export function processStop(payload, options = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  let runtime;
  try {
    runtime = openAnalyticsDatabase(options);
  } catch {
    return null;
  }

  const { db, stateDir } = runtime;
  const sessionKey = stableSessionKey(payload);

  try {
    if (payload.stop_hook_active === true) {
      const state = coerceState(
        queryHookState(db, sessionKey) ?? {
          session_key: sessionKey,
          offset: 0,
          attempts_total: 0,
          attempts_rate_limit: 0,
          attempts_overload: 0,
          attempts_usage_limit: 0,
          last_processed_turn_id: "",
          transcript_prefix_hash: "",
          migrated_from_json: 0,
          updated_at: new Date().toISOString(),
        }
      );
      persistStateAndEvent(db, null, {
        ...buildEventBase(payload, sessionKey, state),
        matched_kind: "no_match",
        decision: "skip_active_hook",
        exhausted: 0,
        attempts_kind_after: 0,
      });
      return null;
    }

    const row = ensureHookState(db, payload, { stateDir });
    const state = coerceState(row);
    const turnId = isString(payload.turn_id) ? payload.turn_id : "";

    if (turnId && turnId === defaultString(state.last_processed_turn_id)) {
      persistStateAndEvent(db, null, {
        ...buildEventBase(payload, sessionKey, state),
        matched_kind: "no_match",
        decision: "skip_duplicate_turn",
        exhausted: 0,
        attempts_kind_after: 0,
      });
      return null;
    }

    const signal = buildSignalText(payload, state);
    const matchedKind = classifyStopText(signal.text);
    const transcriptPresent = isString(payload.transcript_path);
    const stateWithSignal = {
      ...state,
      offset: signal.nextOffset,
      transcript_prefix_hash: signal.prefixHash,
      last_processed_turn_id: turnId || state.last_processed_turn_id,
    };

    if (matchedKind === "no_match") {
      persistStateAndEvent(db, stateWithSignal, {
        ...buildEventBase(payload, sessionKey, stateWithSignal),
        matched_kind: matchedKind,
        decision: "allow_stop",
        exhausted: 0,
        attempts_kind_after: 0,
        transcript_present: transcriptPresent,
      });
      return null;
    }

    const attemptsKind = matchedKind === "transient_rate_limit"
      ? state.attempts_rate_limit
      : matchedKind === "transient_overload"
        ? state.attempts_overload
        : state.attempts_usage_limit;
    const exhausted = attemptsKind >= MAX_ATTEMPTS_BY_KIND[matchedKind] || state.attempts_total >= MAX_ATTEMPTS_TOTAL;

    if (exhausted) {
      persistStateAndEvent(db, stateWithSignal, {
        ...buildEventBase(payload, sessionKey, stateWithSignal),
        matched_kind: matchedKind,
        decision: "stop_capped",
        exhausted: 1,
        attempts_kind_after: attemptsKind,
        transcript_present: transcriptPresent,
      });
      return responseForCap(matchedKind, state);
    }

    const updated = updateStateForKind(stateWithSignal, matchedKind);
    persistStateAndEvent(db, updated, {
      ...buildEventBase(payload, sessionKey, updated),
      matched_kind: matchedKind,
      decision: "continue",
      exhausted: 0,
      attempts_kind_after:
        matchedKind === "transient_rate_limit"
          ? updated.attempts_rate_limit
          : matchedKind === "transient_overload"
            ? updated.attempts_overload
            : updated.attempts_usage_limit,
      transcript_present: transcriptPresent,
    });
    return responseForContinue(matchedKind);
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}

export function main() {
  const payload = parsePayload(readStdin());
  if (!payload) {
    return 0;
  }

  const response = processStop(payload);
  if (response) {
    process.stdout.write(JSON.stringify(response));
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const exitCode = main();
  process.exitCode = exitCode;
}
