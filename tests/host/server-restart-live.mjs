#!/usr/bin/env node
// TEST ONLY. Human-run, named disposable-session procedure. Import/help/plan are
// inert. Every live command requires the explicit review flag and frozen entry.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual as equal } from 'node:util';
import { ArtifactStore, StepLedger, CollectorCore, ReadOnlyRunner, localObservations,
  assertHostContext, privateEnvironment } from './server-restart-control.mjs';
import { validatePreparation, validateInputs, validateEntry, validateCheckpoint, validateStop,
  assessRestart, parseProcessStat, storageFor, INVENTORY_FORMAT } from './server-restart-evidence.mjs';
const must = (ok, message) => { if (!ok) throw new Error(message); };
const clean = s => typeof s === 'string' && s.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(s);
const quote = s => `'${s.replaceAll("'", "'\\''")}'`;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identity = raw => { const s = parseProcessStat(raw); return [s.pid, s.startTicks]; };
const clock = () => new Date().toISOString();
export const liveCommands = ['enter-seed', 'ready', 'collect-seed', 'stop', 'enter-restored', 'collect-restored', 'finish'];
const insideCommands = ['ready', 'finish'];
const good = result => {
  must(result.exitCode === 0 && result.signal === null && result.error === null && !result.timedOut && !result.truncated,
    'command failed/uncertain; retain evidence, no retry or cleanup'); return result;
};
function client(r, f, phase) {
  const result = good(r.json(`logs/entry-${phase}-client.json`));
  must(equal(result.argv, ['--session', f.session]), 'client receipt targets another session'); return result;
}
function resolve(name, search) {
  for (const directory of search.split(':')) {
    if (!path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, name);
    try { fs.accessSync(candidate, fs.constants.X_OK); if (fs.statSync(candidate).isFile()) return fs.realpathSync(candidate); } catch { /* discovery only */ }
  }
  throw new Error(`required host executable unavailable: ${name}`);
}
function fingerprint(filename) {
  const stat = fs.statSync(filename, { bigint: true });
  must(stat.isFile(), 'host executable is not regular');
  return { file: filename, dev: String(stat.dev), ino: String(stat.ino), size: String(stat.size),
    mtimeNs: String(stat.mtimeNs), ctimeNs: String(stat.ctimeNs), sha256: hash(fs.readFileSync(filename)) };
}
function envelope(argv, result) {
  let stdout = '', stderr = '', encodingError = false;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    stdout = decoder.decode(result.stdout ?? Buffer.alloc(0)); stderr = decoder.decode(result.stderr ?? Buffer.alloc(0));
  } catch { encodingError = true; }
  return { argv, stdout, stderr, exitCode: result.status ?? null, signal: result.signal ?? null,
    error: result.error?.code ?? (result.error ? 'spawn_error' : encodingError ? 'INVALID_UTF8' : null),
    timedOut: result.error?.code === 'ETIMEDOUT', truncated: result.error?.code === 'ENOBUFS',
    ...(encodingError ? { stdoutBase64: Buffer.from(result.stdout ?? '').toString('base64'), stderrBase64: Buffer.from(result.stderr ?? '').toString('base64') } : {}) };
}
export function hostAdapter() {
  return {
    host: { platform: process.platform, uid: process.getuid?.(), stdinTTY: process.stdin.isTTY === true,
      stdoutTTY: process.stdout.isTTY === true, env: process.env, entryFile: process.argv[1], node: process.execPath, callerPid: process.ppid },
    tools(frozen) {
      const tools = { ...frozen, herdr: resolve('herdr', frozen.path), docker: resolve('docker', frozen.path) };
      for (const name of ['flock', 'realpath', 'timeout', 'cat', 'mkdir', 'uname']) resolve(name, frozen.path);
      return { tools, identities: Object.fromEntries(['herdr', 'docker', 'bash', 'node', 'git', 'sha256sum'].map(k => [k, fingerprint(tools[k])])) };
    },
    checkTools(saved) {
      for (const [key, value] of Object.entries(saved.identities)) {
        const stat = fs.statSync(saved.tools[key], { bigint: true });
        must(stat.isFile() && ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(field => String(stat[field]) === value[field]) &&
          hash(fs.readFileSync(saved.tools[key])) === value.sha256, 'host tool identity/bytes changed');
        if (key !== 'node') must(resolve(key, saved.tools.path) === value.file, 'host PATH executable resolution changed');
      }
    },
    async approve(message, expected) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        console.log(message);
        const answer = await rl.question(`Type exactly ${JSON.stringify(expected)}: `);
        const observation = await rl.question('Describe what you verified (nonblank): ');
        must(answer === expected && clean(observation), 'explicit human confirmation missing');
        return { answer, observation };
      } finally { rl.close(); }
    },
    mutate(kind, argv, env, f, tools) {
      const installer = kind === 'installer';
      must(installer ? equal(argv, ['install']) : equal(argv, ['session', 'stop', f.session]), 'unapproved mutation argv');
      const binary = installer ? `${f.root}/bin/herdr-extension` : tools.herdr;
      let result;
      try { result = spawnSync(binary, argv, { env, cwd: f.root, encoding: 'buffer', input: '', timeout: installer ? 60000 : 25000,
        maxBuffer: 1024 * 1024, shell: false, killSignal: 'SIGKILL' }); } catch (error) { result = { error }; }
      return envelope(argv, result);
    },
    attach(f, tools, env) {
      let result;
      try { result = spawnSync(tools.herdr, ['--session', f.session], { env, cwd: f.selected, stdio: 'inherit', shell: false }); }
      catch (error) { result = { error }; }
      return envelope(['--session', f.session], result);
    },
    observations: localObservations(process.getuid?.()),
    print: text => console.log(text), clock,
  };
}

