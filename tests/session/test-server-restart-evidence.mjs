// Synthetic saved evidence only. No real Pi, Docker, Herdr, sockets or processes.
// Artifact-core success deliberately does NOT validate official reporter bytes
// or frozen inputs. Public assessor wrappers always enforce those independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { EvidenceReader, parseProcessStat, storageFor, validateInputs, validateStoppedSnapshot,
  validateStopArtifacts, assessRestartArtifacts, validateStop, assessRestart,
  validateCheckpointArtifacts, validateCheckpoint, validatePendingArtifacts, validatePending,
  CONTAINER_FORMAT, INVENTORY_FORMAT, OFFICIAL_REPORTER_SHA256 } from '../host/server-restart-evidence.mjs';
import { prepare } from '../host/prepare-server-restart.mjs';

const driver = new URL('../host/server-restart-evidence.mjs', import.meta.url).pathname;
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const ok = (argv, stdout = '') => ({ argv, stdout, stderr: '', exitCode: 0, signal: null, error: null, timedOut: false, truncated: false });
const bootId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function stat(pid, ppid, start, comm = 'herdr', tpgid = pid) {
  const fields = Array(50).fill('0'); Object.assign(fields, { 0: 'S', 1: String(ppid), 2: String(pid),
    3: String(ppid), 5: String(tpgid), 19: String(start) });
  return `${pid} (${comm}) ${fields.join(' ')}\n`;
}
function fixture(t, { caseName = 'ordinary', stopOnly = false, recordedRoot } = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-evidence-unit-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'pi-docker-restart.abcdef'); fs.mkdirSync(root, { mode: 0o700 });
  const f = { version: 1, scope: 'automatic-server-restart', status: 'prepared_only_not_run_ready',
    root: recordedRoot ?? root, caseName, storageName: 'backend', title: `Phase3 Restart ${caseName}`,
    session: 'pi-restart-abcdef', project: 'pi-restart-abcdef' };
  f.selected = path.join(f.root, caseName === 'ordinary' ? 'fixtures/ordinary' : 'fixtures/linked checkout/packages/backend');
  f.expectedCwd = caseName === 'ordinary' ? '/workspace' : f.selected;
  f.sessionDirectory = path.join(f.root, 'herdr-config/herdr/sessions', f.session);
  const key = hash(`pi-docker-herdr-v3\0${f.selected}\0backend`);
  const reference = `/pi/herdr-sessions/${key}/conversation.jsonl`;
  const record = `pi-docker-herdr-v3\0${f.selected}\0backend\0`;
  const states = {}, snapshots = {};
  const put = (name, value) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(root, name), value, { mode: 0o600 }); };
  const json = (name, value) => put(name, JSON.stringify(value) + '\n');
  fs.mkdirSync(path.join(root, path.relative(f.root, f.selected)), { recursive: true });
  if (caseName === 'linked') {
    fs.mkdirSync(root + '/fixtures/main/.git/worktrees/linked-checkout', { recursive: true });
    put('fixtures/linked checkout/.git', `gitdir: ${f.root}/fixtures/main/.git/worktrees/linked-checkout\n`);
  }
  const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  const change = (name, mutate) => { const value = read(name); mutate(value); json(name, value); };
  const prompts = [`phase3-restart-${caseName}-seed`, `phase3-restart-${caseName}-restored`];
  const header = { type: 'session', version: 3, id: 'stable-session', cwd: f.expectedCwd };
  const seedEntries = [header, { type: 'session_info', id: 'name', parentId: null, name: f.title },
    { type: 'message', id: 'u0', parentId: 'name', message: { role: 'user', content: prompts[0] } },
    { type: 'message', id: 'a0', parentId: 'u0', message: { role: 'assistant', content: [{ type: 'text', text: 'offline-fixture:' + prompts[0] }], provider: 'pi-docker-fixture', stopReason: 'stop' } }];
  const restoredEntries = [...seedEntries,
    { type: 'message', id: 'u1', parentId: 'a0', message: { role: 'user', content: prompts[1] } },
    { type: 'message', id: 'a1', parentId: 'u1', message: { role: 'assistant', content: 'offline-fixture:' + prompts[1], provider: 'pi-docker-fixture', stopReason: 'stop' } }];
  const lines = entries => entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  for (const [i, phase] of (stopOnly ? ['seed'] : ['seed', 'restored']).entries()) {
    const id = String(i + 1).repeat(64), pid = 100 + i * 100;
    const state = { sessionId: 'stable-session', sessionFile: reference, sessionName: f.title,
      cwd: f.expectedCwd, headerCwd: f.expectedCwd, hostname: id.slice(0, 12),
      users: prompts.slice(0, i + 1), assistants: prompts.slice(0, i + 1).map(s => 'offline-fixture:' + s) };
    const paneId = i ? 'w1:p2' : 'w1:p1'; // Changing pane ID is permitted, not required.
    const agent = { pane_id: paneId, agent: 'pi', agent_status: 'idle',
      agent_session: { source: 'herdr:pi', agent: 'pi', kind: 'path', value: reference } };
    const snapshot = { version: '0.9.5', workspaces: [{}], tabs: [{}],
      panes: [{ pane_id: paneId, cwd: f.selected }], agents: [agent] };
    const prefix = `data/config/phase3-restart-${phase}`;
    const startup = { ...state, users: i ? prompts.slice(0, 1) : [], assistants: i ? ['offline-fixture:' + prompts[0]] : [] };
    json(`${prefix}-startup.json`, { phase, paneId, observation: startup });
    json(`${prefix}-checkpoint.json`, { phase, paneId, observation: state,
      provider: { ...state, piVersion: '1.5.2', stage: 'settled', hasHerdr: true }, snapshot, reported: agent });
    json(`${prefix}-snapshot.json`, { result: { snapshot } });
    json(`logs/${phase}-live-snapshot.json`, ok(['--session', f.session, 'api', 'snapshot'], JSON.stringify({ result: { snapshot } })));
    json(`logs/${phase}-runtime.json`, { version: 1, session: f.session,
      cli: ok(['--version'], 'herdr 0.9.5\n'),
      status: ok(['--session', f.session, 'status', 'server', '--json'], JSON.stringify({ status: 'running', running: true,
        version: '0.9.5', compatible: true, session: f.session, socket: `${f.sessionDirectory}/herdr.sock` })),
      server: { stat: stat(pid, 1, pid * 10), bootId, exe: '/usr/local/bin/herdr' },
      shellStat: stat(pid + 1, pid, pid * 10 + 1, 'bash'),
      socket: { path: `${f.sessionDirectory}/herdr.sock`, dev: '1', ino: String(pid) },
      customLookup: ok(['image', 'ls', '--filter', 'reference=pi-docker:custom', '--format', '{{.Repository}}:{{.Tag}}'], 'pi-docker:custom\n'),
      imageInspect: ok(['image', 'inspect', 'pi-docker:custom', '--format', '{{.Id}}'], 'sha256:' + 'b'.repeat(64) + '\n'),
      containerId: id,
      containerInspect: ok(['inspect', '--format', CONTAINER_FORMAT, id], JSON.stringify({ id, hostname: id.slice(0, 12),
        running: true, image: 'pi-docker:custom', imageId: 'sha256:' + 'b'.repeat(64),
        labels: { 'pi-docker.phase3-run': f.project, 'com.docker.compose.project': f.project } })) });
    put(`logs/launch-${phase}/process.stat`, stat(pid + 2, pid + 1, pid * 10 + 2, 'bash'));
    put(`logs/launch-${phase}/shell.stat`, stat(pid + 1, pid, pid * 10 + 1, 'bash'));
    put(`logs/launch-${phase}/argv.nul`, (i ? ['--session', reference] : [f.selected, '--name', 'backend', '--herdr']).join('\0') + '\0');
    put(`logs/launch-${phase}/cwd.txt`, f.selected + '\n');
    put(`logs/launch-${phase}/executable.txt`, f.root + '/bin/pi\n'); put(`logs/launch-${phase}/outcome.txt`, 'uncertain\n');
    put(`logs/${phase}.jsonl`, lines(i ? restoredEntries : seedEntries)); put(`logs/${phase}.record`, record);
    states[phase] = state; snapshots[phase] = snapshot;
  }
  const initial = structuredClone(snapshots.seed); initial.agents = [];
  json('logs/seed-preflight-snapshot.json', { result: { snapshot: initial } });
  put('logs/stopped.jsonl', lines(seedEntries)); put('logs/stopped.record', record);
  json('logs/stopped-session.json', { version: 3, workspaces: [{ id: 'w1', identity_cwd: f.selected,
    public_pane_numbers: { 0: 1 }, public_tab_numbers: [1], tabs: [{ layout: { Pane: 0 }, panes: {
      0: { cwd: f.selected, agent_session: { source: 'herdr:pi', agent: 'pi', kind: 'path', value: reference } } } }] }] });
  json('logs/stopped-session-history.json', { version: 3, workspaces: [{ tabs: [{ panes: { 0: { ansi: 'saved-screen-not-conversation', lines: 1 } } }] }] });
  json('logs/stopped-boundary.json', { version: 1, session: f.session,
    serverProbe: { pid: 100, bootId, status: 'absent', code: 'ENOENT' },
    sockets: ['herdr.sock', 'herdr-client.sock'].map(name => ({ path: `${f.sessionDirectory}/${name}`, status: 'absent', code: 'ENOENT' })) });
  json('logs/stop-command.json', ok(['session', 'stop', f.session], '{}\n'));
  const stages = ['entry-seed', 'seed-checkpoint', 'stop', 'entry-restored', 'restored-checkpoint', 'finish'];
  const events = stages.slice(0, stopOnly ? 3 : 6).flatMap((step, i) => ['uncertain', 'confirmed_success'].map((outcome, j) =>
    ({ step, outcome, session: f.session, at: new Date(1700000000000 + (i * 2 + j) * 1000).toISOString() })));
  put('logs/receipts.jsonl', lines(events));
  for (const [phase, at] of [['seed', 1699999999500], ...(!stopOnly ? [['restored', 1700000005500]] : [])])
    json(`logs/entry-${phase}-approval.json`, { phase, session: f.session, answer: f.session, disposable: true,
      observation: 'Synthetic entry approval; not a real authorization', at: new Date(at).toISOString() });
  json('logs/stop-approval.json', { session: f.session, answer: f.session, disposable: true,
    observation: 'Synthetic approval; not a real user authorization', serverPid: 100, at: new Date(1700000003500).toISOString() });
  for (const boundary of ['pre-entry', 'stopped', ...(stopOnly ? [] : ['final'])]) for (const kind of ['run', 'project'])
    json(`logs/${boundary}-containers-${kind}.json`, ok(['ps', '--all', '--filter',
      `label=${kind === 'run' ? 'pi-docker.phase3-run' : 'com.docker.compose.project'}=${f.project}`, '--format', INVENTORY_FORMAT]));
  const storage = storageFor(f, reference);
  put(storage.relative, lines(stopOnly ? seedEntries : restoredEntries)); put(`data/herdr-launches/${storage.key}.record`, record);
  const sessionRelative = path.relative(f.root, f.sessionDirectory);
  put(sessionRelative + '/session.json', fs.readFileSync(root + '/logs/stopped-session.json'));
  put(sessionRelative + '/session-history.json', fs.readFileSync(root + '/logs/stopped-session-history.json'));
  if (!stopOnly) {
    json('logs/visual.json', { session: f.session, answer: 'yes', observations: 'Synthetic complete history', manualReopen: false, recoveryUi: false,
      at: new Date(1700000009500).toISOString() });
    json('logs/final-exit.json', { session: f.session, piExitCode: 0, shellReturned: true, observation: 'Synthetic shell returned',
      at: new Date(1700000010500).toISOString() });
    put('logs/final-shell.stat', stat(201, 200, 2001, 'bash'));
  }
  return { root, f, put, json, read, change, events, reference, storage, seedEntries, restoredEntries,
    stop: () => validateStopArtifacts(new EvidenceReader(root), f),
    assess: () => assessRestartArtifacts(new EvidenceReader(root), f) };
}

