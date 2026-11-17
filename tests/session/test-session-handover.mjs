// Offline classification/driver guards only. No Docker or Herdr requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const helper = new URL('../host/session-handover.sh', import.meta.url).pathname;
const driver = new URL('../host/verify-native-restore.sh', import.meta.url).pathname;
const namespace = '/pi/herdr-sessions/' + 'a'.repeat(64);
const a = namespace + '/a.jsonl', b = namespace + '/b.jsonl';
function classify(previous, current, reported) {
  return spawnSync('bash', ['-c', 'source "$1"; handover_classify "$2" "$3" "$4"',
    'unit', helper, previous, current, reported], { encoding: 'utf8' });
}
test('current reference classifies a successful handover, not a native restore', () => {
  const r = classify(a, b, b); assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, 'current\n');
});
test('previous reference explicitly classifies stale_previous', () => {
  const r = classify(a, b, a); assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, 'stale_previous\n');
});
test('unrelated reference cannot be mistaken for a stale-previous finding', () => {
  const r = classify(a, b, namespace + '/other.jsonl'); assert.notEqual(r.status, 0); assert.equal(r.stdout, '');
});
test('same conversation twice is not a handover test', () => {
  const r = classify(a, a, a); assert.notEqual(r.status, 0); assert.equal(r.stdout, '');
});
test('different storage namespace invalidates focused same-storage control', () => {
  const r = classify(a, '/pi/herdr-sessions/' + 'b'.repeat(64) + '/b.jsonl', a);
  assert.notEqual(r.status, 0); assert.equal(r.stdout, '');
});
test('invalid/nonmanaged references fail closed', () => {
  for (const bad of ['', '/pi/sessions/a.jsonl', namespace + '/../a.jsonl', namespace + '/a.jsonl\n']) {
    const r = classify(a, b, bad); assert.notEqual(r.status, 0); assert.equal(r.stdout, '');
  }
});
test('focused mode documents consent and does not start via help', () => {
  assert.equal(spawnSync('bash', ['-n', helper]).status, 0);
  assert.equal(spawnSync('bash', ['-n', driver]).status, 0);
  const help = spawnSync('bash', [driver, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /--focused-handover/);
  const guard = spawnSync('bash', [driver, '--run', '--focused-handover'], { encoding: 'utf8' });
  assert.equal(guard.status, 1); assert.match(guard.stderr, /requires --confirm-disposable-session/);
});
test('automated finding is saved before the independent B visual question', () => {
  const script = fs.readFileSync(driver, 'utf8');
  assert(script.indexOf('> "$root/handover.json"') < script.indexOf('Did B show Handover B'));
  assert(script.indexOf('> "$root/evidence.json"') < script.indexOf('Did B show Handover B'));
  assert.doesNotMatch(script, /confirm_visual "handover-\$key"/);
  assert.match(script, /automated assessment is retained in handover\.json/);
});
test('focused code path exits before full native corpus and skips Git creation', () => {
  const script = fs.readFileSync(driver, 'utf8');
  assert.match(script, /if \(\(!focused_handover\)\); then\s+source .*mount-contract\.sh/);
  assert.match(script, /if \(\(focused_handover\)\); then\s+run_focused_handover\s+exit 0\s+fi\s+run_case ordinary/);
  assert.match(script, /DIAGNOSTIC COMPLETE.*NOT a native restore pass/);
  assert.match(script, /handover_classify "\$previous" "\$current" "\$reported"/);
});
