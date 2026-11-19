#!/usr/bin/env node
// TEST ONLY. Read-only validation of saved restart evidence. No process, socket,
// Docker, Herdr, Git, or network access; never creates/repairs missing evidence.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isDeepStrictEqual as equal } from 'node:util';
import { fileURLToPath } from 'node:url';

// Pinned upstream reporter bytes, independent of evidence-supplied hashes.
// Keep this contract test-only, not a production loader.
export const OFFICIAL_REPORTER_SHA256 = '2c5272d732b475bbf91a027203b1f98d25fe43d2c1402530a442b288aeaca1e4';
export const CONTAINER_FORMAT = '{"id":{{json .Id}},"hostname":{{json .Config.Hostname}},"running":{{json .State.Running}},"image":{{json .Config.Image}},"imageId":{{json .Image}},"labels":{{json .Config.Labels}}}';
export const INVENTORY_FORMAT = '{{.ID}} {{.Names}} {{.Status}}';
const stages = ['entry-seed', 'seed-checkpoint', 'stop', 'entry-restored', 'restored-checkpoint', 'finish'];
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const clean = s => typeof s === 'string' && s.length > 0 && !/[\x00-\x1f\x7f]/.test(s);
const absolute = s => clean(s) && path.isAbsolute(s) && path.normalize(s) === s;
const note = s => clean(s) && s.trim().length > 0;
const timestamp = s => typeof s === 'string' && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const same = (a, b, message) => requireThat(equal(a, b), message);
const one = (array, label) => { requireThat(Array.isArray(array) && array.length === 1, `${label}: expected exactly one`); return array[0]; };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseProcessStat(raw) {
  requireThat(typeof raw === 'string', 'missing raw process stat');
  const match = /^(\d+) \(([^\n]*)\) ([^\n]+)\n?$/.exec(raw);
  requireThat(match, 'malformed process stat');
  const fields = match[3].trim().split(/\s+/);
  requireThat(fields.length >= 20 && /^[A-Z]$/.test(fields[0]) && fields.slice(1).every(s => /^-?\d+$/.test(s)), 'malformed process stat fields');
  const [pid, ppid, pgrp, tpgid] = [match[1], fields[1], fields[2], fields[5]].map(Number);
  requireThat([pid, ppid, pgrp].every(n => Number.isSafeInteger(n) && n > 0) && Number.isSafeInteger(tpgid) && /^[1-9]\d*$/.test(fields[19]), 'invalid process identity');
  return { pid, ppid, pgrp, tpgid, startTicks: fields[19], state: fields[0], comm: match[2] };
}
const processIdentity = stat => [stat.pid, stat.startTicks];
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const positive = value => typeof value === 'string' && /^[1-9]\d*$/.test(value);

// The reader rebases only artifact paths when reviewing a copied fixture. All
// recorded host selections/refs remain original bytes; no restore migration.
export class EvidenceReader {
  constructor(directory) {
    requireThat(absolute(directory) && fs.realpathSync(directory) === directory, 'evidence directory must be an existing canonical absolute path');
    requireThat(fs.lstatSync(directory).isDirectory(), 'evidence root must be a directory');
    this.root = directory;
    const stat = fs.lstatSync(directory); this.identity = [stat.dev, stat.ino];
  }
  file(relative, directory = false) {
    const rootStat = fs.lstatSync(this.root);
    requireThat(rootStat.isDirectory() && !rootStat.isSymbolicLink() && equal([rootStat.dev, rootStat.ino], this.identity), 'evidence root replaced during review');
    requireThat(clean(relative) && !path.isAbsolute(relative) && path.normalize(relative) === relative &&
      !relative.split('/').some(p => p === '..' || p === '.' || /^\.env(?:\.|$)/.test(p)), 'unsafe evidence relative path');
    let file = this.root;
    const parts = relative.split('/');
    for (const [i, component] of parts.entries()) {
      file = path.join(file, component);
      const stat = fs.lstatSync(file);
      requireThat(!stat.isSymbolicLink(), `symlink evidence is unsupported: ${relative}`);
      requireThat(i === parts.length - 1 && !directory ? stat.isFile() : stat.isDirectory(), `invalid evidence type: ${relative}`);
    }
    return file;
  }
  bytes(relative) {
    const file = this.file(relative), fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const before = fs.fstatSync(fd);
      requireThat(before.isFile() && before.size > 0 && before.size <= 16 * 1024 * 1024, `empty/oversized evidence: ${relative}`);
      const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd);
      requireThat(before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, `evidence changed during read: ${relative}`);
      return bytes;
    } finally { fs.closeSync(fd); }
  }
  text(relative) { const bytes = this.bytes(relative), text = bytes.toString('utf8'); requireThat(Buffer.from(text).equals(bytes), `invalid UTF-8: ${relative}`); return text; }
  json(relative) { return JSON.parse(this.text(relative)); }
  names(relative) { return fs.readdirSync(this.file(relative, true)).sort(); }
  absent(relative) {
    // lstat, unlike existsSync, does not hide dangling symlinks or access errors.
    try { this.file(relative); return false; } catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  }
}