const boundaryCounts = { 'seed-checkpoint': 2, stop: 3, 'restored-checkpoint': 5, finish: 6 };
function boundaryFixture(t, step, options = {}) {
  const f = fixture(t, { ...options, stopOnly: ['seed-checkpoint', 'stop'].includes(step) });
  const count = boundaryCounts[step];
  const candidate = structuredClone(f.events[count * 2 - 1]);
  const pendingEvents = f.events.slice(0, count * 2 - 1);
  const writeEvents = entries => f.put('logs/receipts.jsonl', entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  writeEvents(pendingEvents);
  return { ...f, candidate, pendingEvents, writeEvents,
    pending: () => validatePendingArtifacts(new EvidenceReader(f.root), f.f, step, candidate) };
}
function treeDigest(root) {
  const result = {};
  const walk = directory => {
    for (const entry of fs.readdirSync(root + '/' + directory, { withFileTypes: true })) {
      const relative = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) walk(relative);
      else { assert.ok(entry.isFile()); result[relative] = hash(fs.readFileSync(root + '/' + relative)); }
    }
  };
  walk(''); return result;
}

for (const caseName of ['ordinary', 'linked']) {
  test(`complete ${caseName} artifact contract validates without claiming frozen-input or live verification`, t => {
    const f = fixture(t, { caseName });
    const result = f.assess();
    assert.equal(result.status, 'restart_artifact_contract_validated'); assert.equal(result.inputsValidated, false);
    assert.equal(result.liveStateInspected, false); assert.equal(result.phase3Complete, false);
    assert.equal(result.lifecycleReceipts, 12); assert.equal(result.reference, f.reference);
    assert.throws(f.stop, /missing, extra|lifecycle steps/);
  });
  test(`${caseName} stopped boundary is only a pre-resume gate, not a restart pass`, t => {
    const f = fixture(t, { caseName, stopOnly: true });
    assert.equal(f.stop().complete, false); assert.equal(f.stop().inputsValidated, false);
    assert.throws(f.assess, /lifecycle steps/);
  });
}

