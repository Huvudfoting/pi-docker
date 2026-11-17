// Offline preparation/PTY/transport guards only. No Docker, Herdr or real Pi.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
const helper = new URL('../host/native-boundary.sh', import.meta.url).pathname;
const driver = new URL('../host/verify-native-restore.sh', import.meta.url).pathname;
const quote = s => `'${s.replaceAll("'", "'\\''")}'`;

test('native preparation retains help, consent, conflict and inert-source guards', () => {
  assert.equal(spawnSync('bash', ['-n', helper]).status, 0);
  const source = spawnSync('bash', ['-c', 'source "$1"', 'offline', helper], { encoding: 'utf8' });
  assert.equal(source.status, 0); assert.equal(source.stdout + source.stderr, '');
  const help = spawnSync('bash', [driver, '--help'], { encoding: 'utf8' });
  assert.match(help.stdout, /--prepare-native-boundary/);
  const denied = spawnSync('bash', [driver, '--run', '--prepare-native-boundary'], { encoding: 'utf8' });
  assert.notEqual(denied.status, 0); assert.match(denied.stderr, /requires --confirm-disposable-session/);
  for (const mode of ['--focused-handover', '--prepare-shell-boundary', '--prepare-native-boundary']) {
    for (const modes of [['--prepare-native-boundary', mode], [mode, '--prepare-native-boundary']]) {
      const r = spawnSync('bash', [driver, '--run', ...modes], { encoding: 'utf8' });
      assert.notEqual(r.status, 0); assert.match(r.stderr, /conflicting handover mode/);
    }
  }
});

test('native workflow keeps strict capture, official-only reopen and bounded read-only checks', () => {
  const s = fs.readFileSync(helper, 'utf8');
  assert.match(s, /"\$root\/bin\/pi" --session "\$seed_ref"\n/);
  assert.match(s, /seed_ref="\$\(jq -er '\.reported\.agent_session\.value'/);
  assert.doesNotMatch(s, /capture .*diagnostic|pane\.(release_agent|clear_agent)|^\s*set [-+]m\b/m);
  assert.match(s, /\.panes\[0\]\.agent_session == null/);
  assert.match(s, /\(\.agents\|length\)==0/);
  assert.match(s, /sha256sum --check --status "\$root\/logs\/native-seed-\$key.sha256"/);
  assert.match(s, /native_prior_ok/);
  assert.match(s, /cmp -s .*seed-\$key.record.*step.record/);
  assert.match(s, /serverRestartTested:false,phase3Complete:false/);
  assert.match(s, /map\(\.hostname\) \| unique \| length\) == 4/);
  assert.match(fs.readFileSync(driver, 'utf8'), /if \(\(native_boundary\)\); then\s+native_prepare\s+exit 0/);
});

test('real jq aggregate rejects replacement IDs, reused containers and changed history', t => {
  if (spawnSync('jq', ['--version']).status !== 0) {
    t.skip('test-only jq unavailable; PTY tests use explicitly inert substitutes'); return;
  }
  const root = fs.mkdtempSync(path.join(tmpdir(), 'pi-docker-native.offline-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ['control', 'logs', 'data/sessions', 'linked checkout']) fs.mkdirSync(path.join(root, name), { recursive: true });
  fs.writeFileSync(root + '/linked checkout/.git', 'fixture');
  const labels = ['seed-ordinary', 'restore-ordinary', 'seed-linked', 'restore-linked'];
  const states = labels.map((label, i) => ({ sessionId: i < 2 ? 'ordinary' : 'linked',
    sessionFile: i < 2 ? '/fixture/ordinary.jsonl' : '/fixture/linked.jsonl', hostname: 'container-' + i }));
  for (const [i, label] of labels.entries()) {
    fs.writeFileSync(`${root}/control/done-${label}`, '');
    fs.writeFileSync(`${root}/logs/native-${label}-result.txt`, `STEP ${label} exit=0; native protocol only, no server restart\n`);
    fs.writeFileSync(`${root}/logs/${label}-phase3-result.json`, JSON.stringify(states[i]));
  }
  for (const key of ['ordinary', 'linked']) {
    const host = `${root}/data/sessions/${key}.jsonl`;
    fs.writeFileSync(host, key);
    fs.writeFileSync(`${root}/logs/restore-${key}.host-file.txt`, host + '\n');
    fs.writeFileSync(`${root}/logs/restore-${key}.jsonl`, key);
  }
  const assess = () => spawnSync('bash', ['-c', `
set -euo pipefail
source "$1"; root="$2"; linked="$root/linked checkout"; selected_linked="$linked/packages/backend"
fail() { printf '%s\\n' "$*" >&2; exit 1; }
probe_git() { :; }
native_assess
`, 'offline', helper, root], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: root } });
  let r = assess(); assert.equal(r.status, 0, r.stderr);
  const restored = `${root}/logs/restore-linked-phase3-result.json`;
  for (const invalid of [{ ...states[3], sessionId: 'replacement' }, { ...states[3], hostname: states[0].hostname }]) {
    fs.writeFileSync(restored, JSON.stringify(invalid));
    assert.notEqual(assess().status, 0);
  }
  fs.writeFileSync(restored, JSON.stringify(states[3]));
  fs.writeFileSync(`${root}/data/sessions/ordinary.jsonl`, 'later mutation');
  assert.notEqual(assess().status, 0);
});