// Preparation validation is separate so a future reviewed controller can
// validate its private inputs BEFORE the official installer creates the reporter.
// It is not a live-entry approval or a substitute for validateInputs at gates.
export function validatePreparation(r) {
  same(r.text('data/config/phase3-fixture'), 'pi-docker-phase3-fixture\n', 'not a private fixture');
  same(r.text('data/config/phase3-restart'), 'pi-docker-phase3-restart\n', 'not a restart fixture');
  const f = r.json('control/fixture.json'), preparation = r.json('preparation.json');
  requireThat(object(f) && f.version === 1 && f.scope === 'automatic-server-restart' && absolute(f.root) &&
    ['ordinary', 'linked'].includes(f.caseName) && /^pi-restart-[a-z0-9]+$/.test(f.session ?? ''), 'invalid fixture contract');
  same(f.status, 'prepared_only_not_run_ready', 'unsupported fixture format/state');
  same(f.terminalWorkflow, 'two_normal_host_terminals', 'unsupported operator workflow');
  same(f.project, f.session, 'wrong Compose project'); same(f.storageName, 'backend', 'wrong storage name');
  same(f.title, `Phase3 Restart ${f.caseName}`, 'wrong fixture title');
  same(f.selected, path.join(f.root, f.caseName === 'ordinary' ? 'fixtures/ordinary' : 'fixtures/linked checkout/packages/backend'), 'wrong exact selected directory');
  same(f.expectedCwd, f.caseName === 'ordinary' ? '/workspace' : f.selected, 'wrong expected mount cwd');
  same(f.sessionDirectory, path.join(f.root, 'herdr-config/herdr/sessions', f.session), 'wrong private session directory');
  for (const [key, value] of Object.entries(f)) same(preparation[key], value, `preparation/fixture mismatch: ${key}`);
  const manifest = r.text('inputs.sha256');
  same(digest(Buffer.from(manifest)), preparation.inputsSha256, 'input manifest changed');
  requireThat(manifest.endsWith('\n'), 'incomplete input manifest');
  const entries = new Set();
  for (const line of manifest.slice(0, -1).split('\n')) {
    const match = /^(\\?)([a-f0-9]{64})  (.+)$/.exec(line); requireThat(match, 'invalid input hash line');
    let original = match[3];
    if (match[1]) {
      requireThat(!/\\(?!\\)/.test(original.replaceAll('\\\\', '')), 'unsupported input filename escape');
      original = original.replaceAll('\\\\', '\\');
    }
    requireThat(original.startsWith(f.root + '/'), 'input hash outside recorded fixture');
    const relative = original.slice(f.root.length + 1);
    requireThat(/^(bin|lib|docs|extensions|skills|images)\//.test(relative) ||
      /^(README\.md|compose(?:\.production|\.git|\.herdr|\.metadata)?\.yaml)$/.test(relative) ||
      /^control\/(fixture\.json|environment\.sh|shell|shims\/pi|INSTRUCTIONS\.txt|preparation-source\.mjs|design\.md|evidence-contract\.md|runbook\.md|host-tools\.json|server-restart-(?:evidence|control|live)\.mjs|pane-helpers\.sh|finish\.sh)$/.test(relative) ||
      relative === 'herdr-config/herdr/config.toml' ||
      /^data\/config\/(auth\.json|settings\.json|phase3-fixture|phase3-restart(?:\.json)?|extensions\/phase3-(?:fixture|restart-checkpoint)\.ts)$/.test(relative), `unexpected immutable input path: ${relative}`);
    requireThat(!entries.has(relative), 'duplicate input hash'); entries.add(relative);
    same(digest(r.bytes(relative)), match[2], `changed immutable input: ${relative}`);
  }
  for (const required of ['bin/pi', 'lib/herdr-launch.sh', 'lib/workspace-mounts.sh', 'compose.yaml', 'compose.production.yaml',
    'compose.herdr.yaml', 'compose.metadata.yaml', 'control/fixture.json', 'control/environment.sh', 'control/shell',
    'control/shims/pi', 'control/host-tools.json', 'control/server-restart-control.mjs', 'control/server-restart-evidence.mjs',
    'control/design.md', 'control/evidence-contract.md', 'control/runbook.md', 'control/server-restart-live.mjs', 'control/pane-helpers.sh', 'control/finish.sh', 'herdr-config/herdr/config.toml', 'data/config/extensions/phase3-fixture.ts', 'data/config/extensions/phase3-restart-checkpoint.ts'])
    requireThat(entries.has(required), `missing immutable hash: ${required}`);
  return f;
}
export function validateInputs(r) {
  requireThat(r.absent('logs/controller-failure.json'), 'controller failure recorded; inspect, do not retry');
  const f = validatePreparation(r);
  same(digest(r.bytes('data/config/extensions/herdr-agent-state.ts')), OFFICIAL_REPORTER_SHA256, 'official 0.9.5 reporter bytes mismatch');
  return f;
}

