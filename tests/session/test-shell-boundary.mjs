// Offline test-only generation/PTY guards. No Docker, Herdr or Pi requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';

const helper = new URL('../host/shell-boundary-handover.sh', import.meta.url).pathname;
const driver = new URL('../host/verify-native-restore.sh', import.meta.url).pathname;
const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
const run = (code, args = []) => spawnSync('bash', ['-c', code, 'offline', ...args], { encoding: 'utf8' });

test('shell-boundary mode retains consent and help guards', () => {
  assert.equal(spawnSync('bash', ['-n', helper]).status, 0);
  const help = spawnSync('bash', [driver, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--prepare-shell-boundary/);
  const guarded = spawnSync('bash', [driver, '--run', '--prepare-shell-boundary'], { encoding: 'utf8' });
  assert.notEqual(guarded.status, 0);
  assert.match(guarded.stderr, /requires --confirm-disposable-session/);
});

test('sourcing helper is inert and noninteractive markers fail closed', () => {
  assert.equal(run('source "$1"', [helper]).stdout, '');
  const r = run('source "$1"; boundary_mark /not-a-fixture ready-a', [helper]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /directly in interactive Bash/);
});

test('conflicting topology modes are rejected before any live operation', () => {
  for (const modes of [
    ['--focused-handover', '--prepare-shell-boundary'],
    ['--prepare-shell-boundary', '--focused-handover'],
  ]) {
    const r = spawnSync('bash', [driver, '--run', ...modes], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /conflicting handover mode/);
  }
});

test('preparation generates inspectable commands without executing serialized functions', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'pi-docker-native.offline-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'control'));
  const r = run(`
set -euo pipefail
source "$1"
root="$2"; tag=pi-docker:custom; image_id=offline; PHASE3_PROJECT=offline
herdr_bin=/not-a-herdr; focused_handover=1; DOCKER_CONFIG="$root/not-read"; HOME="$root"
HERDR_PANE_ID=offline-placeholder; HERDR_SOCKET_PATH="$root/not-a-live-socket"
unset HERDR_AGENT
for name in fail docker_read herdr_read check_inputs prepare_turn capture confirm_visual assess_handover handover_classify; do
  eval "$name() { printf 'UNEXPECTED EXECUTION' >&2; return 99; }"
done
boundary_prepare
`, [helper, root]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /UNEXPECTED/);
  const runner = path.join(root, 'control/boundary-step.sh');
  assert.equal(spawnSync('bash', ['-n', runner]).status, 0);
  const instructions = readFileSync(path.join(root, 'control/INSTRUCTIONS.txt'), 'utf8');
  assert.match(instructions, /Do NOT paste as one block/);
  assert.match(instructions, /ready-a/);
  assert.match(instructions, /after-a/);
  assert.match(instructions, /after-b/);
  assert.match(instructions, /NOT|No native reopen/);
  assert.match(readFileSync(runner, 'utf8'), /boundary_step "\$@"/);
});

test('guarded experiment preserves strict checkpoint and no-reset boundary', () => {
  const script = readFileSync(helper, 'utf8');
  assert.match(script, /capture handover-a .*\/workspace/);
  assert.match(script, /capture handover-b .*\/workspace diagnostic/);
  assert.match(script, /a_group.*!=.*boundary_fields/);
  assert.match(script, /shell_pid.*PPID/);
  assert.match(script, /started-\$step/);
  assert.match(script, /sha256sum --check --status/);
  assert.doesNotMatch(script, /pane\.(release_agent|clear_agent)|^\s*(?:herdr\s+server\s+stop|set [-+]m)\b/m);
  const driverText = readFileSync(driver, 'utf8');
  assert.match(driverText, /if \(\(shell_boundary\)\); then\s+boundary_prepare\s+exit 0/);
  assert.match(driverText, /PREPARED ONLY.*NOT RUN/);
});

