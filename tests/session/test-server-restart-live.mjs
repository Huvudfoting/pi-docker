// Inert end-to-end host procedure. NO real Herdr/Docker/Pi/socket/process calls.
// Optional public-pin positives read a caller-selected, SHA-pinned UPSTREAM SOURCE
// asset as DATA, never execute/vendor it or claim an official/live installation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { prepare } from '../host/prepare-server-restart.mjs';
import { plan, main, RestartWorkflow, liveCommands, assessPair, hostAdapter, checkLaunch } from '../host/server-restart-live.mjs';
import { OFFICIAL_REPORTER_SHA256, storageFor, assessRestart, validateInputs, EvidenceReader } from '../host/server-restart-evidence.mjs';
import { StepLedger, ArtifactStore } from '../host/server-restart-control.mjs';
const script = new URL('../host/server-restart-live.mjs', import.meta.url).pathname;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ok = (argv, stdout = '') => ({ argv, stdout, stderr: '', exitCode: 0, signal: null, error: null, timedOut: false, truncated: false });
const absent = () => Object.assign(new Error('synthetic missing observation'), { code: 'ENOENT' });
const boot = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function stat(pid, ppid, start, comm = 'bash') {
  const fields = Array(50).fill('0'); Object.assign(fields, { 0: 'S', 1: String(ppid), 2: String(pid), 5: String(pid), 19: String(start) });
  return `${pid} (${comm}) ${fields.join(' ')}\n`;
}
function prepared(t, caseName = 'ordinary') {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'r-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const f = prepare({ caseName, parent, env: { PATH: process.env.PATH, HOME: parent } });
  return f;
}
const assetPath = process.env.PI_RESTART_TEST_REPORTER_SOURCE;
function asset() {
  const bytes = fs.readFileSync(assetPath);
  assert.equal(sha(bytes), OFFICIAL_REPORTER_SHA256, 'test source asset must exactly match pinned upstream 0.9.5 bytes'); return bytes;
}
function simulation(t, caseName = 'ordinary') {
  const f = prepared(t, caseName), uid = process.getuid() || 65534;
  // Only the newly allocated test root changes owner when tests run as root.
  // This simulates the required normal-user fixture; no host resource is used.
  if (process.getuid() === 0) fs.chownSync(f.root, uid, process.getgid());
  const put = (name, bytes) => { fs.mkdirSync(path.dirname(f.root + '/' + name), { recursive: true, mode: 0o700 }); fs.writeFileSync(f.root + '/' + name, bytes); };
  const json = (name, value) => put(name, JSON.stringify(value) + '\n');
  const frozen = JSON.parse(fs.readFileSync(f.root + '/control/host-tools.json'));
  const tools = { ...frozen, herdr: '/inert/herdr', docker: '/inert/docker' };
  const state = { phase: 'seed', server: false, container: false, calls: [], mutations: [], clients: [], fault: {}, tick: 0 };
  const clock = () => new Date(1700000000000 + state.tick++).toISOString();
  const pid = () => state.phase === 'seed' ? 100 : 200;
  const id = () => (state.phase === 'seed' ? '1' : '2').repeat(64);
  const socket = f.sessionDirectory + '/herdr.sock';
  const prompts = [`phase3-restart-${caseName}-seed`, `phase3-restart-${caseName}-restored`];
  const key = sha(`pi-docker-herdr-v3\0${f.selected}\0backend`), ref = `/pi/herdr-sessions/${key}/conversation.jsonl`;
  const storage = storageFor(f, ref);
  const entries = [ { type: 'session', version: 3, id: 'stable-' + f.session, cwd: f.expectedCwd },
    { type: 'session_info', id: 'title', parentId: null, name: f.title },
    { type: 'message', id: 'u0', parentId: 'title', message: { role: 'user', content: prompts[0] } },
    { type: 'message', id: 'a0', parentId: 'u0', message: { role: 'assistant', content: 'offline-fixture:' + prompts[0], provider: 'pi-docker-fixture', stopReason: 'stop' } } ];
  const restored = [...entries,
    { type: 'message', id: 'u1', parentId: 'a0', message: { role: 'user', content: prompts[1] } },
    { type: 'message', id: 'a1', parentId: 'u1', message: { role: 'assistant', content: 'offline-fixture:' + prompts[1], provider: 'pi-docker-fixture', stopReason: 'stop' } } ];
  const lines = list => list.map(e => JSON.stringify(e)).join('\n') + '\n';
  function snapshot() {
    return { version: '0.9.5', workspaces: [{}], tabs: [{}], panes: [{ pane_id: 'w1:p1', cwd: f.selected }],
      agents: state.container ? [{ pane_id: 'w1:p1', agent: 'pi', agent_status: 'idle',
        agent_session: { source: 'herdr:pi', agent: 'pi', kind: 'path', value: ref } }] : [] };
  }
  function piData() {
    const phase = state.phase, p = pid(), count = phase === 'seed' ? 1 : 2;
    assert.equal(checkLaunch(f.root, phase).inputsValidated, true);
    state.container = true;
    const observation = { sessionId: 'stable-' + f.session, sessionFile: ref, sessionName: f.title, cwd: f.expectedCwd, headerCwd: f.expectedCwd,
      hostname: id().slice(0, 12), users: prompts.slice(0, count), assistants: prompts.slice(0, count).map(s => 'offline-fixture:' + s) };
    const provider = { ...observation, stage: 'settled', hasHerdr: true, piVersion: '1.5.2' }, live = snapshot();
    const prefix = `data/config/phase3-restart-${phase}`;
    json(prefix + '-startup.json', { phase, paneId: 'w1:p1', observation: { ...observation,
      users: phase === 'seed' ? [] : prompts.slice(0, 1), assistants: phase === 'seed' ? [] : ['offline-fixture:' + prompts[0]] } });
    json(prefix + '-checkpoint.json', { phase, paneId: 'w1:p1', observation, provider, snapshot: live, reported: live.agents[0] });
    json(prefix + '-snapshot.json', { result: { snapshot: live } }); json('data/config/phase3-result.json', provider);
    put(`logs/launch-${phase}/argv.nul`, (phase === 'seed' ? [f.selected, '--name', 'backend', '--herdr'] : ['--session', ref]).join('\0') + '\0');
    put(`logs/launch-${phase}/process.stat`, stat(p + 2, p + 1, p * 10 + 2));
    put(`logs/launch-${phase}/shell.stat`, stat(p + 1, p, p * 10 + 1));
    put(`logs/launch-${phase}/cwd.txt`, f.selected + '\n'); put(`logs/launch-${phase}/executable.txt`, f.root + '/bin/pi\n');
    put(`logs/launch-${phase}/outcome.txt`, 'uncertain\n');
    put(storage.relative, lines(phase === 'seed' ? entries : restored));
    put(`data/herdr-launches/${key}.record`, `pi-docker-herdr-v3\0${f.selected}\0backend\0`);
  }
  const observations = {
    process(number) {
      assert.ok(state.server);
      if (number === pid() + 1) return { stat: stat(number, pid(), pid() * 10 + 1), exe: tools.bash };
      assert.equal(number, pid()); return { stat: stat(number, 1, number * 10, 'herdr'), exe: tools.herdr };
    },
    stat(number) { if (!state.server || number !== pid()) throw absent(); return stat(number, 1, number * 10, 'herdr'); },
    socket(filename) { assert.ok([socket, f.sessionDirectory + '/herdr-client.sock'].includes(filename)); if (!state.server) throw absent(); return { path: filename, dev: '1', ino: String(pid()) }; },
    bootId: () => state.fault.boot ? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' : boot, monotonic: () => state.tick, sleep: async () => { state.tick += 200; },
  };
  const runner = {
    tools, env: {}, run(kind, argv) {
      state.calls.push([kind, argv]); let stdout = '';
      if (kind === 'herdr') {
        if (argv[0] === '--version') stdout = 'herdr 0.9.5\n';
        else if (argv.includes('status')) stdout = JSON.stringify({ version: '0.9.5', compatible: true, running: true, status: 'running', session: f.session, socket });
        else { assert.ok(state.server); stdout = JSON.stringify({ result: { snapshot: snapshot() } }); }
      } else if (argv[0] === 'context') stdout = argv[1] === 'show' ? 'default\n' : (state.fault.remote ? 'tcp://unsupported' : 'unix:///inert-docker.sock\n');
      else if (argv[0] === 'info') stdout = argv[2] === '{{.ID}}' ? (state.fault.daemon ? 'different' : 'synthetic-daemon') : 'linux\n';
      else if (argv[0] === 'compose') stdout = '2.40.0\n';
      else if (argv[0] === 'image') stdout = argv[1] === 'ls' ? 'pi-docker:custom\n' : 'sha256:' + (state.fault.image ? 'c' : 'b').repeat(64) + '\n';
      else if (argv[0] === 'ps') stdout = argv.includes('--no-trunc') ? (state.container ? id() + '\n' : '') : (state.fault.retained ? 'retained\n' : '');
      else if (argv[0] === 'inspect') stdout = JSON.stringify({ id: id(), hostname: id().slice(0, 12), running: state.container,
        image: 'pi-docker:custom', imageId: 'sha256:' + 'b'.repeat(64), labels: { 'pi-docker.phase3-run': f.project, 'com.docker.compose.project': f.project } });
      else assert.fail('unexpected inert query');
      return ok(argv, stdout);
    },
  };
  function io(inside = false) {
    return { host: { platform: 'linux', uid, stdinTTY: true, stdoutTTY: true, node: frozen.node,
      entryFile: f.root + '/control/server-restart-live.mjs', callerPid: pid() + 1,
      env: inside ? { HERDR_ENV: '1', HERDR_SESSION: f.session, HERDR_PANE_ID: 'w1:p1', HERDR_SOCKET_PATH: socket } : {} },
      cwd: f.selected, clock, observations, runner, tools: () => ({ tools, identities: {} }),
      checkTools: () => { if (state.fault.tools) throw new Error('inert tool changed'); },
      approve: async (message, expected) => {
        await state.onApproval?.(message);
        if (state.fault.approvalDeath && message.includes('DISPOSABLE ONLY: stop')) state.server = false;
        return { answer: state.fault.decline ? 'no' : expected, observation: 'Synthetic human test answer; NOT host authorization.' };
      },
      print: () => {},
      mutate(kind, argv) {
        state.mutations.push([kind, argv]);
        if (kind === 'installer') fs.writeFileSync(f.root + '/data/config/extensions/herdr-agent-state.ts', asset(), { flag: 'wx' });
        else {
          assert.deepEqual(argv, ['session', 'stop', f.session]); state.server = false; state.container = false;
          const relative = path.relative(f.root, f.sessionDirectory);
          json(relative + '/session.json', { version: 3, workspaces: [{ id: 'w1', public_pane_numbers: { 0: 1 }, tabs: [{ layout: { Pane: 0 }, panes: {
            0: { cwd: f.selected, agent_session: { source: 'herdr:pi', agent: 'pi', kind: 'path', value: ref } } } }] }] });
          json(relative + '/session-history.json', { version: 3, workspaces: [{ tabs: [{}] }] });
          if (state.fault.stopTimeout) return { ...ok(argv), exitCode: null, error: 'ETIMEDOUT', timedOut: true };
        }
        return ok(argv);
      },
      async attach() {
        state.clients.push(state.phase); state.server = true;
        if (state.phase === 'seed') {
          await perform('ready', true, { rawStat: stat(101, 100, 1001) }); piData();
          if (!state.fault.earlyDetach) await perform('collect-seed');
        } else {
          piData(); await perform('collect-restored'); state.container = false;
          await perform('finish', true, { rawStat: stat(201, 200, 2001), exitCode: state.fault.exitCode ?? 0 });
        }
        return ok(['--session', f.session]);
      },
    };
  }
  const perform = async (op, inside = false, args = {}) => new RestartWorkflow(f.root, op, io(inside)).run(args);
  return { f, state, io, perform, json, put, storage, setRestored: () => { state.phase = 'restored'; } };
}