export function plan(directory) {
  const store = new ArtifactStore(directory), f = validatePreparation(store), frozen = store.json('control/host-tools.json');
  const base = `${quote(frozen.node)} ${quote(f.root + '/control/server-restart-live.mjs')}`;
  const command = op => `${base} ${op} ${quote(f.root)} --execute-reviewed-procedure`;
  return { status: 'review_only_not_execution_approval', fixture: f.root, caseName: f.caseName, session: f.session,
    selected: f.selected, expectedCwd: f.expectedCwd, privateHome: f.root + '/host-home',
    privateHerdrConfig: f.herdrConfigHome, privateHerdrState: f.herdrStateHome, sessionDirectory: f.sessionDirectory,
    dockerConfigPathOnly: f.dockerConfig, inputsSha256: store.json('preparation.json').inputsSha256,
    terminalA: { seedEntry: command('enter-seed') + (f.caseName === 'linked' ? " --ordinary-evidence '/absolute/path/from-completed-ordinary-run'" : ''), paneSetup: `cd -- ${quote(f.selected)} && source ${quote(f.root + '/control/pane-helpers.sh')}`,
      ready: 'restart_ready', seedLaunchSeparateForegroundJob: `pi ${quote(f.selected)} --name backend --herdr`,
      seedUi: [`/name ${f.title}`, `phase3-restart-${f.caseName}-seed`, '/phase3-restart-checkpoint'],
      detachOnlyAfterSeedCollection: 'Ctrl+B, then Q (do NOT /quit)', restoredEntry: command('enter-restored'),
      restoredUi: [`phase3-restart-${f.caseName}-restored`, '/phase3-restart-checkpoint'],
      finish: `After terminal B reserves finish: /quit; then IMMEDIATELY source ${quote(f.root + '/control/finish.sh')} (no intervening command).` },
    terminalB: { collectSeed: command('collect-seed'), separatelyApprovedStop: command('stop'), collectRestoredAndVisual: command('collect-restored') },
    automaticRestoreOnly: true, cleanupProvided: false, hostExecutionAuthorized: false, phase3Complete: false };
}

