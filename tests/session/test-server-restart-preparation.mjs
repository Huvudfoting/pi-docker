// Offline fixture/filesystem/PTY checks only. No live Docker, Herdr or Pi.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepare } from '../host/prepare-server-restart.mjs';

const driver = fileURLToPath(new URL('../host/prepare-server-restart.mjs', import.meta.url));
const quote = s => `'${s.replaceAll("'", "'\\''")}'`;
function temporary(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-prep-unit-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  return parent;
}
function environment(parent) {
  return { PATH: process.env.PATH, HOME: path.join(parent, 'not-read'),
    DOCKER_CONFIG: path.join(parent, 'not-read-docker'),
    GIT_DIR: '/must-not-use', GIT_CONFIG_GLOBAL: '/must-not-read', GIT_TRACE: '/must-not-write' };
}
function checkHashes(root) {
  const r = spawnSync('sha256sum', ['--check', '--status', root + '/inputs.sha256'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}

test('help, invalid modes and importing preparation are inert', t => {
  const parent = temporary(t), stubs = path.join(parent, 'stubs'); fs.mkdirSync(stubs);
  const calls = path.join(parent, 'calls');
  for (const name of ['herdr', 'docker', 'pi', 'git']) fs.writeFileSync(path.join(stubs, name),
    `#!/bin/sh\nprintf '%s\\n' ${quote(name)} >> ${quote(calls)}\nexit 91\n`, { mode: 0o700 });
  const env = { ...environment(parent), PATH: stubs + ':' + process.env.PATH };
  const help = spawnSync(process.execPath, [driver, '--help'], { env, encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /NOT READY FOR HOST EXECUTION/);
  for (const args of [[], ['--run'], ['--restart'], ['--stop'], ['--prepare', '--prepare'],
    ['--prepare', '--case', 'default'], ['--prepare', '--case'], ['--prepare', '--case', 'ordinary', '--case', 'linked']]) {
    const r = spawnSync(process.execPath, [driver, ...args], { env, encoding: 'utf8' });
    assert.notEqual(r.status, 0, args.join(' '));
  }
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('../host/prepare-server-restart.mjs', import.meta.url).href)})`],
    { env, encoding: 'utf8' });
  assert.equal(imported.status, 0); assert.equal(imported.stdout + imported.stderr, '');
  assert.equal(fs.existsSync(calls), false);
  assert.deepEqual(fs.readdirSync(parent).sort(), ['stubs']);
});

for (const caseName of ['ordinary', 'linked']) {
  test(`${caseName} preparation creates private unarmed fixture without live probes`, t => {
    const parent = temporary(t), stubs = path.join(parent, 'stubs'); fs.mkdirSync(stubs);
    const calls = path.join(parent, 'live-calls'), gitCalls = path.join(parent, 'git-calls.jsonl');
    for (const name of ['herdr', 'docker', 'pi']) fs.writeFileSync(path.join(stubs, name),
      `#!/bin/sh\nprintf '%s\\n' ${quote(name)} >> ${quote(calls)}\nexit 91\n`, { mode: 0o700 });
    const git = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
    fs.writeFileSync(path.join(stubs, 'git'), `#!${process.execPath}
const fs=require('fs'),cp=require('child_process');
fs.appendFileSync(${JSON.stringify(gitCalls)},JSON.stringify({args:process.argv.slice(2),env:process.env})+'\\n');
const r=cp.spawnSync(${JSON.stringify(git)},process.argv.slice(2),{env:process.env,stdio:'inherit'});process.exit(r.status??1);
`, { mode: 0o700 });
    // These are inert context placeholders; preparation is not an entry point
    // and must not make any request, even with inherited variables present.
    const env = { ...environment(parent), PATH: stubs + ':' + process.env.PATH,
      HERDR_ENV: '1', HERDR_PANE_ID: 'inert-placeholder', HERDR_SOCKET_PATH: '/not-a-socket' };
    const fixture = prepare({ caseName, parent, env });
    const root = fixture.root, receipt = JSON.parse(fs.readFileSync(root + '/preparation.json'));
    assert.equal(receipt.status, 'prepared_only_not_run_ready');
    assert.deepEqual(receipt.liveOperations, []); assert.equal(receipt.hostRuntimeVerified, false);
    assert.equal(receipt.serverRestartTested, false); assert.equal(receipt.phase3Complete, false);
    assert.notEqual(fixture.session, 'default'); assert.match(fixture.session, /^pi-restart-[a-z0-9]+$/);
    assert.equal(fs.statSync(root).mode & 0o777, 0o700);
    assert.equal(fs.statSync(root + '/data/config/auth.json').mode & 0o777, 0o600);
    assert.equal(fs.readFileSync(root + '/data/config/auth.json', 'utf8'), '{}\n');
    assert.equal(fs.readFileSync(root + '/control/phase', 'utf8'), 'unarmed\n');
    assert.equal(fs.readFileSync(root + '/data/config/phase3-restart-stage', 'utf8'), 'unarmed\n');
    assert.equal(fs.existsSync(root + '/data/config/extensions/herdr-agent-state.ts'), false);
    assert.equal(fs.existsSync(fixture.sessionDirectory), false);
    // Regression for host fixture dyN3HI: completing default onboarding prepended
    // this setting after hashing and correctly blocked ready. Pin it up front,
    // at the top level (not inside [session] or [terminal]), for BOTH cases.
    const herdrConfig = fs.readFileSync(root + '/herdr-config/herdr/config.toml', 'utf8');
    assert.equal(herdrConfig, `onboarding = false\n[session]\nresume_agents_on_restore = true\n[terminal]\ndefault_shell = ${JSON.stringify(root + '/control/shell')}\nshell_mode = "non_login"\n`);
    const settingsText = fs.readFileSync(root + '/data/config/settings.json', 'utf8');
    const settings = JSON.parse(settingsText);
    assert.equal(settings.lastChangelogVersion, '1.5.2');
    assert.equal(settingsText, JSON.stringify(settings, null, 2)); // actual SDK save format, no trailing newline
    const compose = fs.readFileSync(root + '/compose.yaml', 'utf8');
    for (const expected of ['network_mode: none', 'read_only: true', 'mem_limit: 1g', 'pids_limit: 256'])
      assert.ok(compose.includes(expected));
    const instructions = fs.readFileSync(root + '/control/INSTRUCTIONS.txt', 'utf8');
    assert.match(instructions, /NOT READY FOR HOST EXECUTION/);
    assert.doesNotMatch(instructions, /herdr (?:server|session) (?:stop|attach)/);
    for (const name of ['control/environment.sh', 'control/shell', 'control/shims/pi', 'control/pane-helpers.sh', 'control/finish.sh'])
      assert.equal(spawnSync('bash', ['-n', root + '/' + name]).status, 0, name);
    checkHashes(root);
    const shim = spawnSync(root + '/control/shims/pi', ['--session', '/no-session'], { encoding: 'utf8', env });
    assert.notEqual(shim.status, 0); assert.match(shim.stderr, /not armed/);
    assert.deepEqual(fs.readdirSync(root + '/logs'), []);
    assert.equal(fs.existsSync(calls), false);
    for (const line of fs.readFileSync(gitCalls, 'utf8').trim().split('\n')) {
      const call = JSON.parse(line);
      assert.equal(call.env.HOME, '/nonexistent');
      assert.equal(call.env.GIT_CONFIG_NOSYSTEM, '1'); assert.equal(call.env.GIT_CONFIG_GLOBAL, '/dev/null');
      assert.equal(call.env.GIT_DIR, undefined); assert.equal(call.env.GIT_TRACE, undefined);
      assert.equal(call.env.HERDR_SOCKET_PATH, undefined);
    }
    if (caseName === 'ordinary') assert.equal(fixture.expectedCwd, '/workspace');
    else {
      assert.equal(fixture.expectedCwd, fixture.selected);
      assert.match(fs.readFileSync(root + '/fixtures/linked checkout/.git', 'utf8'), /^gitdir: /);
    }
    fs.appendFileSync(root + '/lib/herdr-launch.sh', '\n# changed\n');
    const changed = spawnSync('bash', ['-c', 'source "$1"', 'offline', root + '/control/environment.sh'], { env, encoding: 'utf8' });
    assert.notEqual(changed.status, 0); assert.match(changed.stderr, /inputs changed/);
  });
}

