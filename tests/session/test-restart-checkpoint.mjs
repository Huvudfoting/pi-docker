// Offline observer tests: inert pi.exec and a local socket with no requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import factory from './restart-checkpoint.ts';

async function fixture(phase, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-checkpoint-unit-'));
  const env = { ...process.env };
  const server = net.createServer(socket => { socket.destroy(); assert.fail('no actual socket requests allowed'); });
  try {
    const socket = path.join(root, 'inert.sock');
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socket, resolve); });
    Object.assign(process.env, { PI_CODING_AGENT_DIR: root, HERDR_ENV: '1', HERDR_PANE_ID: 'inert:pane', HERDR_SOCKET_PATH: socket });
    fs.writeFileSync(root + '/phase3-fixture', 'pi-docker-phase3-fixture\n');
    fs.writeFileSync(root + '/phase3-restart', 'pi-docker-phase3-restart\n');
    const config = { caseName: 'ordinary', cwd: '/workspace', title: 'Phase3 Restart ordinary' };
    fs.writeFileSync(root + '/phase3-restart.json', JSON.stringify(config));
    fs.writeFileSync(root + '/phase3-restart-stage', phase + '\n');
    const prefix = root + `/phase3-restart-${phase}`;
    const sessionFile = '/pi/herdr-sessions/' + 'a'.repeat(64) + '/fixture.jsonl';
    const seed = 'phase3-restart-ordinary-seed', restored = 'phase3-restart-ordinary-restored';
    const state = { cwd: config.cwd, headerCwd: config.cwd, sessionId: 'fixture-session', sessionFile,
      sessionName: config.title, hostname: os.hostname(), users: phase === 'restored' ? [seed] : [],
      assistants: phase === 'restored' ? ['offline-fixture:' + seed] : [] };
    const reported = { pane_id: 'inert:pane', agent: 'pi', agent_status: 'idle',
      agent_session: { source: 'herdr:pi', agent: 'pi', kind: 'path', value: sessionFile } };
    const snapshot = { version: '0.9.5', workspaces: [{}], tabs: [{}], panes: [{ pane_id: 'inert:pane' }], agents: [reported] };
    let startup, handler, calls = 0;
    const notifications = [];
    const response = { code: 0, killed: false, truncated: false, stdout: '' };
    const pi = { on(name, fn) { assert.equal(name, 'session_start'); startup = fn; },
      registerCommand(name, command) { assert.equal(name, 'phase3-restart-checkpoint'); handler = command.handler; },
      async exec(command, args, options) {
        calls++; assert.equal(command, 'herdr'); assert.deepEqual(args, ['api', 'snapshot']);
        assert.deepEqual(options, { timeout: 10000, maxBuffer: 1024 * 1024 }); return response;
      } };
    const ctx = { mode: 'tui', cwd: state.cwd, isIdle: () => true,
      sessionManager: { getHeader: () => ({ cwd: state.headerCwd }), getSessionId: () => state.sessionId,
        getSessionFile: () => state.sessionFile, getSessionName: () => state.sessionName,
        getBranch: () => state.users.flatMap((user, i) => [
          { type: 'message', message: { role: 'user', content: user } },
          { type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: state.assistants[i] }] } },
        ]) }, ui: { notify: (...args) => notifications.push(args) } };
    const refresh = () => {
      response.stdout = JSON.stringify({ result: { snapshot } });
      fs.writeFileSync(root + '/phase3-result.json', JSON.stringify({ ...state, stage: 'settled', piVersion: '1.5.2', hasHerdr: true }));
    };
    factory(pi);
    const f = { root, prefix, config, state, reported, snapshot, response, pi, ctx, startup,
      handler, notifications, refresh, calls: () => calls,
      settle() { state.users = phase === 'restored' ? [seed, restored] : [seed];
        state.assistants = state.users.map(s => 'offline-fixture:' + s); refresh(); } };
    await run(f);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true }); // This unit test's own temp tree only.
  }
}

for (const phase of ['seed', 'restored']) {
  test(`${phase} observer preserves startup and one strict checkpoint without controlling processes`, async () => fixture(phase, async f => {
    f.startup({ reason: 'startup' }, f.ctx);
    const startup = fs.readFileSync(f.prefix + '-startup.json', 'utf8');
    f.settle(); await f.handler('', f.ctx);
    assert.equal(f.calls(), 1); assert.equal(f.notifications.at(-1)[1], 'info');
    assert.equal(fs.readFileSync(f.prefix + '-startup.json', 'utf8'), startup);
    const saved = JSON.parse(fs.readFileSync(f.prefix + '-checkpoint.json', 'utf8'));
    assert.deepEqual(saved.observation, f.state); assert.deepEqual(saved.reported, f.reported);
    assert.equal('interactive_ready' in saved.reported, false);
    if (phase === 'seed') assert.match(f.notifications.at(-1)[0], /LEAVE PI RUNNING.*do NOT \/quit/);
    else assert.match(f.notifications.at(-1)[0], /no automatic restore PASS/);
    const checkpoint = fs.readFileSync(f.prefix + '-checkpoint.json', 'utf8');
    await f.handler('', f.ctx); assert.equal(f.calls(), 1);
    assert.equal(fs.readFileSync(f.prefix + '-checkpoint.json', 'utf8'), checkpoint);
    assert.equal(f.notifications.at(-1)[1], 'error');
  }));
}

