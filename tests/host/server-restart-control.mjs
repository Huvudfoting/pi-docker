#!/usr/bin/env node
// TEST ONLY: state/collector core. The CLI exposes ONLY offline inspection.
// Guarded human execution is in the separate frozen server-restart-live.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual as equal } from 'node:util';
import { fileURLToPath } from 'node:url';
import { EvidenceReader, validatePreparation, validatePending, validateCheckpoint, validateStop, assessRestart, parseProcessStat, storageFor,
  CONTAINER_FORMAT, INVENTORY_FORMAT } from './server-restart-evidence.mjs';

const steps = ['entry-seed', 'seed-checkpoint', 'stop', 'entry-restored', 'restored-checkpoint', 'finish'];
const publicationStatus = { 'seed-checkpoint': 'checkpoint_evidence_validated', stop: 'stopped_evidence_validated',
  'restored-checkpoint': 'checkpoint_evidence_validated', finish: 'saved_evidence_validated' };
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const clean = s => typeof s === 'string' && s.length > 0 && !/[\x00-\x1f\x7f]/.test(s);
const note = s => clean(s) && s.trim().length > 0;
const identity = stat => [stat.pid, stat.startTicks];
const now = () => new Date().toISOString();

export class ArtifactStore extends EvidenceReader {
  // Only new controller/evidence files can be published. Immutable input/config
  // and conversation/record files cannot be modified through this store.
  destination(relative, directory = false) {
    requireThat(clean(relative) && path.normalize(relative) === relative && !path.isAbsolute(relative) &&
      /^(logs|control\/steps)\//.test(relative) && !relative.split('/').some(p => p === '..' || /^\.env(?:\.|$)/.test(p)), 'unsafe controller output path');
    const parts = relative.split('/');
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      try { this.file(parent, true); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        fs.mkdirSync(path.join(this.root, parent), { mode: 0o700 });
        this.file(parent, true);
      }
    }
    const filename = path.join(this.root, relative);
    if (directory) fs.mkdirSync(filename, { mode: 0o700 }); // exclusive reservation
    return filename;
  }
  write(relative, bytes) {
    const filename = this.destination(relative);
    const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  jsonWrite(relative, object) { this.write(relative, JSON.stringify(object, null, 2) + '\n'); }
  reserve(relative) { this.destination(relative, true); }
  append(relative, object) {
    requireThat(relative === 'logs/receipts.jsonl' || relative === 'logs/stop-probes.jsonl', 'only known append-only journals are allowed');
    const filename = this.destination(relative);
    if (!this.absent(relative)) this.file(relative);
    const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW, 0o600);
    try {
      const stat = fs.fstatSync(fd); requireThat(stat.isFile() && stat.nlink === 1, 'journal must be a single-link regular private file');
      fs.writeFileSync(fd, JSON.stringify(object) + '\n'); fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
  }
}

export class StepLedger {
  constructor(store, fixture, clock = now) { this.store = store; this.fixture = fixture; this.clock = clock; }
  read() {
    requireThat(this.store.absent('logs/controller-failure.json'), 'controller failure recorded; inspect, do not retry');
    const raw = this.store.absent('logs/receipts.jsonl') ? '' : this.store.text('logs/receipts.jsonl');
    requireThat(!raw || raw.endsWith('\n'), 'incomplete lifecycle journal');
    const entries = raw ? raw.slice(0, -1).split('\n').map(JSON.parse) : [];
    requireThat(entries.length <= 12, 'extra lifecycle entries');
    let previous = -Infinity;
    for (const [i, entry] of entries.entries()) {
      requireThat(entry.step === steps[Math.floor(i / 2)] && entry.session === this.fixture.session &&
        entry.outcome === (i % 2 ? 'confirmed_success' : 'uncertain'), 'failed/repeated/out-of-order lifecycle journal; inspect, do not retry');
      const at = Date.parse(entry.at);
      requireThat(typeof entry.at === 'string' && Number.isFinite(at) && new Date(at).toISOString() === entry.at && at >= previous, 'invalid lifecycle time');
      previous = at;
      if (i % 2 && Object.hasOwn(publicationStatus, entry.step)) {
        requireThat(!this.store.absent(`control/steps/${entry.step}/publication-required.json`) &&
          !this.store.absent(`control/steps/${entry.step}/publication-validated.json`), 'publication validation unfinished; inspect, do not retry');
        const required = this.store.json(`control/steps/${entry.step}/publication-required.json`);
        requireThat(required.version === 1 && required.session === this.fixture.session && required.step === entry.step, 'publication requirement target disagrees');
        const marker = this.store.json(`control/steps/${entry.step}/publication-validated.json`);
        requireThat(equal(marker.receipt, entry) && marker.status === publicationStatus[entry.step], 'publication validation marker disagrees');
      }
    }
    let reserved;
    try { reserved = this.store.names('control/steps'); } catch (error) { if (error.code !== 'ENOENT') throw error; reserved = []; }
    requireThat(equal(reserved, [...new Set(entries.map(e => e.step))].sort()), 'orphan/unknown step reservation; inspect, do not repair/retry');
    for (const step of reserved) this.store.file(`control/steps/${step}`, true);
    return entries;
  }
  expect(step, active) {
    const index = steps.indexOf(step); requireThat(index >= 0, 'unknown lifecycle step');
    const entries = this.read();
    requireThat(entries.length === index * 2 + (active ? 1 : 0), 'wrong lifecycle boundary; no retry/skip/overlap');
    return entries;
  }
  event(step, outcome) {
    const event = { step, outcome, session: this.fixture.session, at: this.clock() };
    const at = Date.parse(event.at), previous = this.read().at(-1);
    requireThat(Number.isFinite(at) && new Date(at).toISOString() === event.at &&
      (!previous || at >= Date.parse(previous.at)), 'clock moved backwards or timestamp invalid');
    return event;
  }
  begin(step) {
    this.expect(step, false);
    const event = this.event(step, 'uncertain');
    this.store.reserve(`control/steps/${step}`);
    this.store.append('logs/receipts.jsonl', event); return event;
  }
  confirm(step, validate) {
    requireThat(!Object.hasOwn(publicationStatus, step), 'checkpoint/stop/finish must use the hardwired public confirmBoundary gate');
    return this.#confirm(step, validate);
  }
  #confirm(step, validate) {
    this.expect(step, true); requireThat(typeof validate === 'function', 'confirmation requires an evidence validator');
    this.store.reserve(`control/steps/${step}/confirmation`);
    const event = this.event(step, 'confirmed_success');
    // Project only the pending ledger line, for read-only full-evidence
    // validation before publishing success. No saved artifact is overwritten.
    const store = this.store, projected = new EvidenceReader(store.root);
    const originalText = projected.text.bind(projected);
    projected.text = relative => relative === 'logs/receipts.jsonl' ?
      store.text(relative) + JSON.stringify(event) + '\n' : originalText(relative);
    try {
      const result = validate(projected, event);
      requireThat(result && typeof result.then !== 'function' && result.inputsValidated === true,
        'only synchronous full-input validation may confirm a step');
      this.store.append('logs/receipts.jsonl', event);
      return { event, validation: result };
    } catch (error) { this.fail(step, error); throw error; }
  }
  confirmBoundary(step) {
    requireThat(Object.hasOwn(publicationStatus, step), 'only checkpoint/stop/finish have full boundary gates');
    this.expect(step, true);
    this.store.jsonWrite(`control/steps/${step}/publication-required.json`, { version: 1, session: this.fixture.session, step });
    // This route is hardwired to public, full-input validators; no injectable
    // callback/reader/reporter hash or synthetic-artifact bypass is accepted.
    const pending = this.#confirm(step, (_projected, candidate) => validatePending(this.store.root, step, candidate));
    try {
      const validation = step === 'stop' ? validateStop(this.store.root) : step === 'finish' ? assessRestart(this.store.root) :
        validateCheckpoint(this.store.root, step === 'seed-checkpoint' ? 'seed' : 'restored');
      this.store.jsonWrite(`control/steps/${step}/publication-validated.json`, { receipt: pending.event, status: validation.status });
      return { event: pending.event, pendingValidation: pending.validation, validation };
    } catch (error) {
      // If this write cannot complete, the required-but-unvalidated publication
      // marker still prevents a following lifecycle step or a retry.
      this.store.jsonWrite('logs/controller-failure.json', { version: 1, session: this.fixture.session, step,
        at: new Date().toISOString(), outcome: 'blocked_after_publication', error: String(error.message ?? error) });
      throw error;
    }
  }
  fail(step, error) {
    this.expect(step, true);
    this.store.append('logs/receipts.jsonl', { ...this.event(step, 'confirmed_failure'), error: String(error.message ?? error) });
    // Reservation and journal remain; no release, rollback or automatic retry.
  }
}