test('copy review rebases artifact reads only, retaining recorded cwd and storage identities', t => {
  const f = fixture(t, { caseName: 'linked', recordedRoot: '/tmp/pi-docker-restart.original' });
  assert.equal(f.assess().reference, f.reference);
  assert.ok(f.read('data/config/phase3-restart-restored-checkpoint.json').observation.cwd.startsWith('/tmp/pi-docker-restart.original/'));
});

test('raw stat parser preserves start ticks, handles parentheses and does not equate PID reuse with same lifetime', () => {
  const raw = stat(42, 1, '12345678901234567890', 'herdr ) name');
  assert.equal(parseProcessStat(raw).comm, 'herdr ) name');
  assert.equal(parseProcessStat(raw).startTicks, '12345678901234567890');
  for (const bad of ['', '42 herdr S 1', stat(42, 0, 10), stat(42, 1, 0), raw + 'extra\n']) assert.throws(() => parseProcessStat(bad));
});

test('PID reuse with different start ticks remains a distinct server lifetime', t => {
  const f = fixture(t);
  f.change('logs/restored-runtime.json', r => { r.server.stat = stat(100, 1, 2000); r.shellStat = stat(201, 100, 2001, 'bash'); });
  f.put('logs/launch-restored/shell.stat', stat(201, 100, 2001, 'bash'));
  f.put('logs/final-shell.stat', stat(201, 100, 2001, 'bash'));
  assert.equal(f.assess().serverLifetimes[1][0], 100);
});

