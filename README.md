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

## Runtime and Storage

Normal plugin operation now uses Node.js, not Python.

- the Stop hook runs `node codex-next/scripts/auto-recover-stop.mjs`
- the plugin requires a Node runtime that includes the built-in `node:sqlite`
  module
- this implementation was validated locally with `node v25.9.0`

SQLite state lives here:

- installed plugin: `${PLUGIN_DATA}/codex-next.sqlite`
- repo-local fallback: `codex-next/.local-state/codex-next.sqlite`

The database stores only recovery metadata:

- live retry state per session
- append-only stop-hook analytics events

It does not store transcript text, prompt text, or assistant message bodies.

If an older JSON session-state file already exists, the JS runtime lazily imports
that session into SQLite on first use and leaves the JSON file in place.

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

## Local Analytics Viewer

This repo also ships a local read-only viewer for the plugin's own recovery
analytics. This is not token, billing, or account-usage reporting.

Start the viewer manually when you need it:

```powershell
node codex-next/scripts/usage-analytics-server.mjs --host 127.0.0.1 --port 3210
```

The command prints a localhost URL such as `http://127.0.0.1:3210/`.

The viewer and APIs support filtering by:

- time range
- stop kind
- decision
- model
- workspace-path text match

Available read-only endpoints:

- `GET /api/health`
- `GET /api/facets`
- `GET /api/summary`
- `GET /api/events`

The Stop hook does not auto-start this server.

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
- when the viewer server is running, you can inspect the recorded recovery
  events in a browser without affecting hook execution

## Development

Run tests:

```powershell
node --test codex-next/tests/*.test.mjs
```

Run a quick JSON sanity check:

```powershell
node -e "JSON.parse(require('node:fs').readFileSync('codex-next/.codex-plugin/plugin.json', 'utf8')); JSON.parse(require('node:fs').readFileSync('codex-next/hooks/hooks.json', 'utf8')); console.log('json ok')"
```

## Package Layout

- `codex-next/.codex-plugin/plugin.json` — plugin manifest
- `codex-next/hooks/hooks.json` — Stop hook wiring
- `codex-next/scripts/auto-recover-stop.mjs` — Stop-hook recovery logic
- `codex-next/scripts/usage-analytics-server.mjs` — local analytics server
- `codex-next/scripts/lib/` — classifier and SQLite helpers
- `codex-next/sql/schema.sql` — SQLite bootstrap schema
- `codex-next/web/` — static analytics viewer assets
- `codex-next/tests/` — Node tests and fixtures