function assertContextEnvironment(env, f, inside) {
  const keys = ['HERDR_ENV', 'HERDR_PANE_ID', 'HERDR_SOCKET_PATH', 'HERDR_AGENT', 'HERDR_SESSION', 'HERDR_WORKSPACE_ID', 'HERDR_TAB_ID'];
  if (!inside) requireThat(keys.every(key => !env[key]), 'operator command requires a normal terminal outside Herdr; do not unset real context to bypass');
  else requireThat(env.HERDR_ENV === '1' && clean(env.HERDR_PANE_ID) && !env.HERDR_AGENT &&
    env.HERDR_SOCKET_PATH === `${f.sessionDirectory}/herdr.sock` && env.HERDR_SESSION === f.session,
    'genuine inherited fixture shell context required; do not fabricate it');
}
export function assertHostContext(host, f, inside = false) {
  requireThat(host.platform === 'linux' && Number.isSafeInteger(host.uid) && host.uid > 0 && host.stdinTTY === true && host.stdoutTTY === true,
    'use an interactive normal-user Linux host terminal');
  assertContextEnvironment(host.env, f, inside);
}

export function privateEnvironment(f, tools, inherited = {}, inside = false) {
  assertContextEnvironment(inherited, f, inside);
  requireThat(clean(tools.path) && tools.path.split(':').every(p => path.isAbsolute(p)) && clean(tools.herdr) && path.isAbsolute(tools.herdr), 'invalid pinned host tool paths');
  requireThat(clean(f.dockerConfig) && path.isAbsolute(f.dockerConfig) && f.herdrConfigHome === `${f.root}/herdr-config` &&
    f.herdrStateHome === `${f.root}/herdr-state` && (!inherited.TERM || clean(inherited.TERM)), 'invalid private environment paths/terminal');
  const env = { PATH: `${f.root}/control/shims:${f.root}/bin:${tools.path}`, HOME: `${f.root}/host-home`,
    DOCKER_CONFIG: f.dockerConfig, XDG_CONFIG_HOME: f.herdrConfigHome, XDG_STATE_HOME: f.herdrStateHome,
    HERDR_CONFIG_PATH: `${f.root}/herdr-config/herdr/config.toml`, HERDR_BIN_PATH: tools.herdr,
    PHASE3_PROJECT: f.project, TERM: inherited.TERM || 'xterm-256color', LC_ALL: 'C' };
  // Allowlist, not an env dump: no credentials, NODE_OPTIONS, shell hooks,
  // exported Bash functions, Git overrides, Compose overrides or socket replay.
  for (const key of ['DOCKER_CONTEXT', 'DOCKER_HOST']) if (inherited[key]) {
    requireThat(clean(inherited[key]), 'invalid Docker selector');
    if (key === 'DOCKER_HOST') requireThat(/^unix:\/\/\/[^\x00-\x1f]+$/.test(inherited[key]), 'only local Unix Docker endpoints are supported');
    env[key] = inherited[key];
  }
  requireThat(!inherited.DOCKER_TLS_VERIFY && !inherited.DOCKER_CERT_PATH && !inherited.DOCKER_TLS, 'remote/TLS Docker is unsupported');
  if (inside) for (const key of ['HERDR_ENV', 'HERDR_PANE_ID', 'HERDR_SOCKET_PATH', 'HERDR_SESSION', 'HERDR_WORKSPACE_ID', 'HERDR_TAB_ID'])
    if (inherited[key] !== undefined) env[key] = inherited[key];
  return env;
}

