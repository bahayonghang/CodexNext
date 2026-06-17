from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "auto-recover-stop.py"
FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"

SPEC = importlib.util.spec_from_file_location("auto_recover_stop", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


class AutoRecoverStopTests(unittest.TestCase):
    def test_classifies_and_retries_429(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            payload = load_fixture("stop-transient-429.json")
            result = MODULE.process_stop(payload, state_dir=Path(tmp))
            self.assertEqual(result["decision"], "block")
            self.assertIn("rate limit", result["reason"].lower())

    def test_classifies_and_retries_503(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            payload = load_fixture("stop-transient-503.json")
            result = MODULE.process_stop(payload, state_dir=Path(tmp))
            self.assertEqual(result["decision"], "block")
            self.assertIn("server overload", result["reason"].lower())

    def test_classifies_and_retries_usage_limit(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            payload = load_fixture("stop-usage-limit.json")
            result = MODULE.process_stop(payload, state_dir=Path(tmp))
            self.assertEqual(result["decision"], "block")
            self.assertIn("usage limit", result["reason"].lower())

    def test_non_matching_stop_is_ignored(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            payload = load_fixture("stop-non-matching.json")
            result = MODULE.process_stop(payload, state_dir=Path(tmp))
            self.assertIsNone(result)

    def test_stop_hook_active_is_ignored(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            payload = load_fixture("stop-transient-429.json")
            payload["stop_hook_active"] = True
            result = MODULE.process_stop(payload, state_dir=Path(tmp))
            self.assertIsNone(result)

    def test_usage_limit_retries_stop_after_cap(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            for turn_id in ("turn-1", "turn-2"):
                payload = load_fixture("stop-usage-limit.json")
                payload["turn_id"] = turn_id
                result = MODULE.process_stop(payload, state_dir=state_dir)
                self.assertEqual(result["decision"], "block")

            payload = load_fixture("stop-usage-limit.json")
            payload["turn_id"] = "turn-3"
            result = MODULE.process_stop(payload, state_dir=state_dir)
            self.assertFalse(result["continue"])
            self.assertIn("usage-limit interruptions", result["systemMessage"])

    def test_duplicate_turn_id_does_not_retrigger(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            payload = load_fixture("stop-transient-429.json")
            result = MODULE.process_stop(payload, state_dir=state_dir)
            self.assertEqual(result["decision"], "block")

            duplicate = load_fixture("stop-transient-429.json")
            result = MODULE.process_stop(duplicate, state_dir=state_dir)
            self.assertIsNone(result)

    def test_transcript_rotation_resets_offset(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            state_dir = tmp_path / "state"
            transcript = tmp_path / "transcript.jsonl"

            transcript.write_text(
                "error 429 too many requests interrupted\n",
                encoding="utf-8",
            )
            payload = {
                "turn_id": "turn-429",
                "stop_hook_active": False,
                "last_assistant_message": "",
                "transcript_path": str(transcript),
                "cwd": "D:/repo",
                "model": "gpt-5-codex"
            }
            result = MODULE.process_stop(payload, state_dir=state_dir)
            self.assertEqual(result["decision"], "block")

            transcript.write_text(
                "failed 503 service unavailable overloaded\n",
                encoding="utf-8",
            )
            payload["turn_id"] = "turn-503"
            result = MODULE.process_stop(payload, state_dir=state_dir)
            self.assertEqual(result["decision"], "block")
            self.assertIn("server overload", result["reason"].lower())


if __name__ == "__main__":
    unittest.main()