test('unsafe parent, invalid Docker selection and missing tools fail before allocation', t => {
  const parent = temporary(t), alias = path.join(parent, 'alias'); fs.symlinkSync(parent, alias);
  for (const input of [alias, parent + '/.', 'relative', parent + '\n'])
    assert.throws(() => prepare({ caseName: 'ordinary', parent: input, env: environment(parent) }));
  assert.throws(() => prepare({ caseName: 'ordinary', parent, env: { PATH: '' } }), /missing executable/);
  assert.throws(() => prepare({ caseName: 'ordinary', parent, env: { ...environment(parent), DOCKER_CONFIG: 'relative' } }), /absolute path/);
  assert.deepEqual(fs.readdirSync(parent), ['alias']);
});

test('failed local Git preserves partial fixture and makes no retry or cleanup', t => {
  const parent = temporary(t), stubs = path.join(parent, 'stubs'); fs.mkdirSync(stubs);
  const calls = path.join(parent, 'calls');
  fs.writeFileSync(stubs + '/git', `#!/bin/sh\nprintf attempt >> ${quote(calls)}\nexit 9\n`, { mode: 0o700 });
  assert.throws(() => prepare({ caseName: 'linked', parent,
    env: { ...environment(parent), PATH: stubs + ':' + process.env.PATH } }), /Partial fixture retained/);
  assert.equal(fs.readFileSync(calls, 'utf8'), 'attempt');
  const roots = fs.readdirSync(parent).filter(name => name.startsWith('pi-docker-restart.'));
  assert.equal(roots.length, 1); assert.equal(fs.existsSync(path.join(parent, roots[0], 'bin/pi')), true);
});