export function allowedRead(kind, argv, f) {
  if (kind === 'herdr') return equal(argv, ['--version']) ||
    equal(argv, ['--session', f.session, 'status', 'server', '--json']) || equal(argv, ['--session', f.session, 'api', 'snapshot']);
  if (kind !== 'docker') return false;
  if (equal(argv, ['context', 'show']) || equal(argv, ['info', '--format', '{{.OSType}}']) || equal(argv, ['info', '--format', '{{.ID}}']) || equal(argv, ['compose', 'version', '--short'])) return true;
  if (argv.length === 5 && argv[0] === 'context' && argv[1] === 'inspect' && clean(argv[2]) &&
    equal(argv.slice(3), ['--format', '{{.Endpoints.docker.Host}}'])) return true;
  if (equal(argv, ['image', 'ls', '--filter', 'reference=pi-docker:custom', '--format', '{{.Repository}}:{{.Tag}}'])) return true;
  if (['pi-docker:base', 'pi-docker:custom'].some(tag => equal(argv, ['image', 'inspect', tag, '--format', '{{.Id}}']))) return true;
  if (argv.length === 4 && equal(argv.slice(0, 3), ['inspect', '--format', CONTAINER_FORMAT]) && /^[a-f0-9]{64}$/.test(argv[3])) return true;
  for (const filter of [`label=pi-docker.phase3-run=${f.project}`, `label=com.docker.compose.project=${f.project}`]) {
    if (equal(argv, ['ps', '--all', '--filter', filter, '--format', INVENTORY_FORMAT]) ||
        equal(argv, ['ps', '--all', '--filter', filter, '--no-trunc', '--format', '{{.ID}}'])) return true;
  }
  return false;
}