export class RestartWorkflow {
  constructor(directory, operation, io) {
    must(liveCommands.includes(operation), 'unsupported live operation');
    this.r = new ArtifactStore(directory); this.f = validatePreparation(this.r); this.op = operation; this.io = io;
    must(this.f.root === this.r.root, 'live execution cannot use a copied/rebased fixture');
    assertHostContext(io.host, this.f, insideCommands.includes(operation));
    const stat = fs.lstatSync(directory);
    must(stat.uid === io.host.uid && (stat.mode & 0o777) === 0o700, 'live fixture must be owned by caller and mode 0700');
    must(fs.realpathSync(io.host.entryFile) === `${directory}/control/server-restart-live.mjs`, 'execute the frozen fixture entry, not repository source');
    const frozen = this.r.json('control/host-tools.json');
    must(io.host.node === frozen.node, 'Node interpreter changed');
    this.l = new StepLedger(this.r, this.f, io.clock); this.l.read();
    if (operation !== 'enter-seed') validateInputs(this.r);
    // Reserve the whole command before any query, mutation, confirmation or
    // partial transition. Never release this token, including on cancellation.
    this.r.reserve(`logs/operation-${operation}`);
    this.savedTools = operation === 'enter-seed' ? io.tools(frozen) : this.r.json('logs/host-tools.json');
    io.checkTools(this.savedTools);
    this.env = privateEnvironment(this.f, this.savedTools.tools, io.host.env, insideCommands.includes(operation));
    this.selectors = { context: this.env.DOCKER_CONTEXT ?? null, host: this.env.DOCKER_HOST ?? null };
    if (operation === 'enter-seed') this.r.jsonWrite('logs/host-tools.json', { ...this.savedTools, selectors: this.selectors });
    else must(equal(this.selectors, this.savedTools.selectors), 'Docker selectors changed; do not unset/replay context');
    const runner = io.runner ?? new ReadOnlyRunner({ fixture: this.f, tools: this.savedTools.tools, env: this.env });
    this.c = new CollectorCore({ store: this.r, fixture: this.f, ledger: this.l, runner, observations: io.observations, clock: io.clock });
  }
  async run(args = {}) {
    try {
      if (this.op === 'enter-seed' && this.f.caseName === 'linked') {
        must(clean(args.ordinaryEvidence) && path.isAbsolute(args.ordinaryEvidence), 'linked entry requires completed ordinary evidence');
        const ordinary = new ArtifactStore(args.ordinaryEvidence), meta = validateInputs(ordinary);
        must(meta.caseName === 'ordinary' && meta.root === ordinary.root && ordinary.root !== this.r.root, 'ordinary prerequisite must be the original separate ordinary fixture');
        const result = assessRestart(ordinary.root);
        must(new StepLedger(ordinary, meta).read().length === 12, 'ordinary publication incomplete');
        client(ordinary, meta, 'restored');
        this.r.jsonWrite('logs/ordinary-prerequisite.json', { directory: ordinary.root, session: result.session, reference: result.reference });
      }
      this.localDaemon();
      return await this[this.op.replaceAll('-', '_')](args);
    } catch (error) {
      // Global failure also blocks completed-but-not-followed-up journal rows.
      if (this.r.absent('logs/controller-failure.json')) this.r.jsonWrite('logs/controller-failure.json', { operation: this.op, session: this.f.session,
        at: this.io.clock(), error: String(error.message ?? error), outcome: 'blocked_no_retry' });
      throw error;
    }
  }
  query(kind, argv, label) { this.io.checkTools(this.savedTools); return this.c.query(kind, argv, `${this.op}-${label}`); }
  localDaemon(prefix = '') {
    let endpoint = this.env.DOCKER_HOST, contextName = null;
    if (this.env.DOCKER_CONTEXT || !endpoint) {
      const context = this.env.DOCKER_CONTEXT || this.query('docker', ['context', 'show'], `${prefix}context-name`).stdout.trim();
      must(clean(context), 'invalid Docker context'); contextName = context;
      endpoint = this.query('docker', ['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}'], `${prefix}endpoint`).stdout.trim();
    }
    must(/^unix:\/\/\/[^\x00-\x1f]+$/.test(endpoint), 'only a local Unix Docker endpoint is supported');
    must(this.query('docker', ['info', '--format', '{{.OSType}}'], `${prefix}os`).stdout.trim() === 'linux', 'Linux Docker Engine required');
    const id = this.query('docker', ['info', '--format', '{{.ID}}'], `${prefix}daemon`).stdout.trim(); must(clean(id) && id.length <= 256, 'invalid daemon ID');
    const daemon = { endpoint, id, contextName };
    if (this.op === 'enter-seed') this.r.jsonWrite('logs/daemon.json', daemon);
    else must(equal(this.r.json('logs/daemon.json'), daemon), 'Docker daemon/endpoint changed');
  }
  async approval(phase) {
    const f = this.f;
    const answer = await this.io.approve(`DISPOSABLE ONLY: ${phase}\nSession: ${f.session}\nSelection: ${f.selected}\nPrivate state: ${f.sessionDirectory}\nNo default/working session, retry or cleanup is allowed.`, f.session);
    must(answer.answer === f.session && clean(answer.observation), 'human approval invalid');
    return { phase, session: f.session, answer: answer.answer, observation: answer.observation, disposable: true, at: this.io.clock() };
  }
  arm(from, to) {
    must(['seed', 'restored'].includes(to) && (to === 'seed' ? from === 'unarmed' : from === 'seed'), 'unsupported phase transition');
    const files = ['control/phase', 'data/config/phase3-restart-stage'];
    for (const file of files) must(this.r.text(file) === from + '\n', 'phase changed; no repair');
    this.r.reserve(`logs/arm-${to}`);
    for (const file of files) {
      const fd = fs.openSync(this.r.file(file), fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
      try {
        must(fs.fstatSync(fd).nlink === 1, 'phase hardlink unsupported');
        fs.ftruncateSync(fd); fs.writeFileSync(fd, to + '\n'); fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
    }
  }
  async enter_seed() {
    this.l.expect('entry-seed', false);
    this.r.jsonWrite('logs/entry-seed-approval.json', await this.approval('seed'));
    this.l.begin('entry-seed'); this.c.preflight();
    must(this.r.absent('data/config/extensions/herdr-agent-state.ts'), 'reporter already exists before official installation');
    this.r.reserve('logs/official-install');
    validatePreparation(this.r); this.io.checkTools(this.savedTools);
    const result = this.io.mutate('installer', ['install'], this.env, this.f, this.savedTools.tools);
    this.r.jsonWrite('logs/official-install.json', result); good(result); validateInputs(this.r);
    return this.attach('seed', 4);
  }
  async attach(phase, expectedRows) {
    validateInputs(this.r);
    this.l.expect(phase === 'seed' ? 'entry-seed' : 'entry-restored', true);
    this.io.checkTools(this.savedTools);
    const result = await this.io.attach(this.f, this.savedTools.tools, this.env);
    this.r.jsonWrite(`logs/entry-${phase}-client.json`, result); good(result);
    must(equal(result.argv, ['--session', this.f.session]), 'client target mismatch');
    must(this.l.read().length === expectedRows, 'client detached before required checkpoints/finish; do not reattach/retry');
    this.io.print(phase === 'seed' ? 'Seed detached with Pi running. Terminal B may request the separate named stop.' : 'Finished evidence retained. No server cleanup performed.');
    return { status: 'client_returned', phase, phase3Complete: false };
  }
  genuineShell(rawStat) {
    const marker = parseProcessStat(rawStat), host = this.io.host;
    must(marker.pid === host.callerPid && marker.pgrp === marker.tpgid && marker.state !== 'Z', 'capture genuine foreground parent-shell stat before starting Node');
    const current = this.io.observations.process(host.callerPid);
    must(equal(identity(current.stat), identity(rawStat)) && current.exe === this.savedTools.tools.bash && parseProcessStat(current.stat).ppid === marker.ppid,
      'foreground marker does not belong to actual Bash parent');
    const server = this.io.observations.process(marker.ppid);
    must(server.exe === this.savedTools.tools.herdr && parseProcessStat(server.stat).comm === 'herdr', 'shell is not a direct child of the reviewed server');
    this.io.observations.socket(`${this.f.sessionDirectory}/herdr.sock`);
    return { server: { stat: server.stat, exe: server.exe, bootId: this.io.observations.bootId() }, paneId: host.env.HERDR_PANE_ID };
  }
  ready({ rawStat }) {
    this.l.expect('entry-seed', true); const ready = this.genuineShell(rawStat);
    must(process.cwd() === this.f.selected || this.io.cwd === this.f.selected, 'ready must run in exact selected directory');
    const result = this.query('herdr', ['--session', this.f.session, 'api', 'snapshot'], 'empty-snapshot');
    this.r.write('logs/seed-preflight-snapshot.json', result.stdout);
    this.r.write('logs/ready-shell.stat', rawStat + (rawStat.endsWith('\n') ? '' : '\n'));
    this.r.jsonWrite('logs/ready-runtime.json', ready);
    this.query('herdr', ['--session', this.f.session, 'status', 'server', '--json'], 'status');
    this.l.confirm('entry-seed', () => validateEntry(this.r.root, 'seed', 'pending')); validateEntry(this.r.root, 'seed');
    this.arm('unarmed', 'seed'); this.l.begin('seed-checkpoint');
    this.io.print(`Ready. Run pi as a SEPARATE foreground job, then /name ${this.f.title}, the seed marker, and /phase3-restart-checkpoint. Leave Pi running.`);
    return { status: 'seed_ready', phase3Complete: false };
  }
  collect_seed() {
    this.c.captureOpen('seed'); const result = this.l.confirmBoundary('seed-checkpoint');
    this.io.print('Seed captured. Terminal A may detach with Ctrl+B then Q, without quitting Pi.'); return result.validation;
  }
  async stop() {
    this.l.expect('stop', false); validateCheckpoint(this.r.root, 'seed');
    client(this.r, this.f, 'seed');
    const seed = this.r.json('logs/seed-runtime.json'), check = this.r.json('data/config/phase3-restart-seed-checkpoint.json');
    must(this.io.observations.bootId() === seed.server.bootId && equal(identity(this.io.observations.process(parseProcessStat(seed.server.stat).pid).stat), identity(seed.server.stat)), 'old server identity changed before stop');
    const live = JSON.parse(this.query('herdr', ['--session', this.f.session, 'api', 'snapshot'], 'pre-stop-snapshot').stdout).result?.snapshot;
    must(live?.version === '0.9.5' && live.agents?.[0]?.agent === 'pi' && equal(live.agents[0].agent_session, check.reported.agent_session) && live.agents.length === 1 && live.panes?.length === 1 &&
      live.workspaces?.length === 1 && live.tabs?.length === 1 && ['idle', 'done'].includes(live.agents[0].agent_status) &&
      !live.agents[0].launch_pending && live.panes[0].pane_id === check.paneId && live.panes[0].cwd === this.f.selected, 'seed no longer live/settled before stop');
    const ids = this.query('docker', ['ps', '--all', '--filter', `label=pi-docker.phase3-run=${this.f.project}`, '--no-trunc', '--format', '{{.ID}}'], 'pre-stop-container').stdout.trim();
    must(ids === seed.containerId, 'seed container changed before stop');
    const projectIds = this.query('docker', ['ps', '--all', '--filter', `label=com.docker.compose.project=${this.f.project}`, '--no-trunc', '--format', '{{.ID}}'], 'pre-stop-project').stdout.trim();
    must(projectIds === ids, 'unexpected project container before stop');
    const inspected = this.query('docker', seed.containerInspect.argv, 'pre-stop-inspect');
    must(equal(JSON.parse(inspected.stdout), JSON.parse(seed.containerInspect.stdout)), 'seed container state/identity changed before stop');
    const image = this.c.image('pre-stop'), initial = this.r.json('logs/preflight.json');
    must(image.tag === initial.tag && image.id === initial.imageId, 'image changed before stop');
    const storage = storageFor(this.f, check.observation.sessionFile);
    must(this.r.bytes(storage.relative).equals(this.r.bytes('logs/seed.jsonl')) &&
      this.r.bytes(`data/herdr-launches/${storage.key}.record`).equals(this.r.bytes('logs/seed.record')), 'seed data changed before stop');
    this.r.jsonWrite('logs/stop-approval.json', { ...await this.approval('stop'), serverPid: parseProcessStat(seed.server.stat).pid });
    // Close the human-prompt gap: revalidate frozen inputs and the local daemon
    // before requesting a stop, then check the actual old lifetime/data last.
    validateCheckpoint(this.r.root, 'seed'); this.l.expect('stop', false);
    this.localDaemon('approved-');
    must(this.io.observations.bootId() === seed.server.bootId &&
      equal(identity(this.io.observations.process(parseProcessStat(seed.server.stat).pid).stat), identity(seed.server.stat)), 'server changed during stop approval');
    must(equal(this.io.observations.socket(`${this.f.sessionDirectory}/herdr.sock`), seed.socket), 'socket changed during stop approval');
    must(this.r.bytes(storage.relative).equals(this.r.bytes('logs/seed.jsonl')) &&
      this.r.bytes(`data/herdr-launches/${storage.key}.record`).equals(this.r.bytes('logs/seed.record')), 'seed changed during stop approval');
    this.l.begin('stop'); this.r.reserve('logs/named-stop');
    this.io.checkTools(this.savedTools);
    const result = this.io.mutate('stop', ['session', 'stop', this.f.session], this.env, this.f, this.savedTools.tools);
    this.r.jsonWrite('logs/stop-command.json', result); good(result);
    await this.c.captureStopped(); const confirmed = this.l.confirmBoundary('stop');
    this.io.print('Stop evidence validated. Fresh entry is a SEPARATE approved command in terminal A; nothing was restarted automatically.');
    return confirmed.validation;
  }
  enter_restored() { return this.enterRestored(); }
  freshEntryChecks(prefix = '') {
    const old = this.r.json('logs/seed-runtime.json').server;
    must(this.io.observations.bootId() === old.bootId, 'host boot changed');
    try { must(!equal(identity(this.io.observations.stat(parseProcessStat(old.stat).pid)), identity(old.stat)), 'old server still alive'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const name of ['herdr.sock', 'herdr-client.sock']) {
      try { this.io.observations.socket(`${this.f.sessionDirectory}/${name}`); throw new Error('socket still exists; no fresh entry'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    for (const kind of ['pi-docker.phase3-run', 'com.docker.compose.project'])
      must(!this.query('docker', ['ps', '--all', '--filter', `label=${kind}=${this.f.project}`, '--format', INVENTORY_FORMAT], `${prefix}before-entry-${kind}`).stdout.trim(), 'container retained before fresh entry');
    const image = this.c.image(`${prefix}reentry`), initial = this.r.json('logs/preflight.json'); must(image.tag === initial.tag && image.id === initial.imageId, 'image changed before fresh entry');
  }
  async enterRestored() {
    this.l.expect('entry-restored', false); validateStop(this.r.root);
    this.freshEntryChecks();
    this.r.jsonWrite('logs/entry-restored-approval.json', await this.approval('restored'));
    // Human approval may take arbitrarily long. A prior successful preflight is
    // not permission to use changed persistence, tools, daemon, image or containers.
    validateStop(this.r.root); this.l.expect('entry-restored', false);
    this.localDaemon('approved-'); this.freshEntryChecks('approved-');
    this.l.begin('entry-restored'); this.arm('seed', 'restored');
    return this.attach('restored', 12);
  }
  async collect_restored() {
    this.c.captureOpen('restored');
    this.l.confirm('entry-restored', () => validateEntry(this.r.root, 'restored', 'pending')); validateEntry(this.r.root, 'restored');
    this.l.begin('restored-checkpoint'); this.l.confirmBoundary('restored-checkpoint');
    const answer = await this.io.approve('Inspect terminal A: original title/history plus exactly one new turn, automatic startup ONLY, no manual pi, Continue/Fork, repair or retry. Confirm all statements with yes.', 'yes');
    must(answer.answer === 'yes' && clean(answer.observation), 'visual confirmation missing');
    this.r.jsonWrite('logs/visual.json', { session: this.f.session, answer: 'yes', observations: answer.observation,
      manualReopen: false, recoveryUi: false, at: this.io.clock() });
    this.l.begin('finish');
    this.io.print(`Finish reserved. Terminal A: /quit; then IMMEDIATELY source ${quote(this.f.root + '/control/finish.sh')}. No intervening command, no detach first.`);
    return { status: 'awaiting_immediate_shell_return', phase3Complete: false };
  }
  finish({ rawStat, exitCode }) {
    this.l.expect('finish', true); this.genuineShell(rawStat);
    must(this.io.host.env.HERDR_PANE_ID === this.r.json('data/config/phase3-restart-restored-checkpoint.json').paneId, 'wrong restored pane');
    this.c.captureFinalShell({ rawStat: rawStat + (rawStat.endsWith('\n') ? '' : '\n'), exitCode, callerPid: this.io.host.callerPid,
      observation: 'Immediate /quit status and foreground shell stat captured by frozen Bash builtin helper.' });
    const result = this.l.confirmBoundary('finish').validation;
    this.r.jsonWrite('logs/assessment.json', result);
    this.io.print('Saved restart evidence validated. Pi exited; server/state retained. Detach only, no cleanup. Phase 3 as a whole remains open.');
    return result;
  }
}

export function checkLaunch(directory, phase) {
  must(['seed', 'restored'].includes(phase), 'invalid launch phase');
  const r = new ArtifactStore(directory), f = validateInputs(r);
  must(f.root === r.root, 'launch cannot use a copied fixture');
  must(r.text('control/phase') === phase + '\n' && r.text('data/config/phase3-restart-stage') === phase + '\n', 'partial/changed phase transition; no retry');
  new StepLedger(r, f).expect(phase === 'seed' ? 'seed-checkpoint' : 'entry-restored', true);
  return { status: 'launch_prerequisites_validated', inputsValidated: true, liveStateInspected: false, phase3Complete: false };
}
export function assessPair(ordinaryDirectory, linkedDirectory) {
  const directories = [ordinaryDirectory, linkedDirectory];
  const results = directories.map((directory, index) => {
    const r = new ArtifactStore(directory), f = validateInputs(r);
    must(f.caseName === (index ? 'linked' : 'ordinary'), 'pair needs ordinary then linked');
    must(new StepLedger(r, f).read().length === 12, 'case publication incomplete');
    client(r, f, 'restored');
    return assessRestart(directory);
  });
  must(results[0].session !== results[1].session && results[0].reference !== results[1].reference &&
    results[0].sessionId !== results[1].sessionId, 'cases must be independent');
  const linked = new ArtifactStore(linkedDirectory).json('logs/ordinary-prerequisite.json');
  must(linked.directory === new ArtifactStore(ordinaryDirectory).json('control/fixture.json').root && linked.session === results[0].session && linked.reference === results[0].reference, 'linked prerequisite differs from assessed ordinary case');
  return { status: 'saved_restart_pair_evidence_validated', cases: results, inputsValidated: true, liveStateInspected: false, phase3Complete: false };
}
export async function main(args, adapter = hostAdapter) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: node server-restart-live.mjs --plan ABSOLUTE_FIXTURE\nOffline: --assess-pair ORDINARY LINKED; --check-launch FIXTURE seed|restored (shim prerequisites only)\nLive (human host ONLY): <operation> ABSOLUTE_FIXTURE --execute-reviewed-procedure [--shell-stat RAW --exit-status INTEGER]\nOperations: ' + liveCommands.join(', ') + '\nRequires separately approved runbook, frozen entry, normal-user Linux terminal, exact typed confirmations. No cleanup or automatic retries.'); return;
  }
  if (args.length === 3 && args[0] === '--check-launch') { console.log(JSON.stringify(checkLaunch(args[1], args[2]))); return; }
  if (args.length === 3 && args[0] === '--assess-pair') { console.log(JSON.stringify(assessPair(args[1], args[2]), null, 2)); return; }
  if (args.length === 2 && args[0] === '--plan') { console.log(JSON.stringify(plan(args[1]), null, 2)); return; }
  const [operation, directory, flag, ...extra] = args;
  must(liveCommands.includes(operation) && clean(directory) && path.isAbsolute(directory) && flag === '--execute-reviewed-procedure', 'live operation requires exact command, absolute fixture and --execute-reviewed-procedure; no execution has been inferred');
  let rawStat, exitCode, ordinaryEvidence;
  if (operation === 'ready') { must(extra.length === 2 && extra[0] === '--shell-stat', 'ready requires the frozen builtin helper'); rawStat = extra[1]; }
  else if (operation === 'finish') {
    must(extra.length === 4 && extra[0] === '--shell-stat' && extra[2] === '--exit-status' && /^\d+$/.test(extra[3]), 'finish requires the immediate frozen builtin helper');
    rawStat = extra[1]; exitCode = Number(extra[3]);
  } else if (operation === 'enter-seed' && extra.length) {
    must(extra.length === 2 && extra[0] === '--ordinary-evidence' && clean(extra[1]) && path.isAbsolute(extra[1]), 'invalid ordinary prerequisite argument');
    ordinaryEvidence = extra[1];
  } else must(extra.length === 0, 'unexpected/duplicate arguments');
  if (insideCommands.includes(operation)) parseProcessStat(rawStat);
  const workflow = new RestartWorkflow(directory, operation, adapter());
  console.log(JSON.stringify(await workflow.run({ rawStat, exitCode, ordinaryEvidence }), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`STOP: ${error.message}`); process.exitCode = 1; });
}
