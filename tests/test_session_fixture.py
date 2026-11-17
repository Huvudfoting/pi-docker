"""Real Pi CLI + offline provider; no Docker, real auth/config, model APIs or Herdr.

Optional outside the image: PI_PHASE3_CLI can select a reviewed Pi 1.5.2 CLI.
This tests the fixture and Pi itself, not production Docker/Herdr integration.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
CLI = Path(os.environ.get('PI_PHASE3_CLI', '/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js'))
NODE = shutil.which('node')


@unittest.skipUnless(NODE and CLI.is_file(), 'requires Node and reviewed Pi CLI (PI_PHASE3_CLI)')
class SessionFixtureTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pi-phase3-unit-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.agent = self.root / 'config'
        self.agent.mkdir()
        (self.agent / 'phase3-fixture').write_text('pi-docker-phase3-fixture\n')
        (self.agent / 'auth.json').write_text('{}\n')
        (self.agent / 'settings.json').write_text('{"packages":[],"compaction":{"enabled":false},"retry":{"enabled":false}}\n')
        self.cwd = self.root / 'project'
        self.cwd.mkdir()
        self.store = self.root / 'sessions'
        self.env = {'PATH': os.environ['PATH'], 'HOME': str(self.root),
                    'PI_CODING_AGENT_DIR': str(self.agent),
                    'PI_CODING_AGENT_SESSION_DIR': str(self.store), 'PI_OFFLINE': '1'}

    def run_pi(self, prompt, *flags, cwd=None, store=None, success=True):
        self.store = store or self.store
        env = {**self.env, 'PI_CODING_AGENT_SESSION_DIR': str(self.store)}
        result = subprocess.run([NODE, str(CLI), '--offline', '--print', '--no-approve', '--no-tools', '--no-mcp',
                                 '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files',
                                 '--provider', 'pi-docker-fixture', '--model', 'fixed',
                                 '--extension', str(ROOT / 'tests/session/fixture-provider.ts'),
                                 *flags, prompt],
                                env=env, cwd=cwd or self.cwd, stdin=subprocess.DEVNULL,
                                capture_output=True, text=True, timeout=35)
        if not success:
            return result
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('offline-fixture:' + prompt, result.stdout)
        snapshot = json.loads((self.agent / 'phase3-result.json').read_text())
        self.assertEqual(snapshot['stage'], 'settled')
        self.assertEqual(snapshot['piVersion'], '1.5.2')
        self.assertFalse(snapshot['hasHerdr'])
        self.assertEqual(snapshot['assistants'][-1], 'offline-fixture:' + prompt)
        entries = [json.loads(line) for line in Path(snapshot['sessionFile']).read_text().splitlines()]
        self.assertEqual(entries[0]['id'], snapshot['sessionId'])
        self.assertEqual(entries[0]['cwd'], snapshot['headerCwd'])
        return snapshot

    def test_fresh_turn_is_persisted_by_real_pi(self):
        state = self.run_pi('phase3-first')
        self.assertEqual(state['users'], ['phase3-first'])
        self.assertEqual(state['cwd'], str(self.cwd))
        self.assertEqual(state['headerCwd'], str(self.cwd))
        self.assertEqual(Path(state['sessionFile']).parent, self.store)

    def test_continue_keeps_id_file_and_history(self):
        first = self.run_pi('phase3-first')
        second = self.run_pi('phase3-second', '--continue')
        self.assertEqual(second['sessionId'], first['sessionId'])
        self.assertEqual(second['sessionFile'], first['sessionFile'])
        self.assertEqual(second['users'], ['phase3-first', 'phase3-second'])
        self.assertEqual(len(list(self.store.glob('*.jsonl'))), 1)

    def test_selected_session_restores_its_recorded_cwd(self):
        first = self.run_pi('phase3-first')
        other = self.root / 'other'
        other.mkdir()
        second = self.run_pi('phase3-second', '--session', first['sessionFile'], cwd=other)
        self.assertEqual(second['cwd'], str(self.cwd))
        self.assertEqual(second['sessionId'], first['sessionId'])
        self.assertEqual(second['users'], ['phase3-first', 'phase3-second'])

    def test_separate_storage_does_not_continue_other_conversation(self):
        first = self.run_pi('phase3-first')
        second = self.run_pi('phase3-second', '--continue', store=self.root / 'other-storage')
        self.assertNotEqual(second['sessionId'], first['sessionId'])
        self.assertEqual(second['users'], ['phase3-second'])

    def test_missing_recorded_cwd_fails_without_fork_or_replacement(self):
        first = self.run_pi('phase3-first')
        before = Path(first['sessionFile']).read_bytes()
        self.cwd.rmdir()
        result = self.run_pi('phase3-second', '--session', first['sessionFile'], cwd=self.root, success=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(Path(first['sessionFile']).read_bytes(), before)
        self.assertEqual(len(list(self.store.glob('*.jsonl'))), 1)

    def test_fixture_cannot_activate_without_sentinel(self):
        (self.agent / 'phase3-fixture').unlink()
        result = self.run_pi('phase3-first', success=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.agent / 'phase3-result.json').exists())