test('socket inode reuse is permitted only with saved disappearance and new process evidence', t => {
  const f = fixture(t); f.change('logs/restored-runtime.json', r => { r.socket.ino = '100'; });
  assert.equal(f.assess().inputsValidated, false);
  f.change('logs/stopped-boundary.json', r => { r.sockets[0].status = 'present'; });
  assert.throws(f.assess, /socket disappearance/);
});

const failures = {
  'same server lifetime': f => f.change('logs/restored-runtime.json', r => { r.server.stat = stat(100, 1, 1000); r.shellStat = stat(201, 100, 2001, 'bash');
    f.put('logs/launch-restored/shell.stat', r.shellStat); }),
  'server executable changed': f => f.change('logs/restored-runtime.json', r => { r.server.exe = '/another/herdr'; }),
  'implicit status target': f => f.change('logs/restored-runtime.json', r => { r.status.argv = ['status', 'server', '--json']; }),
  'implicit fresh snapshot target': f => f.change('logs/restored-live-snapshot.json', r => { r.argv = ['api', 'snapshot']; }),
  'failed fresh snapshot query': f => f.change('logs/restored-live-snapshot.json', r => { r.exitCode = 1; }),
  'stale fresh snapshot reference': f => f.change('logs/restored-live-snapshot.json', r => {
    const raw = JSON.parse(r.stdout); raw.result.snapshot.agents[0].agent_session.value = '/old.jsonl'; r.stdout = JSON.stringify(raw); }),
  'fresh snapshot extra pane': f => f.change('logs/restored-live-snapshot.json', r => {
    const raw = JSON.parse(r.stdout); raw.result.snapshot.panes.push({ pane_id: 'other' }); r.stdout = JSON.stringify(raw); }),
  'fresh snapshot working agent': f => f.change('logs/restored-live-snapshot.json', r => {
    const raw = JSON.parse(r.stdout); raw.result.snapshot.agents[0].agent_status = 'working'; r.stdout = JSON.stringify(raw); }),
  'host reboot outside scope': f => f.change('logs/restored-runtime.json', r => { r.server.bootId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; }),
  'container reused': f => f.change('logs/restored-runtime.json', r => { r.containerId = '1'.repeat(64); r.containerInspect.argv[3] = r.containerId;
    const c = JSON.parse(r.containerInspect.stdout); c.id = r.containerId; c.hostname = r.containerId.slice(0, 12); r.containerInspect.stdout = JSON.stringify(c); }),
  'container belongs to other project': f => f.change('logs/restored-runtime.json', r => {
    const c = JSON.parse(r.containerInspect.stdout); c.labels['pi-docker.phase3-run'] = 'other'; r.containerInspect.stdout = JSON.stringify(c); }),
  'image replaced': f => f.change('logs/restored-runtime.json', r => { r.imageInspect.stdout = 'sha256:' + 'c'.repeat(64); }),
  'image lookup failed not absence': f => f.change('logs/restored-runtime.json', r => { r.customLookup.exitCode = 1; r.customLookup.stdout = ''; }),
  'stale official ref': f => f.change('data/config/phase3-restart-restored-checkpoint.json', r => { r.reported.agent_session.value = '/stale.jsonl'; }),
  'provider snapshot replacement': f => f.change('data/config/phase3-restart-restored-checkpoint.json', r => { r.provider.sessionId = 'new'; }),
  'replacement conversation ID': f => f.change('data/config/phase3-restart-restored-checkpoint.json', r => { r.observation.sessionId = 'new'; }),
  'lost startup history': f => f.change('data/config/phase3-restart-restored-startup.json', r => { r.observation.users = []; }),
  'observer failure': f => f.put('data/config/phase3-restart-seed-error.txt', 'STOP'),
  'wrong shell ancestor': f => f.change('logs/restored-runtime.json', r => { r.shellStat = stat(201, 999, 2001, 'bash'); }),
  'shell predates recorded server': f => f.change('logs/restored-runtime.json', r => {
    r.shellStat = stat(201, 200, 1999, 'bash'); f.put('logs/launch-restored/shell.stat', r.shellStat); }),
  'wrong native argv': f => f.put('logs/launch-restored/argv.nul', '--continue\0'),
  'native argv trailing bytes': f => f.put('logs/launch-restored/argv.nul', '--session\0' + f.reference + '\0extra'),
  'rewritten raw reservation': f => f.put('logs/launch-seed/outcome.txt', 'confirmed_success\n'),
  'duplicate launch': f => f.put('logs/launch-restored-again/argv.nul', '--continue\0'),
  'missing restored launch': f => fs.rmSync(f.root + '/logs/launch-restored', { recursive: true }),
  'default session stopped': f => f.change('logs/stop-command.json', r => { r.argv = ['session', 'stop', 'default']; }),
  'stop timeout': f => f.change('logs/stop-command.json', r => { r.timedOut = true; }),
  'no explicit approval': f => f.change('logs/stop-approval.json', r => { r.answer = 'yes'; }),
  'wrong initial entry approval': f => f.change('logs/entry-seed-approval.json', r => { r.session = 'default'; }),
  're-entry approval before stop completed': f => f.change('logs/entry-restored-approval.json', r => { r.at = new Date(1700000004500).toISOString(); }),
  'late approval': f => f.change('logs/stop-approval.json', r => { r.at = new Date(1700000009000).toISOString(); }),
  'server still alive': f => f.change('logs/stopped-boundary.json', r => { r.serverProbe.status = 'present'; }),
  'failed absence check': f => f.change('logs/stopped-boundary.json', r => { r.serverProbe.code = 'EACCES'; }),
  'same process mistaken for PID reuse': f => f.change('logs/stopped-boundary.json', r => { r.serverProbe.status = 'replaced'; r.serverProbe.stat = stat(100, 1, 1000); }),
  'unrelated PID mistaken for reuse': f => f.change('logs/stopped-boundary.json', r => { r.serverProbe.status = 'replaced'; r.serverProbe.stat = stat(999, 1, 2000); }),
  'missing socket boundary': f => f.change('logs/stopped-boundary.json', r => { r.sockets.pop(); }),
  'custom resume override': f => f.change('logs/stopped-session.json', r => { r.workspaces[0].tabs[0].panes[0].agent_resume = { source: 'custom', agent: 'pi', argv: ['pi', '--continue'] }; }),
  'missing recorded selected cwd': f => f.change('logs/stopped-session.json', r => { r.workspaces[0].tabs[0].panes[0].cwd = '/gone'; }),
  'removed selected fixture directory': f => fs.rmSync(f.f.selected, { recursive: true }),
  'wrong stopped public pane': f => f.change('logs/stopped-session.json', r => { r.workspaces[0].public_pane_numbers[0] = 7; }),
  'unsupported stopped format': f => f.change('logs/stopped-session.json', r => { r.version = 2; }),
  'stop changed history bytes': f => f.put('logs/stopped.jsonl', fs.readFileSync(f.root + '/logs/seed.jsonl', 'utf8').replace('"id":"name"', '"id": "name"')),
  'changed v3 record': f => f.put('logs/restored.record', `pi-docker-herdr-v3\0${f.f.selected}\0other\0`),
  'later host history mutation': f => f.put(f.storage.relative, fs.readFileSync(f.root + '/logs/restored.jsonl', 'utf8') + '{}\n'),
  'later host record mutation': f => f.put(`data/herdr-launches/${f.storage.key}.record`, 'changed'),
  'manual reopen declared': f => f.change('logs/visual.json', r => { r.manualReopen = true; }),
  'visual check failed': f => f.change('logs/visual.json', r => { r.answer = 'no'; }),
  'Continue Fork fallback': f => f.change('logs/visual.json', r => { r.recoveryUi = true; }),
  'no visual observation': f => f.change('logs/visual.json', r => { r.observations = ''; }),
  'whitespace-only visual observation': f => f.change('logs/visual.json', r => { r.observations = '   '; }),
  'visual confirmation before restored turn': f => f.change('logs/visual.json', r => { r.at = new Date(1700000006500).toISOString(); }),
  'Pi exit nonzero': f => f.change('logs/final-exit.json', r => { r.piExitCode = 1; }),
  'old exit observation reused': f => f.change('logs/final-exit.json', r => { r.at = new Date(1700000006500).toISOString(); }),
  'shell not foreground': f => f.put('logs/final-shell.stat', stat(201, 200, 2001, 'bash', 202)),
  'retained container after stop': f => f.change('logs/stopped-containers-run.json', r => { r.stdout = 'old-container\n'; }),
  'retained project container at finish': f => f.change('logs/final-containers-project.json', r => { r.stdout = 'container\n'; }),
  'inventory query failure': f => f.change('logs/final-containers-project.json', r => { r.exitCode = 1; }),
  'inventory query wrong target': f => f.change('logs/pre-entry-containers-run.json', r => { r.argv[3] = 'label=other'; }),
  'missing lifecycle outcome': f => f.put('logs/receipts.jsonl', f.events.slice(0, -1).map(JSON.stringify).join('\n') + '\n'),
  'repeated lifecycle stage': f => { f.events[6].step = 'stop'; f.put('logs/receipts.jsonl', f.events.map(JSON.stringify).join('\n') + '\n'); },
  'failed lifecycle outcome': f => { f.events[5].outcome = 'confirmed_failure'; f.put('logs/receipts.jsonl', f.events.map(JSON.stringify).join('\n') + '\n'); },
};
for (const [name, mutate] of Object.entries(failures)) test(`artifact assessor rejects ${name}`, t => {
  const f = fixture(t); mutate(f); assert.throws(f.assess);
});

