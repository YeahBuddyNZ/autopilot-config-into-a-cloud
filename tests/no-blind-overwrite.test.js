// Tests for the overwrite guard. Run with: node --test tests/*.test.js
//
// Both directions matter equally. The two that must block are the accident the
// hook exists for. The ones that must not block matter just as much: a guard
// that fires on ordinary work teaches people to route around it, which is how
// you lose a guard without deleting it.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'config', '.claude', 'hooks', 'no-blind-overwrite.js');
const { truncationTargets, writeWouldDestroy } = require(HOOK);

// '>' is assembled rather than written literally so that editing this file from
// Bash does not trip the very guard it tests.
const GT = '>';

/** A scratch git repo with one tracked file and one untracked one. */
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nbo-'));
  const git = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.test');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'tracked.txt'), 'real content\n');
  git('add', 'tracked.txt');
  git('commit', '-qm', 'first');
  fs.writeFileSync(path.join(dir, 'untracked.txt'), 'build output\n');
  fs.writeFileSync(path.join(dir, 'empty.txt'), '');
  return dir;
}

function run(payload, cwd) {
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
  });
  return { code: r.status, err: r.stderr };
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const write = (file_path) => ({ tool_name: 'Write', tool_input: { file_path } });

test('it finds the redirects that truncate, and only those', () => {
  assert.deepEqual(truncationTargets(`echo hi ${GT} notes.md`), ['notes.md']);
  assert.deepEqual(truncationTargets(`cat ${GT} a.txt <<EOF\nx\nEOF`), ['a.txt']);
  assert.deepEqual(truncationTargets(`echo hi ${GT}${GT} notes.md`), [], 'append never truncates');
  assert.deepEqual(truncationTargets(`npm test 2${GT}&1 | tail`), [], 'descriptor redirect');
  assert.deepEqual(truncationTargets(`echo hi ${GT} /dev/null`), [], '/dev is not a file anyone loses');
  assert.deepEqual(truncationTargets('git status --short'), [], 'no redirect at all');
  assert.deepEqual(truncationTargets(''), []);
  assert.deepEqual(truncationTargets(undefined), []);
});

test('a heredoc body is data, not shell', () => {
  // Without this the guard refuses every attempt to write a script that happens
  // to contain a redirect, including editing itself.
  assert.deepEqual(
    truncationTargets(`cat ${GT} build.sh <<'EOF'\necho x ${GT} tracked.txt\nEOF`),
    ['build.sh'],
    'only the opener line redirects; the body is content'
  );
});

test('it blocks a redirect onto a tracked file', () => {
  const dir = repo();
  const r = run(bash(`echo hi ${GT} tracked.txt`), dir);
  assert.equal(r.code, 2);
  assert.match(r.err, /git is tracking/);
});

test('it leaves ordinary shell work alone', () => {
  const dir = repo();
  for (const command of [
    `echo hi ${GT} untracked.txt`,
    `echo hi ${GT} build/output.js`,
    `echo hi ${GT}${GT} tracked.txt`,
    `echo hi ${GT} /dev/null`,
    `npm test 2${GT}&1 | tail -5`,
    'git status --short',
    'npm ci && npm test',
  ]) {
    assert.equal(run(bash(command), dir).code, 0, `must allow: ${command}`);
  }
});

test('it blocks a Write over a file that already has content', () => {
  const dir = repo();
  const r = run(write(path.join(dir, 'tracked.txt')), dir);
  assert.equal(r.code, 2);
  assert.match(r.err, /already exists and is not empty/);
});

test('it allows a Write that really is a create', () => {
  const dir = repo();
  assert.equal(run(write(path.join(dir, 'new.txt')), dir).code, 0, 'a new file');
  assert.equal(run(write(path.join(dir, 'empty.txt')), dir).code, 0, 'an empty file holds nothing');
  assert.equal(
    run(write(path.join(dir, 'nested', 'deep', 'new.md')), dir).code,
    0,
    'a new file in a directory that does not exist yet'
  );
});

test('scratch and temp outside the project are exempt', () => {
  const dir = repo();
  const outside = path.join(os.tmpdir(), 'nbo-outside.txt');
  fs.writeFileSync(outside, 'scratch\n');
  assert.equal(writeWouldDestroy(outside, dir), false, 'outside the project dir');
  assert.equal(run(write(outside), dir).code, 0);
  fs.rmSync(outside, { force: true });
});

test('unparseable input is refused rather than waved through', () => {
  const r = spawnSync('node', [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('it ignores tools it is not for', () => {
  const dir = repo();
  assert.equal(run({ tool_name: 'Read', tool_input: { file_path: 'tracked.txt' } }, dir).code, 0);
});
