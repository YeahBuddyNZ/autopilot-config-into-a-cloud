# Decisions

Short records of choices that shape this repo, so the next session does not re-argue them. Newest first. One paragraph each; if a decision needs more, it needs an ADR in a downstream repo, not here.

## 2026-09-25: Safe by default: allow reads, ask for writes

The base pre-allowed each connector with a broad `mcp__<connector>__*` and tried to claw the dangerous ops back in `ask`. Across the three real installs that failed two ways: the connector names were stale (`mcp__vercel__`, `mcp__cloudflare__`, the `claude_ai_` prefixes) so they matched nothing on the current connectors and every connector call prompted, and the `ask` claw-back covered only some names so writes on the current connectors were auto-allowed. People answered the prompt storm with "always allow, this project", which promotes each op into `allow` and, enough times, empties `ask`. nzcreditsolutions and SEP-Quoting both ended up with the whole escalation set in `allow` and `ask` empty; SEP's file was also invalid JSON, so its guards were not loading. The model is now inverted: `allow` holds only safe reads and safe dev, git and script ops under the current connector names, and everything else (deploy, push, merge, migrate, any cloud write) falls through to a prompt. This relies on two behaviours the old config already depended on: `acceptEdits` prompts for unmatched Bash and MCP calls, and `ask` beats `allow`. `session-check.js` now warns when a project's gate has been weakened, so the drift is visible instead of silent. Repos that are already de-gated are the owner's to fix by re-running the installer; a payload change cannot reach them.

## 2026-09-12: Third-party skills are vendored, pinned and licensed

Six skills from Supabase, Vercel, Stripe and Superpowers ship inside the payload as copies at a pinned commit, each with its licence file (or the licence declared in its frontmatter where upstream has no file) and an `UPSTREAM.md`. Not fetched at install time: that would make every install depend on four upstream repos being reachable and unchanged. `scripts/vendor-skills.sh` refreshes them; the table in it is the record. The session's GitHub proxy serves public repos through plain git only, not archives or the API, which is why the script clones.

## 2026-09-12: One rule for the git author

Across the repos, one said the author must be the personal address and three said GitHub rejects it (GH007) and Vercel then refuses to deploy. The base rule is: the author stays as configured; if a push or deploy is refused for the author, the fix is the account's GitHub noreply address, set by a human. Sessions never change the author to force a push.

## 2026-09-12: Commands became skills

Claude Code merged commands into skills; both create the same slash command, skills add supporting files. The four commands moved to `.claude/skills/<name>/SKILL.md` and the audit's appendices moved beside it. Descriptions were rewritten as triggers because the docs say Claude under-triggers on terse descriptions.

## 2026-09-12: The repo installs its own payload

`.claude/` at the root and the rules section of `CLAUDE.md` are the installed copy of `config/`, refreshed by `scripts/sync-root.sh`, and `verify.sh` fails if they drift. The audit found that shipping `/plan`, `/review` and `/lesson` while not having them here produced exactly the failures they prevent. Cost: the payload's deny on editing `.claude/**` and `.github/**` applies to sessions on this repo, and the guards apply to the session that edits the guards. Accepted; it caught a false positive within minutes.

## 2026-09-12: Two guards, same design

The SQL guard and the shell guard are both fail-closed PreToolUse hooks with test suites, and the shell guard reuses the SQL guard's rules for SQL on a command line. The permission deny list stays as a first line but is not the tested control; exact-string patterns cannot be tested against Claude Code's matcher from here. Any new "Blocked" promise in the README must land in a guard with a test, not only in the deny list.

## 2026-09-12: Heredoc bodies are data

The shell guard skips the body of a heredoc unless it is fed to a shell or a SQL client. A heredoc to `python3` or `node` is not inspected; the guard is a guard, not a sandbox, and the alternative blocks every documentation edit. Recorded in `SECURITY.md` as a known limit.

## 2026-09-12: Versions are dates, stamped on install

`VERSION` holds a date (`2026.09.12`). The installer writes it into `.claude/autopilot.json` in the target, and the session-start hook reports it. No semantic versioning: every merge to `main` is a release and the changelog date is the version. Tags are optional.

## 2026-09-11: The payload lives under `config/`, not at the root

The root is the installed copy; `config/` is the source. Extracting with a wildcard (`*/config/*`) means the install command survives a repo rename, which happened the same day.

## 2026-09-11: Repository settings and release tags are created by hand

The cloud session's GitHub proxy allows git and pull request operations but refuses repository-settings writes: rename, description, topics, branch protection. It also refuses pushing a tag (HTTP 403 on the git push) and creating a tag ref through the API. Release tags are created by the owner from the Releases page. A probe of the API returned 200 for a read, which was misleading. The owner does these in the GitHub UI; sessions should ask, not retry.

## 2026-09-11: Licence deferred

The repo is public with no licence file, which legally means all rights reserved. Deliberately left for the owner to choose (MIT or similar versus proprietary). Recorded so it is not mistaken for an oversight.