function command(result, argv, label) {
  requireThat(object(result), `${label}: missing command receipt`);
  same(result.argv, argv, `${label}: wrong command/target`);
  requireThat(result.exitCode === 0 && result.signal === null && result.error === null && result.timedOut === false &&
    result.truncated === false && typeof result.stdout === 'string' && typeof result.stderr === 'string', `${label}: failed/uncertain command`);
  return result.stdout;
}
function inventory(r, f, boundary) {
  for (const kind of ['run', 'project']) {
    const filter = `label=${kind === 'run' ? 'pi-docker.phase3-run' : 'com.docker.compose.project'}=${f.project}`;
    const output = command(r.json(`logs/${boundary}-containers-${kind}.json`), ['ps', '--all', '--filter', filter, '--format', INVENTORY_FORMAT], `${boundary} ${kind} inventory`);
    requireThat(output.trim() === '', `${boundary}: retained containers`);
  }
}
function receipts(r, f, count) {
  const raw = r.text('logs/receipts.jsonl'); requireThat(raw.endsWith('\n'), 'incomplete lifecycle receipt');
  const all = raw.slice(0, -1).split('\n').map(JSON.parse);
  requireThat(all.length === count * 2, 'missing, extra or repeated lifecycle steps');
  let previous = -1;
  for (const [i, receipt] of all.entries()) {
    same(receipt.step, stages[Math.floor(i / 2)], 'out-of-order/retried lifecycle step');
    same(receipt.outcome, i % 2 ? 'confirmed_success' : 'uncertain', 'failed/incomplete lifecycle outcome');
    same(receipt.session, f.session, 'receipt session mismatch');
    const at = Date.parse(receipt.at); requireThat(timestamp(receipt.at) && at >= previous, 'unordered/invalid lifecycle timestamps'); previous = at;
  }
  return all;
}
function observation(f, state, users) {
  requireThat(object(state) && clean(state.sessionId) && /^[a-f0-9]{12}$/.test(state.hostname ?? ''), 'missing conversation/container identity');
  same(state.cwd, f.expectedCwd, 'wrong conversation cwd'); same(state.headerCwd, f.expectedCwd, 'wrong header cwd');
  same(state.sessionName, f.title, 'wrong conversation title');
  same(state.users, users, 'lost/replaced user history'); same(state.assistants, users.map(s => 'offline-fixture:' + s), 'lost/replaced assistant history');
}
export function storageFor(f, reference) {
  const key = digest(Buffer.from(`pi-docker-herdr-v3\0${f.selected}\0${f.storageName}`));
  const match = /^\/pi\/herdr-sessions\/([a-f0-9]{64})\/([a-zA-Z0-9][a-zA-Z0-9_.-]*\.jsonl)$/.exec(reference ?? '');
  requireThat(match && match[1] === key, 'wrong official managed reference/storage key');
  return { key, relative: `data/sessions/${f.storageName}-${digest(Buffer.from(f.selected)).slice(0, 12)}/${match[2]}` };
}
function checkpoint(r, f, phase) {
  const prefix = `data/config/phase3-restart-${phase}`;
  requireThat(r.absent(`${prefix}-error.txt`), `${phase}: observer failed`);
  const check = r.json(`${prefix}-checkpoint.json`), start = r.json(`${prefix}-startup.json`);
  same(check.phase, phase, 'checkpoint phase mismatch'); same(start.phase, phase, 'startup phase mismatch');
  requireThat(clean(check.paneId) && check.paneId === start.paneId, 'missing/mismatched checkpoint pane');
  const users = [`phase3-restart-${f.caseName}-seed`, ...(phase === 'restored' ? [`phase3-restart-${f.caseName}-restored`] : [])];
  observation(f, check.observation, users);
  requireThat(object(start.observation), 'missing startup observation');
  for (const key of ['sessionId', 'sessionFile', 'hostname', 'cwd', 'headerCwd']) same(start.observation[key], check.observation[key], `startup ${key} changed`);
  if (phase === 'restored') observation(f, start.observation, users.slice(0, 1));
  const provider = check.provider;
  requireThat(provider?.stage === 'settled' && provider.piVersion === '1.5.2' && provider.hasHerdr === true, 'provider not settled/compatible/integrated');
  for (const [key, value] of Object.entries(check.observation)) same(provider[key], value, `provider/checkpoint mismatch: ${key}`);
  const raw = r.json(`${prefix}-snapshot.json`);
  same(raw?.result?.snapshot, check.snapshot, 'raw official snapshot differs from checkpoint');
  const fresh = JSON.parse(command(r.json(`logs/${phase}-live-snapshot.json`),
    ['--session', f.session, 'api', 'snapshot'], 'fresh host snapshot')).result?.snapshot;
  same(fresh?.version, '0.9.5', 'wrong fresh host snapshot version');
  one(fresh.workspaces, 'fresh workspaces'); one(fresh.tabs, 'fresh tabs');
  const freshPane = one(fresh.panes, 'fresh panes'), freshAgent = one(fresh.agents, 'fresh agents');
  requireThat(freshPane.pane_id === check.paneId && freshPane.cwd === f.selected && freshPane.restore_error == null &&
    freshAgent.pane_id === check.paneId && freshAgent.agent === 'pi' && ['idle', 'done'].includes(freshAgent.agent_status) &&
    !freshAgent.launch_pending && freshAgent.agent_session?.source === 'herdr:pi' && freshAgent.agent_session.agent === 'pi' &&
    freshAgent.agent_session.kind === 'path' && freshAgent.agent_session.value === check.observation.sessionFile,
    'fresh official identity/topology changed after checkpoint');
  const snapshot = check.snapshot;
  same(snapshot?.version, '0.9.5', 'wrong live server version');
  one(snapshot.workspaces, 'live workspaces'); one(snapshot.tabs, 'live tabs');
  const pane = one(snapshot.panes, 'live panes'), agent = one(snapshot.agents, 'live agents');
  same(pane.pane_id, check.paneId, 'live pane mismatch'); same(pane.cwd, f.selected, 'saved shell cwd differs from exact selection');
  requireThat(pane.restore_error == null, 'pane restore error');
  same(agent, check.reported, 'official checkpoint agent mismatch');
  requireThat(agent.pane_id === check.paneId && agent.agent === 'pi' && ['idle', 'done'].includes(agent.agent_status) && !agent.launch_pending, 'not a live settled Pi');
  requireThat(agent.agent_session?.source === 'herdr:pi' && agent.agent_session.agent === 'pi' &&
    agent.agent_session.kind === 'path' && agent.agent_session.value === check.observation.sessionFile, 'official identity/path mismatch');
  return { check, start, storage: storageFor(f, agent.agent_session.value), pane, users };
}