export class ReadOnlyRunner {
  constructor({ fixture, tools, env, spawn = spawnSync }) { this.f = fixture; this.tools = tools; this.env = env; this.spawn = spawn; }
  run(kind, argv) {
    requireThat(allowedRead(kind, argv, this.f), 'command not in scoped read-only allowlist');
    const binary = this.tools[kind]; requireThat(path.isAbsolute(binary ?? ''), 'missing absolute host tool');
    let result;
    try { result = this.spawn(binary, argv, { env: this.env, cwd: this.f.root, input: '', encoding: 'buffer',
      timeout: 20000, maxBuffer: 1024 * 1024, killSignal: 'SIGKILL', shell: false }); }
    catch (error) { result = { error }; }
    let stdout, stderr, encodingError = null;
    const decode = value => typeof value === 'string' ? value :
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(value ?? Buffer.alloc(0));
    try { stdout = decode(result.stdout); stderr = decode(result.stderr); }
    catch { stdout = ''; stderr = ''; encodingError = 'INVALID_UTF8'; }
    return { argv, stdout, stderr, exitCode: result.status ?? null,
      signal: result.signal ?? null, error: result.error?.code ?? (result.error ? 'spawn_error' : encodingError),
      timedOut: result.error?.code === 'ETIMEDOUT', truncated: result.error?.code === 'ENOBUFS',
      ...(encodingError ? { encodingError, stdoutBase64: Buffer.from(result.stdout ?? '').toString('base64'),
        stderrBase64: Buffer.from(result.stderr ?? '').toString('base64') } : {}) };
  }
}
const checked = (receipt, label) => {
  requireThat(receipt.exitCode === 0 && receipt.signal === null && receipt.error === null &&
    receipt.timedOut === false && receipt.truncated === false && typeof receipt.stdout === 'string' && typeof receipt.stderr === 'string',
    `${label}: failed/uncertain query; inspect saved result, no retry`);
  return receipt.stdout;
};

// Production observation adapter: exact recorded process IDs/known socket paths
// only. It has NO API control, process-kill, broad discovery or removal methods.
export function localObservations(uid) {
  const statFor = pid => {
    requireThat(Number.isSafeInteger(pid) && pid > 0, 'invalid recorded process ID');
    return fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  };
  return {
    stat: statFor,
    process(pid) { return { stat: statFor(pid), exe: fs.realpathSync(`/proc/${pid}/exe`) }; },
    bootId: () => fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(),
    socket(filename) {
      const stat = fs.lstatSync(filename, { bigint: true });
      requireThat(stat.isSocket() && stat.uid === BigInt(uid), 'fixture socket is not same-user Unix socket');
      return { path: filename, dev: stat.dev.toString(), ino: stat.ino.toString() };
    },
    monotonic: () => performance.now(), sleep: delay,
  };
}

