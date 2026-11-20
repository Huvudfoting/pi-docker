// Test-owned files only. Exercise installed Pi 1.5.2 settings persistence and
// extracted startup methods, NOT a Pi CLI/TUI/model/Herdr/Docker process.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { prepare } from '../host/prepare-server-restart.mjs';
import { EvidenceReader, validatePreparation } from '../host/server-restart-evidence.mjs';
const sdkRoot = process.env.PI_RESTART_TEST_PI_ROOT || '/usr/local/lib/node_modules/@earendil-works/pi-coding-agent';
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-settings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory;
}
async function sdk(t) {
  const pkg = sdkRoot + '/package.json';
  if (!fs.existsSync(pkg)) {
    if (process.env.PI_RESTART_TEST_PI_ROOT) throw new Error('explicit test SDK root unavailable');
    t.skip('installed Pi 1.5.2 SDK unavailable; no dependency installation attempted'); return null;
  }
  const metadata = JSON.parse(fs.readFileSync(pkg, 'utf8'));
  if (metadata.name !== '@earendil-works/pi-coding-agent' || metadata.version !== '1.5.2') {
    if (process.env.PI_RESTART_TEST_PI_ROOT) throw new Error('explicit test SDK must be Pi 1.5.2');
    t.skip('installed SDK is not Pi 1.5.2'); return null;
  }
  const { SettingsManager } = await import(pathToFileURL(sdkRoot + '/dist/core/settings-manager.js'));
  const changelog = await import(pathToFileURL(sdkRoot + '/dist/utils/changelog.js'));
  // Do not import/construct InteractiveMode: its dependency graph includes
  // UI/auth/model services. Compile ONLY these exact installed method bodies.
  const source = fs.readFileSync(sdkRoot + '/dist/modes/interactive/interactive-mode.js', 'utf8');
  function method(name, next) {
    const start = source.indexOf(`    ${name}(`), end = source.indexOf(`\n    ${next}(`, start);
    assert.ok(start >= 0 && end > start, 'Pi startup source shape changed; review rather than guess');
    const body = source.slice(start, end);
    return vm.runInNewContext(`({${body}}).${name}`, {
      VERSION: '1.5.2', getChangelogPath: () => sdkRoot + '/CHANGELOG.md',
      parseChangelog: changelog.parseChangelog, getNewEntries: changelog.getNewEntries,
      normalizeChangelogLinks: changelog.normalizeChangelogLinks,
      getSourcePackageKey: () => { throw new Error('fixture must have no packaged extensions'); },
    });
  }
  return { SettingsManager, changelog: method('getChangelogForDisplay', 'getExtensionChangelogUpdates'),
    extensions: method('getExtensionChangelogUpdates', 'readPackageJson') };
}
function context(manager, resumed = false) {
  const telemetry = [];
  return { telemetry, settingsManager: manager, session: { state: { messages: resumed ? [{}] : [] },
    resourceLoader: { getExtensions: () => ({ extensions: [
      { sourceInfo: { origin: 'auto' } }, { sourceInfo: { origin: 'cli' } },
    ] }) } }, reportInstallTelemetry: version => telemetry.push(version) };
}
for (const caseName of ['ordinary', 'linked']) test(`actual Pi 1.5.2 startup/save preserves frozen ${caseName} settings bytes`, async t => {
  const pi = await sdk(t); if (!pi) return;
  const parent = temporary(t), f = prepare({ caseName, parent, env: { PATH: process.env.PATH, HOME: parent } });
  const directory = f.root + '/data/config', filename = directory + '/settings.json';
  const before = fs.readFileSync(filename), r = new EvidenceReader(f.root);
  const manager = pi.SettingsManager.create(f.selected, directory);
  assert.equal(manager.getLastChangelogVersion(), '1.5.2');
  assert.deepEqual(manager.getPackages(), []);
  assert.equal(manager.getEnableAnalytics(), false); assert.equal(manager.getEnableInstallTelemetry(), false);
  const ctx = context(manager);
  assert.equal(pi.changelog.call(ctx), undefined);
  assert.equal(pi.extensions.call(ctx).length, 0); assert.deepEqual(ctx.telemetry, []);
  await manager.flush(); assert.deepEqual(manager.drainErrors(), []);
  assert.ok(fs.readFileSync(filename).equals(before)); validatePreparation(r);
  // Trust gating changes in-memory project visibility, not global settings.
  manager.setProjectTrusted(false); manager.setProjectTrusted(true);
  // Even identical-value persistence uses the exact prehashed serialization.
  manager.setLastChangelogVersion('1.5.2');
  manager.setDefaultModelAndProvider('pi-docker-fixture', 'fixed');
  await manager.flush(); assert.deepEqual(manager.drainErrors(), []);
  assert.ok(fs.readFileSync(filename).equals(before)); validatePreparation(r);
  const resumed = context(manager, true);
  assert.equal(pi.changelog.call(resumed), undefined); assert.equal(pi.extensions.call(resumed).length, 0);
  await manager.flush(); assert.ok(fs.readFileSync(filename).equals(before)); validatePreparation(r);
});
test('actual Pi fresh-start method reproduces the legacy missing-marker rewrite', async t => {
  const pi = await sdk(t); if (!pi) return;
  const parent = temporary(t), agent = parent + '/agent'; fs.mkdirSync(agent);
  const filename = agent + '/settings.json', original = JSON.stringify({ packages: [], enableAnalytics: false,
    enableInstallTelemetry: false }) + '\n'; fs.writeFileSync(filename, original);
  const manager = pi.SettingsManager.create(parent, agent), ctx = context(manager);
  assert.equal(pi.changelog.call(ctx), undefined); await manager.flush();
  assert.equal(manager.getLastChangelogVersion(), '1.5.2');
  assert.deepEqual(ctx.telemetry, ['1.5.2']); // intercepted method call, NEVER a network request
  assert.deepEqual(manager.drainErrors(), []);
  const after = fs.readFileSync(filename, 'utf8');
  assert.notEqual(after, original); assert.equal(after, JSON.stringify(JSON.parse(after), null, 2));
});
test('actual SDK semantic settings drift is still rejected by the public immutable-input gate', async t => {
  const pi = await sdk(t); if (!pi) return;
  const parent = temporary(t), f = prepare({ caseName: 'ordinary', parent, env: { PATH: process.env.PATH, HOME: parent } });
  const r = new EvidenceReader(f.root); validatePreparation(r);
  const manager = pi.SettingsManager.create(f.selected, f.root + '/data/config');
  manager.setDefaultModelAndProvider('unexpected', 'different'); await manager.flush();
  assert.deepEqual(manager.drainErrors(), []);
  assert.throws(() => validatePreparation(r), /changed immutable input: data\/config\/settings.json/);
});
test('actual Pi first-time setup predicate skips existing/private fixture settings', async t => {
  const pi = await sdk(t); if (!pi) return;
  const parent = temporary(t), filename = parent + '/settings.json'; fs.writeFileSync(filename, '{}');
  const source = fs.readFileSync(sdkRoot + '/dist/cli/startup-ui.js', 'utf8');
  const start = source.indexOf('export function shouldRunFirstTimeSetup(');
  const end = source.indexOf('\nexport async function showStartupSelector(', start);
  assert.ok(start >= 0 && end > start, 'Pi setup source shape changed');
  const env = {};
  const predicate = vm.runInNewContext(`(${source.slice(start, end).replace('export function', 'function')})`, {
    isOfficialDistribution: () => true, PACKAGE_NAME: '@earendil-works/pi-coding-agent', APP_NAME: 'pi', CONFIG_DIR_NAME: '.pi',
    areExperimentalFeaturesEnabled: () => true, ENV_AGENT_DIR: 'PI_CODING_AGENT_DIR', process: { env },
    existsSync: fs.existsSync, getSettingsPath: () => { throw new Error('must supply test-owned explicit path'); },
  });
  assert.equal(predicate(filename), false); // file presence alone skips setup
  assert.equal(predicate(parent + '/missing.json'), true); // positive control
  env.PI_CODING_AGENT_DIR = parent;
  assert.equal(predicate(parent + '/missing.json'), false); // fixture override independently skips setup
});