export function validateStoppedSnapshot(snapshot, { reference, cwd, paneId }) {
  same(snapshot?.version, 3, 'unsupported stopped snapshot version');
  const ws = one(snapshot.workspaces, 'stopped workspaces'), tab = one(ws.tabs, 'stopped tabs');
  requireThat(object(tab.panes), 'missing stopped panes');
  const rawId = one(Object.keys(tab.panes), 'stopped panes'); requireThat(/^\d+$/.test(rawId), 'invalid raw pane id');
  const pane = tab.panes[rawId];
  same(tab.layout, { Pane: Number(rawId) }, 'stopped layout differs from single pane');
  same(pane.cwd, cwd, 'stopped shell cwd mismatch');
  same(pane.agent_session, { source: 'herdr:pi', agent: 'pi', kind: 'path', value: reference }, 'stopped official reference mismatch');
  requireThat(pane.agent_resume == null, 'custom resume argv must not substitute for native restore');
  const number = ws.public_pane_numbers?.[rawId];
  requireThat(Number.isSafeInteger(number) && number > 0 && `${ws.id}:p${number}` === paneId, 'stopped public pane mapping mismatch');
  return { cwd, reference, paneId };
}
function history(r, f, label, check) {
  const bytes = r.bytes(`logs/${label}.jsonl`), raw = bytes.toString('utf8');
  requireThat(raw.endsWith('\n') && Buffer.from(raw).equals(bytes), 'incomplete/non-UTF8 conversation');
  const entries = raw.slice(0, -1).split('\n').map(JSON.parse), header = entries[0];
  requireThat(header?.type === 'session' && header.id === check.observation.sessionId && header.cwd === f.expectedCwd, 'persisted conversation header mismatch');
  const messages = entries.filter(e => e.type === 'message').map(e => e.message);
  const text = content => typeof content === 'string' ? content : content.filter(c => c.type === 'text').map(c => c.text).join('');
  same(messages.filter(m => m.role === 'user').map(m => text(m.content)), check.observation.users, 'persisted user history differs');
  same(messages.filter(m => m.role === 'assistant').map(m => text(m.content)), check.observation.assistants, 'persisted assistant history differs');
  requireThat(messages.every(m => m.role === 'user' || (m.role === 'assistant' && m.provider === 'pi-docker-fixture' && m.stopReason === 'stop')), 'unexpected provider/tool/unfinished message');
  requireThat(!entries.some(e => ['compaction', 'branch_summary'].includes(e.type)), 'unexpected branched/compacted fixture history');
  same(entries.filter(e => e.type === 'session_info').at(-1)?.name, f.title, 'persisted conversation title differs');
  // This fixture does no branching/rewind; reject duplicate IDs and forks rather
  // than flattening multiple branches into apparent successful continuation.
  const ids = new Set(); let parent = null;
  for (const entry of entries.slice(1)) {
    requireThat(clean(entry.id) && !ids.has(entry.id) && entry.parentId === parent, 'nonlinear/duplicate conversation entries');
    ids.add(entry.id); parent = entry.id;
  }
  return bytes;
}
function record(r, f, label) {
  const expected = Buffer.from(`pi-docker-herdr-v3\0${f.selected}\0${f.storageName}\0`), bytes = r.bytes(`logs/${label}.record`);
  requireThat(bytes.equals(expected), `${label}: changed/invalid v3 record`); return bytes;
}
// Internal raw-artifact validation, not a frozen-input or execution gate.
export function validateRuntimeArtifacts(r, f, phase, check) {
  const value = r.json(`logs/${phase}-runtime.json`);
  requireThat(value.version === 1 && value.session === f.session, 'wrong runtime receipt scope');
  same(command(value.cli, ['--version'], 'Herdr CLI').trim(), 'herdr 0.9.5', 'wrong CLI version');
  const status = JSON.parse(command(value.status, ['--session', f.session, 'status', 'server', '--json'], 'Herdr status'));
  requireThat(status.status === 'running' && status.running === true && status.version === '0.9.5' &&
    status.compatible === true && status.session === f.session && status.socket === `${f.sessionDirectory}/herdr.sock`, 'wrong live server/session/socket');
  const proc = parseProcessStat(value.server?.stat), shell = parseProcessStat(value.shellStat);
  requireThat(uuid(value.server.bootId) && absolute(value.server.exe) && proc.state !== 'Z' && proc.comm === 'herdr', 'invalid live server process evidence');
  const launch = parseProcessStat(r.text(`logs/launch-${phase}/process.stat`));
  const launchShell = parseProcessStat(r.text(`logs/launch-${phase}/shell.stat`));
  same(processIdentity(launchShell), processIdentity(shell), 'launch/runtime shell identity mismatch');
  same(launch.ppid, shell.pid, 'launcher is not a child of recorded shell'); same(shell.ppid, proc.pid, 'shell is not a child of recorded server');
  requireThat(launch.state !== 'Z' && shell.state !== 'Z', 'dead launcher/shell evidence');
  requireThat(BigInt(shell.startTicks) >= BigInt(proc.startTicks) && BigInt(launch.startTicks) >= BigInt(shell.startTicks), 'impossible server/shell/launcher start ordering');
  same(r.text(`logs/launch-${phase}/cwd.txt`), f.selected + '\n', 'launcher exact cwd mismatch');
  same(r.text(`logs/launch-${phase}/executable.txt`), `${f.root}/bin/pi\n`, 'wrong launcher executable');
  same(r.text(`logs/launch-${phase}/outcome.txt`), 'uncertain\n', 'raw launch reservation was rewritten');
  const socket = value.socket;
  requireThat(socket?.path === status.socket && positive(socket.dev) && positive(socket.ino), 'missing socket identity');
  const custom = command(value.customLookup, ['image', 'ls', '--filter', 'reference=pi-docker:custom', '--format', '{{.Repository}}:{{.Tag}}'], 'custom image lookup').trim();
  requireThat(custom === '' || custom === 'pi-docker:custom', 'ambiguous image availability');
  const tag = custom || 'pi-docker:base';
  const imageId = command(value.imageInspect, ['image', 'inspect', tag, '--format', '{{.Id}}'], 'image inspection').trim();
  requireThat(/^sha256:[a-f0-9]{64}$/.test(imageId), 'invalid image ID');
  const container = JSON.parse(command(value.containerInspect,
    ['inspect', '--format', CONTAINER_FORMAT, value.containerId], 'container inspection'));
  requireThat(/^[a-f0-9]{64}$/.test(value.containerId ?? '') && container.id === value.containerId &&
    container.hostname === check.observation.hostname && container.hostname === container.id.slice(0, 12) && container.running === true &&
    container.image === tag && container.imageId === imageId && container.labels?.['pi-docker.phase3-run'] === f.project &&
    container.labels?.['com.docker.compose.project'] === f.project, 'wrong/reused/stopped fixture container');
  return { proc, shell, bootId: value.server.bootId, exe: value.server.exe, socket, container, imageId, tag };
}
function launches(r, allowed) {
  same(r.names('logs').filter(n => n.startsWith('launch-')), allowed.map(p => `launch-${p}`).sort(), 'missing/extra launch reservations');
}
function entryApproval(r, f, phase, events) {
  const approval = r.json(`logs/entry-${phase}-approval.json`);
  requireThat(approval.phase === phase && approval.session === f.session && approval.answer === f.session &&
    approval.disposable === true && note(approval.observation), 'missing/mismatched explicit disposable entry approval');
  const at = Date.parse(approval.at), entry = phase === 'seed' ? 0 : 6;
  requireThat(timestamp(approval.at) && at <= Date.parse(events[entry].at) &&
    (phase === 'seed' || at >= Date.parse(events[entry - 1].at)), 'entry approval outside its lifecycle boundary');
}
function stopBoundary(r, f, seedRuntime, seed, events) {
  const approval = r.json('logs/stop-approval.json');
  requireThat(approval.session === f.session && approval.answer === f.session && approval.disposable === true &&
    note(approval.observation) && approval.serverPid === seedRuntime.proc.pid, 'missing/mismatched explicit disposable stop approval');
  const at = Date.parse(approval.at);
  requireThat(timestamp(approval.at) && at >= Date.parse(events[3].at) && at <= Date.parse(events[4].at), 'stop approval outside seed/stop boundary');
  command(r.json('logs/stop-command.json'), ['session', 'stop', f.session], 'named session stop');
  const stopped = r.json('logs/stopped-boundary.json');
  requireThat(stopped.version === 1 && stopped.session === f.session, 'wrong stopped-boundary scope');
  const probe = stopped.serverProbe;
  requireThat(probe?.pid === seedRuntime.proc.pid && probe.bootId === seedRuntime.bootId, 'wrong stopped server probe');
  requireThat((probe.status === 'absent' && probe.code === 'ENOENT') ||
    (probe.status === 'replaced' && parseProcessStat(probe.stat).pid === probe.pid &&
      !equal(processIdentity(parseProcessStat(probe.stat)), processIdentity(seedRuntime.proc))), 'old server still alive or termination uncertain');
  requireThat(Array.isArray(stopped.sockets) && stopped.sockets.length === 2, 'missing socket disappearance evidence');
  for (const [i, name] of ['herdr.sock', 'herdr-client.sock'].entries()) {
    const socket = stopped.sockets[i];
    requireThat(socket.path === `${f.sessionDirectory}/${name}` && socket.status === 'absent' && socket.code === 'ENOENT', 'socket disappearance not confirmed');
  }
  inventory(r, f, 'stopped');
  validateStoppedSnapshot(r.json('logs/stopped-session.json'), {
    reference: seed.check.observation.sessionFile, cwd: f.selected, paneId: seed.check.paneId });
  const historySnapshot = r.json('logs/stopped-session-history.json');
  same(historySnapshot?.version, 3, 'unsupported stopped history snapshot');
  one(one(historySnapshot.workspaces, 'stopped history workspaces').tabs, 'stopped history tabs');
}
function seedEvidence(r, f, events) {
  // Retention check only, not a second implementation of production Git mount
  // discovery. A copied fixture keeps literal host gitfile pointers unchanged.
  r.file(path.relative(f.root, f.selected), true);
  if (f.caseName === 'linked') {
    const pointer = r.text('fixtures/linked checkout/.git');
    requireThat(pointer.endsWith('\n') && clean(pointer.slice(0, -1)) &&
      pointer.startsWith(`gitdir: ${f.root}/fixtures/main/.git/worktrees/`), 'retained fixture linked gitfile missing/changed');
    r.file('fixtures/main/.git', true);
  }
  entryApproval(r, f, 'seed', events);
  inventory(r, f, 'pre-entry');
  const seed = checkpoint(r, f, 'seed'), live = validateRuntimeArtifacts(r, f, 'seed', seed.check);
  const initial = r.json('logs/seed-preflight-snapshot.json')?.result?.snapshot;
  same(initial?.version, '0.9.5', 'wrong seed preflight version');
  one(initial.workspaces, 'seed preflight workspaces'); one(initial.tabs, 'seed preflight tabs');
  const pane = one(initial.panes, 'seed preflight panes');
  requireThat(pane.pane_id === seed.check.paneId && pane.cwd === f.selected && pane.agent_session == null &&
    Array.isArray(initial.agents) && initial.agents.length === 0, 'seed did not start in an empty selected shell');
  const seedHistory = history(r, f, 'seed', seed.check), seedRecord = record(r, f, 'seed');
  const argv = r.text('logs/launch-seed/argv.nul').split('\0');
  same(argv, [f.selected, '--name', 'backend', '--herdr', ''], 'unexpected seed launcher argv');
  return { f, events, seed, live, seedHistory, seedRecord };
}
function stopEvidence(r, f, complete, count = complete ? 6 : 3) {
  const events = receipts(r, f, count);
  if (!complete) launches(r, ['seed']);
  const { seed, live, seedHistory, seedRecord } = seedEvidence(r, f, events);
  requireThat(history(r, f, 'stopped', seed.check).equals(seedHistory), 'stopping changed conversation bytes');
  requireThat(record(r, f, 'stopped').equals(seedRecord), 'stopping changed launch record');
  stopBoundary(r, f, live, seed, events);
  if (!complete) {
    requireThat(r.bytes(seed.storage.relative).equals(seedHistory), 'stopped host conversation differs from seed');
    requireThat(r.bytes(`data/herdr-launches/${seed.storage.key}.record`).equals(seedRecord), 'stopped host record differs from seed');
    const sessionRelative = path.relative(f.root, f.sessionDirectory);
    for (const [liveName, copyName] of [['session.json', 'stopped-session.json'], ['session-history.json', 'stopped-session-history.json']])
      requireThat(r.bytes(`${sessionRelative}/${liveName}`).equals(r.bytes(`logs/${copyName}`)), 'stopped persistence archive differs from saved session');
  }
  return { f, events, seed, live, seedHistory, seedRecord };
}

