"""Regression coverage for the Phase 3 host driver: fake Docker, private Git/data.

This does NOT establish Docker or real-Pi integration; test_session_fixture.py
separately exercises the real locally installed Pi CLI and offline provider.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

DOCKER = r'''
import json, os, pathlib, sys, uuid
a = sys.argv[1:]
with open(os.environ['FAKE_DOCKER_LOG'], 'a') as f: f.write(json.dumps(a) + '\n')
if a[:2] == ['context', 'show']: print('fixture'); sys.exit(0)
if a[:2] == ['context', 'inspect']: print('unix:///fixture.sock'); sys.exit(0)
if a[:1] == ['info']: print('linux'); sys.exit(0)
if a[:1] == ['version']: print('fixture client/server'); sys.exit(0)
if a[:2] == ['image', 'ls']:
    if not os.environ.get('FAKE_BASE'): print('pi-docker:custom')
    sys.exit(0)
if a[:2] == ['image', 'inspect']:
    if '--format' in a: print('sha256:' + '1' * 64)
    sys.exit(0)
if a[:2] == ['compose', 'version']: print('5.7.1'); sys.exit(0)
if a[:1] == ['ps']: sys.exit(0)
if a[:1] != ['compose']: sys.exit(99)
if a[-2:] == ['config', '--quiet']:
    sys.exit(71 if os.environ.get('FAKE_CONFIG_FAILURE') else 0)
if 'run' not in a: sys.exit(99)
args = a[a.index('pi')+1:]
assert args[-1].startswith('phase3-')
assert os.environ['PI_DOCKER_IMAGE'] == ('pi-docker:base' if os.environ.get('FAKE_BASE') else 'pi-docker:custom')
store = pathlib.Path(os.environ['PI_SESSIONS'])
agent = pathlib.Path(os.environ['PI_CONFIG'])
assert (agent / 'auth.json').read_text() == '{}\n'
assert (agent / 'phase3-fixture').read_text() == 'pi-docker-phase3-fixture\n'
if '--session' in args:
    file = store / pathlib.Path(args[args.index('--session')+1]).name
elif '--continue' in args and list(store.glob('*.jsonl')):
    file = max(store.glob('*.jsonl'), key=lambda p:p.stat().st_mtime_ns)
else:
    file = store / (uuid.uuid4().hex + '.jsonl')
if file.exists():
    entries = [json.loads(line) for line in file.read_text().splitlines()]
else:
    entries = [{'type':'session','id':str(uuid.uuid4()),'cwd':os.environ['PI_WORKDIR']}]
if '--name' in args: entries[0]['name'] = args[args.index('--name')+1]
entries += [{'type':'message','message':{'role':'user','content':args[-1]}},
            {'type':'message','message':{'role':'assistant','content':'offline-fixture:' + args[-1],
              'provider':'pi-docker-fixture','stopReason':'stop'}}]
file.write_text(''.join(json.dumps(x)+'\n' for x in entries))
state = {'stage':'settled','cwd':entries[0]['cwd'],'headerCwd':entries[0]['cwd'],
         'sessionFile':'/pi/sessions/'+file.name,'sessionId':entries[0]['id'],
         'sessionName':entries[0].get('name'),'hostname':'fixture-container',
         'piVersion':'1.5.2','hasHerdr':False,
         'users':[x['message']['content'] for x in entries if x.get('message',{}).get('role')=='user'],
         'assistants':[x['message']['content'] for x in entries if x.get('message',{}).get('role')=='assistant']}
if os.environ.get('FAKE_BAD_HISTORY'): state['users'] = []
(agent / 'phase3-result.json').write_text(json.dumps(state)+'\n')
print('offline-fixture:'+args[-1])
'''


@unittest.skipUnless(shutil.which('jq') and shutil.which('git'), 'host-driver tests need test-only jq and Git')
class SessionHostTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pi-session-driver-unit-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.runs = self.root / 'runs'
        self.runs.mkdir()
        (self.bin / 'docker').write_text(f'#!{sys.executable}\n' + DOCKER)
        (self.bin / 'mktemp').write_text(f'#!{sys.executable}\n' +
            'import os, sys, tempfile\n'
            'assert sys.argv[1:] == ["-d", "/tmp/pi-docker-persistence.XXXXXXXX"]\n'
            'assert not os.environ.get("FORBID_MKTEMP")\n'
            'print(tempfile.mkdtemp(prefix="pi-docker-persistence.", dir=os.environ["FAKE_RUNS"]))\n')
        (self.bin / 'id').write_text('#!/bin/sh\nprintf "1000\\n"\n')
        for file in self.bin.iterdir(): file.chmod(0o755)
        self.log = self.root / 'docker.log'
        self.env = {'PATH': f'{self.bin}:{os.environ["PATH"]}', 'HOME': str(self.root),
                    'FAKE_RUNS': str(self.runs), 'FAKE_DOCKER_LOG': str(self.log)}

    def run_driver(self, *args, extra=None):
        return subprocess.run(['bash', str(ROOT / 'tests/host/verify-session-persistence.sh'), *args],
                              env={**self.env, **(extra or {})}, cwd=self.root,
                              capture_output=True, text=True, timeout=90)

    def test_help_has_no_docker_or_fixture_activity(self):
        result = self.run_driver('--help')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.log.exists())
        self.assertEqual(list(self.runs.iterdir()), [])

    def test_preflight_never_creates_fixture_deployment(self):
        result = self.run_driver('--preflight', extra={'FORBID_MKTEMP':'1'})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(list(self.runs.iterdir()), [])
        calls = [json.loads(line) for line in self.log.read_text().splitlines()]
        self.assertFalse(any('run' in args or 'pull' in args or 'build' in args for args in calls))

    def test_complete_driver_corpus_and_private_state(self):
        result = self.run_driver('--run')
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        run, = self.runs.iterdir()
        report = (run / 'report.txt').read_text()
        self.assertIn('RESULT: PASS (14 checks)', report)
        self.assertIn('NOT interactive picker/native Herdr/live APIs/rewind', report)
        self.assertEqual(len(list((run / 'logs').glob('state-*.json'))), 11)
        self.assertFalse((run / '.git').exists())
        wrapper = (run / 'compose.yaml').read_text()
        self.assertIn('network_mode: none', wrapper)
        self.assertNotIn('entrypoint:', wrapper)
        self.assertNotIn('command:', wrapper)
        self.assertIn('file: ./compose.production.yaml', wrapper)
        self.assertEqual((run / 'compose.production.yaml').read_bytes(), (ROOT / 'compose.yaml').read_bytes())
        calls = [json.loads(line) for line in self.log.read_text().splitlines()]
        self.assertEqual(sum('run' in args for args in calls), 11)
        self.assertFalse(any('pull' in args or 'build' in args or 'rm' == args[0] for args in calls))

    def test_base_absence_branch_uses_fresh_base_selection_not_an_override(self):
        result = self.run_driver('--run', extra={'FAKE_BASE':'1'})
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        run, = self.runs.iterdir()
        self.assertIn('Image: pi-docker:base', (run / 'report.txt').read_text())
        self.assertIn('RESULT: PASS (14 checks)', (run / 'report.txt').read_text())

    def test_incorrect_observation_stops_instead_of_false_pass_or_retry(self):
        result = self.run_driver('--run', extra={'FAKE_BAD_HISTORY':'1'})
        self.assertNotEqual(result.returncode, 0)
        run, = self.runs.iterdir()
        report = (run / 'report.txt').read_text()
        self.assertIn('RESULT: FAIL/INTERRUPTED', report)
        calls = [json.loads(line) for line in self.log.read_text().splitlines()]
        self.assertEqual(sum('run' in args for args in calls), 1)

    def test_configuration_failure_cannot_be_recorded_as_pi_readiness(self):
        result = self.run_driver('--run', extra={'FAKE_CONFIG_FAILURE':'1'})
        self.assertNotEqual(result.returncode, 0)
        run, = self.runs.iterdir()
        self.assertIn('RESULT: FAIL/INTERRUPTED', (run / 'report.txt').read_text())
        self.assertFalse((run / 'data/config/phase3-result.json').exists())
        calls = [json.loads(line) for line in self.log.read_text().splitlines()]
        self.assertFalse(any('run' in args for args in calls))