test('persisted-only identity without live official checkpoint never passes', t => {
  const f = fixture(t); f.change('data/config/phase3-restart-restored-snapshot.json', r => { r.result.snapshot.agents = []; });
  assert.throws(f.assess, /raw official snapshot/);
});

test('branching and prefix rewriting cannot masquerade as continuation', t => {
  const f = fixture(t);
  const entries = structuredClone(f.restoredEntries); entries[4].parentId = 'name';
  f.put('logs/restored.jsonl', entries.map(JSON.stringify).join('\n') + '\n');
  assert.throws(f.assess, /nonlinear/);
  f.put('logs/restored.jsonl', f.restoredEntries.map(e => JSON.stringify(e, null, ' ')).join('\n') + '\n');
  assert.throws(f.assess);
});

test('read-only reader rejects aliases, traversal, special files and symlink evidence', t => {
  const f = fixture(t), reader = new EvidenceReader(f.root);
  for (const name of ['../outside', '/absolute', 'logs/../logs/visual.json', '.env', 'logs/.env.private']) assert.throws(() => reader.bytes(name));
  fs.symlinkSync(f.root + '/logs/visual.json', f.root + '/logs/alias'); assert.throws(() => reader.bytes('logs/alias'), /symlink/);
  fs.symlinkSync('/not-existing', f.root + '/logs/dangling'); assert.throws(() => reader.absent('logs/dangling'), /symlink/);
  assert.throws(() => reader.bytes('logs'), /invalid evidence type/);
  const alias = f.root + '-alias'; fs.symlinkSync(f.root, alias); assert.throws(() => new EvidenceReader(alias), /canonical/);
});