// Artifact-contract core is separately testable without vendoring/executing the
// official reporter. Only the public directory wrappers below validate frozen
// inputs and pinned reporter bytes; core results must not be used as a gate.
export function validateStopArtifacts(r, fixture) {
  const { f, seed } = stopEvidence(r, fixture, false);
  return { status: 'stopped_artifact_contract_validated', scope: 'automatic-server-restart', caseName: f.caseName,
    session: f.session, reference: seed.check.observation.sessionFile, complete: false,
    inputsValidated: false, liveStateInspected: false, phase3Complete: false };
}
function restoredEvidence(r, fixture, count = 6) {
  const { f, events, seed, live, seedHistory, seedRecord } = stopEvidence(r, fixture, true, count);
  launches(r, ['seed', 'restored']);
  entryApproval(r, f, 'restored', events);
  const restored = checkpoint(r, f, 'restored'), after = validateRuntimeArtifacts(r, f, 'restored', restored.check);
  for (const field of ['sessionId', 'sessionFile', 'sessionName', 'cwd', 'headerCwd'])
    same(restored.check.observation[field], seed.check.observation[field], `restore replaced ${field}`);
  same(after.bootId, live.bootId, 'host reboot is outside graceful server-restart scope');
  requireThat(!equal(processIdentity(after.proc), processIdentity(live.proc)), 'reattach/handoff is not a new server lifetime');
  requireThat(BigInt(after.proc.startTicks) >= BigInt(live.proc.startTicks), 'restored server predates seed server');
  same(after.exe, live.exe, 'server executable changed');
  requireThat(!equal(processIdentity(after.shell), processIdentity(live.shell)), 'shell process was reused');
  requireThat(after.container.id !== live.container.id, 'container was reused');
  same(after.tag, live.tag, 'image availability changed'); same(after.imageId, live.imageId, 'image bytes changed');
  same(r.text('logs/launch-restored/argv.nul').split('\0'), ['--session', seed.check.observation.sessionFile, ''], 'restore did not use exact native argv');
  const restoredHistory = history(r, f, 'restored', restored.check);
  requireThat(restoredHistory.subarray(0, seedHistory.length).equals(seedHistory), 'restored file rewrote original conversation bytes');
  requireThat(record(r, f, 'restored').equals(seedRecord), 'restore changed v3 record');
  requireThat(r.bytes(restored.storage.relative).equals(restoredHistory), 'final host conversation changed or wrong storage selected');
  requireThat(r.bytes(`data/herdr-launches/${seed.storage.key}.record`).equals(seedRecord), 'final host launch record changed');
  return { f, events, seed, live, after };
}
export function assessRestartArtifacts(r, fixture) {
  const { f, events, seed, live, after } = restoredEvidence(r, fixture);
  const visual = r.json('logs/visual.json');
  requireThat(visual.session === f.session && visual.answer === 'yes' && note(visual.observations) &&
    visual.manualReopen === false && visual.recoveryUi === false, 'visual history/automatic-start confirmation missing/failed');
  requireThat(timestamp(visual.at) && Date.parse(visual.at) >= Date.parse(events[9].at) &&
    Date.parse(visual.at) <= Date.parse(events[10].at), 'visual check outside restored/finish boundary');
  const exit = r.json('logs/final-exit.json'), shell = parseProcessStat(r.text('logs/final-shell.stat'));
  requireThat(exit.session === f.session && exit.piExitCode === 0 && exit.shellReturned === true && note(exit.observation), 'final Pi exit/shell return unconfirmed');
  requireThat(timestamp(exit.at) && Date.parse(exit.at) >= Date.parse(events[10].at) &&
    Date.parse(exit.at) <= Date.parse(events[11].at), 'exit observation outside finish boundary');
  same(processIdentity(shell), processIdentity(after.shell), 'final shell identity differs');
  requireThat(shell.state !== 'Z' && shell.pgrp === shell.tpgid && shell.ppid === after.proc.pid, 'shell is not back in the foreground under the restored server');
  inventory(r, f, 'final');
  return { status: 'restart_artifact_contract_validated', scope: 'automatic-server-restart', caseName: f.caseName,
    session: f.session, reference: seed.check.observation.sessionFile, sessionId: seed.check.observation.sessionId,
    serverLifetimes: [processIdentity(live.proc), processIdentity(after.proc)],
    containerIds: [live.container.id, after.container.id], lifecycleReceipts: events.length,
    inputsValidated: false, liveStateInspected: false, phase3Complete: false };
}
// Checkpoint gates stop before stop/finish: no later artifacts are invented or
// required. Raw helper results remain non-authoritative synthetic contracts.
export function validateCheckpointArtifacts(r, fixture, phase) {
  requireThat(['seed', 'restored'].includes(phase), 'unknown checkpoint phase');
  let evidence;
  if (phase === 'seed') {
    const events = receipts(r, fixture, 2); launches(r, ['seed']);
    evidence = seedEvidence(r, fixture, events);
    requireThat(r.bytes(evidence.seed.storage.relative).equals(evidence.seedHistory), 'open seed host conversation changed');
    requireThat(r.bytes(`data/herdr-launches/${evidence.seed.storage.key}.record`).equals(evidence.seedRecord), 'open seed host record changed');
  } else evidence = restoredEvidence(r, fixture, 5);
  return { status: 'checkpoint_artifact_contract_validated', phase, caseName: fixture.caseName,
    session: fixture.session, reference: evidence.seed.check.observation.sessionFile,
    complete: false, inputsValidated: false, liveStateInspected: false, phase3Complete: false };
}
// Entry is checked against real saved evidence before and after its receipt is
// published. Restored entry deliberately remains uncertain until the continued
// turn/checkpoint is available; this never launches or types into restored Pi.
export function validateEntry(directory, phase, state = 'saved') {
  requireThat(['seed', 'restored'].includes(phase) && ['pending', 'saved'].includes(state), 'invalid entry gate');
  const r = new EvidenceReader(directory), f = validateInputs(r), count = phase === 'seed' ? 1 : 4;
  let view = r;
  if (state === 'pending') {
    const raw = r.text('logs/receipts.jsonl'); requireThat(raw.endsWith('\n'), 'incomplete entry journal');
    const rows = raw.slice(0, -1).split('\n').map(JSON.parse);
    requireThat(rows.length === count * 2 - 1 && rows.at(-1).outcome === 'uncertain', 'wrong uncertain entry boundary');
    view = new PendingReceiptReader(r, raw + JSON.stringify({ ...rows.at(-1), outcome: 'confirmed_success' }) + '\n');
  }
  const events = receipts(view, f, count); entryApproval(view, f, phase, events);
  if (phase === 'restored') restoredEvidence(view, f, 4);
  else {
    inventory(view, f, 'pre-entry'); launches(view, []);
    const snapshot = view.json('logs/seed-preflight-snapshot.json')?.result?.snapshot;
    same(snapshot?.version, '0.9.5', 'wrong initial server version');
    one(snapshot.workspaces, 'initial workspaces'); one(snapshot.tabs, 'initial tabs');
    const pane = one(snapshot.panes, 'initial panes'), ready = view.json('logs/ready-runtime.json');
    requireThat(pane.pane_id === ready.paneId && pane.cwd === f.selected && pane.agent_session == null &&
      pane.restore_error == null && Array.isArray(snapshot.agents) && snapshot.agents.length === 0, 'initial shell is not empty/selected');
    const shell = parseProcessStat(view.text('logs/ready-shell.stat')), server = parseProcessStat(ready.server.stat);
    requireThat(shell.pgrp === shell.tpgid && shell.ppid === server.pid && shell.state !== 'Z' && server.state !== 'Z' &&
      server.comm === 'herdr' && BigInt(shell.startTicks) >= BigInt(server.startTicks) && uuid(ready.server.bootId) && absolute(ready.server.exe),
      'invalid genuine ready shell/server ancestry');
    const status = JSON.parse(command(view.json('logs/ready-status.json'), ['--session', f.session, 'status', 'server', '--json'], 'ready named status'));
    requireThat(status.running === true && status.status === 'running' && status.compatible === true && status.version === '0.9.5' &&
      status.session === f.session && status.socket === `${f.sessionDirectory}/herdr.sock`, 'wrong initial named server');
    same(view.text('control/phase'), 'unarmed\n', 'seed armed before ready gate');
    same(view.text('data/config/phase3-restart-stage'), 'unarmed\n', 'observer armed before ready gate');
  }
  return { status: 'entry_evidence_validated', phase, session: f.session, receiptPending: state === 'pending',
    complete: false, inputsValidated: true, liveStateInspected: false, phase3Complete: false };
}
export function validateCheckpoint(directory, phase) {
  const r = new EvidenceReader(directory), f = validateInputs(r);
  return { ...validateCheckpointArtifacts(r, f, phase), status: 'checkpoint_evidence_validated', inputsValidated: true };
}

