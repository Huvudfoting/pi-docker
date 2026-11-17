// Offline unit tests only: mock pi.exec, private local socket, no Herdr process/API.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import factory from './native-checkpoint.ts';

const driver = new URL('../host/verify-native-restore.sh', import.meta.url).pathname;
test('driver syntax/help/consent and terminal guards do not call Herdr', () => {
  assert.equal(spawnSync('bash', ['-n', driver]).status, 0);
  const env = { PATH: process.env.PATH, HOME: '/nonexistent' };
  const help = spawnSync('bash', [driver, '--help'], { env, encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /NOT|Does NOT/);
  const consent = spawnSync('bash', [driver, '--run'], { env, encoding: 'utf8' });
  assert.equal(consent.status, 1); assert.match(consent.stderr, /requires --confirm-disposable-session/);
  const terminal = spawnSync('bash', [driver, '--run', '--confirm-disposable-session'], { env, encoding: 'utf8' });
  assert.equal(terminal.status, 1); assert.match(terminal.stderr, /interactive terminal|normal user/);
});

// Run serially: each case temporarily changes only its own process environment.
async function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-observer-unit-'));
  const saved = { ...process.env };
  const server = net.createServer(socket => { socket.destroy(); throw new Error('unit test must never connect'); });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(path.join(root, 'mock.sock'), resolve); });
    Object.assign(process.env, { PI_CODING_AGENT_DIR: root, HERDR_ENV: '1',
      HERDR_PANE_ID: 'unit:pane', HERDR_SOCKET_PATH: path.join(root, 'mock.sock') });
    fs.writeFileSync(path.join(root, 'phase3-fixture'), 'pi-docker-phase3-fixture\n');
    fs.writeFileSync(path.join(root, 'phase3-native'), 'pi-docker-phase3-native\n');
    const observation = { stage: 'settled', sessionId: 'unit-session',
      sessionFile: '/pi/herdr-sessions/' + 'a'.repeat(64) + '/unit.jsonl', hasHerdr: true };
    fs.writeFileSync(path.join(root, 'phase3-result.json'), JSON.stringify(observation));
    const reported = { pane_id: 'unit:pane', agent: 'pi', agent_status: 'idle',
      interactive_ready: true, launch_pending: false,
      agent_session: { source: 'herdr:pi', agent: 'pi', kind: 'path', value: observation.sessionFile } };
    const snapshot = { version: '0.9.5', agents: [reported] };
    let handler; let calls = 0; const notifications = [];
    const response = { code: 0, stdout: JSON.stringify({ result: { snapshot } }), killed: false, truncated: false };
    factory({ registerCommand(name, command) {
      assert.equal(name, 'phase3-native-checkpoint'); handler = command.handler;
    }, async exec(cmd, args, options) {
      calls++; assert.equal(cmd, 'herdr'); assert.deepEqual(args, ['api', 'snapshot']);
      assert.equal(options.timeout, 10000); assert.equal(options.maxBuffer, 1024 * 1024);
      return response;
    } });
    const ctx = { mode: 'tui', isIdle: () => true,
      sessionManager: { getSessionId: () => observation.sessionId, getSessionFile: () => observation.sessionFile },
      ui: { notify: (...args) => notifications.push(args) } };
    await run({ root, observation, reported, snapshot, response, handler, ctx,
      calls: () => calls, notifications, refresh: () => { response.stdout = JSON.stringify({ result: { snapshot } }); } });
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true }); // Only this unit test's temporary tree.
  }
}

