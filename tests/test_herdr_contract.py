"""Offline Herdr-harness safety tests. Requires jq; never invokes real Herdr/Docker."""
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]
RUNNER = SOURCE / 'tests/host/verify-herdr-contract.sh'
FAKE = SOURCE / 'tests/host/fake-herdr.py'


@unittest.skipUnless(shutil.which('jq'), 'Herdr contract harness tests require test-only jq')
@unittest.skipIf(os.getuid() == 0, 'harness deliberately refuses root')
class HerdrContractTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pi-herdr-unit-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.state = self.root / 'state.json'
        self.state.write_text(json.dumps({
            'next': 2, 'calls': [], 'workspaces': {
                'w1': {'workspace_id': 'w1', 'worktree': {'checkout_path': str(self.root)}}},
            'paths': [], 'branches': {},
        }))
        self.launcher = self.root / 'launcher with spaces'
        self.launcher.write_text('#!/bin/sh\necho unexpectedly-ran >> "' + str(self.root / 'pi-ran') + '"\nexit 99\n')
        self.launcher.chmod(0o755)
        (self.bin / 'pi').symlink_to(self.launcher)
        wrapper = self.bin / 'herdr'
        wrapper.write_text(f'#!/bin/sh\nexec "{shutil.which("python3")}" "{FAKE}" "$@"\n')
        wrapper.chmod(0o755)
        self.sock = socket.socket(socket.AF_UNIX)
        self.sock.bind(str(self.root / 'herdr.sock'))
        self.addCleanup(self.sock.close)
        # Mock-only context points to our own private dummy socket, never a live server.
        self.env = dict(os.environ, PATH=str(self.bin) + os.pathsep + os.environ['PATH'],
                        HERDR_ENV='1', HERDR_PANE_ID='w1:p1',
                        HERDR_SOCKET_PATH=str(self.root / 'herdr.sock'),
                        CONTRACT_FAKE_STATE=str(self.state))

    def run_harness(self, *args, mode='', env=None):
        current = dict(self.env, CONTRACT_FAKE_MODE=mode)
        if env:
            current.update(env)
        result = subprocess.run(['bash', str(RUNNER), *args], env=current, capture_output=True,
                                text=True, timeout=45)
        match = re.search(r'Report to return: (/.*/report\.txt)', result.stdout)
        self.artifact = Path(match[1]).parent if match else None
        if self.artifact:
            self.assertTrue(self.artifact.name.startswith('pi-herdr-contract.'))
            self.addCleanup(shutil.rmtree, self.artifact)
        self.assertFalse((self.root / 'pi-ran').exists(), 'Pi must never be executed')
        return result

    def run_suite(self, mode=''):
        return self.run_harness('--run', '--launcher', str(self.launcher),
                                '--confirm-disposable-session', mode=mode)

    def calls(self):
        return json.loads(self.state.read_text())['calls']

    def receipts(self):
        return [json.loads(line) for line in (self.artifact / 'receipts.jsonl').read_text().splitlines()]

    def test_help_offline(self):
        result = self.run_harness('--help', env={'HERDR_ENV': '', 'PATH': '/usr/bin:/bin'})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls(), [])

    def test_preflight_read_only_and_does_not_execute_launcher(self):
        result = self.run_harness('--preflight', '--launcher', str(self.launcher))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls(), [['--version'], ['api', 'snapshot']])
        self.assertIsNone(self.artifact)

    def test_consent_required_before_contact(self):
        result = self.run_harness('--run', '--launcher', str(self.launcher))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_context_required_before_contact(self):
        for env in ({'HERDR_ENV': ''}, {'HERDR_PANE_ID': ''}, {'HERDR_SOCKET_PATH': '/nonexistent'}):
            with self.subTest(env=env):
                result = self.run_harness('--preflight', '--launcher', str(self.launcher), env=env)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.calls(), [])

    def test_wrong_launcher_refused_before_contact(self):
        result = self.run_harness('--preflight', '--launcher', '/bin/sh')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_version_and_live_topology_fail_closed(self):
        for mode in ('wrong-cli', 'wrong-server', 'live-topology'):
            with self.subTest(mode=mode):
                result = self.run_suite(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertIsNone(self.artifact)
                self.assertFalse(any(call[:2] == ['workspace', 'create'] for call in self.calls()))

    def test_complete_contract_and_no_unrequested_mutations(self):
        result = self.run_suite()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = (self.artifact / 'report.txt').read_text()
        self.assertIn('RESULT: PASS', report)
        self.assertNotIn(str(self.artifact), report)
        calls = self.calls()
        self.assertFalse(any('--force' in call or '--trust-repository' in call for call in calls))
        self.assertFalse(any(call[:1] in (['agent'], ['server'], ['session'], ['tab']) for call in calls))
        self.assertFalse(any(call[:2] in (['pane', 'split'], ['pane', 'close']) for call in calls))
        self.assertEqual(sum(call[:2] == ['workspace', 'close'] for call in calls), 1)
        self.assertEqual(sum(call[:2] == ['worktree', 'remove'] for call in calls), 2)
        creates = [call for call in calls if call[:2] == ['worktree', 'create']]
        self.assertEqual(len(creates), 3)  # two valid, one deliberate linked-source refusal
        self.assertTrue(all('--no-focus' in call for call in creates))
        self.assertTrue(any(receipt.get('result', {}).get('root_pane')
                            for receipt in self.receipts() if isinstance(receipt.get('result'), dict)))
        self.assertEqual(len(json.loads(self.state.read_text())['paths']), 1)  # occupied retained

    def test_timeout_retains_returned_ids_and_never_retries(self):
        result = self.run_suite('timeout-create')
        self.assertNotEqual(result.returncode, 0)
        receipts = self.receipts()
        returned = [r for r in receipts if r['stage'] == 'create' and r.get('result')]
        self.assertEqual(returned[0]['outcome'], 'uncertain')
        self.assertIn('workspace', returned[0]['result'])
        self.assertEqual(self.calls()[-1][:2], ['worktree', 'create'])
        self.assertEqual(sum(call[:2] == ['worktree', 'create'] for call in self.calls()), 1)
        self.assertTrue(any(r['stage'] == 'clean-remove' and r['outcome'] == 'not_attempted' for r in receipts))
        self.assertTrue((self.artifact / 'fixtures/linked checkout/.git').exists())

    def test_malformed_success_stops_without_cleanup(self):
        result = self.run_suite('malformed-create')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls()[-1][:2], ['worktree', 'create'])
        self.assertTrue(any(r['stage'] == 'create' and r['outcome'] == 'uncertain' for r in self.receipts()))
        self.assertTrue((self.artifact / 'fixtures/linked checkout/.git').exists())

    def test_missing_records_stop_after_recording_response(self):
        result = self.run_suite('missing-record')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls()[-1][:2], ['worktree', 'create'])
        self.assertTrue(any(r['stage'] == 'create' and r.get('result', {}).get('workspace')
                            for r in self.receipts() if isinstance(r.get('result'), dict)))

    def test_unrelated_removal_failure_is_not_expected_dirty_refusal(self):
        result = self.run_suite('wrong-dirty-error')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls()[-1][:2], ['worktree', 'remove'])
        self.assertTrue((self.artifact / 'fixtures/linked checkout/tracked').read_text().endswith('dirty fixture\n'))
        self.assertEqual(sum(call[:2] == ['worktree', 'remove'] for call in self.calls()), 1)

    def test_focus_change_stops_before_further_mutations(self):
        result = self.run_suite('changed-focus')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls()[-1], ['api', 'snapshot'])
        self.assertFalse(any(call[:2] == ['workspace', 'close'] for call in self.calls()))

    def test_unknown_occupancy_stops_without_replacing_or_closing(self):
        result = self.run_suite('unknown-occupancy')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls()[-1][:2], ['pane', 'process-info'])
        self.assertFalse((self.artifact / 'occupant.sh.release').exists())
        self.assertNotIn('RESULT: PASS', (self.artifact / 'report.txt').read_text())


if __name__ == '__main__':
    unittest.main()
