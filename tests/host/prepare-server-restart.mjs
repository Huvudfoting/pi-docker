#!/usr/bin/env node
// TEST ONLY. Offline preparation: never invokes Herdr, Docker, Pi or a server.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const deployment = fileURLToPath(new URL('../..', import.meta.url));
const quote = s => `'${s.replaceAll("'", "'\\''")}'`;
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const clean = s => typeof s === 'string' && s.length > 0 && !/[\x00-\x1f\x7f]/.test(s);
const help = `Usage: node tests/host/prepare-server-restart.mjs --prepare --case ordinary|linked [--parent ABSOLUTE_DIRECTORY]
Offline preparation ONLY. Creates a fresh private copied deployment and Git fixtures.
Does not invoke Herdr, Docker or Pi; does not inspect image availability or credentials.
Guarded controller copied; NOT READY FOR HOST EXECUTION without separate explicit approval.
No entry, stop, restart, cleanup, image change or live API request is performed.
Retains partial fixtures on failure; never retry in or remove an existing fixture.
`;

function safeParent(input) {
  if (!clean(input) || !path.isAbsolute(input) || path.normalize(input) !== input)
    throw new Error('parent must be a normalized absolute path without control characters');
  if (fs.realpathSync(input) !== input || !fs.lstatSync(input).isDirectory())
    throw new Error('parent must be an existing canonical directory, not a symlink/alias');
  return input;
}
function executable(name, env) {
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    if (!clean(dir) || !path.isAbsolute(dir)) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return fs.realpathSync(candidate);
    } catch { /* No process probes. */ }
  }
  throw new Error(`missing executable: ${name}`);
}
function privateDirectory(dir) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); }
function put(file, content, mode = 0o600) {
  privateDirectory(path.dirname(file));
  fs.writeFileSync(file, content, { flag: 'wx', mode });
}
function copyTree(source, destination, files) {
  const stat = fs.lstatSync(source);
  if (stat.isDirectory()) {
    privateDirectory(destination);
    for (const name of fs.readdirSync(source).sort()) copyTree(path.join(source, name), path.join(destination, name), files);
  } else if (stat.isFile()) {
    put(destination, fs.readFileSync(source), stat.mode & 0o111 ? 0o700 : 0o600);
    files.push(destination);
  } else throw new Error(`refuse non-regular source (including symlinks): ${source}`);
}

