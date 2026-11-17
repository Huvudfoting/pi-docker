// Offline Linux PTY characterization, not a Docker or live Herdr test.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('a non-job-control Bash driver keeps one foreground group across child handover', (t) => {
  if (process.platform !== 'linux' || spawnSync('script', ['--version']).status !== 0) {
    t.skip('requires Linux /proc and util-linux script');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'pi-driver-pgid-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const probe = path.join(dir, 'probe.mjs');
  const records = path.join(dir, 'records.jsonl');
  writeFileSync(probe, `
import { appendFileSync, readFileSync } from 'node:fs';
const stat = readFileSync('/proc/self/stat', 'utf8');
const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
// Fields after comm: state, ppid, pgrp, session, tty_nr, tpgid.
appendFileSync(process.argv[2], JSON.stringify({
  stage: process.argv[3], pid: process.pid, parent: Number(fields[1]),
  group: Number(fields[2]), terminal: Number(fields[4]), foreground: Number(fields[5]),
}) + '\\n');
`);
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const driver = path.join(dir, 'driver.sh');
  // Same shell mode as verify-native-restore.sh: noninteractive, no set -m.
  writeFileSync(driver, `#!/usr/bin/env bash
set -euo pipefail
for stage in a between b; do
  ${quote(process.execPath)} ${quote(probe)} ${quote(records)} "$stage"
done
`);
  const result = spawnSync('script', [
    '-qec', `bash --noprofile --norc -i -c ${quote(`bash ${quote(driver)}`)}`, '/dev/null',
  ], { encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH, HOME: dir, TERM: 'dumb' } });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  const rows = readFileSync(records, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map((row) => row.stage), ['a', 'between', 'b']);
  assert.equal(new Set(rows.map((row) => row.pid)).size, 3, 'children really differ');
  assert.equal(new Set(rows.map((row) => row.parent)).size, 1, 'one driver parent');
  assert.equal(new Set(rows.map((row) => row.group)).size, 1, 'unchanged job group');
  for (const row of rows) {
    assert.notEqual(row.terminal, 0, 'real controlling PTY');
    assert.equal(row.group, row.foreground, 'child job remains foreground');
  }
});
