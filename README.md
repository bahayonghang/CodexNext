# Codex Next

[中文说明](./README.zh-CN.md)

Codex Next is a local Codex plugin package for one narrow job: keep Codex on
the current task when a turn is interrupted by platform-side limits or
temporary service failures.

## Design Goal

This plugin is designed to reduce Codex distraction.

In practice, that means:

- Codex should stay focused on the task it was already doing.
- The user should not need to manually type "continue" after every transient
  interruption.
- Retry behavior must stay bounded so the plugin does not loop forever.

The plugin does not try to "fix" OpenAI limits. It only reduces context
switching when Codex is interrupted and a bounded retry is reasonable.

## What It Handles

The plugin watches for three interruption classes:

- `429` / rate-limit failures
- `503` / temporary overload failures
- usage-limit / model-limit style failures

When a stop matches one of those classes, the plugin can ask Codex to continue
exactly where it left off.

## Retry Policy

- `transient_rate_limit`: up to 3 retries
- `transient_overload`: up to 2 retries
- `usage_limit`: up to 2 retries
- global cap across all classes: 5 retries

After a class cap or the global cap is exhausted, the plugin stops retrying and
returns an actionable message instead of looping.

## Safety Guards

- skips when `stop_hook_active` is already true
- suppresses duplicate `turn_id`
- scans only transcript deltas
- resets transcript offset when the transcript rotates or shrinks
- stores retry state per session

## Install

This repository ships the plugin package itself. Codex still needs a marketplace
entry before you can install it in the plugin directory.

### Option 1: Repo-local Marketplace

Recommended when you want to use this plugin from this repository directly.

1. Create or update `$REPO_ROOT/.agents/plugins/marketplace.json`:

```json
{
  "name": "codex-next-local",
  "interface": {
    "displayName": "Codex Next Local"
  },
  "plugins": [
    {
      "name": "codex-next",
      "source": {
        "source": "local",
        "path": "./codex-next"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

2. Restart Codex.
3. Open the plugin directory in Codex:

```text
/plugins
```

4. Find `codex-next` in the `codex-next-local` marketplace and install it.
5. Review and trust the plugin hook definition if Codex prompts you to do so.

### Option 2: Personal Marketplace

Recommended when you want to use the plugin across repositories.

1. Copy this folder to `~/.codex/plugins/codex-next`.
2. Create or update `~/.agents/plugins/marketplace.json`:

```json
{
  "name": "personal",
  "interface": {
    "displayName": "Personal"
  },
  "plugins": [
    {
      "name": "codex-next",
      "source": {
        "source": "local",
        "path": "./.codex/plugins/codex-next"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

3. Restart Codex.
4. Open `/plugins`, install `codex-next`, and trust the hook if prompted.

## Use

1. Install the plugin.
2. Start a new Codex thread.
3. Use Codex normally.

There is no special command to invoke. The plugin works automatically through
the `Stop` hook.

Expected behavior:

- if a turn is interrupted by a matching `429`, `503`, or usage-limit signal,
  the plugin can ask Codex to continue
- if retries are exhausted, the plugin stops and tells you to check `/status`,
  wait for reset, add credits if applicable, or switch to a lower-cost model

## Development

Run tests:

```powershell
python -m unittest discover -s codex-next/tests -p "test_*.py"
```

Validate the plugin manifest:

```powershell
python C:\Users\lyh\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py codex-next
```

## Package Layout

- `codex-next/.codex-plugin/plugin.json` — plugin manifest
- `codex-next/hooks/hooks.json` — Stop hook wiring
- `codex-next/scripts/auto-recover-stop.py` — recovery logic
- `codex-next/tests/` — unit tests and fixtures
