// Tests for the SessionStart drift warning. Run with: node --test tests/*.test.js
// The hook warns when the permission gate has been weakened: escalation ops
// promoted into allow, the ask list emptied, or broad connector wildcards in allow.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'config', '.claude', 'hooks', 'session-check.js');
const SHIPPED = path.join(__dirname, '..', 'config', '.claude', 'settings.json');

// Run the hook against a throwaway project dir holding one settings.json fixture.
function runWith(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'));
  try {
    fs.mkdirSync(path.join(dir, '.claude'));
    const body = typeof settings === 'string' ? settings : JSON.stringify(settings);
    fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), body);
    const r = spawnSync('node', [HOOK], { env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' });
    return r.stdout || '';
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const DRIFT = /deploy\/push\/merge operations are in the "allow" list/;
const EMPTY_ASK = /the "ask" list is empty/;
const WILDCARD = /broad connector wildcards/;

test('the shipped base does not trip any drift warning', () => {
  const out = runWith(fs.readFileSync(SHIPPED, 'utf8'));
  assert.doesNotMatch(out, DRIFT, out);
  assert.doesNotMatch(out, EMPTY_ASK, out);
  assert.doesNotMatch(out, WILDCARD, out);
});

test('escalation ops promoted into allow trip the drift warning', () => {
  const out = runWith({ permissions: {
    allow: ['Read', 'Edit', 'Bash(git push *)', 'mcp__Supabase__apply_migration'],
    ask: [], deny: [],
  } });
  assert.match(out, DRIFT, out);
});

test('read-only git that merely looks similar does not false-trip', () => {
  const out = runWith({ permissions: {
    allow: ['Bash(git merge-base *)', 'Bash(git rev-parse *)', 'Bash(git ls-files *)'],
    ask: ['Bash(git push *)'], deny: [],
  } });
  assert.doesNotMatch(out, DRIFT, out);
});

test('a broad connector wildcard in allow is flagged', () => {
  const out = runWith({ permissions: {
    allow: ['Read', 'mcp__Supabase__*', 'mcp__github__*'],
    ask: ['Bash(git push *)'], deny: [],
  } });
  assert.match(out, WILDCARD, out);
});

test('read-only connector patterns are not flagged as broad wildcards', () => {
  const out = runWith({ permissions: {
    allow: ['mcp__Supabase__list_*', 'mcp__Supabase__get_*', 'mcp__Cloudflare_Developer_Platform__*_get'],
    ask: ['Bash(git push *)'], deny: [],
  } });
  assert.doesNotMatch(out, WILDCARD, out);
});

test('an emptied ask list with a long allow is flagged', () => {
  const allow = ['Read', 'Edit', 'Write', 'WebSearch'];
  for (let i = 0; i < 30; i++) allow.push(`Bash(tool${i} *)`);
  const out = runWith({ permissions: { allow, ask: [], deny: [] } });
  assert.match(out, EMPTY_ASK, out);
});