test('generated A/B steps exercise shell/job guards on a local PTY with inert stubs', async (t) => {
  if (process.platform !== 'linux' || spawnSync('script', ['--version']).status !== 0) {
    t.skip('requires Linux /proc and util-linux script'); return;
  }
  const root = mkdtempSync(path.join(tmpdir(), 'pi-docker-native.offline-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ['control', 'logs', 'bin']) mkdirSync(path.join(root, dir));
  const socketPath = path.join(root, 'inert.sock');
  const server = net.createServer(() => assert.fail('no socket requests allowed'));
  server.listen(socketPath); await once(server, 'listening');
  t.after(() => server.close());
  writeFileSync(path.join(root, 'control/shell-boundary-handover.sh'), readFileSync(helper));
  writeFileSync(path.join(root, 'bin/pi'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o700 });
  writeFileSync(path.join(root, 'bin/jq'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o700 });
  const setup = run(`
set -euo pipefail
source "$1"
root="$2"; tag=offline; image_id=offline; PHASE3_PROJECT=offline
herdr_bin=/not-a-herdr; focused_handover=1; DOCKER_CONFIG="$root/not-read"; HOME="$root"
PATH="$root/bin:$PATH"
HERDR_PANE_ID=offline-placeholder; HERDR_SOCKET_PATH="$root/inert.sock"
unset HERDR_AGENT
fail() { printf '%s\\n' "$*" >&2; exit 1; }
docker_read() { :; }
herdr_read() { if [[ "$1" == --version ]]; then printf 'herdr 0.9.5\\n'; else printf '{}\\n'; fi; }
check_inputs() { :; }
prepare_turn() { :; }
capture() { :; }
confirm_visual() { :; }
assess_handover() { printf '{}\\n' > "$root/handover.json"; printf '[]\\n' > "$root/evidence.json"; }
handover_classify() { :; }
boundary_prepare
`, [helper, root]);
  assert.equal(setup.status, 0, setup.stderr);
  const runner = path.join(root, 'control/boundary-step.sh');
  const commands = [
    `source ${quote(helper)}`,
    `boundary_mark ${quote(root)} ready-a || exit 21`,
    `bash ${quote(runner)} a || exit 22`,
    `boundary_mark ${quote(root)} after-a || exit 23`,
    `bash ${quote(runner)} b || exit 24`,
    `boundary_mark ${quote(root)} after-b || exit 25`,
    `bash ${quote(runner)} assess || exit 26`,
    // Deliberately attempting a completed step must fail, never launch again.
    `bash ${quote(runner)} b && exit 27`,
    'exit 0',
  ].join('\n') + '\n';
  const r = spawnSync('script', ['-qec', 'exec bash --noprofile --norc -i', '/dev/null'], {
    input: commands, encoding: 'utf8', timeout: 10000,
    env: { PATH: process.env.PATH, HOME: root, TERM: 'dumb', HERDR_ENV: '1',
      HERDR_PANE_ID: 'offline-placeholder', HERDR_SOCKET_PATH: socketPath },
  });
  assert.equal(r.status, 0, r.error?.message ?? r.stdout + r.stderr);
  assert.match(readFileSync(path.join(root, 'result.txt'), 'utf8'), /DIAGNOSTIC COMPLETE/);
  const a = readFileSync(path.join(root, 'logs/boundary-process-a.txt'), 'utf8').split(' ');
  const b = readFileSync(path.join(root, 'logs/boundary-process-b.txt'), 'utf8').split(' ');
  assert.equal(a[1], b[1]); assert.notEqual(a[2], b[2]);
});

test('interactive shell markers observe the actual foreground shell on a local PTY', async (t) => {
  if (process.platform !== 'linux' || spawnSync('script', ['--version']).status !== 0) {
    t.skip('requires Linux /proc and util-linux script'); return;
  }
  const root = mkdtempSync(path.join(tmpdir(), 'pi-docker-native.offline-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'control')); mkdirSync(path.join(root, 'logs'));
  // A local inert socket satisfies file-type guards only. No clients connect;
  // placeholder context is used ONLY in this isolated offline unit test.
  const socketPath = path.join(root, 'inert.sock');
  const server = net.createServer(() => assert.fail('no socket requests allowed'));
  server.listen(socketPath); await once(server, 'listening');
  t.after(() => server.close());
  writeFileSync(path.join(root, 'control/boundary-context'), `offline-placeholder\n${socketPath}\n`);
  writeFileSync(path.join(root, 'control/done-a'), 'offline marker fixture');
  const command = [
    `source ${quote(helper)}`,
    `boundary_mark ${quote(root)} ready-a || exit 21`,
    `boundary_mark ${quote(root)} after-a || exit 22`,
    'exit 0',
  ].join('\n') + '\n';
  const r = spawnSync('script', ['-qec', 'exec bash --noprofile --norc -i', '/dev/null'], {
    input: command, encoding: 'utf8', timeout: 10000,
    env: { PATH: process.env.PATH, HOME: root, TERM: 'dumb', HERDR_ENV: '1',
      HERDR_PANE_ID: 'offline-placeholder', HERDR_SOCKET_PATH: socketPath },
  });
  assert.equal(r.status, 0, r.error?.message ?? r.stdout + r.stderr);
  const a = readFileSync(path.join(root, 'logs/shell-ready-a.txt'), 'utf8').trim().split(' ');
  const after = readFileSync(path.join(root, 'logs/shell-after-a.txt'), 'utf8').trim().split(' ');
  assert.deepEqual(a.slice(0, 3), after.slice(0, 3));
  assert.equal(a[0], a[1]); assert.equal(a[0], a[2]);
});
