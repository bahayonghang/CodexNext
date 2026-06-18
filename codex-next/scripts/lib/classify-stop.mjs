const ERROR_RE = /\b(error|failed|failure|interrupted|aborted|stopped|unable|cannot|can't|timed out|timeout)\b/i;
const RATE_LIMIT_RE = /(\b429\b|rate[\s_-]?limit|too many requests|rate[\s_-]?limited|retry[\s_-]?after)/i;
const OVERLOAD_RE = /(\b503\b|service unavailable|server error|internal server error|bad gateway|gateway timeout|overloaded|temporarily unavailable)/i;
const USAGE_LIMIT_RE = /(usage limit|quota exceeded|credits?(?: exhausted| depleted)?|workspace usage limit|model (?:cap|limit|is at capacity)|monthly budget|spending limit)/i;
const USAGE_CONTEXT_RE = /\b(reached|hit|exceeded|exhausted|depleted|reset|wait|later|remaining|quota|limit|capacity)\b/i;

export const MAX_ATTEMPTS_TOTAL = 5;
export const MAX_ATTEMPTS_BY_KIND = Object.freeze({
  transient_rate_limit: 3,
  transient_overload: 2,
  usage_limit: 2,
});

export const CONTINUE_MESSAGES = Object.freeze({
  transient_rate_limit:
    "The previous turn appears to have been interrupted by an OpenAI rate limit. Continue exactly where you left off and do not restart from scratch.",
  transient_overload:
    "The previous turn appears to have been interrupted by a temporary OpenAI server overload. Continue exactly where you left off and do not restart from scratch.",
  usage_limit:
    "The previous turn appears to have been interrupted by a Codex model or usage limit. Continue exactly where you left off if the limit has cleared, and do not restart from scratch.",
});

export const STOP_MESSAGES = Object.freeze({
  transient_rate_limit:
    "Auto-retry stopped after repeated rate-limit interruptions. Check `/status`, wait for the limit window to reset, then continue manually.",
  transient_overload:
    "Auto-retry stopped after repeated temporary OpenAI overload responses. Check `/status` and try again later, then continue manually.",
  usage_limit:
    "Auto-retry stopped after repeated Codex model or usage-limit interruptions. Check `/status`, wait for reset, add credits if applicable, or switch to a lower-cost model, then continue manually.",
});

export const STOP_KIND_VALUES = Object.freeze([
  "transient_rate_limit",
  "transient_overload",
  "usage_limit",
  "no_match",
]);

export const DECISION_VALUES = Object.freeze([
  "continue",
  "stop_capped",
  "skip_active_hook",
  "skip_duplicate_turn",
  "allow_stop",
]);

export function classifyStopText(text) {
  if (typeof text !== "string" || text.length === 0) {
    return "no_match";
  }

  if (USAGE_LIMIT_RE.test(text) && (ERROR_RE.test(text) || USAGE_CONTEXT_RE.test(text))) {
    return "usage_limit";
  }

  if (RATE_LIMIT_RE.test(text) && ERROR_RE.test(text)) {
    return "transient_rate_limit";
  }

  if (OVERLOAD_RE.test(text) && ERROR_RE.test(text)) {
    return "transient_overload";
  }

  return "no_match";
}