test('unconfigured or unarmed activation fails without CLI calls', async () => fixture('seed', async f => {
  fs.writeFileSync(f.root + '/phase3-restart-stage', 'unarmed\n');
  assert.throws(() => factory(f.pi), /unarmed/);
  fs.unlinkSync(f.root + '/phase3-restart');
  assert.throws(() => factory(f.pi)); assert.equal(f.calls(), 0);
}));

test('duplicate startup preserves first evidence and blocks later checkpoint', async () => fixture('seed', async f => {
  f.startup({}, f.ctx); const first = fs.readFileSync(f.prefix + '-startup.json', 'utf8');
  f.startup({}, f.ctx); f.settle(); await f.handler('', f.ctx);
  assert.equal(f.calls(), 0); assert.equal(fs.readFileSync(f.prefix + '-startup.json', 'utf8'), first);
  assert.match(fs.readFileSync(f.prefix + '-error.txt', 'utf8'), /Earlier.*failure/);
}));

test('restored startup without original history fails before any snapshot', async () => fixture('restored', async f => {
  f.state.users = []; f.state.assistants = []; f.startup({}, f.ctx);
  assert.equal(fs.existsSync(f.prefix + '-startup.json'), false);
  f.settle(); await f.handler('', f.ctx); assert.equal(f.calls(), 0);
}));

for (const scenario of ['busy', 'arguments', 'non-tui', 'missing-context', 'stage-changed', 'no-startup',
  'provider-unsettled', 'provider-replacement', 'provider-wrong-version', 'provider-no-herdr',
  'current-replacement', 'missing-original-turn', 'wrong-title', 'wrong-header-cwd']) {
  test(`pre-snapshot failure stops without a CLI call: ${scenario}`, async () => fixture('restored', async f => {
    if (scenario !== 'no-startup') f.startup({}, f.ctx);
    f.settle(); let args = '';
    switch (scenario) {
      case 'busy': f.ctx.isIdle = () => false; break;
      case 'arguments': args = 'not-allowed'; break;
      case 'non-tui': f.ctx.mode = 'print'; break;
      case 'missing-context': delete process.env.HERDR_ENV; break;
      case 'stage-changed': fs.writeFileSync(f.root + '/phase3-restart-stage', 'seed\n'); break;
      case 'provider-unsettled': case 'provider-replacement': case 'provider-wrong-version': case 'provider-no-herdr': {
        const file = f.root + '/phase3-result.json', provider = JSON.parse(fs.readFileSync(file));
        if (scenario === 'provider-unsettled') provider.stage = 'startup';
        if (scenario === 'provider-replacement') provider.sessionId = 'replacement';
        if (scenario === 'provider-wrong-version') provider.piVersion = 'different';
        if (scenario === 'provider-no-herdr') provider.hasHerdr = false;
        fs.writeFileSync(file, JSON.stringify(provider)); break;
      }
      case 'current-replacement': f.state.sessionId = 'replacement'; f.refresh(); break;
      case 'missing-original-turn': f.state.users.shift(); f.state.assistants.shift(); f.refresh(); break;
      case 'wrong-title': f.state.sessionName = 'replacement-title'; f.refresh(); break;
      case 'wrong-header-cwd': f.state.headerCwd = '/elsewhere'; f.refresh(); break;
    }
    await f.handler(args, f.ctx); assert.equal(f.calls(), 0);
    assert.equal(fs.existsSync(f.prefix + '-checkpoint.json'), false);
    assert.equal(f.notifications.at(-1)[1], 'error');
  }));
}

for (const scenario of ['wrong-version', 'extra-pane', 'wrong-pane', 'extra-agent', 'stale-path',
  'unofficial-source', 'id-not-path', 'blocked', 'launch-pending', 'timeout', 'truncated', 'invalid-json']) {
  test(`official-snapshot failure cannot become a checkpoint or be retried: ${scenario}`, async () => fixture('seed', async f => {
    f.startup({}, f.ctx); f.settle();
    switch (scenario) {
      case 'wrong-version': f.snapshot.version = 'different'; break;
      case 'extra-pane': f.snapshot.panes.push({ pane_id: 'other' }); break;
      case 'wrong-pane': f.snapshot.panes[0].pane_id = 'other'; break;
      case 'extra-agent': f.snapshot.agents.push({}); break;
      case 'stale-path': f.reported.agent_session.value = '/previous.jsonl'; break;
      case 'unofficial-source': f.reported.agent_session.source = 'not-official'; break;
      case 'id-not-path': f.reported.agent_session.kind = 'id'; break;
      case 'blocked': f.reported.agent_status = 'blocked'; break;
      case 'launch-pending': f.reported.launch_pending = true; break;
      case 'timeout': f.response.code = 124; f.response.killed = true; break;
      case 'truncated': f.response.truncated = true; break;
    }
    f.refresh(); if (scenario === 'invalid-json') f.response.stdout = 'not-json';
    await f.handler('', f.ctx); assert.equal(f.calls(), 1);
    assert.equal(fs.existsSync(f.prefix + '-checkpoint.json'), false);
    assert.equal(fs.existsSync(f.prefix + '-snapshot.json'), !['timeout', 'truncated'].includes(scenario));
    await f.handler('', f.ctx); assert.equal(f.calls(), 1); assert.equal(f.notifications.at(-1)[1], 'error');
  }));
}
