# Directory Structure

> How the user-facing plugin surface is organized in this project.

---

## Overview

There is no framework app here. The "frontend" is the set of files a user reads
or that Codex inspects when installing and presenting the plugin, plus the tiny
static analytics viewer. Keep that surface small and easy to audit.

## Directory Layout

```text
codex-next/
├── .codex-plugin/
│   └── plugin.json
├── hooks/
│   └── hooks.json
├── web/
│   ├── usage-analytics.html
│   ├── usage-analytics.css
│   └── usage-analytics.js
└── scripts/
    └── usage-analytics-server.mjs

repo root/
├── README.md
└── README.zh-CN.md
```

## Module Organization

- Put installation-facing and marketplace-facing metadata in
  `codex-next/.codex-plugin/plugin.json`.
- Put Codex hook registration in `codex-next/hooks/hooks.json`.
- Keep viewer assets in `codex-next/web/` and backend implementation details in
  `codex-next/scripts/`; the manifest and hook file should stay declarative.
- Keep end-user documentation in the root `README` files so plugin users can
  find install, behavior, and development commands immediately.
- Keep the server CLI and the browser UI decoupled. Starting the viewer is a
  manual action, not part of installation or hook configuration.

## Naming Conventions

- JSON filenames remain fixed by platform convention: `plugin.json`,
  `hooks.json`.
- Keep plugin display strings concise and literal. This project describes a
  narrow tool, not a broad product suite.
- Mirror English and Chinese README sections when behavior changes, even if the
  wording is not line-for-line identical.

## Examples

- `codex-next/.codex-plugin/plugin.json` is the authoritative user-facing
  summary of capabilities and prompts.
- `README.md` and `README.zh-CN.md` expand the same behavior into install and
  usage documentation.
- `codex-next/web/usage-analytics.*` is the only browser-facing UI surface in
  the repo and should map directly to the documented filter/query behavior.