test('sentinel guard rejects unconfigured activation without CLI calls', async () => fixture(async f => {
  fs.unlinkSync(path.join(f.root, 'phase3-native'));
  assert.throws(() => factory({ exec: () => assert.fail('CLI invoked') }));
}));
test('valid official snapshot is saved once, no identity is reported', async () => fixture(async f => {
  await f.handler('', f.ctx);
  const file = path.join(f.root, 'phase3-native-checkpoint.json');
  const before = fs.readFileSync(file, 'utf8');
  assert.deepEqual(JSON.parse(before).observation, f.observation); assert.equal(f.calls(), 1);
  assert.equal(f.notifications.at(-1)[1], 'info');
  await f.handler('', f.ctx);
  assert.equal(f.calls(), 1); assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(f.notifications.at(-1)[1], 'error');
}));
test('direct foreground launch accepts omitted managed readiness flags', async () => fixture(async f => {
  // Actual 0.9.5 host snapshot shape: false flags are omitted, not true.
  delete f.reported.interactive_ready; delete f.reported.launch_pending; f.refresh();
  await f.handler('', f.ctx); assert.equal(f.calls(), 1);
  const saved = JSON.parse(fs.readFileSync(path.join(f.root, 'phase3-native-checkpoint.json'), 'utf8'));
  assert.deepEqual(saved.reported, f.reported);
  assert.equal('interactive_ready' in saved.reported, false); // Never synthesize readiness.
  assert.equal(f.notifications.at(-1)[1], 'info');
}));
test('direct foreground launch accepts explicit false managed readiness', async () => fixture(async f => {
  f.reported.interactive_ready = false; f.refresh();
  await f.handler('', f.ctx);
  assert.equal(f.notifications.at(-1)[1], 'info');
}));
test('pending launch still fails with a matching official path and idle report', async () => fixture(async f => {
  f.reported.launch_pending = true; f.refresh();
  await f.handler('', f.ctx); assert.equal(f.calls(), 1);
  assert.equal(fs.existsSync(path.join(f.root, 'phase3-native-checkpoint.json')), false);
  assert.equal(f.notifications.at(-1)[1], 'error');
}));
test('official blocked state still fails with matching history/path', async () => fixture(async f => {
  f.reported.agent_status = 'blocked'; f.refresh();
  await f.handler('', f.ctx); assert.equal(f.calls(), 1);
  assert.equal(fs.existsSync(path.join(f.root, 'phase3-native-checkpoint.json')), false);
  assert.equal(f.notifications.at(-1)[1], 'error');
}));
test('host capture does not demand managed-only interactive readiness', () => {
  // Guard both halves: fixing the observer alone would fail the host assertion next.
  const script = fs.readFileSync(driver, 'utf8');
  assert.doesNotMatch(script, /\.reported\.interactive_ready\s*==\s*true/);
  assert.match(script, /\.reported\.launch_pending \| not/);
});
test('busy session rejected before snapshot', async () => fixture(async f => {
  f.ctx.isIdle = () => false;
  await f.handler('', f.ctx); assert.equal(f.calls(), 0);
  assert.equal(f.notifications.at(-1)[1], 'error');
}));
test('different session observation rejected before snapshot', async () => fixture(async f => {
  f.ctx.sessionManager.getSessionId = () => 'other';
  await f.handler('', f.ctx); assert.equal(f.calls(), 0);
  assert.equal(f.notifications.at(-1)[1], 'error');
}));
test('nonofficial report preserves raw snapshot but cannot pass', async () => fixture(async f => {
  f.reported.agent_session.source = 'not-official'; f.refresh();
  await f.handler('', f.ctx); assert.equal(f.calls(), 1);
  assert.equal(fs.existsSync(path.join(f.root, 'phase3-native-checkpoint.json')), false);
  assert.equal(fs.existsSync(path.join(f.root, 'phase3-native-snapshot.json')), true);
  assert.equal(f.notifications.at(-1)[1], 'error');
}));
test('wrong reference cannot pass', async () => fixture(async f => {
  f.reported.agent_session.value = '/different.jsonl'; f.refresh();
  await f.handler('', f.ctx); assert.equal(f.calls(), 1);
  assert.equal(fs.existsSync(path.join(f.root, 'phase3-native-checkpoint.json')), false);
}));
test('stale previous conversation is rejected even when official reporter is idle', async () => fixture(async f => {
  // Host finding yaTn8dy1: ordinary restore passed, then linked seed left
  // Herdr reporting the old ordinary path in the same pane. Neither matching
  // agent/source nor idle status makes a different conversation acceptable.
  f.observation.sessionFile = '/pi/herdr-sessions/' + 'b'.repeat(64) + '/linked.jsonl';
  f.observation.sessionId = 'new-linked-session';
  fs.writeFileSync(path.join(f.root, 'phase3-result.json'), JSON.stringify(f.observation));
  await f.handler('', f.ctx); assert.equal(f.calls(), 1);
  assert.equal(fs.existsSync(path.join(f.root, 'phase3-native-checkpoint.json')), false);
  const raw = JSON.parse(fs.readFileSync(path.join(f.root, 'phase3-native-snapshot.json'), 'utf8'));
  assert.equal(raw.result.snapshot.agents[0].agent_session.source, 'herdr:pi');
  assert.equal(raw.result.snapshot.agents[0].agent_status, 'idle');
  assert.notEqual(raw.result.snapshot.agents[0].agent_session.value, f.observation.sessionFile);
  assert.equal(f.notifications.at(-1)[1], 'error');
}));
test('timeout stops after one snapshot request', async () => fixture(async f => {
  f.response.code = 124; f.response.killed = true;
  await f.handler('', f.ctx); assert.equal(f.calls(), 1);
  assert.equal(fs.existsSync(path.join(f.root, 'phase3-native-checkpoint.json')), false);
  assert.match(fs.readFileSync(path.join(f.root, 'phase3-native-error.txt'), 'utf8'), /no retry/);
}));
test('missing inherited context is rejected without snapshot', async () => fixture(async f => {
  delete process.env.HERDR_ENV;
  await f.handler('', f.ctx); assert.equal(f.calls(), 0);
  assert.equal(f.notifications.at(-1)[1], 'error');
}));