export function prepare({ caseName, parent = os.tmpdir(), env = process.env } = {}) {
  if (!['ordinary', 'linked'].includes(caseName)) throw new Error('choose case ordinary or linked');
  parent = safeParent(parent);
  // Resolve offline tools before isolation, without running version/help probes.
  const bash = executable('bash', env), git = executable('git', env), sha256sum = executable('sha256sum', env);
  if (/\s/.test(bash)) throw new Error('Bash executable path cannot contain whitespace (shebang requirement)');
  const dockerConfig = env.DOCKER_CONFIG || (clean(env.HOME) && path.isAbsolute(env.HOME) ? path.join(env.HOME, '.docker') : '');
  if (!clean(dockerConfig) || !path.isAbsolute(dockerConfig)) throw new Error('Docker config selection must be an absolute path (contents are not read)');
  const hostPath = [...new Set((env.PATH ?? '').split(path.delimiter).filter(p => clean(p) && path.isAbsolute(p)))].join(path.delimiter);
  const root = fs.mkdtempSync(path.join(parent, 'pi-docker-restart.'));
  fs.chmodSync(root, 0o700);
  try {
    const files = [];
    const resources = ['bin', 'lib', 'docs', 'extensions', 'skills', 'images', 'README.md',
      'compose.git.yaml', 'compose.herdr.yaml', 'compose.metadata.yaml'];
    for (const name of resources) copyTree(path.join(deployment, name), path.join(root, name), files);
    copyTree(path.join(deployment, 'compose.yaml'), path.join(root, 'compose.production.yaml'), files);
    copyTree(fileURLToPath(import.meta.url), path.join(root, 'control/preparation-source.mjs'), files);
    copyTree(path.join(deployment, 'tests/host/server-restart-evidence.mjs'), path.join(root, 'control/server-restart-evidence.mjs'), files);
    copyTree(path.join(deployment, 'tests/host/server-restart-control.mjs'), path.join(root, 'control/server-restart-control.mjs'), files);
    copyTree(path.join(deployment, 'tests/host/server-restart-live.mjs'), path.join(root, 'control/server-restart-live.mjs'), files);
    copyTree(path.join(deployment, 'tests/session/HERDR_SERVER_RESTART_DESIGN.md'), path.join(root, 'control/design.md'), files);
    copyTree(path.join(deployment, 'tests/session/HERDR_SERVER_RESTART_EVIDENCE.md'), path.join(root, 'control/evidence-contract.md'), files);
    copyTree(path.join(deployment, 'tests/session/HERDR_SERVER_RESTART_RUNBOOK.md'), path.join(root, 'control/runbook.md'), files);
    const writeInput = (name, content, mode) => { const file = path.join(root, name); put(file, content, mode); files.push(file); };
    const gitEnv = { PATH: hostPath, HOME: '/nonexistent', LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_COUNT: '0', GIT_OPTIONAL_LOCKS: '0',
      GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
    const runGit = args => {
      const r = spawnSync(git, ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', ...args],
        { env: gitEnv, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024, cwd: root });
      if (r.error || r.status !== 0) throw new Error(`fixture Git failed; no retry: ${r.error?.message ?? r.stderr}`);
    };
    let selected;
    if (caseName === 'ordinary') {
      selected = path.join(root, 'fixtures/ordinary'); privateDirectory(selected);
    } else {
      const main = path.join(root, 'fixtures/main'), linked = path.join(root, 'fixtures/linked checkout');
      privateDirectory(main);
      runGit(['-C', main, 'init', '-q', '-b', 'main']);
      put(path.join(main, 'tracked'), 'fixture\n');
      runGit(['-C', main, 'add', 'tracked']);
      runGit(['-C', main, 'commit', '-qm', 'fixture']);
      runGit(['-C', main, 'worktree', 'add', '-q', '-b', 'restart-test', linked]);
      selected = path.join(linked, 'packages/backend'); privateDirectory(selected);
    }
    // Ask the unchanged production mount discovery code, under fixture-only Git
    // configuration. No inherited Git overrides, HOME config, hooks or tracing.
    const discover = spawnSync(bash, ['--noprofile', '--norc', '-c',
      'set -euo pipefail; source "$1"; fixture_git="$3"; mount_git() { "$fixture_git" -c core.hooksPath=/dev/null -c commit.gpgSign=false "$@"; }; mount_discover "$2"; printf "%s\\0" "$mount_workdir"',
      'restart-fixture', path.join(root, 'lib/workspace-mounts.sh'), selected, git],
      { env: gitEnv, timeout: 20000, maxBuffer: 1024 * 1024, cwd: root });
    if (discover.error || discover.status !== 0) throw new Error(`fixture mount discovery failed: ${discover.stderr}`);
    const expectedCwd = discover.stdout.toString('utf8');
    if (!expectedCwd.endsWith('\0') || !clean(expectedCwd.slice(0, -1))) throw new Error('invalid mount discovery result');
    for (const dir of ['logs', 'control/shims', 'data/config/extensions', 'data/gh-config', 'host-home',
      'herdr-config/herdr', 'herdr-state']) privateDirectory(path.join(root, dir));
    const session = `pi-restart-${path.basename(root).split('.').at(-1).toLowerCase()}`;
    const project = session;
    const manifest = { version: 1, scope: 'automatic-server-restart', status: 'prepared_only_not_run_ready',
      root, caseName, selected, expectedCwd: expectedCwd.slice(0, -1), storageName: 'backend',
      title: `Phase3 Restart ${caseName}`, session, project, dockerConfig,
      herdrConfigHome: path.join(root, 'herdr-config'), herdrStateHome: path.join(root, 'herdr-state'),
      sessionDirectory: path.join(root, 'herdr-config/herdr/sessions', session),
      terminalWorkflow: 'two_normal_host_terminals',
      hostRuntimeVerified: false, serverRestartTested: false, phase3Complete: false };
    writeInput('control/fixture.json', JSON.stringify(manifest, null, 2) + '\n');
    writeInput('control/host-tools.json', JSON.stringify({ path: hostPath, bash, git, sha256sum, node: process.execPath }, null, 2) + '\n');
    writeInput('control/pane-helpers.sh', `# Source ONLY in the initial genuine fixture pane, before starting Pi.
restart_ready() {
  local __phase3_stat
  IFS= read -r __phase3_stat < /proc/$$/stat || return
  ${quote(process.execPath)} ${quote(root + '/control/server-restart-live.mjs')} ready ${quote(root)} --execute-reviewed-procedure --shell-stat "$__phase3_stat"
}
`);
    // Sourcing this file is the FIRST command after /quit. Assignment/read are
    // builtins: preserve both actual status and foreground job before Node.
    writeInput('control/finish.sh', `__phase3_exit=$?
IFS= read -r __phase3_stat < /proc/$$/stat || return
${quote(process.execPath)} ${quote(root + '/control/server-restart-live.mjs')} finish ${quote(root)} --execute-reviewed-procedure --shell-stat "$__phase3_stat" --exit-status "$__phase3_exit"
`);
    writeInput('data/config/auth.json', '{}\n');
    writeInput('data/config/settings.json', JSON.stringify({ packages: [], defaultProvider: 'pi-docker-fixture',
      defaultModel: 'fixed', defaultTools: [], compaction: { enabled: false }, retry: { enabled: false },
      enableAnalytics: false, enableInstallTelemetry: false }) + '\n');
    writeInput('data/config/phase3-fixture', 'pi-docker-phase3-fixture\n');
    writeInput('data/config/phase3-restart', 'pi-docker-phase3-restart\n');
    // Mutable stage is intentionally unarmed. Only the guarded frozen controller
    // owns transitions after execution approval; preparation never runs it.
    put(path.join(root, 'control/phase'), 'unarmed\n');
    put(path.join(root, 'data/config/phase3-restart-stage'), 'unarmed\n');
    writeInput('data/config/phase3-restart.json', JSON.stringify({ caseName, cwd: manifest.expectedCwd, title: manifest.title }) + '\n');
    for (const [source, target] of [['fixture-provider.ts', 'phase3-fixture.ts'], ['restart-checkpoint.ts', 'phase3-restart-checkpoint.ts']]) {
      copyTree(path.join(deployment, 'tests/session', source), path.join(root, 'data/config/extensions', target), files);
    }
    writeInput('compose.yaml', `name: "\${PHASE3_PROJECT:?}"
services:
  pi:
    extends:
      file: ./compose.production.yaml
      service: pi
    environment:
      HOME: /tmp
      PI_OFFLINE: "1"
    network_mode: none
    read_only: true
    mem_limit: 1g
    cpus: 2
    pids_limit: 256
    tmpfs:
      - /tmp:rw,nosuid,nodev,size=128m,mode=1777
    labels:
      pi-docker.phase3-run: "\${PHASE3_PROJECT:?}"
`);
    writeInput('herdr-config/herdr/config.toml', `[session]\nresume_agents_on_restore = true\n[terminal]\ndefault_shell = ${JSON.stringify(path.join(root, 'control/shell'))}\nshell_mode = "non_login"\n`);
    writeInput('control/environment.sh', `# TEST ONLY; source in the fixture server entry and every fresh pane shell.
[[ -d ${quote(root)} && ! -L ${quote(root)} ]] || { printf 'STOP: fixture path changed\\n' >&2; return 1; }
${quote(sha256sum)} --check --status ${quote(path.join(root, 'inputs.sha256'))} || { printf 'STOP: fixture inputs changed\\n' >&2; return 1; }
export HOME=${quote(path.join(root, 'host-home'))}
export DOCKER_CONFIG=${quote(dockerConfig)}
export XDG_CONFIG_HOME=${quote(manifest.herdrConfigHome)}
export XDG_STATE_HOME=${quote(manifest.herdrStateHome)}
export HERDR_CONFIG_PATH=${quote(path.join(root, 'herdr-config/herdr/config.toml'))}
export PHASE3_PROJECT=${quote(project)}
# Do not let the unchanged launcher/child Bash read host startup hooks.
unset BASH_ENV ENV CDPATH GLOBIGNORE
export -n SHELLOPTS BASHOPTS
export PATH=${quote(path.join(root, 'control/shims') + ':' + path.join(root, 'bin') + ':' + hostPath)}
# Do not set/unset HERDR_ENV, HERDR_PANE_ID, HERDR_SOCKET_PATH or HERDR_AGENT.
`);
    writeInput('control/shell', `#!${bash} -p
set -euo pipefail
source ${quote(path.join(root, 'control/environment.sh'))}
# -p suppresses inherited BASH_ENV/functions/options, not a UID change.
# --norc also suppresses system bashrc; --rcfile alone does not on all hosts.
export PS1='restart-fixture> '
exec ${quote(bash)} --noprofile --norc -p -i
`, 0o700);
    writeInput('control/shims/pi', `#!${bash} -p
# Transparent test-only argv recorder. It neither chooses nor alters a session.
set -euo pipefail
source ${quote(path.join(root, 'control/environment.sh'))}
phase="$(< ${quote(path.join(root, 'control/phase'))})"
case "$phase" in seed|restored) ;; *) printf 'STOP: restart workflow is not armed\\n' >&2; exit 1 ;; esac
receipt=${quote(path.join(root, 'logs/launch-'))}"$phase"
# Atomic one-shot reservation: failed/uncertain starts cannot be repeated.
mkdir -m 700 -- "$receipt" || { printf 'STOP: launch already attempted; no retry\\n' >&2; exit 1; }
printf '%s\\0' "$@" > "$receipt/argv.nul"
printf '%s\\n' "$PWD" > "$receipt/cwd.txt"
printf '%s\\n' uncertain > "$receipt/outcome.txt"
cat /proc/$$/stat > "$receipt/process.stat"
cat /proc/$PPID/stat > "$receipt/shell.stat"
printf '%s\\n' ${quote(path.join(root, 'bin/pi'))} > "$receipt/executable.txt"
# Pure saved-file gate; no API/process control and no argv substitution.
${quote(process.execPath)} ${quote(root + '/control/server-restart-live.mjs')} --check-launch ${quote(root)} "$phase" >/dev/null
exec ${quote(path.join(root, 'bin/pi'))} "$@"
`, 0o700);
    writeInput('control/INSTRUCTIONS.txt', `PREPARED ONLY — NOT READY FOR HOST EXECUTION WITHOUT SEPARATE EXPLICIT APPROVAL
Case: ${caseName}
Fixture: ${root}
Proposed disposable session: ${session}
Private session directory: ${manifest.sessionDirectory}
Selected host directory: ${selected}
Expected container cwd: ${manifest.expectedCwd}

No Herdr, Docker, Pi, image or credential probes were made.
The shim remains unarmed. Preparation grants no execution permission.
The design uses TWO normal host terminals, not additional Herdr panes.
The guarded frozen controller is control/server-restart-live.mjs.
Review its offline plan (never invokes Herdr, Docker or Pi):
${quote(process.execPath)} ${quote(root + '/control/server-restart-live.mjs')} --plan ${quote(root)}
Review the frozen control/runbook.md, exact
private paths, inputs.sha256 and plan with the user BEFORE any live operation.
Every live command requires --execute-reviewed-procedure, real host context and
one-shot reservations; entries/stop/visual checks also require typed human consent.
Never fabricate context, arm files manually, manually reopen restored Pi, retry,
repair, add a pane/workspace, switch images or clean up to obtain a pass.
The official reporter is installed only by the approved private host installer.
Ordinary first; linked is separately prepared/approved ONLY after ordinary passes.
Retain this fixture. No automatic cleanup or retry is supplied.
`);
    // Freeze only immutable deployment/control inputs, not mutable Git metadata,
    // histories, future official reporter install, or stage/evidence files.
    const lines = files.sort().map(file => file.includes('\\') ?
      `\\${hash(file)}  ${file.replaceAll('\\', '\\\\')}` : `${hash(file)}  ${file}`);
    put(path.join(root, 'inputs.sha256'), lines.join('\n') + '\n');
    put(path.join(root, 'preparation.json'), JSON.stringify({ ...manifest,
      inputsSha256: hash(path.join(root, 'inputs.sha256')), preparedAt: new Date().toISOString(),
      mutations: ['fresh_private_files', ...(caseName === 'linked' ? ['fixture_local_git'] : [])],
      liveOperations: [], next: 'review_frozen_plan_and_obtain_explicit_host_execution_approval' }, null, 2) + '\n');
    return manifest;
  } catch (error) {
    // Never delete/repair a partially created fixture or guess which step ran.
    throw new Error(`${error.message}\nPartial fixture retained: ${root}`, { cause: error });
  }
}

export function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { process.stdout.write(help); return; }
  let caseName, parent, mode = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--prepare' && !mode) mode = true;
    else if (arg === '--case' && caseName === undefined && args[0] && !args[0].startsWith('--')) caseName = args.shift();
    else if (arg === '--parent' && parent === undefined && args[0] && !args[0].startsWith('--')) parent = args.shift();
    else throw new Error('invalid/duplicate arguments; use --help (no live modes are supported)');
  }
  if (!mode) throw new Error('only --prepare is supported; use --help');
  const fixture = prepare({ caseName, parent });
  process.stdout.write(`PREPARED ONLY; NOT AUTHORIZED TO EXECUTE\nFixture retained: ${fixture.root}\nRead: ${fixture.root}/control/INSTRUCTIONS.txt\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(`STOP: ${error.message}`); process.exitCode = 1; }
}
