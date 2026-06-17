set shell := ["powershell", "-NoLogo", "-NoProfile", "-Command"]

default:
  @just --list

ci:
  node --test codex-next/tests/*.test.mjs
  node -e "JSON.parse(require('node:fs').readFileSync('codex-next/.codex-plugin/plugin.json', 'utf8')); JSON.parse(require('node:fs').readFileSync('codex-next/hooks/hooks.json', 'utf8')); console.log('json ok')"