test('live CLI import/help/invalid arguments never construct a host adapter', async () => {
  const forbidden = () => { throw new Error('adapter must not be constructed'); };
  await main(['--help'], forbidden);
  for (const op of liveCommands) await assert.rejects(main([op, '/not-opened'], forbidden), /requires exact/);
  await assert.rejects(main(['stop', '/not-opened', '--execute-reviewed-procedure', '--again'], forbidden), /unexpected/);
  await assert.rejects(main(['finish', '/not-opened', '--execute-reviewed-procedure', '--shell-stat', 'bad'], forbidden), /builtin helper/);
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('../host/server-restart-live.mjs', import.meta.url).href)})`], { encoding: 'utf8', env: { PATH: '/not-used' } });
  assert.equal(imported.status, 0); assert.equal(imported.stdout + imported.stderr, '');
});
test('offline plan is exact, private, two-terminal and not execution approval', t => {
  const f = prepared(t), before = fs.readdirSync(f.root + '/logs'), result = plan(f.root);
  assert.equal(result.session, f.session); assert.equal(result.hostExecutionAuthorized, false);
  assert.match(result.terminalA.seedLaunchSeparateForegroundJob, /--name backend --herdr$/);
  assert.match(result.terminalA.seedUi[0], /^\/name Phase3 Restart ordinary$/);
  assert.match(result.terminalA.finish, /IMMEDIATELY source/);
  assert.ok(!JSON.stringify(result).includes('--image')); assert.deepEqual(fs.readdirSync(f.root + '/logs'), before);
});
test('generated immediate source helper preserves failed status and real parent identity before spawning Node', t => {
  const f = prepared(t), capture = f.root + '/capture.mjs', output = f.root + '/captured.json';
  fs.writeFileSync(capture, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(output)},JSON.stringify({args:process.argv.slice(2),parent:process.ppid}));`);
  // Test-owned modified copy only; never change frozen source in a real run.
  const original = fs.readFileSync(f.root + '/control/finish.sh', 'utf8');
  const inert = original.replaceAll(f.root + '/control/server-restart-live.mjs', capture);
  fs.writeFileSync(f.root + '/finish-inert.sh', inert);
  const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', `false; source '${f.root}/finish-inert.sh'`], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } });
  assert.equal(result.status, 0); const saved = JSON.parse(fs.readFileSync(output));
  assert.equal(saved.args.at(-1), '1'); assert.equal(Number(saved.args[4].split(' ')[0]), saved.parent);
});