test('public input validation pins hashes and reporter, with no synthetic success bypass', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-pinned-unit-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const f = prepare({ caseName: 'ordinary', parent, env: { PATH: process.env.PATH, HOME: parent } });
  const reader = new EvidenceReader(f.root);
  assert.equal(OFFICIAL_REPORTER_SHA256.length, 64);
  // A harmless synthetic file must not be accepted as the official reporter.
  fs.writeFileSync(f.root + '/data/config/extensions/herdr-agent-state.ts', '// not official\n');
  assert.throws(() => validateInputs(reader), /reporter bytes mismatch/);
  assert.throws(() => assessRestart(f.root), /reporter bytes mismatch/);
  assert.throws(() => validateStop(f.root), /reporter bytes mismatch/);
  fs.appendFileSync(f.root + '/lib/herdr-launch.sh', '\n#changed\n');
  assert.throws(() => validateInputs(reader), /changed immutable input/);
});

test('hash manifest cannot redirect reads outside the fixture', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-hash-unit-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const f = prepare({ caseName: 'ordinary', parent, env: { PATH: process.env.PATH, HOME: parent } });
  const manifest = 'a'.repeat(64) + '  /must-not-read\n'; fs.writeFileSync(f.root + '/inputs.sha256', manifest);
  const preparation = JSON.parse(fs.readFileSync(f.root + '/preparation.json'));
  preparation.inputsSha256 = hash(manifest); fs.writeFileSync(f.root + '/preparation.json', JSON.stringify(preparation));
  assert.throws(() => validateInputs(new EvidenceReader(f.root)), /outside recorded fixture/);
});

test('aggregate rejects reuse even when the restored checkpoint and container receipt agree', t => {
  const f = fixture(t);
  f.change('logs/restored-runtime.json', r => {
    r.containerId = '1'.repeat(64); r.containerInspect.argv[3] = r.containerId;
    const c = JSON.parse(r.containerInspect.stdout); c.id = r.containerId; c.hostname = r.containerId.slice(0, 12);
    r.containerInspect.stdout = JSON.stringify(c);
  });
  for (const suffix of ['startup', 'checkpoint']) f.change(`data/config/phase3-restart-restored-${suffix}.json`, r => {
    r.observation.hostname = '1'.repeat(12); if (r.provider) r.provider.hostname = r.observation.hostname;
  });
  assert.throws(f.assess, /container was reused/);
});

test('aggregate rejects a locally consistent replacement conversation ID', t => {
  const f = fixture(t);
  for (const suffix of ['startup', 'checkpoint']) f.change(`data/config/phase3-restart-restored-${suffix}.json`, r => {
    r.observation.sessionId = 'replacement'; if (r.provider) r.provider.sessionId = 'replacement';
  });
  assert.throws(f.assess, /restore replaced sessionId/);
});

test('aggregate rejects a locally consistent replacement conversation file', t => {
  const f = fixture(t), reference = f.reference.replace('conversation.jsonl', 'replacement.jsonl');
  for (const suffix of ['startup', 'checkpoint']) f.change(`data/config/phase3-restart-restored-${suffix}.json`, r => {
    r.observation.sessionFile = reference;
    if (r.provider) {
      r.provider.sessionFile = reference; r.reported.agent_session.value = reference;
      r.snapshot.agents[0].agent_session.value = reference;
      f.json('data/config/phase3-restart-restored-snapshot.json', { result: { snapshot: r.snapshot } });
      f.json('logs/restored-live-snapshot.json', ok(['--session', f.f.session, 'api', 'snapshot'], JSON.stringify({ result: { snapshot: r.snapshot } })));
    }
  });
  assert.throws(f.assess, /restore replaced sessionFile/);
});

