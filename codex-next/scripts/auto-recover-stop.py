#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any
import re


if sys.platform.startswith("win"):
    import io as _io

    for _stream_name in ("stdin", "stdout", "stderr"):
        _stream = getattr(sys, _stream_name, None)
        if _stream is None:
            continue
        if hasattr(_stream, "reconfigure"):
            try:
                _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
            except Exception:
                pass
        elif hasattr(_stream, "detach"):
            try:
                setattr(sys, _stream_name, _io.TextIOWrapper(_stream.detach(), encoding="utf-8", errors="replace"))
            except Exception:
                pass


MAX_ATTEMPTS_TOTAL = 5
MAX_ATTEMPTS_BY_KIND = {
    "transient_rate_limit": 3,
    "transient_overload": 2,
    "usage_limit": 2,
}

CONTINUE_MESSAGES = {
    "transient_rate_limit": (
        "The previous turn appears to have been interrupted by an OpenAI rate limit. "
        "Continue exactly where you left off and do not restart from scratch."
    ),
    "transient_overload": (
        "The previous turn appears to have been interrupted by a temporary OpenAI server overload. "
        "Continue exactly where you left off and do not restart from scratch."
    ),
    "usage_limit": (
        "The previous turn appears to have been interrupted by a Codex model or usage limit. "
        "Continue exactly where you left off if the limit has cleared, and do not restart from scratch."
    ),
}

STOP_MESSAGES = {
    "transient_rate_limit": (
        "Auto-retry stopped after repeated rate-limit interruptions. Check `/status`, wait for the limit window to "
        "reset, then continue manually."
    ),
    "transient_overload": (
        "Auto-retry stopped after repeated temporary OpenAI overload responses. Check `/status` and try again later, "
        "then continue manually."
    ),
    "usage_limit": (
        "Auto-retry stopped after repeated Codex model or usage-limit interruptions. Check `/status`, wait for reset, "
        "add credits if applicable, or switch to a lower-cost model, then continue manually."
    ),
}

ERROR_RE = re.compile(
    r"\b(error|failed|failure|interrupted|aborted|stopped|unable|cannot|can't|timed out|timeout)\b",
    re.IGNORECASE,
)
RATE_LIMIT_RE = re.compile(
    r"(\b429\b|rate[\s_-]?limit|too many requests|rate[\s_-]?limited|retry[\s_-]?after)",
    re.IGNORECASE,
)
OVERLOAD_RE = re.compile(
    r"(\b503\b|service unavailable|server error|internal server error|bad gateway|gateway timeout|overloaded|temporarily unavailable)",
    re.IGNORECASE,
)
USAGE_LIMIT_RE = re.compile(
    r"(usage limit|quota exceeded|credits?(?: exhausted| depleted)?|workspace usage limit|model (?:cap|limit)|monthly budget|spending limit)",
    re.IGNORECASE,
)
USAGE_CONTEXT_RE = re.compile(
    r"\b(reached|hit|exceeded|exhausted|depleted|reset|wait|later|remaining|quota|limit)\b",
    re.IGNORECASE,
)


def plugin_root(script_path: Path | None = None) -> Path:
    base = script_path or Path(__file__).resolve()
    return base.parents[1]


def default_state_dir(root: Path | None = None) -> Path:
    plugin_data = os.environ.get("PLUGIN_DATA")
    if plugin_data:
        return Path(plugin_data)
    return (root or plugin_root()) / ".local-state"


def read_stdin() -> str:
    try:
        return sys.stdin.read()
    except Exception:
        return ""


def parse_payload(raw: str) -> dict[str, Any]:
    if not raw.strip():
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def stable_session_key(payload: dict[str, Any]) -> str:
    transcript_path = payload.get("transcript_path")
    if isinstance(transcript_path, str) and transcript_path:
        return "transcript-" + hashlib.sha256(transcript_path.encode("utf-8")).hexdigest()[:16]

    cwd = payload.get("cwd") or ""
    model = payload.get("model") or ""
    key = f"{cwd}::{model}"
    return "fallback-" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]


def state_file_path(payload: dict[str, Any], state_dir: Path | None = None) -> Path:
    base = state_dir or default_state_dir()
    return base / f"{stable_session_key(payload)}.json"