test('immediate finish marker is genuinely foreground on a local PTY before the Node child', t => {
  if (spawnSync('script', ['--version']).status !== 0) { t.skip('util-linux script unavailable'); return; }
  const f = prepared(t), output = f.root + '/pty-captured.json', capture = f.root + '/pty-capture.mjs';
  fs.writeFileSync(capture, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(output)},JSON.stringify({args:process.argv.slice(2),parent:process.ppid,current:fs.readFileSync('/proc/'+process.ppid+'/stat','utf8')}));`);
  fs.writeFileSync(f.root + '/pty-finish.sh', fs.readFileSync(f.root + '/control/finish.sh', 'utf8').replaceAll(f.root + '/control/server-restart-live.mjs', capture));
  const result = spawnSync('script', ['-qec', 'exec /bin/bash --noprofile --norc -i', '/dev/null'], {
    input: `false\nsource '${f.root}/pty-finish.sh'\nexit\n`, encoding: 'utf8', timeout: 10000,
    env: { PATH: '/usr/bin:/bin', TERM: 'dumb', PS1: 'inert> ' } });
  assert.equal(result.status, 0); const saved = JSON.parse(fs.readFileSync(output));
  const fields = raw => raw.slice(raw.lastIndexOf(')') + 2).trim().split(/\s+/);
  assert.equal(saved.args.at(-1), '1'); assert.equal(Number(saved.args[4].split(' ')[0]), saved.parent);
  assert.equal(fields(saved.args[4])[2], fields(saved.args[4])[5]);
  assert.notEqual(fields(saved.current)[2], fields(saved.current)[5]);
});
for (const failure of ['uid', 'context', 'node', 'entry-file', 'mode', 'hash'])
  test(`host wrapper refuses ${failure} before queries or mutations`, t => {
    const s = simulation(t), io = s.io();
    if (failure === 'uid') io.host.uid = 0;
    if (failure === 'context') io.host.env.HERDR_PANE_ID = 'foreign';
    if (failure === 'node') io.host.node = '/different/node';
    if (failure === 'entry-file') io.host.entryFile = script;
    if (failure === 'mode') fs.chmodSync(s.f.root, 0o755);
    if (failure === 'hash') fs.appendFileSync(s.f.root + '/control/pane-helpers.sh', '\n# changed\n');
    assert.throws(() => new RestartWorkflow(s.f.root, 'enter-seed', io));
    assert.deepEqual(s.state.calls, []); assert.deepEqual(s.state.mutations, []);
  });
test('linked entry refuses absent ordinary proof before any daemon/API query', async t => {
  const s = simulation(t, 'linked'); await assert.rejects(s.perform('enter-seed'), /ordinary evidence/);
  assert.deepEqual(s.state.calls, []); assert.deepEqual(s.state.mutations, []);
});
test('host executable cache detects byte and PATH resolution changes without executing a tool', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-unit-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ['herdr', 'docker', 'bash', 'node', 'git', 'sha256sum', 'flock', 'realpath', 'timeout', 'cat', 'mkdir', 'uname'])
    fs.writeFileSync(root + '/' + name, '#!/bin/sh\nexit 99\n', { mode: 0o700 });
  const adapter = hostAdapter(), frozen = { path: root, ...Object.fromEntries(['bash', 'node', 'git', 'sha256sum'].map(k => [k, root + '/' + k])) };
  const saved = adapter.tools(frozen); adapter.checkTools(saved);
  const wrongDigest = structuredClone(saved); wrongDigest.identities.docker.sha256 = '0'.repeat(64);
  assert.throws(() => adapter.checkTools(wrongDigest), /bytes changed/); // metadata is unchanged: digest must be enforced too
  fs.appendFileSync(root + '/docker', '# changed\n'); assert.throws(() => adapter.checkTools(saved), /changed/);
  const fresh = adapter.tools(frozen), first = root + '/first'; fs.mkdirSync(first);
  fs.writeFileSync(first + '/docker', '#!/bin/sh\nexit 99\n', { mode: 0o700 });
  fresh.tools.path = first + ':' + root; assert.throws(() => adapter.checkTools(fresh), /resolution/);
});

for (const caseName of ['ordinary', 'linked']) test(`FULL INERT ${caseName} two-terminal procedure, genuine pinned-source bytes as data, no runtime attestation`, { skip: !assetPath }, async t => {
  let ordinary;
  if (caseName === 'linked') {
    ordinary = simulation(t); await ordinary.perform('enter-seed'); await ordinary.perform('stop'); ordinary.setRestored(); await ordinary.perform('enter-restored');
  }
  const s = simulation(t, caseName);
  await s.perform('enter-seed', false, ordinary ? { ordinaryEvidence: ordinary.f.root } : {});
  await s.perform('stop'); s.setRestored(); await s.perform('enter-restored');
  if (ordinary) assert.equal(assessPair(ordinary.f.root, s.f.root).status, 'saved_restart_pair_evidence_validated');
  const result = assessRestart(s.f.root); assert.equal(result.status, 'saved_evidence_validated');
  assert.equal(result.inputsValidated, true); assert.equal(result.liveStateInspected, false); assert.equal(result.phase3Complete, false);
  assert.deepEqual(s.state.clients, ['seed', 'restored']); assert.equal(s.state.mutations.length, 2);
  assert.deepEqual(s.state.mutations[1], ['stop', ['session', 'stop', s.f.session]]);
  assert.equal(new StepLedger(new ArtifactStore(s.f.root), s.f).read().length, 12);
  const count = s.state.mutations.length; await assert.rejects(s.perform('stop')); assert.equal(s.state.mutations.length, count);
});
for (const fault of ['decline', 'earlyDetach', 'stopTimeout', 'retained', 'image', 'daemon', 'remote', 'exitCode'])
  test(`inert procedure stops without retries/cleanup on ${fault}`, { skip: !assetPath }, async t => {
    const s = simulation(t);
    if (fault === 'decline' || fault === 'earlyDetach') {
      s.state.fault[fault] = true; await assert.rejects(s.perform('enter-seed'));
    } else {
      await s.perform('enter-seed');
      if (['stopTimeout', 'retained'].includes(fault)) { s.state.fault[fault] = true; await assert.rejects(s.perform('stop')); }
      else {
        await s.perform('stop'); s.setRestored(); s.state.fault[fault] = fault === 'exitCode' ? 1 : true;
        await assert.rejects(s.perform('enter-restored'));
      }
    }
    const mutations = s.state.mutations.length;
    assert.throws(() => validateInputs(new EvidenceReader(s.f.root)), /controller failure/);
    await assert.rejects(s.perform('enter-restored')); assert.equal(s.state.mutations.length, mutations);
    if (fault === 'stopTimeout') {
      const race = simulation(t); await race.perform('enter-seed'); race.state.fault.approvalDeath = true;
      await assert.rejects(race.perform('stop'));
      assert.deepEqual(race.state.mutations.map(m => m[0]), ['installer']); // never issue a no-op stop after prompt-time death
      assert.throws(() => validateInputs(new EvidenceReader(race.f.root)), /controller failure/);
    }
  });