test('stable base-image selection validates; a real availability switch does not', t => {
  const f = fixture(t);
  const base = phase => f.change(`logs/${phase}-runtime.json`, r => {
    r.customLookup.stdout = ''; r.imageInspect.argv[2] = 'pi-docker:base';
    const c = JSON.parse(r.containerInspect.stdout); c.image = 'pi-docker:base'; r.containerInspect.stdout = JSON.stringify(c);
  });
  base('restored'); assert.throws(f.assess, /image availability changed/);
  base('seed'); assert.equal(f.assess().inputsValidated, false);
});

test('check-stop compares archives with actual saved files before allowing re-entry', t => {
  const f = fixture(t, { stopOnly: true });
  f.put(path.relative(f.f.root, f.f.sessionDirectory) + '/session.json', '{}\n');
  assert.throws(f.stop, /archive differs/);
});

test('linked retention does not silently accept missing or redirected fixture metadata', t => {
  const f = fixture(t, { caseName: 'linked' });
  f.put('fixtures/linked checkout/.git', 'gitdir: /outside\n');
  assert.throws(f.assess, /gitfile missing\/changed/);
});

test('evidence reader detects replacement of its root during review', t => {
  const f = fixture(t), reader = new EvidenceReader(f.root);
  fs.renameSync(f.root, f.root + '-old'); fs.mkdirSync(f.root);
  assert.throws(() => reader.bytes('logs/visual.json'), /root replaced/);
});

test('public hash validator handles quoted/backslash paths without reading a substitute reporter', t => {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-escape-unit-'));
  t.after(() => fs.rmSync(top, { recursive: true, force: true }));
  const parent = path.join(top, "quote ' and back\\slash"); fs.mkdirSync(parent);
  const f = prepare({ caseName: 'ordinary', parent, env: { PATH: process.env.PATH, HOME: top } });
  fs.writeFileSync(f.root + '/data/config/extensions/herdr-agent-state.ts', '// not official\n');
  assert.throws(() => validateInputs(new EvidenceReader(f.root)), /reporter bytes mismatch/);
});

for (const caseName of ['ordinary', 'linked']) for (const phase of ['seed', 'restored'])
  test(`${caseName} ${phase} checkpoint contract needs no later stop/finish evidence`, t => {
    const f = fixture(t, { caseName, stopOnly: phase === 'seed' });
    const count = phase === 'seed' ? 2 : 5;
    f.put('logs/receipts.jsonl', f.events.slice(0, count * 2).map(e => JSON.stringify(e)).join('\n') + '\n');
    const future = phase === 'seed' ? ['stop-command.json', 'stopped-boundary.json', 'stopped.jsonl', 'stopped.record',
      'stopped-session.json', 'stopped-session-history.json'] : ['visual.json', 'final-exit.json', 'final-shell.stat',
      'final-containers-run.json', 'final-containers-project.json'];
    for (const name of future) fs.unlinkSync(f.root + '/logs/' + name); // test-owned synthetic files only
    const before = treeDigest(f.root);
    const result = validateCheckpointArtifacts(new EvidenceReader(f.root), f.f, phase);
    assert.equal(result.phase, phase); assert.equal(result.complete, false); assert.equal(result.inputsValidated, false);
    assert.deepEqual(treeDigest(f.root), before);
  });

for (const caseName of ['ordinary', 'linked']) for (const step of Object.keys(boundaryCounts))
  test(`${caseName} pending ${step} projects one receipt without publishing or claiming input verification`, t => {
    // The linked case also models a retained copy: only artifact lookup rebases.
    const f = boundaryFixture(t, step, { caseName, recordedRoot: caseName === 'linked' ? '/tmp/pi-restart-original' : undefined });
    const before = treeDigest(f.root);
    const result = f.pending();
    assert.equal(result.status, 'pending_artifact_contract_validated'); assert.equal(result.inputsValidated, false);
    assert.equal(result.receiptPending, true); assert.equal(result.pendingStep, step); assert.equal(result.complete, false);
    assert.equal(result.liveStateInspected, false); assert.equal(result.phase3Complete, false);
    assert.deepEqual(treeDigest(f.root), before);
    const reader = new EvidenceReader(f.root);
    assert.throws(() => step === 'stop' ? validateStopArtifacts(reader, f.f) : step === 'finish' ? assessRestartArtifacts(reader, f.f) :
      validateCheckpointArtifacts(reader, f.f, step === 'seed-checkpoint' ? 'seed' : 'restored'), /lifecycle/);
  });

const pendingFailures = {
  'wrong target': f => { f.candidate.session = 'default'; },
  'wrong step': f => { f.candidate.step = 'entry-seed'; },
  'failed outcome': f => { f.candidate.outcome = 'confirmed_failure'; },
  'missing field': f => { delete f.candidate.at; },
  'extra bypass property': f => { f.candidate.skipInputs = true; },
  'timestamp before uncertainty': f => { f.candidate.at = new Date(Date.parse(f.pendingEvents.at(-1).at) - 1).toISOString(); },
  'already published': f => f.writeEvents([...f.pendingEvents, f.candidate]),
  'unconfirmed prior receipt': f => { const rows = structuredClone(f.pendingEvents); rows[1].outcome = 'uncertain'; f.writeEvents(rows); },
  'extra uncertain receipt': f => f.writeEvents([...f.pendingEvents, f.pendingEvents.at(-1)]),
  'partial journal': f => f.put('logs/receipts.jsonl', f.pendingEvents.map(e => JSON.stringify(e)).join('\n')),
};
for (const step of Object.keys(boundaryCounts)) for (const [name, mutate] of Object.entries(pendingFailures))
  test(`pending ${step} rejects ${name} without rewriting evidence`, t => {
    const f = boundaryFixture(t, step); mutate(f); const before = treeDigest(f.root);
    assert.throws(f.pending); assert.deepEqual(treeDigest(f.root), before);
  });

