# Implementation Plan: Codex Auto-Recovery for 429, 503, and Usage Limits

## Ordered Checklist

- [x] Scaffold a root-level `codex-next/` plugin and make its manifest valid.
- [x] Implement `codex-next/scripts/auto-recover-stop.py` in Python with:
      - Windows UTF-8 stream hardening
      - safe stdin JSON parsing
      - per-session state load/save under `PLUGIN_DATA` with a local fallback
      - transcript delta reading
      - classifier for 429 / 503 / usage-limit conditions
      - per-class and global retry caps
      - documented hook output JSON for continue vs capped-stop
- [x] Add `codex-next/hooks/hooks.json` wired to the script with
      `${PLUGIN_ROOT}`.
- [x] Add fixture-based tests under `codex-next/tests/` using stdlib
      `unittest`.
- [x] Add at least one fixture for each detection class plus transcript-rotation
      and `stop_hook_active` cases.
- [x] Add a fixture or direct test that proves capped retries stop continuing.
- [x] Run automated tests, plugin validation, and manual stdin smoke checks.
- [x] Review the resulting UX text for clarity and non-looping behavior.

## Validation Commands

```powershell
python -m unittest discover -s codex-next/tests -p "test_*.py"
```

```powershell
Get-Content codex-next/tests/fixtures/stop-transient-429.json | python -X utf8 codex-next/scripts/auto-recover-stop.py
```

```powershell
Get-Content codex-next/tests/fixtures/stop-usage-limit.json | python -X utf8 codex-next/scripts/auto-recover-stop.py
```

```powershell
python C:\Users\lyh\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py codex-next
```

## Risky Files

- `codex-next/.codex-plugin/plugin.json`
  - invalid manifest fields or dangling component paths break validation
- `codex-next/hooks/hooks.json`
  - bad JSON or wrong event shape disables hook loading
- `codex-next/scripts/auto-recover-stop.py`
  - hook logic bugs can create unwanted resume loops
- `codex-next/tests/*`
  - fixtures must reflect real Codex wording closely enough to stay useful

## Review Gates Before Completion

- Planning artifacts reflect the user-approved policy that all three failure
  classes are retryable, but capped.
- The task keeps scope to a root-level local Codex plugin package.
- The user accepts the capped-retry default for usage-limit cases.

## Rollback Points

- Delete the `codex-next/` plugin folder.
- Clear any plugin runtime state under `PLUGIN_DATA` or the local fallback
  state directory if bad state causes false positives during testing.