test('quoted fixture paths hash correctly and fresh shell retains private environment and genuine inherited context', t => {
  if (process.platform !== 'linux' || spawnSync('script', ['--version']).status !== 0) {
    t.skip('requires Linux PTY via util-linux script'); return;
  }
  const top = temporary(t), parent = path.join(top, "quote ' and back\\slash"); fs.mkdirSync(parent);
  const fixture = prepare({ caseName: 'ordinary', parent, env: environment(top) });
  checkHashes(fixture.root);
  const capture = path.join(fixture.root, 'logs/fresh-shell.nul');
  const poison = path.join(top, 'must-not-source');
  fs.writeFileSync(poison, `printf poisoned > ${quote(top + '/poisoned')}\n`);
  const command = `printf '%s\\0' "$HOME" "$DOCKER_CONFIG" "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$PHASE3_PROJECT" "$(type -P pi)" "$HERDR_ENV" "$HERDR_PANE_ID" "$HERDR_SOCKET_PATH" "$HERDR_AGENT" > ${quote(capture)}`;
  const r = spawnSync('script', ['-qec', `exec ${quote(fixture.root + '/control/shell')}`, '/dev/null'], {
    input: command + '\nexit\n', encoding: 'utf8', timeout: 10000,
    env: { PATH: process.env.PATH, HOME: '/not-the-private-home', TERM: 'dumb',
      BASH_ENV: poison, ENV: poison, HERDR_ENV: '1', HERDR_PANE_ID: 'inert-context',
      HERDR_SOCKET_PATH: '/inert-socket', HERDR_AGENT: 'preserved-marker' },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(fs.existsSync(top + '/poisoned'), false);
  assert.deepEqual(fs.readFileSync(capture, 'utf8').split('\0'), [fixture.root + '/host-home',
    top + '/not-read-docker', fixture.herdrConfigHome, fixture.herdrStateHome, fixture.project,
    fixture.root + '/control/shims/pi', '1', 'inert-context', '/inert-socket', 'preserved-marker', '']);
});

test('transparent shim records exact argv and reserves failed starts once (inert substitute only)', t => {
  const parent = temporary(t), fixture = prepare({ caseName: 'ordinary', parent, env: environment(parent) });
  const root = fixture.root;
  // Replace only this test copy of the launcher AND pure permission gate, then
  // rehash test inputs. Gate authority is tested separately with pinned data;
  // this case tests transparent shell argv/one-shot behavior, not permission.
  // No Docker/Herdr/Pi runtime is exercised or claimed.
  fs.writeFileSync(root + '/control/server-restart-live.mjs', 'process.exit(0); // INERT test gate only\n');
  fs.writeFileSync(root + '/bin/pi', `#!/usr/bin/env bash\nprintf '%s\\0' "$@" > ${quote(root + '/logs/substitute-argv.nul')}\nexit 17\n`, { mode: 0o700 });
  const manifest = fs.readFileSync(root + '/inputs.sha256', 'utf8').split('\n').filter(Boolean).map(line => line.slice(66));
  const rehash = spawnSync('sha256sum', ['--', ...manifest], { encoding: 'utf8' });
  assert.equal(rehash.status, 0); fs.writeFileSync(root + '/inputs.sha256', rehash.stdout);
  fs.writeFileSync(root + '/control/phase', 'seed\n');
  fs.writeFileSync(root + '/data/config/phase3-restart-stage', 'seed\n');
  const args = ['--session', "/pi/herdr-sessions/" + 'a'.repeat(64) + "/quote ' space.jsonl"];
  const poison = root + '/logs/must-not-source';
  fs.writeFileSync(poison, `printf poisoned > ${quote(root + '/logs/poisoned')}\n`);
  const invoke = () => spawnSync(root + '/control/shims/pi', args, { encoding: 'utf8',
    env: { ...environment(parent), BASH_ENV: poison, ENV: poison }, cwd: fixture.selected });
  assert.equal(invoke().status, 17);
  assert.equal(fs.existsSync(root + '/logs/poisoned'), false);
  const argv = fs.readFileSync(root + '/logs/launch-seed/argv.nul');
  assert.deepEqual(argv, fs.readFileSync(root + '/logs/substitute-argv.nul'));
  assert.deepEqual(argv.toString().split('\0'), [...args, '']);
  assert.equal(fs.readFileSync(root + '/logs/launch-seed/outcome.txt', 'utf8'), 'uncertain\n');
  const second = invoke(); assert.notEqual(second.status, 0); assert.match(second.stderr, /no retry/);
  assert.deepEqual(fs.readFileSync(root + '/logs/launch-seed/argv.nul'), argv);
});