test('pending checkpoint and stop/finish validation preserves every substantive evidence check', t => {
  const seed = boundaryFixture(t, 'seed-checkpoint'); seed.put(seed.storage.relative, 'changed\n'); assert.throws(seed.pending, /conversation/);
  const stop = boundaryFixture(t, 'stop'); stop.change('logs/stopped-containers-run.json', r => { r.stdout = 'retained\n'; });
  assert.throws(stop.pending, /retained/);
  const restored = boundaryFixture(t, 'restored-checkpoint');
  restored.change('logs/restored-runtime.json', r => { r.server.stat = stat(100, 1, 1000); r.shellStat = stat(201, 100, 2001, 'bash');
    restored.put('logs/launch-restored/shell.stat', r.shellStat); });
  assert.throws(restored.pending, /new server lifetime/);
  const finish = boundaryFixture(t, 'finish'); finish.change('logs/visual.json', r => { r.manualReopen = true; });
  assert.throws(finish.pending, /visual/);
});

test('pending helper refuses unsupported stages and does not mutate the supplied reader', t => {
  const f = boundaryFixture(t, 'stop'), reader = new EvidenceReader(f.root), before = reader.text('logs/receipts.jsonl');
  for (const step of ['entry-seed', 'entry-restored', '__proto__', 'constructor', 'unknown'])
    assert.throws(() => validatePendingArtifacts(reader, f.f, step, f.candidate), /unsupported/);
  validatePendingArtifacts(reader, f.f, 'stop', f.candidate); assert.equal(reader.text('logs/receipts.jsonl'), before);
  for (const phase of ['SEED', '', null, '__proto__'])
    assert.throws(() => validateCheckpointArtifacts(reader, f.f, phase), /unknown checkpoint/);
  const stale = boundaryFixture(t, 'stop'), staleReader = new EvidenceReader(stale.root);
  const originalText = staleReader.text.bind(staleReader);
  staleReader.text = relative => {
    const text = originalText(relative);
    if (relative === 'logs/receipts.jsonl') { fs.renameSync(stale.root, stale.root + '-moved'); fs.mkdirSync(stale.root, { mode: 0o700 }); }
    return text;
  };
  assert.throws(() => validatePendingArtifacts(staleReader, stale.f, 'stop', stale.candidate), /root replaced/);
});

test('public pending/checkpoint gates always pin actual inputs/reporter and never accept synthetic opt-outs', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-pending-public-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const f = prepare({ caseName: 'ordinary', parent, env: { PATH: process.env.PATH, HOME: parent } });
  fs.writeFileSync(f.root + '/data/config/extensions/herdr-agent-state.ts', '// not the official reporter\n');
  const before = treeDigest(f.root);
  for (const phase of ['seed', 'restored']) assert.throws(() => validateCheckpoint(f.root, phase), /official.*reporter/);
  for (const step of Object.keys(boundaryCounts)) {
    const candidate = { step, session: f.session, outcome: 'confirmed_success', at: new Date().toISOString() };
    assert.throws(() => validatePending(f.root, step, candidate, { skipInputs: true, reporterHash: 'fake' }), /official.*reporter/);
  }
  assert.deepEqual(treeDigest(f.root), before);
  fs.appendFileSync(f.root + '/control/server-restart-control.mjs', '\n// changed\n');
  assert.throws(() => validatePending(f.root, 'stop', {}), /changed immutable/);
  fs.writeFileSync(f.root + '/logs/controller-failure.json', '{}\n');
  assert.throws(() => validateCheckpoint(f.root, 'seed'), /controller failure/);
  assert.throws(() => validatePending(f.root, 'stop', {}), /controller failure/);
});

test('CLI help/import/invalid modes are inert and cannot arm or repair evidence', t => {
  const f = fixture(t), before = fs.readdirSync(f.root + '/logs').sort();
  const env = { PATH: '/not-used', HOME: '/not-used', HERDR_ENV: '1', HERDR_PANE_ID: 'inert', HERDR_SOCKET_PATH: '/not-a-socket' };
  const help = spawnSync(process.execPath, [driver, '--help'], { env, encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /Read-only/);
  for (const args of [[], ['--run', f.root], ['--restart', f.root], ['--assess'], ['--check-stop', f.root, 'extra']])
    assert.notEqual(spawnSync(process.execPath, [driver, ...args], { env }).status, 0);
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('../host/server-restart-evidence.mjs', import.meta.url).href)})`], { env, encoding: 'utf8' });
  assert.equal(imported.status, 0); assert.equal(imported.stdout + imported.stderr, '');
  assert.deepEqual(fs.readdirSync(f.root + '/logs').sort(), before);
});
