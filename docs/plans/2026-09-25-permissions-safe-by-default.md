# Plan: safe-by-default permissions

Date: 2026-09-25
Status: implemented

## Problem

Owner report: too many `allow` entries pile up after the payload runs on a project. A read-only sweep of the three real installs found the cause and a worse symptom.

- Installs found: TRBR-Guide (clean), nzcreditsolutions and SEP-Quoting (both de-gated). No `settings.local.json` is ever committed; Claude Code gitignores it, so the pile-up lives in the local file and regrows every session.
- The base pre-allowed each connector with a broad `mcp__<connector>__*` and clawed the dangerous ops back in `ask`. The connector names were stale (`mcp__vercel__`, `mcp__cloudflare__`, the `claude_ai_` prefixes) and matched nothing on the current connectors, so every connector call prompted. People answered the prompt storm with "always allow, this project", which promotes each op into `allow` and, enough times, empties `ask`.
- nzcreditsolutions and SEP-Quoting both ended with the whole escalation set in `allow` and `ask` empty. SEP-Quoting's `settings.json` is also invalid JSON, so its guards and hooks do not load at all.

## Approach (owner chose: safe-by-default rewrite)

1. `allow` holds only safe reads plus safe dev, git and script ops, under the current connector names. No broad `mcp__<connector>__*`.
2. Everything else (deploy, push, merge, migrate, any cloud write) falls through to a prompt. Relies on `acceptEdits` prompting for unmatched Bash and MCP calls, and on `ask` beating `allow`.
3. `deny` hard-blocks and the two guards are unchanged.
4. `session-check.js` warns when the gate has been weakened: escalation ops in `allow`, an emptied `ask`, or broad connector wildcards in `allow`.

## Acceptance criteria

- `bash scripts/verify.sh` passes, including root/config sync and the installer end-to-end.
- The shipped base trips no drift warning; a de-gated config and a broad-wildcard config both do (`tests/session-check.test.js`).
- Reads on the current connectors are allowed; a deploy/push/merge/migrate prompts.
- Documented in `CHANGELOG.md`, `docs/decisions.md` and the `beyond-traps` skill; `VERSION` bumped.

## Out of scope / follow-ups

- Fixing the already-de-gated repos (SEP-Quoting invalid JSON, nzcreditsolutions emptied gate) needs a re-run of the installer in each; a payload change cannot reach them. Flagged to the owner.
- The "good project base" roundup (bug reporting, chat help, telemetry, reusable CI) is tracked separately.