// Only the lifecycle text is projected; every other byte is read from disk.
// Caller-supplied readers, input validators and reporter hashes are not accepted
// by the public functions. The ordinary saved-directory gate is still required
// AFTER publication; pending validation is never authority to execute re-entry.
class PendingReceiptReader extends EvidenceReader {
  constructor(reader, raw) {
    super(reader.root); same(this.identity, reader.identity, 'evidence root replaced during pending validation');
    this.pending = raw;
  }
  text(relative) { return relative === 'logs/receipts.jsonl' ? this.pending : super.text(relative); }
}
const pendingCounts = { 'seed-checkpoint': 2, stop: 3, 'restored-checkpoint': 5, finish: 6 };
export function validatePendingArtifacts(r, fixture, step, candidate) {
  requireThat(Object.hasOwn(pendingCounts, step), 'unsupported pending boundary');
  requireThat(object(candidate) && equal(Object.keys(candidate).sort(), ['at', 'outcome', 'session', 'step']) &&
    candidate.step === step && candidate.session === fixture.session && candidate.outcome === 'confirmed_success' && timestamp(candidate.at),
    'invalid proposed success receipt');
  const raw = r.text('logs/receipts.jsonl'); requireThat(raw.endsWith('\n'), 'incomplete lifecycle receipt');
  requireThat(raw.slice(0, -1).split('\n').length === pendingCounts[step] * 2 - 1, 'pending boundary needs exactly one unfinished final receipt');
  const projected = new PendingReceiptReader(r, raw + JSON.stringify(candidate) + '\n');
  const result = step === 'stop' ? validateStopArtifacts(projected, fixture) : step === 'finish' ? assessRestartArtifacts(projected, fixture) :
    validateCheckpointArtifacts(projected, fixture, step === 'seed-checkpoint' ? 'seed' : 'restored');
  return { ...result, status: 'pending_artifact_contract_validated', pendingStep: step, receiptPending: true, complete: false, inputsValidated: false };
}
export function validatePending(directory, step, candidate) {
  const r = new EvidenceReader(directory), f = validateInputs(r);
  return { ...validatePendingArtifacts(r, f, step, candidate), status: 'pending_evidence_validated', inputsValidated: true };
}
export function validateStop(directory) {
  const r = new EvidenceReader(directory), f = validateInputs(r);
  return { ...validateStopArtifacts(r, f), status: 'stopped_evidence_validated', inputsValidated: true };
}
export function assessRestart(directory) {
  const r = new EvidenceReader(directory), f = validateInputs(r);
  return { ...assessRestartArtifacts(r, f), status: 'saved_evidence_validated', inputsValidated: true };
}
export function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: node tests/host/server-restart-evidence.mjs --check-stop|--assess ABSOLUTE_FIXTURE_DIRECTORY\nRead-only saved-evidence validation; never contacts Herdr/Docker or authorizes execution.\nNo fixture is created, armed, repaired or deleted. No live state or overall Phase 3 PASS is asserted.'); return;
  }
  requireThat(args.length === 2 && ['--check-stop', '--assess'].includes(args[0]), 'choose --check-stop or --assess and one absolute fixture directory');
  console.log(JSON.stringify((args[0] === '--check-stop' ? validateStop : assessRestart)(args[1]), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`STOP: ${error.message}`); process.exitCode = 1; }
}