for (const scenario of ['success', 'stale-before-restore', 'changed-seed', 'retained-container', 'wrong-parent', 'changed-control']) {
  test(`generated native steps on local PTY with inert stubs: ${scenario}`, async t => {
    if (process.platform !== 'linux' || spawnSync('script', ['--version']).status !== 0) {
      t.skip('requires Linux /proc and util-linux script'); return;
    }
    const root = fs.mkdtempSync(path.join(tmpdir(), 'pi-docker-native.offline-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const name of ['control', 'logs', 'bin']) fs.mkdirSync(path.join(root, name));
    const socket = path.join(root, 'inert.sock');
    const server = net.createServer(() => assert.fail('no socket requests allowed'));
    server.listen(socket); await once(server, 'listening'); t.after(() => server.close());
    fs.copyFileSync(helper, path.join(root, 'control/native-boundary.sh'));
    // Test jq substitute validates snapshot fixtures and extracts the official
    // path; it does NOT certify jq predicate syntax, history or aggregate checks.
    fs.writeFileSync(path.join(root, 'bin/jq'), `#!${process.execPath}
const fs=require('fs'),args=process.argv.slice(2),last=args.at(-1);
if(args.includes('-er')) { console.log(JSON.parse(fs.readFileSync(last)).reported.agent_session.value); }
else if(last.endsWith('-snapshot.json')) { const s=JSON.parse(fs.readFileSync(last)).result.snapshot; if(s.agents.length) process.exit(1); }
else if(args.includes('-nc') || args.includes('-n')) console.log('{}');
else if(args.includes('-s')) console.log('[]');
`, { mode: 0o700 });
    fs.writeFileSync(path.join(root, 'bin/pi'), `#!${process.execPath}
require('fs').appendFileSync(${JSON.stringify(root + '/logs/argv.jsonl')},JSON.stringify(process.argv.slice(2))+'\\n');
`, { mode: 0o700 });
    const setup = spawnSync('bash', ['-c', `
set -euo pipefail
source "$1"
root="$2"; tag=offline; image_id=offline; PHASE3_PROJECT=offline; herdr_bin=/not-herdr
focused_handover=0; HOME="$root"; DOCKER_CONFIG="$root/not-read"; PATH="$root/bin:$PATH"
linked="$root/linked checkout"; selected_linked="$linked/packages/backend"
HERDR_PANE_ID=offline-placeholder; HERDR_SOCKET_PATH="$root/inert.sock"
fail() { printf 'STOP: %s\\n' "$*" >&2; exit 1; }
docker_read() { if [[ "$TEST_NATIVE_SCENARIO" == retained-container && "$step" == seed-ordinary ]]; then printf 'retained-test-container\\n'; fi; return 0; }
herdr_read() {
  if [[ "$1" == --version ]]; then printf 'herdr 0.9.5\\n';
  elif [[ "$TEST_NATIVE_SCENARIO" == stale-before-restore && "$step" == restore-ordinary ]]; then printf '{"result":{"snapshot":{"agents":[{}]}}}\\n';
  else printf '{"result":{"snapshot":{"agents":[]}}}\\n'; fi
}
check_inputs() { :; }
prepare_turn() { :; }
capture() {
  local label="$1" key="\${1#*-}" prefix
  prefix="$(printf 'a%.0s' {1..64})"; [[ "$key" != linked ]] || prefix="$(printf 'b%.0s' {1..64})"
  ref="/pi/herdr-sessions/$prefix/$key.jsonl"
  state="$root/logs/$label-phase3-result.json"
  printf '{"sessionId":"%s","sessionFile":"%s"}\\n' "$key" "$ref" > "$state"
  printf '{"reported":{"agent_session":{"value":"%s"}}}\\n' "$ref" > "$root/logs/$label-phase3-native-checkpoint.json"
  printf record > "$root/logs/$label.record"
}
confirm_visual() { :; }
probe_git() { :; }
native_prepare
`, 'offline', helper, root], { encoding: 'utf8' });
    assert.equal(setup.status, 0, setup.stderr);
    const runner = path.join(root, 'control/native-step.sh');
    assert.equal(spawnSync('bash', ['-n', runner]).status, 0);
    const instructions = fs.readFileSync(path.join(root, 'control/INSTRUCTIONS.txt'), 'utf8');
    assert.match(instructions, /Enter each command SEPARATELY/);
    assert.match(instructions, /NOT server-restart restore/);
    // Replace assessment only in the *test* generated runner, rehashing the test
    // control. Real assessment/history validation remains an integration gate.
    let content = fs.readFileSync(runner, 'utf8').replace('native_step "$@"', `
native_assess() { printf '[]\\n' > "$root/evidence.json"; printf '{}\\n' > "$root/native-evidence.json"; }
native_step "$@"`);
    fs.writeFileSync(runner, content);
    const rehash = spawnSync('bash', ['-c', 'sha256sum -- "$1" "$2" > "$3"', 'offline', runner,
      path.join(root, 'control/native-context'), path.join(root, 'control/native-controls.sha256')]);
    assert.equal(rehash.status, 0);
    const commands = [`source ${quote(helper)}`, `native_mark ${quote(root)} ready-native || exit 20`];
    if (scenario === 'wrong-parent') commands.push(`bash -c ${quote(`bash ${quote(runner)} seed-ordinary; result=$?; exit "$result"`)} && exit 99`, 'exit 0');
    else if (scenario === 'changed-control') commands.push(`printf '#changed\\n' >> ${quote(runner)}`, `bash ${quote(runner)} seed-ordinary && exit 99`, 'exit 0');
    else {
      for (const [i, label] of ['seed-ordinary', 'restore-ordinary', 'seed-linked', 'restore-linked'].entries()) {
        commands.push(`bash ${quote(runner)} ${label} || exit ${30 + i}`);
        if (scenario === 'changed-seed' && i === 0) commands.push(`printf 'tampered\\n' >> ${quote(root + '/logs/seed-ordinary-phase3-native-checkpoint.json')}`);
        commands.push(`native_mark ${quote(root)} after-${label} || exit ${40 + i}`);
      }
      commands.push(`bash ${quote(runner)} assess || exit 50`, `bash ${quote(runner)} restore-linked && exit 99`, 'exit 0');
    }
    const r = spawnSync('script', ['-qec', 'exec bash --noprofile --norc -i', '/dev/null'], {
      input: commands.join('\n') + '\n', encoding: 'utf8', timeout: 10000,
      env: { PATH: process.env.PATH, HOME: root, TERM: 'dumb', HERDR_ENV: '1',
        HERDR_PANE_ID: 'offline-placeholder', HERDR_SOCKET_PATH: socket, TEST_NATIVE_SCENARIO: scenario },
    });
    if (scenario === 'success') {
      assert.equal(r.status, 0, r.error?.message ?? r.stdout + r.stderr);
      const args = fs.readFileSync(root + '/logs/argv.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
      assert.equal(args.length, 4);
      assert.deepEqual(args[1], ['--session', '/pi/herdr-sessions/' + 'a'.repeat(64) + '/ordinary.jsonl']);
      assert.deepEqual(args[3], ['--session', '/pi/herdr-sessions/' + 'b'.repeat(64) + '/linked.jsonl']);
      assert.equal(args[2][0], root + '/linked checkout/packages/backend');
      assert.match(fs.readFileSync(root + '/result.txt', 'utf8'), /RESULT: PASS.*NOT server-restart/);
      const groups = ['seed-ordinary', 'restore-ordinary', 'seed-linked', 'restore-linked'].map(label =>
        fs.readFileSync(`${root}/logs/native-process-${label}.txt`, 'utf8').split(' '));
      assert.equal(new Set(groups.map(x => x[1])).size, 1);
      assert.equal(new Set(groups.map(x => x[2])).size, 4);
    } else {
      if (scenario === 'wrong-parent' || scenario === 'changed-control') {
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.equal(fs.existsSync(root + '/logs/argv.jsonl'), false);
      } else {
        assert.notEqual(r.status, 0, r.stdout + r.stderr);
        assert.equal(fs.readFileSync(root + '/logs/argv.jsonl', 'utf8').trim().split('\n').length, 1);
        assert.match(fs.readFileSync(root + '/result.txt', 'utf8'), /FAIL\/INTERRUPTED/);
      }
    }
  });
}
