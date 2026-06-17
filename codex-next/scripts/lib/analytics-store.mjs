import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { DECISION_VALUES, STOP_KIND_VALUES } from "./classify-stop.mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = fs.readFileSync(new URL("../../sql/schema.sql", import.meta.url), "utf8");

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toText(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function isoNow() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function pluginRootDir() {
  return path.resolve(MODULE_DIR, "..", "..");
}

export function resolveStateDir({ stateDir, rootDir } = {}) {
  if (stateDir) {
    return path.resolve(stateDir);
  }

  if (process.env.PLUGIN_DATA) {
    return path.resolve(process.env.PLUGIN_DATA);
  }

  return path.join(rootDir ? path.resolve(rootDir) : pluginRootDir(), ".local-state");
}

export function resolveDatabasePath({ dbPath, stateDir, rootDir } = {}) {
  if (dbPath) {
    return path.resolve(dbPath);
  }

  return path.join(resolveStateDir({ stateDir, rootDir }), "codex-next.sqlite");
}

export function stableSessionKey(payload) {
  const transcriptPath = isObject(payload) ? payload.transcript_path : null;
  if (typeof transcriptPath === "string" && transcriptPath) {
    return `transcript-${crypto.createHash("sha256").update(transcriptPath, "utf8").digest("hex").slice(0, 16)}`;
  }

  const cwd = toText(isObject(payload) ? payload.cwd : "", "");
  const model = toText(isObject(payload) ? payload.model : "", "");
  const key = `${cwd}::${model}`;
  return `fallback-${crypto.createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16)}`;
}

export function resolveLegacyStatePath(sessionKey, { stateDir, rootDir } = {}) {
  return path.join(resolveStateDir({ stateDir, rootDir }), `${sessionKey}.json`);
}

export function readLegacySessionState(sessionKey, options = {}) {
  const legacyPath = resolveLegacyStatePath(sessionKey, options);
  if (!fs.existsSync(legacyPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(legacyPath, "utf8");
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeHookStateRow(row, sessionKey) {
  if (!isObject(row)) {
    return null;
  }

  return {
    session_key: toText(row.session_key, sessionKey ?? ""),
    offset: toInt(row.offset),
    attempts_total: toInt(row.attempts_total),
    attempts_rate_limit: toInt(row.attempts_rate_limit),
    attempts_overload: toInt(row.attempts_overload),
    attempts_usage_limit: toInt(row.attempts_usage_limit),
    last_processed_turn_id: toText(row.last_processed_turn_id),
    transcript_prefix_hash: toText(row.transcript_prefix_hash),
    migrated_from_json: toInt(row.migrated_from_json),
    updated_at: toText(row.updated_at),
  };
}

export function normalizeLegacyHookState(legacyState, sessionKey) {
  const attemptsByKind = isObject(legacyState?.attempts_by_kind) ? legacyState.attempts_by_kind : {};
  return {
    session_key: sessionKey,
    offset: toInt(legacyState?.offset),
    attempts_total: toInt(legacyState?.attempts_total),
    attempts_rate_limit: toInt(attemptsByKind.transient_rate_limit),
    attempts_overload: toInt(attemptsByKind.transient_overload),
    attempts_usage_limit: toInt(attemptsByKind.usage_limit),
    last_processed_turn_id: toText(legacyState?.last_processed_turn_id),
    transcript_prefix_hash: toText(legacyState?.transcript_prefix_hash),
    migrated_from_json: 1,
    updated_at: isoNow(),
  };
}

export function defaultHookState(sessionKey) {
  return {
    session_key: sessionKey,
    offset: 0,
    attempts_total: 0,
    attempts_rate_limit: 0,
    attempts_overload: 0,
    attempts_usage_limit: 0,
    last_processed_turn_id: "",
    transcript_prefix_hash: "",
    migrated_from_json: 0,
    updated_at: isoNow(),
  };
}

export function openAnalyticsDatabase(options = {}) {
  const dbPath = resolveDatabasePath(options);
  ensureDir(path.dirname(dbPath));

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 2000;");
  db.exec(SCHEMA_SQL);
  db.exec("PRAGMA user_version = 1;");

  return { db, dbPath, stateDir: resolveStateDir(options) };
}

export function queryHookState(db, sessionKey) {
  const row = db
    .prepare(
      `
      SELECT
        session_key,
        offset,
        attempts_total,
        attempts_rate_limit,
        attempts_overload,
        attempts_usage_limit,
        last_processed_turn_id,
        transcript_prefix_hash,
        migrated_from_json,
        updated_at
      FROM hook_state
      WHERE session_key = :session_key
    `
    )
    .get({ session_key: sessionKey });

  return normalizeHookStateRow(row, sessionKey);
}

export function upsertHookState(db, state) {
  db.prepare(
    `
      INSERT INTO hook_state (
        session_key,
        offset,
        attempts_total,
        attempts_rate_limit,
        attempts_overload,
        attempts_usage_limit,
        last_processed_turn_id,
        transcript_prefix_hash,
        migrated_from_json,
        updated_at
      )
      VALUES (
        :session_key,
        :offset,
        :attempts_total,
        :attempts_rate_limit,
        :attempts_overload,
        :attempts_usage_limit,
        :last_processed_turn_id,
        :transcript_prefix_hash,
        :migrated_from_json,
        :updated_at
      )
      ON CONFLICT(session_key) DO UPDATE SET
        offset = excluded.offset,
        attempts_total = excluded.attempts_total,
        attempts_rate_limit = excluded.attempts_rate_limit,
        attempts_overload = excluded.attempts_overload,
        attempts_usage_limit = excluded.attempts_usage_limit,
        last_processed_turn_id = excluded.last_processed_turn_id,
        transcript_prefix_hash = excluded.transcript_prefix_hash,
        migrated_from_json = max(hook_state.migrated_from_json, excluded.migrated_from_json),
        updated_at = excluded.updated_at
    `
  ).run({
    session_key: state.session_key,
    offset: toInt(state.offset),
    attempts_total: toInt(state.attempts_total),
    attempts_rate_limit: toInt(state.attempts_rate_limit),
    attempts_overload: toInt(state.attempts_overload),
    attempts_usage_limit: toInt(state.attempts_usage_limit),
    last_processed_turn_id: toText(state.last_processed_turn_id),
    transcript_prefix_hash: toText(state.transcript_prefix_hash),
    migrated_from_json: toInt(state.migrated_from_json),
    updated_at: toText(state.updated_at, isoNow()),
  });
}

export function ensureHookState(db, payload, options = {}) {
  const sessionKey = stableSessionKey(payload);
  const existing = queryHookState(db, sessionKey);
  if (existing) {
    return existing;
  }

  const legacyState = readLegacySessionState(sessionKey, options);
  const state = legacyState ? normalizeLegacyHookState(legacyState, sessionKey) : defaultHookState(sessionKey);
  upsertHookState(db, state);
  return normalizeHookStateRow(queryHookState(db, sessionKey), sessionKey) ?? state;
}

export function recordHookState(db, state) {
  const nextState = {
    ...state,
    updated_at: isoNow(),
  };
  upsertHookState(db, nextState);
  return nextState;
}

export function appendStopEvent(db, event) {
  db.prepare(
    `
      INSERT INTO stop_events (
        occurred_at,
        session_key,
        turn_id,
        model,
        cwd,
        transcript_present,
        matched_kind,
        decision,
        attempts_total_after,
        attempts_kind_after,
        exhausted
      )
      VALUES (
        :occurred_at,
        :session_key,
        :turn_id,
        :model,
        :cwd,
        :transcript_present,
        :matched_kind,
        :decision,
        :attempts_total_after,
        :attempts_kind_after,
        :exhausted
      )
    `
  ).run({
    occurred_at: toText(event.occurred_at, isoNow()),
    session_key: toText(event.session_key),
    turn_id: event.turn_id == null ? null : toText(event.turn_id),
    model: event.model == null ? null : toText(event.model),
    cwd: event.cwd == null ? null : toText(event.cwd),
    transcript_present: event.transcript_present ? 1 : 0,
    matched_kind: STOP_KIND_VALUES.includes(event.matched_kind) ? event.matched_kind : "no_match",
    decision: DECISION_VALUES.includes(event.decision) ? event.decision : "allow_stop",
    attempts_total_after: toInt(event.attempts_total_after),
    attempts_kind_after: toInt(event.attempts_kind_after),
    exhausted: event.exhausted ? 1 : 0,
  });
}

function buildWhereClause(filters = {}) {
  const clauses = [];
  const params = {};

  if (typeof filters.from === "string" && filters.from) {
    clauses.push("occurred_at >= :from");
    params.from = filters.from;
  }

  if (typeof filters.to === "string" && filters.to) {
    clauses.push("occurred_at <= :to");
    params.to = filters.to;
  }

  if (typeof filters.kind === "string" && filters.kind) {
    clauses.push("matched_kind = :kind");
    params.kind = filters.kind;
  }

  if (typeof filters.decision === "string" && filters.decision) {
    clauses.push("decision = :decision");
    params.decision = filters.decision;
  }

  if (typeof filters.model === "string" && filters.model) {
    clauses.push("model = :model");
    params.model = filters.model;
  }

  if (typeof filters.cwdContains === "string" && filters.cwdContains) {
    clauses.push("instr(lower(coalesce(cwd, '')), lower(:cwd_contains)) > 0");
    params.cwd_contains = filters.cwdContains;
  }

  return {
    where: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export function querySummary(db, filters = {}) {
  const { where, params } = buildWhereClause(filters);
  const totals = db
    .prepare(
      `
        SELECT
          count(*) AS total,
          sum(CASE WHEN decision = 'continue' THEN 1 ELSE 0 END) AS continue_count,
          sum(CASE WHEN decision = 'stop_capped' THEN 1 ELSE 0 END) AS stop_capped_count,
          sum(CASE WHEN decision = 'skip_active_hook' THEN 1 ELSE 0 END) AS skip_active_hook_count,
          sum(CASE WHEN decision = 'skip_duplicate_turn' THEN 1 ELSE 0 END) AS skip_duplicate_turn_count,
          sum(CASE WHEN decision = 'allow_stop' THEN 1 ELSE 0 END) AS allow_stop_count
        FROM stop_events${where}
      `
    )
    .get(params) ?? {};

  const kindRows = db
    .prepare(
      `
        SELECT matched_kind AS kind, count(*) AS count
        FROM stop_events${where}
        GROUP BY matched_kind
        ORDER BY count(*) DESC, matched_kind ASC
      `
    )
    .all(params);

  const decisionRows = db
    .prepare(
      `
        SELECT decision, count(*) AS count
        FROM stop_events${where}
        GROUP BY decision
        ORDER BY count(*) DESC, decision ASC
      `
    )
    .all(params);

  const kindCounts = Object.fromEntries(STOP_KIND_VALUES.map((kind) => [kind, 0]));
  for (const row of kindRows) {
    kindCounts[row.kind] = toInt(row.count);
  }

  const decisionCounts = Object.fromEntries(DECISION_VALUES.map((decision) => [decision, 0]));
  for (const row of decisionRows) {
    decisionCounts[row.decision] = toInt(row.count);
  }

  return {
    total: toInt(totals.total),
    continueCount: toInt(totals.continue_count),
    stopCappedCount: toInt(totals.stop_capped_count),
    skipActiveHookCount: toInt(totals.skip_active_hook_count),
    skipDuplicateTurnCount: toInt(totals.skip_duplicate_turn_count),
    allowStopCount: toInt(totals.allow_stop_count),
    kindCounts,
    decisionCounts,
  };
}

export function queryEvents(db, filters = {}) {
  const { where, params } = buildWhereClause(filters);
  const limit = Math.min(Math.max(toInt(filters.limit, 50), 1), 500);
  const offset = Math.max(toInt(filters.offset, 0), 0);

  const total = db
    .prepare(
      `
        SELECT count(*) AS total
        FROM stop_events${where}
      `
    )
    .get(params)?.total ?? 0;

  const rows = db
    .prepare(
      `
        SELECT
          id,
          occurred_at,
          session_key,
          turn_id,
          model,
          cwd,
          transcript_present,
          matched_kind,
          decision,
          attempts_total_after,
          attempts_kind_after,
          exhausted
        FROM stop_events${where}
        ORDER BY occurred_at DESC, id DESC
        LIMIT :limit OFFSET :offset
      `
    )
    .all({ ...params, limit, offset })
    .map((row) => ({
      id: toInt(row.id),
      occurred_at: toText(row.occurred_at),
      session_key: toText(row.session_key),
      turn_id: row.turn_id == null ? null : toText(row.turn_id),
      model: row.model == null ? null : toText(row.model),
      cwd: row.cwd == null ? null : toText(row.cwd),
      transcript_present: toInt(row.transcript_present),
      matched_kind: toText(row.matched_kind),
      decision: toText(row.decision),
      attempts_total_after: toInt(row.attempts_total_after),
      attempts_kind_after: toInt(row.attempts_kind_after),
      exhausted: toInt(row.exhausted),
    }));

  return {
    total: toInt(total),
    limit,
    offset,
    rows,
  };
}

export function queryFacets(db) {
  const models = db
    .prepare(
      `
        SELECT DISTINCT model
        FROM stop_events
        WHERE model IS NOT NULL AND model <> ''
        ORDER BY model ASC
      `
    )
    .all()
    .map((row) => toText(row.model))
    .filter(Boolean);

  return {
    models,
    kinds: [...STOP_KIND_VALUES],
    decisions: [...DECISION_VALUES],
  };
}