def load_state(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        data = {}

    if not isinstance(data, dict):
        data = {}

    attempts = data.get("attempts_by_kind")
    if not isinstance(attempts, dict):
        attempts = {}

    return {
        "offset": int(data.get("offset", 0) or 0),
        "attempts_total": int(data.get("attempts_total", 0) or 0),
        "attempts_by_kind": {
            "transient_rate_limit": int(attempts.get("transient_rate_limit", 0) or 0),
            "transient_overload": int(attempts.get("transient_overload", 0) or 0),
            "usage_limit": int(attempts.get("usage_limit", 0) or 0),
        },
        "last_processed_turn_id": str(data.get("last_processed_turn_id", "") or ""),
        "transcript_prefix_hash": str(data.get("transcript_prefix_hash", "") or ""),
    }


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def read_transcript_delta(
    transcript_path: str | None,
    offset: int,
    known_prefix_hash: str = "",
) -> tuple[str, int, str]:
    if not transcript_path:
        return "", offset, ""

    path = Path(transcript_path)
    if not path.exists():
        return "", offset, ""

    try:
        size = path.stat().st_size
    except OSError:
        return "", offset, ""

    try:
        with path.open("rb") as fh:
            prefix_bytes = fh.read(128)
    except OSError:
        return "", offset, ""

    prefix_hash = hashlib.sha256(prefix_bytes).hexdigest() if prefix_bytes else ""
    rotated = bool(known_prefix_hash and prefix_hash and prefix_hash != known_prefix_hash)
    start = 0 if rotated or size < offset else offset
    if size == start:
        return "", size, prefix_hash

    try:
        with path.open("rb") as fh:
            fh.seek(start)
            chunk = fh.read(size - start)
    except OSError:
        return "", offset, prefix_hash

    text = chunk.decode("utf-8", errors="replace")
    return text, size, prefix_hash


def build_signal_text(payload: dict[str, Any], state: dict[str, Any]) -> tuple[str, int, str]:
    parts: list[str] = []
    message = payload.get("last_assistant_message")
    if isinstance(message, str) and message:
        parts.append(message)

    transcript_path = payload.get("transcript_path")
    chunk, next_offset, prefix_hash = read_transcript_delta(
        transcript_path if isinstance(transcript_path, str) else None,
        int(state.get("offset", 0) or 0),
        str(state.get("transcript_prefix_hash", "") or ""),
    )
    if chunk:
        parts.append(chunk)

    return "\n".join(parts), next_offset, prefix_hash


def classify_text(text: str) -> str | None:
    if not text:
        return None

    if USAGE_LIMIT_RE.search(text) and (ERROR_RE.search(text) or USAGE_CONTEXT_RE.search(text)):
        return "usage_limit"
    if RATE_LIMIT_RE.search(text) and ERROR_RE.search(text):
        return "transient_rate_limit"
    if OVERLOAD_RE.search(text) and ERROR_RE.search(text):
        return "transient_overload"
    return None


def continue_response(kind: str) -> dict[str, Any]:
    return {"decision": "block", "reason": CONTINUE_MESSAGES[kind]}


def stop_response(kind: str, state: dict[str, Any]) -> dict[str, Any]:
    used = int(state["attempts_by_kind"].get(kind, 0))
    cap = MAX_ATTEMPTS_BY_KIND[kind]
    detail = f"{kind} retries exhausted ({used}/{cap}; total {state['attempts_total']}/{MAX_ATTEMPTS_TOTAL})."
    return {
        "continue": False,
        "stopReason": detail,
        "systemMessage": STOP_MESSAGES[kind],
    }


def should_skip_turn(payload: dict[str, Any], state: dict[str, Any]) -> bool:
    if payload.get("stop_hook_active") is True:
        return True

    turn_id = payload.get("turn_id")
    if isinstance(turn_id, str) and turn_id and turn_id == state.get("last_processed_turn_id", ""):
        return True

    return False


def process_stop(payload: dict[str, Any], state_dir: Path | None = None) -> dict[str, Any] | None:
    state_path = state_file_path(payload, state_dir=state_dir)
    state = load_state(state_path)

    if should_skip_turn(payload, state):
        return None

    text, next_offset, prefix_hash = build_signal_text(payload, state)
    state["offset"] = next_offset
    state["transcript_prefix_hash"] = prefix_hash

    turn_id = payload.get("turn_id")
    if isinstance(turn_id, str) and turn_id:
        state["last_processed_turn_id"] = turn_id

    kind = classify_text(text)
    if kind is None:
        save_state(state_path, state)
        return None

    kind_attempts = int(state["attempts_by_kind"].get(kind, 0))
    total_attempts = int(state.get("attempts_total", 0))
    if kind_attempts >= MAX_ATTEMPTS_BY_KIND[kind] or total_attempts >= MAX_ATTEMPTS_TOTAL:
        save_state(state_path, state)
        return stop_response(kind, state)

    state["attempts_by_kind"][kind] = kind_attempts + 1
    state["attempts_total"] = total_attempts + 1
    save_state(state_path, state)
    return continue_response(kind)


def emit_json(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))


def main() -> int:
    payload = parse_payload(read_stdin())
    if not payload:
        return 0

    response = process_stop(payload)
    if response is not None:
        emit_json(response)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