export class CollectorCore {
  // Construction alone performs no observations. The live workflow controller
  // enforces host/context/approval gates and public frozen-input validation
  // before calling this core. Unit tests inject inert runner/observations.
  constructor({ store, fixture, ledger, runner, observations, clock = now }) {
    this.r = store; this.f = fixture; this.ledger = ledger; this.runner = runner; this.obs = observations; this.clock = clock;
  }
  query(kind, argv, name) {
    this.r.reserve(`logs/query-${name}`); // reserve BEFORE invocation, including failures
    const result = this.runner.run(kind, argv);
    this.r.jsonWrite(`logs/${name}.json`, result); // save failed query BEFORE throwing
    checked(result, name); return result;
  }
  reserve(name) { this.r.reserve(`logs/collector-${name}`); }
  phase(phase) {
    requireThat(['seed', 'restored'].includes(phase), 'unknown collector phase');
    this.ledger.expect(phase === 'seed' ? 'seed-checkpoint' : 'entry-restored', true);
    requireThat(this.r.text('control/phase') === phase + '\n' && this.r.text('data/config/phase3-restart-stage') === phase + '\n', 'phase files disagree; do not repair/retry');
    requireThat(this.r.absent(`data/config/phase3-restart-${phase}-error.txt`), 'checkpoint observer failed');
  }
  inventory(boundary) {
    requireThat(['pre-entry', 'stopped', 'final'].includes(boundary), 'unknown inventory boundary');
    const expected = { 'pre-entry': 'entry-seed', stopped: 'stop', final: 'finish' }[boundary];
    this.ledger.expect(expected, true);
    for (const kind of ['run', 'project']) {
      const filter = `label=${kind === 'run' ? 'pi-docker.phase3-run' : 'com.docker.compose.project'}=${this.f.project}`;
      const result = this.query('docker', ['ps', '--all', '--filter', filter, '--format', INVENTORY_FORMAT], `${boundary}-containers-${kind}`);
      requireThat(result.stdout.trim() === '', `${boundary}: retained containers; do not remove automatically`);
    }
  }
  preflight() {
    this.ledger.expect('entry-seed', true); this.reserve('preflight');
    for (const name of ['herdr.sock', 'herdr-client.sock'])
      requireThat(Buffer.byteLength(`${this.f.sessionDirectory}/${name}`) <= 107, 'private Unix socket path exceeds Linux pathname limit');
    requireThat(this.r.absent(path.relative(this.f.root, this.f.sessionDirectory)), 'initial named session directory already exists');
    requireThat(this.r.text('control/phase') === 'unarmed\n' && this.r.text('data/config/phase3-restart-stage') === 'unarmed\n', 'initial fixture is already armed');
    requireThat(this.r.absent('data/sessions') && this.r.absent('data/herdr-launches') &&
      !this.r.names('logs').some(name => name.startsWith('launch-')) &&
      !this.r.names('data/config').some(name => name === 'phase3-result.json' || /^phase3-restart-(seed|restored)-/.test(name)),
      'initial fixture already has launch/conversation/observer evidence');
    const cli = this.query('herdr', ['--version'], 'preflight-cli');
    requireThat(cli.stdout.trim() === 'herdr 0.9.5', 'reviewed host Herdr 0.9.5 required; no upgrade');
    const env = this.runner.env; let endpoint;
    if (env.DOCKER_CONTEXT) endpoint = this.query('docker', ['context', 'inspect', env.DOCKER_CONTEXT, '--format', '{{.Endpoints.docker.Host}}'], 'preflight-context').stdout.trim();
    else if (env.DOCKER_HOST) endpoint = env.DOCKER_HOST;
    else {
      const context = this.query('docker', ['context', 'show'], 'preflight-context-name').stdout.trim();
      requireThat(clean(context), 'invalid Docker context name');
      endpoint = this.query('docker', ['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}'], 'preflight-context').stdout.trim();
    }
    requireThat(/^unix:\/\/\/[^\x00-\x1f]+$/.test(endpoint), 'only local Unix Docker endpoints are supported');
    requireThat(this.query('docker', ['info', '--format', '{{.OSType}}'], 'preflight-os').stdout.trim() === 'linux', 'Linux Docker Engine required');
    requireThat(this.query('docker', ['compose', 'version', '--short'], 'preflight-compose').stdout.trim(), 'Docker Compose plugin required');
    const selection = this.image('preflight'); this.inventory('pre-entry');
    this.r.jsonWrite('logs/preflight.json', { version: 1, session: this.f.session, tag: selection.tag, imageId: selection.id,
      inputsValidated: false, serverRestartTested: false, phase3Complete: false });
    return selection;
  }
  image(label) {
    const customLookup = this.query('docker', ['image', 'ls', '--filter', 'reference=pi-docker:custom', '--format', '{{.Repository}}:{{.Tag}}'], `${label}-custom-lookup`);
    const custom = customLookup.stdout.trim(); requireThat(custom === '' || custom === 'pi-docker:custom', 'ambiguous custom image lookup');
    const tag = custom || 'pi-docker:base';
    const imageInspect = this.query('docker', ['image', 'inspect', tag, '--format', '{{.Id}}'], `${label}-image-inspect`);
    const id = imageInspect.stdout.trim(); requireThat(/^sha256:[a-f0-9]{64}$/.test(id), 'invalid inspected image ID');
    return { tag, id, customLookup, imageInspect };
  }
  captureOpen(phase) {
    this.phase(phase); this.reserve(`open-${phase}`);
    const f = this.f, prefix = `data/config/phase3-restart-${phase}`;
    const checkpoint = this.r.json(`${prefix}-checkpoint.json`), startup = this.r.json(`${prefix}-startup.json`);
    requireThat(checkpoint.phase === phase && startup.phase === phase && checkpoint.paneId === startup.paneId, 'checkpoint/startup phase or pane mismatch');
    requireThat(equal(this.r.json('data/config/phase3-result.json'), checkpoint.provider), 'provider changed after checkpoint; stop, no retry');
    const state = checkpoint.observation, storage = storageFor(f, state.sessionFile);
    const launch = parseProcessStat(this.r.text(`logs/launch-${phase}/process.stat`));
    const savedShell = parseProcessStat(this.r.text(`logs/launch-${phase}/shell.stat`));
    requireThat(launch.ppid === savedShell.pid, 'recorded shim/shell ancestry mismatch');
    const shell = this.obs.process(savedShell.pid), shellStat = parseProcessStat(shell.stat);
    requireThat(equal(identity(shellStat), identity(savedShell)), 'recorded shell was replaced');
    const server = this.obs.process(shellStat.ppid), serverStat = parseProcessStat(server.stat);
    requireThat(serverStat.pid === shellStat.ppid && serverStat.comm === 'herdr' && server.exe === this.runner.tools.herdr &&
      serverStat.state !== 'Z' && shellStat.state !== 'Z', 'server ancestry/executable unavailable or changed');
    const bootId = this.obs.bootId(); requireThat(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(bootId), 'invalid Linux boot ID');
    const socket = this.obs.socket(`${f.sessionDirectory}/herdr.sock`);
    const cli = this.query('herdr', ['--version'], `${phase}-cli`);
    requireThat(cli.stdout.trim() === 'herdr 0.9.5', 'CLI version changed');
    const status = this.query('herdr', ['--session', f.session, 'status', 'server', '--json'], `${phase}-status`);
    const live = JSON.parse(status.stdout);
    requireThat(live.status === 'running' && live.running === true && live.version === '0.9.5' && live.compatible === true &&
      live.session === f.session && live.socket === socket.path, 'wrong live named server/version/socket');
    const image = this.image(phase), preflight = this.r.json('logs/preflight.json');
    requireThat(preflight.tag === image.tag && preflight.imageId === image.id, 'image availability/bytes changed; do not override or repair');
    const ids = this.query('docker', ['ps', '--all', '--filter', `label=pi-docker.phase3-run=${f.project}`, '--no-trunc', '--format', '{{.ID}}'], `${phase}-container-lookup`).stdout.trim();
    requireThat(/^[a-f0-9]{64}$/.test(ids), 'expected one exact fixture container; no guessing');
    const containerInspect = this.query('docker', ['inspect', '--format', CONTAINER_FORMAT, ids], `${phase}-container-inspect`);
    const container = JSON.parse(containerInspect.stdout);
    requireThat(container.id === ids && container.hostname === state.hostname && container.hostname === ids.slice(0, 12) &&
      container.running === true && container.image === image.tag && container.imageId === image.id &&
      container.labels?.['pi-docker.phase3-run'] === f.project && container.labels?.['com.docker.compose.project'] === f.project,
      'container identity/image/labels mismatch');
    const snapshotReceipt = this.query('herdr', ['--session', f.session, 'api', 'snapshot'], `${phase}-live-snapshot`);
    const snapshot = JSON.parse(snapshotReceipt.stdout).result?.snapshot;
    const agent = snapshot?.agents?.[0], pane = snapshot?.panes?.[0];
    requireThat(snapshot?.version === '0.9.5' && snapshot.workspaces?.length === 1 && snapshot.tabs?.length === 1 &&
      snapshot.panes?.length === 1 && snapshot.agents?.length === 1 && pane.pane_id === checkpoint.paneId && pane.cwd === f.selected &&
      pane.restore_error == null && agent.pane_id === checkpoint.paneId && agent.agent === 'pi' &&
      ['idle', 'done'].includes(agent.agent_status) && !agent.launch_pending && agent.agent_session?.source === 'herdr:pi' &&
      agent.agent_session.agent === 'pi' && agent.agent_session.kind === 'path' && agent.agent_session.value === state.sessionFile,
      'fresh official identity/topology changed after checkpoint');
    // Read current files after live checks, without modifying them. The future
    // controller runs the full public evidence validator before committing.
    this.r.write(`logs/${phase}.jsonl`, this.r.bytes(storage.relative));
    this.r.write(`logs/${phase}.record`, this.r.bytes(`data/herdr-launches/${storage.key}.record`));
    const runtime = { version: 1, session: f.session, cli, status, server: { stat: server.stat, exe: server.exe, bootId }, shellStat: shell.stat,
      socket, customLookup: image.customLookup, imageInspect: image.imageInspect, containerId: ids, containerInspect };
    this.r.jsonWrite(`logs/${phase}-runtime.json`, runtime);
    return { status: 'captured_only', phase, inputsValidated: false, observationsCollected: true, liveStateInspected: false, phase3Complete: false };
  }
  async captureStopped({ timeoutMs = 20000, intervalMs = 200 } = {}) {
    this.ledger.expect('stop', true); this.reserve('stopped');
    requireThat(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000 && Number.isInteger(intervalMs) && intervalMs > 0,
      'invalid bounded observation window');
    const f = this.f, stop = this.r.json('logs/stop-command.json');
    requireThat(equal(stop.argv, ['session', 'stop', f.session]), 'wrong saved stop target'); checked(stop, 'saved human stop');
    const old = this.r.json('logs/seed-runtime.json').server, prior = parseProcessStat(old.stat);
    requireThat(this.obs.bootId() === old.bootId, 'host boot changed');
    const start = this.obs.monotonic(); let boundary;
    do {
      requireThat(Number.isFinite(start) && this.obs.monotonic() >= start && this.obs.monotonic() - start <= timeoutMs,
        'observation deadline elapsed or monotonic clock invalid');
      let serverProbe;
      try {
        const raw = this.obs.stat(prior.pid), stat = parseProcessStat(raw);
        requireThat(stat.pid === prior.pid, 'process probe returned unrelated PID');
        serverProbe = { pid: prior.pid, bootId: old.bootId, status: equal(identity(prior), identity(stat)) ? 'present' : 'replaced', stat: raw };
      } catch (error) {
        if (error.code !== 'ENOENT') {
          this.r.append('logs/stop-probes.jsonl', { session: f.session, at: this.clock(), processError: error.code ?? 'invalid_process_observation' });
          throw error;
        }
        serverProbe = { pid: prior.pid, bootId: old.bootId, status: 'absent', code: 'ENOENT' };
      }
      const sockets = ['herdr.sock', 'herdr-client.sock'].map(name => {
        const filename = `${f.sessionDirectory}/${name}`;
        try { this.obs.socket(filename); return { path: filename, status: 'present' }; }
        catch (error) {
          if (error.code !== 'ENOENT') {
            this.r.append('logs/stop-probes.jsonl', { session: f.session, at: this.clock(), socket: filename, socketError: error.code ?? 'invalid_socket_observation' });
            throw error;
          }
          return { path: filename, status: 'absent', code: 'ENOENT' };
        }
      });
      boundary = { version: 1, session: f.session, serverProbe, sockets };
      this.r.append('logs/stop-probes.jsonl', { ...boundary, at: this.clock() });
      requireThat(this.obs.monotonic() - start <= timeoutMs, 'observation deadline elapsed');
      if (serverProbe.status !== 'present' && sockets.every(s => s.status === 'absent')) break;
      const remaining = timeoutMs - (this.obs.monotonic() - start);
      requireThat(remaining > 0, 'old server/socket did not disappear; no kill/removal/retry');
      await this.obs.sleep(Math.min(intervalMs, remaining));
    } while (true);
    this.r.jsonWrite('logs/stopped-boundary.json', boundary);
    this.inventory('stopped');
    const relative = path.relative(f.root, f.sessionDirectory);
    this.r.write('logs/stopped-session.json', this.r.bytes(`${relative}/session.json`));
    this.r.write('logs/stopped-session-history.json', this.r.bytes(`${relative}/session-history.json`));
    const seed = this.r.json('data/config/phase3-restart-seed-checkpoint.json');
    const storage = storageFor(f, seed.observation.sessionFile);
    this.r.write('logs/stopped.jsonl', this.r.bytes(storage.relative));
    this.r.write('logs/stopped.record', this.r.bytes(`data/herdr-launches/${storage.key}.record`));
    return { status: 'captured_only', phase: 'stopped', inputsValidated: false, observationsCollected: true, liveStateInspected: false, phase3Complete: false };
  }
  captureFinalShell({ rawStat, exitCode, callerPid, observation }) {
    this.ledger.expect('finish', true); this.reserve('final');
    const current = parseProcessStat(rawStat), runtime = this.r.json('logs/restored-runtime.json');
    const previous = parseProcessStat(runtime.shellStat), server = parseProcessStat(runtime.server.stat);
    requireThat(current.pid === callerPid && equal(identity(current), identity(previous)) && current.ppid === server.pid &&
      current.pgrp === current.tpgid && current.state !== 'Z' && exitCode === 0 && note(observation),
      'require immediate successful Pi exit and genuine foreground parent-shell marker');
    this.r.write('logs/final-shell.stat', rawStat);
    this.r.jsonWrite('logs/final-exit.json', { session: this.f.session, piExitCode: exitCode, shellReturned: true,
      observation, at: this.clock() });
    this.inventory('final');
    return { status: 'captured_only', phase: 'final', inputsValidated: false, observationsCollected: true, liveStateInspected: false, phase3Complete: false };
  }
}

export function inspect(directory) {
  const store = new ArtifactStore(directory), fixture = validatePreparation(store);
  const entries = new StepLedger(store, fixture).read();
  return { status: 'offline_inspection_only', session: fixture.session, caseName: fixture.caseName,
    nextStep: steps[Math.floor(entries.length / 2)] ?? 'none', activeUncertainStep: entries.length % 2 ? entries.at(-1).step : null,
    terminalWorkflow: 'two_normal_host_terminals', liveWorkflowImplemented: true, hostExecutionAuthorized: false,
    liveStateInspected: false, phase3Complete: false };
}
export function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: node tests/host/server-restart-control.mjs --inspect ABSOLUTE_FIXTURE_DIRECTORY\nOffline state inspection only. Collector/state core is not a live controller.\nNo entry, stop, restart, stage arming, installer, image mutation or cleanup command is exposed.\nHost procedure will require TWO normal host terminals and separate execution approval.'); return;
  }
  requireThat(args.length === 2 && args[0] === '--inspect', 'only --inspect is implemented; no live commands are authorized/exposed');
  console.log(JSON.stringify(inspect(args[1]), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`STOP: ${error.message}`); process.exitCode = 1; }
}
