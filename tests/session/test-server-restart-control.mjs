// Inert controller/collector tests. No live Herdr, Docker, process/socket probe,
// server entry/stop, real reporter, credentials, or automatic workflow execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ArtifactStore, StepLedger, assertHostContext, privateEnvironment, allowedRead,
  ReadOnlyRunner, CollectorCore, inspect, localObservations } from '../host/server-restart-control.mjs';
import { storageFor, validateRuntimeArtifacts } from '../host/server-restart-evidence.mjs';
import { prepare } from '../host/prepare-server-restart.mjs';

const driver = new URL('../host/server-restart-control.mjs', import.meta.url).pathname;
const steps = ['entry-seed', 'seed-checkpoint', 'stop', 'entry-restored', 'restored-checkpoint', 'finish'];
const bootId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ok = (argv, stdout = '') => ({ argv, stdout, stderr: '', exitCode: 0, signal: null, error: null, timedOut: false, truncated: false });
const missing = () => Object.assign(new Error('synthetic absent observation'), { code: 'ENOENT' });
function stat(pid, ppid, start, comm = 'bash', tpgid = pid) {
  const fields = Array(50).fill('0'); Object.assign(fields, { 0: 'S', 1: String(ppid), 2: String(pid), 5: String(tpgid), 19: String(start) });
  return `${pid} (${comm}) ${fields.join(' ')}\n`;
}
function temporary(t, prefix = 'rc-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}
function fixture(t, { active = 'seed-checkpoint', hasPreflight = true } = {}) {
  const root = temporary(t);
  const f = { root, caseName: 'ordinary', expectedCwd: '/workspace', selected: root + '/fixtures/ordinary', storageName: 'backend',
    title: 'Phase3 Restart ordinary', session: 'pi-restart-unit', project: 'pi-restart-unit',
    dockerConfig: root + '/not-read-docker', herdrConfigHome: root + '/herdr-config', herdrStateHome: root + '/herdr-state' };
  f.sessionDirectory = f.herdrConfigHome + '/herdr/sessions/' + f.session;
  const put = (relative, bytes) => { fs.mkdirSync(path.dirname(root + '/' + relative), { recursive: true, mode: 0o700 }); fs.writeFileSync(root + '/' + relative, bytes); };
  const json = (relative, object) => put(relative, JSON.stringify(object) + '\n');
  fs.mkdirSync(f.selected, { recursive: true });
  const phase = ['entry-restored', 'restored-checkpoint', 'finish'].includes(active) ? 'restored' : 'seed';
  const initialPhase = active === 'entry-seed' ? 'unarmed' : phase;
  put('control/phase', initialPhase + '\n'); put('data/config/phase3-restart-stage', initialPhase + '\n');
  const store = new ArtifactStore(root); let ticks = 0, monotonic = 0;
  const clock = () => new Date(1700000000000 + ticks++).toISOString();
  const ledger = new StepLedger(store, f, clock);
  const advance = target => {
    for (let i = 0; i < steps.indexOf(target); i++) {
      ledger.begin(steps[i]);
      // Deliberately synthetic validator for journal-mechanics tests, NOT a
      // public input/official-reporter validation or real workflow success.
      if (['entry-seed', 'entry-restored'].includes(steps[i])) ledger.confirm(steps[i], () => ({ inputsValidated: true, synthetic: true }));
      else {
        // Raw test setup only: not a controller execution path. Public boundary
        // confirmation cannot accept a fake callback or disable reporter pins.
        const receipt = ledger.event(steps[i], 'confirmed_success');
        store.jsonWrite(`control/steps/${steps[i]}/publication-required.json`, { version: 1, session: f.session, step: steps[i], synthetic: true });
        store.reserve(`control/steps/${steps[i]}/confirmation`);
        store.append('logs/receipts.jsonl', receipt);
        store.jsonWrite(`control/steps/${steps[i]}/publication-validated.json`, { synthetic: true, receipt,
          status: steps[i] === 'stop' ? 'stopped_evidence_validated' : 'checkpoint_evidence_validated' });
      }
    }
    ledger.begin(target);
  };
  if (active) advance(active);
  // storageFor validates references; derive its key from unchanged production bytes.
  const referenceKey = hash(`pi-docker-herdr-v3\0${f.selected}\0backend`);
  const reference = `/pi/herdr-sessions/${referenceKey}/fixture.jsonl`, storage = storageFor(f, reference);
  const pid = phase === 'seed' ? 100 : 200, id = (phase === 'seed' ? '1' : '2').repeat(64);
  const state = { sessionId: 'unit', sessionFile: reference, sessionName: f.title, cwd: '/workspace', headerCwd: '/workspace',
    hostname: id.slice(0, 12), users: ['phase3-restart-ordinary-seed'], assistants: ['offline-fixture:phase3-restart-ordinary-seed'] };
  const provider = { ...state, stage: 'settled', hasHerdr: true, piVersion: '1.5.2' };
  const agent = { pane_id: 'w1:p1', agent: 'pi', agent_status: 'idle', agent_session: { source: 'herdr:pi', agent: 'pi', kind: 'path', value: reference } };
  const snapshot = { version: '0.9.5', workspaces: [{}], tabs: [{}], panes: [{ pane_id: 'w1:p1', cwd: f.selected }], agents: [agent] };
  const checkpoint = { phase, paneId: 'w1:p1', observation: state, provider, reported: agent, snapshot };
  if (active !== 'entry-seed') {
    json(`data/config/phase3-restart-${phase}-checkpoint.json`, checkpoint);
    json(`data/config/phase3-restart-${phase}-startup.json`, { phase, paneId: 'w1:p1', observation: state });
    json('data/config/phase3-result.json', provider);
    put(`logs/launch-${phase}/process.stat`, stat(pid + 2, pid + 1, pid * 10 + 2));
    put(`logs/launch-${phase}/shell.stat`, stat(pid + 1, pid, pid * 10 + 1));
    put(`logs/launch-${phase}/cwd.txt`, f.selected + '\n');
    put(`logs/launch-${phase}/executable.txt`, root + '/bin/pi\n');
    put(`logs/launch-${phase}/outcome.txt`, 'uncertain\n');
    const record = `pi-docker-herdr-v3\0${f.selected}\0backend\0`;
    put(storage.relative, '{"synthetic":"collector copies bytes; full history validation is separate"}\n');
    put(`data/herdr-launches/${storage.key}.record`, record);
  }
  if (hasPreflight) json('logs/preflight.json', { version: 1, session: f.session, tag: 'pi-docker:custom', imageId: 'sha256:' + 'b'.repeat(64) });
  const tools = { path: '/host:/usr/bin:/bin', herdr: '/host/herdr', docker: '/host/docker' };
  const env = privateEnvironment(f, tools, { TERM: 'dumb' });
  const calls = [], probes = [], fault = {};
  const spawn = (binary, argv, options) => {
    calls.push({ binary, argv, options });
    let stdout = '';
    if (binary === tools.herdr) {
      if (argv[0] === '--version') stdout = fault.cliVersion ?? 'herdr 0.9.5\n';
      else if (argv.includes('status')) stdout = JSON.stringify({ status: 'running', running: true, version: '0.9.5', compatible: true,
        session: fault.statusSession ?? f.session, socket: `${f.sessionDirectory}/herdr.sock` });
      else { const fresh = structuredClone(snapshot); if (fault.stale) fresh.agents[0].agent_session.value = '/old.jsonl'; stdout = JSON.stringify({ result: { snapshot: fresh } }); }
    } else if (argv[0] === 'context') stdout = argv[1] === 'show' ? 'default\n' : (fault.endpoint ?? 'unix:///var/run/docker.sock\n');
    else if (argv[0] === 'info') stdout = fault.os ?? 'linux\n';
    else if (argv[0] === 'compose') stdout = '2.40.0\n';
    else if (argv[0] === 'image' && argv[1] === 'ls') {
      if (fault.imageError) return { status: 1, signal: null, stdout: '', stderr: 'inert query failed' };
      stdout = fault.custom ?? 'pi-docker:custom\n';
    } else if (argv[0] === 'image') stdout = fault.imageId ?? 'sha256:' + 'b'.repeat(64) + '\n';
    else if (argv[0] === 'ps') stdout = argv.includes('--no-trunc') ? (fault.containerIds ?? id + '\n') : (fault.inventory ?? '');
    else if (argv[0] === 'inspect') stdout = JSON.stringify({ id, hostname: id.slice(0, 12), running: true, image: 'pi-docker:custom',
      imageId: 'sha256:' + 'b'.repeat(64), labels: { 'pi-docker.phase3-run': fault.project ?? f.project, 'com.docker.compose.project': f.project } });
    else assert.fail('unexpected command');
    return { status: 0, signal: null, stdout, stderr: '' };
  };
  const runner = new ReadOnlyRunner({ fixture: f, tools, env, spawn });
  const observations = {
    process(number) {
      probes.push(['process', number]);
      if (number === pid + 1) return { stat: stat(number, pid, fault.shellStart ?? pid * 10 + 1), exe: '/host/bash' };
      assert.equal(number, pid); return { stat: stat(pid, 1, pid * 10, 'herdr'), exe: fault.serverExe ?? tools.herdr };
    },
    stat(number) { probes.push(['stat', number]); assert.equal(number, 100); if (fault.processError) throw Object.assign(new Error('inert process error'), { code: fault.processError });
      if (fault.alive || (fault.pollUntil && monotonic < fault.pollUntil)) return stat(100, 1, 1000, 'herdr'); throw missing(); },
    bootId: () => fault.bootId ?? bootId,
    socket(filename) { probes.push(['socket', filename]);
      if (fault.socketError) throw Object.assign(new Error('inert socket error'), { code: fault.socketError });
      if (active === 'stop' && !fault.socketPresent) throw missing();
      return { path: filename, dev: '1', ino: String(pid) };
    },
    monotonic: () => monotonic, sleep: async ms => { monotonic += ms; },
  };
  if (active === 'stop') {
    json('logs/seed-runtime.json', { server: { stat: stat(100, 1, 1000, 'herdr'), exe: tools.herdr, bootId } });
    json('logs/stop-command.json', ok(['session', 'stop', f.session]));
    const relative = path.relative(root, f.sessionDirectory);
    json(relative + '/session.json', { version: 3, synthetic: true });
    json(relative + '/session-history.json', { version: 3, synthetic: true });
  }
  if (active === 'finish') json('logs/restored-runtime.json', { server: { stat: stat(200, 1, 2000, 'herdr'), exe: tools.herdr, bootId }, shellStat: stat(201, 200, 2001) });
  const core = new CollectorCore({ store, fixture: f, ledger, runner, observations, clock });
  return { root, f, put, json, store, ledger, clock, core, runner, observations, calls, probes, fault, checkpoint, phase, storage, tools, env };
}
function hash(s) { return createHash('sha256').update(s).digest('hex'); }

// Public CLI tests never instantiate a live collector/runner.
test('CLI help, import and unimplemented mutations make no external calls or changes', t => {
  const parent = temporary(t), env = { PATH: '/not-used', HOME: '/not-used', HERDR_ENV: '1', HERDR_PANE_ID: 'inert' };
  const help = spawnSync(process.execPath, [driver, '--help'], { env, encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /Offline state inspection/);
  for (const mode of ['--enter', '--stop', '--restart', '--arm', '--capture', '--ready', '--finish', '--install']) {
    const r = spawnSync(process.execPath, [driver, mode, parent], { env, encoding: 'utf8' });
    assert.notEqual(r.status, 0); assert.match(r.stderr, /only --inspect/);
  }
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('../host/server-restart-control.mjs', import.meta.url).href)})`], { env, encoding: 'utf8' });
  assert.equal(imported.status, 0); assert.equal(imported.stdout + imported.stderr, ''); assert.deepEqual(fs.readdirSync(parent), []);
});

test('offline inspector validates prepared inputs without a reporter, touching no resources', t => {
  const parent = temporary(t), f = prepare({ caseName: 'ordinary', parent, env: { PATH: process.env.PATH, HOME: parent } });
  const before = fs.readdirSync(f.root + '/logs'); const result = inspect(f.root);
  assert.equal(result.nextStep, 'entry-seed'); assert.equal(result.hostExecutionAuthorized, false); assert.equal(result.liveWorkflowImplemented, true);
  assert.equal(result.terminalWorkflow, 'two_normal_host_terminals'); assert.deepEqual(fs.readdirSync(f.root + '/logs'), before);
  fs.appendFileSync(f.root + '/control/server-restart-control.mjs', '\n// tampered\n'); assert.throws(() => inspect(f.root), /changed immutable/);
});

test('ledger reserves exactly once and validates projected evidence before confirming', t => {
  const f = fixture(t, { active: null }); f.ledger.begin('entry-seed');
  const before = f.store.text('logs/receipts.jsonl');
  f.ledger.confirm('entry-seed', projected => {
    assert.equal(f.store.text('logs/receipts.jsonl'), before);
    assert.equal(projected.text('logs/receipts.jsonl').trim().split('\n').length, 2);
    return { inputsValidated: true, synthetic: true };
  });
  assert.equal(f.ledger.read().length, 2);
  assert.throws(() => f.ledger.begin('entry-seed')); assert.throws(() => f.ledger.begin('stop'));
  assert.deepEqual(f.store.names('control/steps'), ['entry-seed']);
});

for (const scenario of ['throws', 'artifact-core', 'async']) test(`failed confirmation remains reserved and cannot be retried: ${scenario}`, t => {
  const f = fixture(t, { active: null }); f.ledger.begin('entry-seed');
  const validate = scenario === 'throws' ? () => { throw new Error('synthetic validation failure'); } :
    scenario === 'async' ? () => Promise.resolve({ inputsValidated: true }) : () => ({ inputsValidated: false });
  assert.throws(() => f.ledger.confirm('entry-seed', validate));
  assert.match(f.store.text('logs/receipts.jsonl'), /confirmed_failure/);
  assert.throws(() => f.ledger.read(), /failed/); assert.throws(() => f.ledger.begin('entry-seed'));
  assert.throws(() => f.ledger.confirm('entry-seed', () => ({ inputsValidated: true })));
});

test('orphan reservations and partial/backwards-time journals stop without repair', t => {
  const f = fixture(t, { active: null }); f.store.reserve('control/steps/entry-seed');
  assert.throws(() => f.ledger.read(), /orphan/); assert.throws(() => f.ledger.begin('entry-seed'), /orphan/);
  const other = fixture(t, { active: null }); other.ledger.begin('entry-seed');
  other.ledger.clock = () => new Date(1600000000000).toISOString();
  assert.throws(() => other.ledger.confirm('entry-seed', () => ({ inputsValidated: true })), /clock/);
  other.ledger.clock = other.clock;
  assert.throws(() => other.ledger.confirm('entry-seed', () => ({ inputsValidated: true })), /EEXIST/);
  fs.appendFileSync(other.root + '/logs/receipts.jsonl', '{'); assert.throws(() => other.ledger.read(), /incomplete/);
});

test('artifact store cannot overwrite conversations, records, prior receipts, or follow symlinks', t => {
  const f = fixture(t);
  for (const relative of ['data/config/auth.json', 'data/sessions/a.jsonl', 'data/herdr-launches/a.record', '../outside', 'logs/../data/config/auth.json'])
    assert.throws(() => f.store.write(relative, 'bad'), /unsafe/);
  f.store.write('logs/once', 'original'); assert.throws(() => f.store.write('logs/once', 'replacement'));
  fs.symlinkSync('/not-a-target', f.root + '/logs/link'); assert.throws(() => f.store.write('logs/link', 'bad'));
  assert.equal(f.store.text('logs/once'), 'original');
  f.store.append('logs/stop-probes.jsonl', { synthetic: true });
  const original = f.store.text('logs/stop-probes.jsonl');
  fs.linkSync(f.root + '/logs/stop-probes.jsonl', f.root + '/logs/hardlink');
  assert.throws(() => f.store.append('logs/stop-probes.jsonl', { changed: true }), /single-link/);
  assert.equal(f.store.text('logs/stop-probes.jsonl'), original);
});

test('host/context and private environment gates never silently strip genuine context', t => {
  const f = fixture(t), host = { platform: 'linux', uid: 1000, stdinTTY: true, stdoutTTY: true, env: {} };
  assert.doesNotThrow(() => assertHostContext(host, f.f));
  for (const patch of [{ uid: 0 }, { platform: 'darwin' }, { stdinTTY: false }, { stdoutTTY: false }, { env: { HERDR_PANE_ID: 'inherited' } }])
    assert.throws(() => assertHostContext({ ...host, ...patch }, f.f));
  const realContext = { HERDR_ENV: '1', HERDR_SESSION: f.f.session, HERDR_PANE_ID: 'inert:pane', HERDR_SOCKET_PATH: f.f.sessionDirectory + '/herdr.sock' };
  assert.doesNotThrow(() => assertHostContext({ ...host, env: realContext }, f.f, true));
  assert.throws(() => assertHostContext({ ...host, env: { ...realContext, HERDR_AGENT: 'pi' } }, f.f, true));
  assert.throws(() => privateEnvironment(f.f, f.tools, realContext), /outside Herdr/);
  const privateEnv = privateEnvironment(f.f, f.tools, { ...realContext, SECRET_TOKEN: 'synthetic-not-a-credential', NODE_OPTIONS: '--bad', BASH_ENV: '/must-not-source', GIT_DIR: '/bad', COMPOSE_FILE: '/bad' }, true);
  for (const [key, value] of Object.entries(realContext)) assert.equal(privateEnv[key], value);
  for (const key of ['SECRET_TOKEN', 'NODE_OPTIONS', 'BASH_ENV', 'GIT_DIR', 'COMPOSE_FILE']) assert.equal(privateEnv[key], undefined);
  assert.equal(privateEnv.HOME, f.root + '/host-home'); assert.equal(privateEnv.DOCKER_CONFIG, f.f.dockerConfig);
  assert.throws(() => privateEnvironment(f.f, f.tools, { DOCKER_HOST: 'ssh://not-supported' }), /local Unix/);
  assert.throws(() => privateEnvironment(f.f, f.tools, { DOCKER_TLS_VERIFY: '1' }), /TLS/);
});

test('runner allows only scoped reads, never bare launch, stop, reporter install, image mutation or broad inventory', t => {
  const f = fixture(t);
  const rejected = [['herdr', []], ['herdr', ['session', 'stop', f.f.session]], ['herdr', ['server', 'stop']],
    ['herdr', ['integration', 'install']], ['herdr', ['status', 'server', '--json']], ['herdr', ['--session', 'default', 'api', 'snapshot']],
    ['docker', ['ps', '--all']], ['docker', ['inspect', 'anything']], ['docker', ['image', 'pull', 'pi-docker:base']],
    ['docker', ['image', 'rm', 'pi-docker:custom']], ['docker', ['container', 'rm', '-f', 'anything']]];
  for (const [kind, argv] of rejected) { assert.equal(allowedRead(kind, argv, f.f), false); assert.throws(() => f.runner.run(kind, argv)); }
  assert.equal(f.calls.length, 0);
  f.runner.run('herdr', ['--version']); const options = f.calls[0].options;
  assert.equal(options.timeout, 20000); assert.equal(options.maxBuffer, 1024 * 1024); assert.equal(options.shell, false);
});

for (const code of ['ETIMEDOUT', 'ENOBUFS', 'EACCES']) test(`query failures are captured once before throwing: ${code}`, t => {
  const f = fixture(t);
  f.runner.spawn = () => { throw Object.assign(new Error('synthetic'), { code }); };
  assert.throws(() => f.core.query('herdr', ['--version'], 'synthetic-query'), /failed\/uncertain/);
  const saved = f.store.json('logs/synthetic-query.json'); assert.equal(saved.error, code);
  assert.equal(saved.timedOut, code === 'ETIMEDOUT'); assert.equal(saved.truncated, code === 'ENOBUFS');
  let invoked = false; f.runner.spawn = () => { invoked = true; };
  assert.throws(() => f.core.query('herdr', ['--version'], 'synthetic-query')); assert.equal(invoked, false);
});

test('invalid UTF-8 query bytes fail closed and are retained without replacement decoding', t => {
  const f = fixture(t), raw = Buffer.from([0xc3, 0x28]);
  f.runner.spawn = () => ({ status: 0, signal: null, stdout: raw, stderr: Buffer.alloc(0) });
  assert.throws(() => f.core.query('herdr', ['--version'], 'invalid-encoding'), /failed\/uncertain/);
  const saved = f.store.json('logs/invalid-encoding.json');
  assert.equal(saved.error, 'INVALID_UTF8'); assert.equal(saved.stdout, '');
  assert.deepEqual(Buffer.from(saved.stdoutBase64, 'base64'), raw);
});

for (const phase of ['seed', 'restored']) test(`open ${phase} collector produces compatible raw runtime artifacts using only inert scoped reads`, t => {
  const f = fixture(t, { active: phase === 'seed' ? 'seed-checkpoint' : 'entry-restored' });
  const before = f.ledger.read().length, result = f.core.captureOpen(phase);
  assert.equal(result.status, 'captured_only'); assert.equal(result.inputsValidated, false); assert.equal(result.liveStateInspected, false); assert.equal(f.ledger.read().length, before);
  const runtime = validateRuntimeArtifacts(f.store, f.f, phase, f.checkpoint);
  assert.equal(runtime.proc.comm, 'herdr'); assert.equal(runtime.container.id.slice(0, 12), f.checkpoint.observation.hostname);
  assert.deepEqual(f.store.bytes(`logs/${phase}.jsonl`), f.store.bytes(f.storage.relative));
  for (const call of f.calls) assert.ok(allowedRead(call.binary === f.tools.herdr ? 'herdr' : 'docker', call.argv, f.f));
  assert.equal(f.probes.filter(p => p[0] === 'process').length, 2);
  const count = f.calls.length; assert.throws(() => f.core.captureOpen(phase)); assert.equal(f.calls.length, count);
});

for (const scenario of ['stale', 'imageError', 'imageId', 'project', 'containerIds', 'shellStart', 'serverExe', 'statusSession'])
  test(`open collector stops and retains uncertainty: ${scenario}`, t => {
    const f = fixture(t);
    Object.assign(f.fault, { [scenario]: ({ imageId: 'sha256:' + 'c'.repeat(64), project: 'other', containerIds: '1\n2\n',
      shellStart: 999, serverExe: '/another/herdr', statusSession: 'default' })[scenario] ?? true });
    assert.throws(() => f.core.captureOpen('seed'));
    assert.equal(f.ledger.read().at(-1).outcome, 'uncertain');
    assert.equal(f.store.absent('logs/seed-runtime.json'), true);
    const count = f.calls.length; assert.throws(() => f.core.captureOpen('seed')); assert.equal(f.calls.length, count);
  });

test('preflight reads local engine/image metadata and records empty inventories without arming or starting anything', t => {
  const f = fixture(t, { active: 'entry-seed', hasPreflight: false });
  f.put('control/phase', 'unarmed\n'); f.put('data/config/phase3-restart-stage', 'unarmed\n');
  const result = f.core.preflight(); assert.equal(result.tag, 'pi-docker:custom');
  assert.equal(f.store.text('control/phase'), 'unarmed\n'); assert.equal(f.store.text('data/config/phase3-restart-stage'), 'unarmed\n');
  assert.equal(f.store.json('logs/preflight.json').serverRestartTested, false); assert.deepEqual(f.probes, []);
});
for (const scenario of ['endpoint', 'os', 'cliVersion', 'imageError', 'inventory']) test(`preflight rejects unsupported/uncertain host evidence: ${scenario}`, t => {
  const f = fixture(t, { active: 'entry-seed', hasPreflight: false });
  Object.assign(f.fault, { [scenario]: ({ endpoint: 'tcp://remote:2375', os: 'windows', cliVersion: 'herdr 9', inventory: 'retained\n' })[scenario] ?? true });
  assert.throws(() => f.core.preflight()); assert.equal(f.store.absent('logs/preflight.json'), true);
});

test('oversized Unix socket paths and existing session directories stop before any CLI query', t => {
  const f = fixture(t, { active: 'entry-seed', hasPreflight: false });
  f.f.sessionDirectory += '/' + 'long'.repeat(50); assert.throws(() => f.core.preflight(), /pathname limit/); assert.equal(f.calls.length, 0);
  const other = fixture(t, { active: 'entry-seed', hasPreflight: false }); fs.mkdirSync(other.f.sessionDirectory, { recursive: true });
  assert.throws(() => other.core.preflight()); assert.equal(other.calls.length, 0);
});

test('stopped collector observes only recorded PID/socket paths, never sends stop, and copies evidence without confirming', async t => {
  const f = fixture(t, { active: 'stop' }); const before = f.ledger.read().length;
  const result = await f.core.captureStopped(); assert.equal(result.inputsValidated, false);
  assert.equal(f.store.json('logs/stopped-boundary.json').serverProbe.code, 'ENOENT');
  assert.equal(f.ledger.read().length, before); assert.ok(f.calls.every(c => c.binary === f.tools.docker && c.argv[0] === 'ps'));
  assert.deepEqual(f.store.bytes('logs/stopped.record'), f.store.bytes(`data/herdr-launches/${f.storage.key}.record`));
});

test('bounded read-only disappearance polling is not mutation retry', async t => {
  const f = fixture(t, { active: 'stop' }); f.fault.pollUntil = 400;
  await f.core.captureStopped({ timeoutMs: 1000, intervalMs: 200 });
  assert.equal(f.store.text('logs/stop-probes.jsonl').trim().split('\n').length, 3);
  assert.equal(f.probes.filter(p => p[0] === 'stat').length, 3);
});
for (const scenario of ['alive', 'socketPresent', 'processError', 'socketError', 'bootId', 'inventory'])
  test(`stopped collector does not turn uncertainty into absence: ${scenario}`, async t => {
    const f = fixture(t, { active: 'stop' });
    Object.assign(f.fault, { [scenario]: ({ processError: 'EACCES', socketError: 'EACCES', bootId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', inventory: 'retained\n' })[scenario] ?? true });
    await assert.rejects(f.core.captureStopped({ timeoutMs: 400, intervalMs: 200 }));
    assert.equal(f.ledger.read().at(-1).outcome, 'uncertain');
    if (scenario.endsWith('Error')) assert.match(f.store.text('logs/stop-probes.jsonl'), /EACCES/);
    const count = f.calls.length; await assert.rejects(f.core.captureStopped()); assert.equal(f.calls.length, count);
  });

test('final shell collector requires the exact foreground parent and exit status before empty inventory capture', t => {
  const f = fixture(t, { active: 'finish' }), raw = stat(201, 200, 2001);
  const result = f.core.captureFinalShell({ rawStat: raw, callerPid: 201, exitCode: 0, observation: 'Synthetic immediate shell return' });
  assert.equal(result.inputsValidated, false); assert.equal(f.store.text('logs/final-shell.stat'), raw);
  assert.equal(f.store.json('logs/final-exit.json').piExitCode, 0);
  assert.equal(f.ledger.read().at(-1).outcome, 'uncertain');
});
for (const scenario of ['status', 'foreground', 'caller', 'identity', 'observation']) test(`final shell refuses an invalid boundary: ${scenario}`, t => {
  const f = fixture(t, { active: 'finish' });
  const args = { rawStat: stat(201, 200, 2001), callerPid: 201, exitCode: 0, observation: 'Synthetic shell' };
  if (scenario === 'status') args.exitCode = 1;
  if (scenario === 'foreground') args.rawStat = stat(201, 200, 2001, 'bash', 202);
  if (scenario === 'caller') args.callerPid = 202;
  if (scenario === 'identity') args.rawStat = stat(201, 200, 1999);
  if (scenario === 'observation') args.observation = '   ';
  assert.throws(() => f.core.captureFinalShell(args)); assert.equal(f.calls.length, 0);
});

for (const scenario of ['armed', 'stage-disagreement', 'conversation', 'record', 'launch', 'observer'])
  test(`initial preflight rejects dirty fixtures before commands: ${scenario}`, t => {
    const f = fixture(t, { active: 'entry-seed', hasPreflight: false });
    if (scenario === 'armed') f.put('control/phase', 'seed\n');
    if (scenario === 'stage-disagreement') f.put('data/config/phase3-restart-stage', 'seed\n');
    if (scenario === 'conversation') f.put('data/sessions/stale.jsonl', '{}\n');
    if (scenario === 'record') f.put('data/herdr-launches/stale.record', 'stale');
    if (scenario === 'launch') f.put('logs/launch-seed/process.stat', 'stale');
    if (scenario === 'observer') f.put('data/config/phase3-restart-seed-error.txt', 'stale');
    assert.throws(() => f.core.preflight()); assert.equal(f.calls.length, 0);
  });

for (const scenario of ['phase-disagreement', 'observer-error', 'changed-provider'])
  test(`open observation fails before queries on local uncertainty: ${scenario}`, t => {
    const f = fixture(t);
    if (scenario === 'phase-disagreement') f.put('control/phase', 'restored\n');
    if (scenario === 'observer-error') f.put('data/config/phase3-restart-seed-error.txt', 'synthetic observer failure');
    if (scenario === 'changed-provider') f.json('data/config/phase3-result.json', { stage: 'working' });
    assert.throws(() => f.core.captureOpen('seed')); assert.equal(f.calls.length, 0);
    assert.equal(f.ledger.read().at(-1).outcome, 'uncertain');
  });

for (const scenario of ['wrong-target', 'failed-stop', 'timed-out-stop'])
  test(`stopped collection never repairs or reissues an ambiguous stop: ${scenario}`, async t => {
    const f = fixture(t, { active: 'stop' }), receipt = ok(['session', 'stop', f.f.session]);
    if (scenario === 'wrong-target') receipt.argv[2] = 'default';
    if (scenario === 'failed-stop') receipt.exitCode = 1;
    if (scenario === 'timed-out-stop') { receipt.exitCode = null; receipt.error = 'ETIMEDOUT'; receipt.timedOut = true; }
    f.json('logs/stop-command.json', receipt);
    await assert.rejects(f.core.captureStopped()); assert.deepEqual(f.calls, []); assert.deepEqual(f.probes, []);
    assert.equal(f.store.absent('logs/stopped-boundary.json'), true);
  });

test('stopped capture distinguishes reused PID from old lifetime using raw stat', async t => {
  const f = fixture(t, { active: 'stop' });
  f.observations.stat = pid => stat(pid, 1, 9999, 'unrelated'); await f.core.captureStopped();
  assert.equal(f.store.json('logs/stopped-boundary.json').serverProbe.status, 'replaced');
});

test('stop polling cannot pass after oversleeping its deadline', async t => {
  const f = fixture(t, { active: 'stop' }); let time = 0;
  f.observations.monotonic = () => time;
  f.observations.stat = pid => { if (!time) return stat(pid, 1, 1000, 'herdr'); throw missing(); };
  f.observations.sleep = async () => { time += 1000; };
  await assert.rejects(f.core.captureStopped({ timeoutMs: 400, intervalMs: 200 }), /deadline/);
  assert.equal(f.store.absent('logs/stopped-boundary.json'), true);
});

for (const step of ['seed-checkpoint', 'stop', 'restored-checkpoint', 'finish'])
  test(`public ${step} boundary cannot use a fake callback or bypass frozen inputs`, t => {
    const f = fixture(t, { active: step }); let invoked = false;
    assert.throws(() => f.ledger.confirm(step, () => { invoked = true; return { inputsValidated: true }; }), /confirmBoundary/);
    assert.equal(invoked, false); assert.equal(f.ledger.read().at(-1).outcome, 'uncertain');
    // Extra callback is deliberately ignored by the hardwired public method.
    assert.throws(() => f.ledger.confirmBoundary(step, () => { invoked = true; return { inputsValidated: true }; }));
    assert.equal(invoked, false); assert.equal(f.calls.length, 0); assert.deepEqual(f.probes, []);
    assert.match(f.store.text('logs/receipts.jsonl'), /confirmed_failure/);
    assert.equal(f.store.absent(`control/steps/${step}/publication-validated.json`), true);
    assert.throws(() => f.ledger.confirmBoundary(step));
  });

test('entry confirmation is not silently treated as a data/publication gate', t => {
  const f = fixture(t, { active: 'entry-seed' }), before = f.store.text('logs/receipts.jsonl');
  assert.throws(() => f.ledger.confirmBoundary('entry-seed'), /only checkpoint/);
  assert.equal(f.store.text('logs/receipts.jsonl'), before);
  assert.equal(f.store.absent('control/steps/entry-seed/publication-required.json'), true);
});

for (const scenario of ['missing-validation', 'wrong-receipt', 'wrong-status', 'wrong-target', 'controller-failure'])
  test(`publication cannot permit the next step after crash/disagreement: ${scenario}`, t => {
    const f = fixture(t), step = 'seed-checkpoint';
    const receipt = f.ledger.event(step, 'confirmed_success');
    f.store.jsonWrite(`control/steps/${step}/publication-required.json`, { version: 1,
      session: scenario === 'wrong-target' ? 'default' : f.f.session, step });
    f.store.reserve(`control/steps/${step}/confirmation`);
    f.store.append('logs/receipts.jsonl', receipt); // deliberate synthetic crash window
    if (scenario !== 'missing-validation') f.store.jsonWrite(`control/steps/${step}/publication-validated.json`, {
      receipt: scenario === 'wrong-receipt' ? { ...receipt, session: 'default' } : receipt,
      status: scenario === 'wrong-status' ? 'pending_evidence_validated' : 'checkpoint_evidence_validated' });
    if (scenario === 'controller-failure') f.store.jsonWrite('logs/controller-failure.json', { outcome: 'synthetic blocked publication' });
    const before = f.store.text('logs/receipts.jsonl');
    assert.throws(() => f.ledger.read()); assert.throws(() => f.ledger.begin('stop'));
    assert.throws(() => f.ledger.confirmBoundary(step));
    assert.equal(f.store.text('logs/receipts.jsonl'), before); assert.equal(f.calls.length, 0);
    assert.equal(f.store.names('control/steps').includes('stop'), false);
  });

test('local observation adapter rejects unrecorded/invalid process IDs before reading /proc', () => {
  const io = localObservations(1000);
  for (const pid of [0, -1, '1', NaN, Infinity]) { assert.throws(() => io.stat(pid)); assert.throws(() => io.process(pid)); }
});
