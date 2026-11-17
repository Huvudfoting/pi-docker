"""Small launcher checks with a fake Docker CLI; no daemon or real private state.

Run: python3 -m unittest discover -s tests -p 'test_*.py' -v
The real Herdr launch/restart trial still runs on the host.
"""

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import pty
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1]


class HerdrLauncherTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pi-herdr-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        # Copy deployment inputs only, never the real repository's data/ or .git/.
        self.setup = self.root
        for directory in ['bin', 'lib', 'docs', 'extensions', 'skills', 'images']:
            shutil.copytree(SOURCE / directory, self.root / directory)
        for filename in ['README.md', 'compose.yaml', 'compose.git.yaml', 'compose.herdr.yaml', 'compose.metadata.yaml']:
            shutil.copy2(SOURCE / filename, self.root / filename)
        self.project = self.root / "project with 'quotes'"
        self.project.mkdir()
        self.other = self.root / "other"
        self.other.mkdir()
        self.log = self.root / "docker.json"
        self.bin = self.root / "fake-bin"
        self.bin.mkdir()
        (self.bin / "pi").symlink_to(self.setup / "bin/pi")
        self.probes = self.root / "docker-probes.log"
        docker = self.bin / "docker"
        docker.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys\n"
            "with open(os.environ['DOCKER_PROBE_LOG'], 'a') as f: f.write(json.dumps(sys.argv[1:]) + '\\n')\n"
            "if sys.argv[1:3] == ['image', 'ls']:\n"
            "    if os.environ.get('LOOKUP_FAILURE'): sys.exit(71)\n"
            "    if os.environ.get('MISSING_IMAGE') not in ['pi-docker:custom', 'all']: print('pi-docker:custom')\n"
            "    sys.exit(0)\n"
            "if sys.argv[1:3] == ['image', 'inspect']: sys.exit(1 if os.environ.get('MISSING_IMAGE') in [sys.argv[3], 'all'] or os.environ.get('INSPECT_FAILURE') else 0)\n"
            "if sys.argv[1] == 'compose' and sys.argv[-2:] == ['config', '--quiet']: sys.exit(int(os.environ.get('CONFIG_EXIT', '0')))\n"
            "keys = ['PI_WORKSPACE', 'PI_SESSIONS', 'PI_SESSION_TARGET', "
            "'HERDR_ENV', 'HERDR_PANE_ID', 'HERDR_SOCKET_HOST_PATH', 'HERDR_AGENT', 'PI_GITCONFIG', 'PI_DOCKER_IMAGE', "
            "'PI_CHECKOUT_SOURCE', 'PI_CHECKOUT_TARGET', 'PI_WORKDIR', 'PI_GIT_COMMON', 'COMPOSE_FILE', 'COMPOSE_ENV_FILES']\n"
            "with open(os.environ['DOCKER_LOG'], 'w') as f:\n"
            "    json.dump({'args': sys.argv[1:], 'env': {k: os.environ.get(k) for k in keys}}, f)\n"
            "sys.exit(int(os.environ.get('DOCKER_EXIT', '0')))\n"
        )
        docker.chmod(0o755)
        # Deliberately don't inherit real Herdr, Docker, or Pi configuration.
        self.env = {
            "PATH": f"{self.bin}:{os.environ['PATH']}",
            "HOME": str(self.root),
            "DOCKER_LOG": str(self.log),
            "DOCKER_PROBE_LOG": str(self.probes),
            "MISSING_IMAGE": "pi-docker:custom",
        }
        self.sock = self.make_socket("herdr.sock")
        self.env.update(HERDR_ENV="1", HERDR_PANE_ID="w1:p1", HERDR_SOCKET_PATH=str(self.sock))
        extension = self.root / "data/config/extensions/herdr-agent-state.ts"
        extension.parent.mkdir(parents=True)
        extension.write_text("// managed test fixture v9\n")
        self.fake_herdr()

    def make_socket(self, name):
        endpoint = self.root / name
        sock = socket.socket(socket.AF_UNIX)
        sock.bind(str(endpoint))
        self.addCleanup(sock.close)
        return endpoint

    def launch(self, *args, env=None, cwd=None):
        self.log.unlink(missing_ok=True)
        master, slave = pty.openpty()
        try:
            result = subprocess.run(
                [str(self.setup / "bin/pi"), *map(str, args)],
                cwd=cwd or self.other,
                env=self.env if env is None else env,
                stdin=slave,
                stdout=slave,
                stderr=subprocess.PIPE,
                text=True,
                timeout=10,
            )
        finally:
            os.close(slave)
            os.close(master)
        invocation = json.loads(self.log.read_text()) if self.log.exists() else None
        return result, invocation

    def initial_launch(self):
        result, invocation = self.launch(self.project, "--name", "backend", "--herdr")
        self.assertEqual(result.returncode, 0, result.stderr)
        return invocation

    def run_command(self, command, *args, env=None):
        return subprocess.run(
            [str(command), *args], cwd=self.other,
            env=self.env if env is None else env,
            stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10,
        )

    def fake_herdr(self):
        herdr = self.bin / "herdr"
        herdr.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys\n"
            "from pathlib import Path\n"
            "config = Path(os.environ['PI_CODING_AGENT_DIR'])\n"
            "call = {'args': sys.argv[1:], 'config': str(config)}\n"
            "with open(os.environ['HERDR_LOG'], 'w') as f: json.dump(call, f)\n"
            "with open(os.environ['HERDR_LOG'] + '.history', 'a') as f: f.write(json.dumps(call) + '\\n')\n"
            "if os.environ.get('HERDR_EXIT'): sys.exit(int(os.environ['HERDR_EXIT']))\n"
            "target = config / 'extensions/herdr-agent-state.ts'\n"
            "if sys.argv[1:] == ['--version']:\n"
            "    print(os.environ.get('HERDR_VERSION', 'herdr 0.9.5'))\n"
            "elif sys.argv[1:] == ['--skill']:\n"
            "    if os.environ.get('HERDR_SKILL_FAIL'): print('partial'); sys.exit(23)\n"
            "    if not os.environ.get('HERDR_SKILL_EMPTY'): print('---\\nname: herdr\\ndescription: Official fixture\\n---\\n# Herdr')\n"
            "elif sys.argv[1:] == ['integration', 'status']:\n"
            "    state = os.environ.get('HERDR_STATUS')\n"
            "    if state == 'malformed': print('pi: new unknown format'); sys.exit(0)\n"
            "    if state == 'duplicate': print(f'pi: current (v9) ({target})')\n"
            "    if not state or state == 'duplicate':\n"
            "        state = 'not installed' if not target.exists() else ('current (v9)' if 'v9' in target.read_text() else ('outdated (v1 < v9)' if 'v1' in target.read_text() else 'outdated (legacy < v9)'))\n"
            "    print(f'pi: {state} ({target})')\n"
            "elif sys.argv[1:] == ['integration', 'install', 'pi']:\n"
            "    import time\n"
            "    time.sleep(float(os.environ.get('HERDR_INSTALL_DELAY', '0')))\n"
            "    if not os.environ.get('HERDR_SKIP_WRITE'):\n"
            "        target.parent.mkdir(exist_ok=True)\n"
            "        target.write_text('// managed test fixture v9\\n')\n"
            "elif sys.argv[1:] == ['integration', 'uninstall', 'pi']:\n"
            "    target.unlink(missing_ok=True)\n"
            "else: sys.exit(64)\n"
        )
        herdr.chmod(0o755)
        self.env['HERDR_LOG'] = str(self.root / 'herdr.json')
        return herdr

    def test_standalone_launch_uses_only_pi_compose(self):
        result, invocation = self.launch(self.project, "--name", "standalone", "--no-herdr")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(invocation["args"][:3], [
            "compose", "-f", str(self.setup / "compose.yaml"),
        ])

    def test_image_selection_and_base_has_no_custom_extension_paths(self):
        for cli, configured, expected in [([], None, 'pi-docker:base'),
                                           ([], 'pi-docker:custom', 'pi-docker:custom'),
                                           ([], 'invalid inherited image', 'pi-docker:custom')]:
            env = dict(self.env)
            if configured:
                env['PI_DOCKER_IMAGE'] = configured
                env.pop('MISSING_IMAGE')
            result, invocation = self.launch(self.project, '--name', 'backend', '--no-herdr', *cli, env=env)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(invocation['env']['PI_DOCKER_IMAGE'], expected)
            self.assertIn(['image', 'inspect', expected], [json.loads(line) for line in self.probes.read_text().splitlines()])
            self.assertNotIn('--image', invocation['args'])
            self.assertFalse(any('/usr/local/lib/node_modules/' in a for a in invocation['args']))
            self.assertNotIn('/usr/local/share/pi-custom/skills', invocation['args'])
        for args in [('--image',), ('--image', ''), ('--image', '--privileged'), ('--image', 'bad image'), ('--image=pi-docker:base',)]:
            result, invocation = self.launch(self.project, '--name', 'backend', *args)
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertIsNone(invocation)

    def test_available_custom_is_preferred_and_inherited_base_is_ignored(self):
        env = {k: v for k, v in self.env.items() if k != 'MISSING_IMAGE'}
        for cli, configured, expected in [([], None, 'pi-docker:custom'),
                                           ([], 'pi-docker:base', 'pi-docker:custom')]:
            selected_env = dict(env)
            if configured:
                selected_env['PI_DOCKER_IMAGE'] = configured
            self.probes.unlink(missing_ok=True)
            result, invocation = self.launch(self.other, '--no-herdr', *cli, env=selected_env)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(invocation['env']['PI_DOCKER_IMAGE'], expected)
            probes = [json.loads(line) for line in self.probes.read_text().splitlines()]
            if expected == 'pi-docker:base':
                self.assertNotIn(['image', 'inspect', 'pi-docker:custom'], probes)

    def test_missing_selected_image_fails_before_preparation(self):
        result, invocation = self.launch(self.other, env={**self.env, 'MISSING_IMAGE': 'all'})
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIsNone(invocation)
        self.assertIn('pi-docker:base', result.stderr)
        self.assertIn('./bin/build custom', result.stderr)
        self.assertEqual(self.herdr_calls(), [])
        self.assertFalse((self.root / 'data/sessions').exists())
        self.assertFalse((self.root / 'data/herdr-launches').exists())

    def test_native_restore_selects_image_afresh_with_image_independent_records(self):
        original = self.initial_launch()
        filename = 'image-test.jsonl'
        (Path(original['env']['PI_SESSIONS']) / filename).write_text('fixture conversation sentinel\n')
        reference = f"{original['env']['PI_SESSION_TARGET']}/{filename}"
        for missing, expected in [('', 'pi-docker:custom'), ('pi-docker:custom', 'pi-docker:base')]:
            env = {**self.env, 'MISSING_IMAGE': missing, 'PI_DOCKER_IMAGE': 'ignored:preference'}
            result, restored = self.launch('--session', reference, env=env)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(restored['env']['PI_DOCKER_IMAGE'], expected)
            self.assertEqual(restored['env']['PI_SESSION_TARGET'], original['env']['PI_SESSION_TARGET'])
            self.assertEqual(restored['env']['PI_SESSIONS'], original['env']['PI_SESSIONS'])
        records = list((self.root / 'data/herdr-launches').glob('*.record'))
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0].read_bytes(), f'pi-docker-herdr-v3\0{self.project}\0backend\0'.encode())

    def test_old_restore_record_versions_are_rejected_without_replacements(self):
        original = self.initial_launch()
        record = next((self.root / 'data/herdr-launches').glob('*.record'))
        for version in ['pi-docker-herdr-v1', 'pi-docker-herdr-v2']:
            record.write_bytes(f'{version}\0{self.project}\0backend\0pi-docker:base\0'.encode())
            result, invocation = self.launch('--session', f"{original['env']['PI_SESSION_TARGET']}/old.jsonl")
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertIsNone(invocation)
            self.assertIn('Unsupported Herdr launch record version', result.stderr)

    def test_lookup_and_inspect_failures_do_not_fall_back(self):
        for failure in ['LOOKUP_FAILURE', 'INSPECT_FAILURE']:
            self.probes.unlink(missing_ok=True)
            result, invocation = self.launch(self.other, env={**self.env, 'MISSING_IMAGE': '', failure: '1'})
            self.assertNotEqual(result.returncode, 0)
            self.assertIsNone(invocation)
            probes = [json.loads(line) for line in self.probes.read_text().splitlines()]
            self.assertNotIn(['image', 'inspect', 'pi-docker:base'], probes)
            self.assertEqual(self.herdr_calls(), [])

    def test_compose_validation_failure_prevents_run(self):
        result, invocation = self.launch(self.other, '--no-herdr', env={**self.env, 'CONFIG_EXIT': '1'})
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIsNone(invocation)
        self.assertIn('configuration validation failed', result.stderr)

    def test_gitconfig_is_optional_read_only_and_can_be_disabled(self):
        config = self.root / '.gitconfig'
        result, invocation = self.launch(self.other, '--no-herdr')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(str(self.setup / 'compose.git.yaml'), invocation['args'])
        self.assertFalse(config.exists())
        config.write_text('[user]\nname = Test\n')
        result, invocation = self.launch(self.other, '--no-herdr')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(str(self.setup / 'compose.git.yaml'), invocation['args'])
        self.assertEqual(invocation['env']['PI_GITCONFIG'], str(config))
        overlay = (self.setup / 'compose.git.yaml').read_text()
        self.assertIn('read_only: true', overlay)
        self.assertIn('create_host_path: false', overlay)
        result, invocation = self.launch(self.other, '--no-herdr', '--no-host-gitconfig')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(str(self.setup / 'compose.git.yaml'), invocation['args'])

    def test_gitconfig_directory_is_not_mounted(self):
        (self.root / '.gitconfig').mkdir()
        result, invocation = self.launch(self.other, '--no-herdr')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(str(self.setup / 'compose.git.yaml'), invocation['args'])

    def test_gitconfig_and_herdr_overlays_work_together(self):
        (self.root / '.gitconfig').write_text('[user]\nname = Test\n')
        result, invocation = self.launch(self.other, '--herdr')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(invocation['args'][:7], [
            'compose', '-f', str(self.setup / 'compose.yaml'),
            '-f', str(self.setup / 'compose.git.yaml'),
            '-f', str(self.setup / 'compose.herdr.yaml'),
        ])

    def test_standalone_needs_no_host_herdr(self):
        (self.bin / 'herdr').unlink()
        env = {key: value for key, value in self.env.items() if not key.startswith('HERDR_')}
        result, invocation = self.launch(self.other, env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(str(self.setup / 'compose.herdr.yaml'), invocation['args'])
        self.assertNotIn('--skill', invocation['args'])
        self.assertIsNone(invocation['env']['HERDR_SOCKET_HOST_PATH'])
        self.assertFalse((self.root / 'data/herdr-launches').exists())
        self.assertEqual(self.herdr_calls(), [])
        # The installed reporter fixture remains in shared configuration, but
        # standalone Compose must not forward the context that activates it.
        self.assertNotIn('HERDR_', (self.setup / 'compose.yaml').read_text())

    def test_disabled_herdr_needs_no_host_herdr(self):
        (self.bin / 'herdr').unlink()
        result, invocation = self.launch(self.other, '--no-herdr')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(str(self.setup / 'compose.herdr.yaml'), invocation['args'])
        self.assertNotIn('--skill', invocation['args'])
        self.assertIsNone(invocation['env']['HERDR_SOCKET_HOST_PATH'])
        self.assertFalse((self.root / 'data/herdr-launches').exists())
        self.assertEqual(self.herdr_calls(), [])

    def test_help_and_status_are_read_only_without_docker_calls(self):
        private = self.root / "data/config/auth.json"
        private.write_text('TEST-ONLY-secret-do-not-print')
        before = sorted(p.relative_to(self.root) for p in (self.root / "data").rglob("*"))
        result = self.run_command(self.setup / "bin/pi", "--help")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--herdr-status", result.stdout)
        self.assertIn("bin/herdr-extension install", result.stdout)
        self.assertNotIn(str(self.root), result.stdout)
        self.assertIn('Ordinary launches retain /workspace', result.stdout)
        result = self.run_command(self.setup / "bin/pi", str(self.project), "--name", "backend", "--herdr-status")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Official extension: present", result.stdout)
        self.assertIn("not created yet", result.stdout)
        self.assertIn("Native restore PATH: pi resolves to this launcher", result.stdout)
        self.assertIn("not contacted", result.stdout)
        self.assertIn("informational here", result.stdout)
        self.assertNotIn(private.read_text(), result.stdout + result.stderr)
        self.assertEqual(before, sorted(p.relative_to(self.root) for p in (self.root / "data").rglob("*")))
        self.assertEqual(self.herdr_calls(), [])
        self.assertFalse(self.probes.exists())

    def test_status_reports_missing_context_and_extension_without_changes(self):
        (self.root / "data/config/extensions/herdr-agent-state.ts").unlink()
        result = self.run_command(
            self.setup / "bin/pi", "--herdr-status", env={**self.env, "HERDR_ENV": "", "HERDR_SOCKET_PATH": ""},
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("Official extension: missing", result.stdout)
        self.assertIn("Pane context: missing", result.stdout)
        self.assertIn("Host socket: missing", result.stdout)
        self.assertFalse(self.probes.exists())
        self.assertFalse((self.root / "data/herdr-launches").exists())
        self.assertFalse((self.root / "data/sessions").exists())

    def test_installer_resolves_symlink_and_overrides_only_target_configuration(self):
        herdr = self.fake_herdr()
        config = self.root / "data/config"
        private = config / "auth.json"
        private.write_text('TEST-ONLY-secret-do-not-print')
        alias = self.bin / "install-herdr"
        alias.symlink_to(self.setup / "bin/herdr-extension")
        # Match the owning binary even if it is not named herdr on PATH.
        owning = herdr.with_name("owning-herdr")
        herdr.rename(owning)
        env = {**self.env, "HERDR_BIN_PATH": str(owning), "PI_CODING_AGENT_DIR": "/wrong/config"}
        for action in ((), ("install",), ("uninstall",)):
            result = self.run_command(alias, *action, env=env)
            self.assertEqual(result.returncode, 0, result.stderr)
            call = json.loads(Path(self.env['HERDR_LOG']).read_text())
            self.assertEqual(call['config'], str(config))
            self.assertEqual(call['args'], ['integration', 'uninstall', 'pi'] if action == ('uninstall',) else ['integration', 'install', 'pi'])
            self.assertNotIn(private.read_text(), result.stdout + result.stderr)
        self.assertFalse((config / "extensions/herdr-agent-state.ts").exists())
        self.assertEqual(private.read_text(), 'TEST-ONLY-secret-do-not-print')
        self.assertFalse(self.probes.exists())

    def test_installer_creates_only_needed_state_and_reports_failures(self):
        self.fake_herdr()
        shutil.rmtree(self.root / "data")  # Only this test's private fixture.
        installer = self.setup / "bin/herdr-extension"
        for args in (("--help",), ("uninstall",), ("invalid",)):
            result = self.run_command(installer, *args)
            self.assertEqual(result.returncode, 2 if args == ("invalid",) else 0, result.stderr)
            self.assertFalse((self.root / "data").exists())
            self.assertFalse(Path(self.env['HERDR_LOG']).exists())
        result = self.run_command(installer)
        self.assertEqual(result.returncode, 0, result.stderr)
        extension = self.root / "data/config/extensions/herdr-agent-state.ts"
        self.assertTrue(extension.is_file())
        self.assertEqual((self.root / "data/config").stat().st_mode & 0o777, 0o700)
        extension.unlink()
        result = self.run_command(installer, env={**self.env, "HERDR_SKIP_WRITE": "1"})
        self.assertEqual(result.returncode, 1)
        self.assertIn("returned success but no readable", result.stderr)
        result = self.run_command(installer, env={**self.env, "HERDR_EXIT": "23"})
        self.assertEqual(result.returncode, 23)
        self.assertIn("Herdr install failed", result.stderr)
        self.assertFalse(self.probes.exists())

    def herdr_calls(self):
        history = Path(self.env['HERDR_LOG'] + '.history')
        return [json.loads(line)['args'] for line in history.read_text().splitlines()] if history.exists() else []

    def test_auto_current_enables_with_notice_without_rewriting(self):
        extension = self.root / 'data/config/extensions/herdr-agent-state.ts'
        before = extension.stat().st_mtime_ns
        # Upstream accepts newer versions too; do not force an exact match.
        result, invocation = self.launch(self.project, '--name', 'backend', env={**self.env, 'HERDR_STATUS': 'current (v99)'})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Herdr integration enabled', result.stderr)
        self.assertIn('including other panes', result.stderr)
        self.assertIn('--no-herdr', result.stderr)
        self.assertIn(str(self.setup / 'compose.herdr.yaml'), invocation['args'])
        self.assertEqual(self.herdr_calls(), [['integration', 'status']])
        self.assertEqual(extension.stat().st_mtime_ns, before)

    def test_auto_installs_missing_and_outdated_then_verifies(self):
        extension = self.root / 'data/config/extensions/herdr-agent-state.ts'
        private = extension.parents[1] / 'auth.json'
        private.write_text('TEST-ONLY-secret-do-not-print')
        for content, state in ((None, 'missing'), ('// old fixture', 'outdated'), ('// fixture v1', 'outdated')):
            with self.subTest(state=state):
                Path(self.env['HERDR_LOG'] + '.history').unlink(missing_ok=True)
                if content is None:
                    shutil.rmtree(self.root / 'data/config')
                else:
                    extension.write_text(content)
                result, invocation = self.launch(self.project, '--name', 'backend', env={**self.env, 'PI_CODING_AGENT_DIR': '/wrong/config'})
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(f'integration is {state}', result.stderr)
                self.assertIn('Herdr integration enabled', result.stderr)
                self.assertEqual(self.herdr_calls(), [
                    ['integration', 'status'], ['integration', 'install', 'pi'], ['integration', 'status'],
                ])
                self.assertIn('v9', extension.read_text())
                self.assertIn('/pi/herdr-sessions/', invocation['env']['PI_SESSION_TARGET'])
                if content is not None:
                    self.assertEqual(private.read_text(), 'TEST-ONLY-secret-do-not-print')
                private.write_text('TEST-ONLY-secret-do-not-print')
                self.assertNotIn(private.read_text(), result.stderr)

    def test_disabled_no_context_and_ineligible_launches_never_invoke_herdr(self):
        for args, patch in (
            (('--no-herdr',), {'HERDR_AGENT': 'inherited'}),
            ((), {'HERDR_ENV': '', 'HERDR_PANE_ID': '', 'HERDR_SOCKET_PATH': ''}),
            (('--', '--print', 'hello'), {}),
            (('--', 'update'), {}),
            (('--', '--no-session'), {}),
            (('--', '--no-extensions'), {}),
            (('--', '--session', '/explicit.jsonl'), {}),
        ):
            with self.subTest(args=args, patch=patch):
                result, invocation = self.launch(self.project, '--name', 'backend', *args, env={**self.env, **patch})
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertNotIn(str(self.setup / 'compose.herdr.yaml'), invocation['args'])
                self.assertIsNone(invocation['env']['HERDR_AGENT'])
                self.assertEqual(self.herdr_calls(), [])
        result = self.run_command(self.setup / 'bin/pi', str(self.project), '--name', 'backend')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.herdr_calls(), [])
        self.assertFalse((self.root / 'data/herdr-launches').exists())

    def test_auto_failures_fall_back_but_required_launches_fail(self):
        for patch in (
            {'HERDR_EXIT': '23'},
            {'HERDR_STATUS': 'malformed'},
            {'HERDR_STATUS': 'duplicate'},
            {'HERDR_STATUS': 'outdated (v1 < v9)', 'HERDR_SKIP_WRITE': '1'},
            {'HERDR_BIN_PATH': '/missing/herdr'},
            {'HERDR_SOCKET_PATH': '/missing/socket'},
            {'HERDR_PANE_ID': ''},
        ):
            with self.subTest(patch=patch):
                env = {**self.env, **patch}
                result, invocation = self.launch(self.project, '--name', 'backend', env=env)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('reporting and native restore are unavailable', result.stderr)
                self.assertNotIn('Herdr integration enabled', result.stderr)
                self.assertEqual(invocation['env']['PI_SESSION_TARGET'], '/pi/sessions')
                self.assertNotIn(str(self.setup / 'compose.herdr.yaml'), invocation['args'])
                result, invocation = self.launch(self.project, '--name', 'backend', '--herdr', env=env)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertIsNone(invocation)
        self.assertFalse((self.root / 'data/herdr-launches').exists())

    def test_restore_integration_failure_never_falls_back(self):
        original = self.initial_launch()
        (Path(original['env']['PI_SESSIONS']) / 'persisted.jsonl').write_text('fixture conversation sentinel\n')
        result, invocation = self.launch('--session', original['env']['PI_SESSION_TARGET'] + '/persisted.jsonl',
                                         env={**self.env, 'HERDR_EXIT': '23'})
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIsNone(invocation)
        self.assertNotIn('launching without socket access', result.stderr)

    def test_ensure_uses_selected_host_binary_and_deployment_only(self):
        owning = self.bin / 'owning-herdr'
        (self.bin / 'herdr').rename(owning)
        result, invocation = self.launch(self.project, '--name', 'backend', env={
            **self.env, 'HERDR_BIN_PATH': str(owning), 'PI_CODING_AGENT_DIR': '/wrong/config',
        })
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Herdr integration enabled', result.stderr)
        call = json.loads(Path(self.env['HERDR_LOG']).read_text())
        self.assertEqual(call['config'], str(self.root / 'data/config'))
        self.assertEqual(self.herdr_calls(), [['integration', 'status']])

    def test_unknown_status_does_not_install_or_modify_extension(self):
        extension = self.root / 'data/config/extensions/herdr-agent-state.ts'
        before = extension.read_bytes()
        result = self.run_command(self.setup / 'bin/herdr-extension', 'ensure',
                                  env={**self.env, 'HERDR_STATUS': 'malformed'})
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(extension.read_bytes(), before)
        self.assertEqual(self.herdr_calls(), [['integration', 'status']])

    def test_current_status_cannot_mask_an_empty_extension(self):
        (self.root / 'data/config/extensions/herdr-agent-state.ts').write_text('')
        result = self.run_command(self.setup / 'bin/herdr-extension', 'ensure',
                                  env={**self.env, 'HERDR_STATUS': 'current (v9)'})
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn('empty or unreadable', result.stderr)
        self.assertNotIn(['integration', 'install', 'pi'], self.herdr_calls())

    def test_concurrent_ensure_installs_once_and_rechecks_under_lock(self):
        (self.root / 'data/config/extensions/herdr-agent-state.ts').unlink()
        env = {**self.env, 'HERDR_INSTALL_DELAY': '0.15'}
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.run_command(self.setup / 'bin/herdr-extension', 'ensure', env=env), range(4)))
        for result in results:
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.herdr_calls().count(['integration', 'install', 'pi']), 1)
        self.assertEqual(self.herdr_calls().count(['integration', 'status']), 5)

    def test_reporter_actions_do_not_modify_shared_skills(self):
        directory = self.root / 'data/config/skills/herdr'
        directory.mkdir(parents=True)
        (directory / 'SKILL.md').write_text('---\nname: herdr\ndescription: User skill fixture\n---\n')
        before = {p.name: p.read_bytes() for p in directory.iterdir()}
        installer = self.setup / 'bin/herdr-extension'
        for action in ('ensure', 'install', 'uninstall'):
            result = self.run_command(installer, action)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(before, {p.name: p.read_bytes() for p in directory.iterdir()})
        self.assertNotIn(['--skill'], self.herdr_calls())
        self.assertNotIn(['--version'], self.herdr_calls())

    def test_fresh_ensure_does_not_create_shared_skills(self):
        result = self.run_command(self.setup / 'bin/herdr-extension', 'ensure')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.root / 'data/config/skills').exists())
        self.assertEqual(self.herdr_calls(), [['integration', 'status']])

    def test_conflicting_mode_flags_rejected_without_preparation(self):
        result, invocation = self.launch(self.project, '--herdr', '--no-herdr')
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIsNone(invocation)
        self.assertEqual(self.herdr_calls(), [])

    def test_standalone_keeps_default_boundary_even_in_herdr_shell(self):
        env = {**self.env, "PI_SESSION_TARGET": "/unexpected"}
        result, invocation = self.launch(self.project, "--name", "backend", "--", "--version", env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(str(self.setup / "compose.herdr.yaml"), invocation["args"])
        self.assertEqual(invocation["env"]["PI_SESSION_TARGET"], "/pi/sessions")
        self.assertIsNone(invocation["env"]["HERDR_AGENT"])
        self.assertEqual(invocation["args"][-1], "--version")
        self.assertFalse((self.root / "data/herdr-launches").exists())

    def test_pi_arguments_are_forwarded_verbatim_after_launcher_options(self):
        arguments = ["--model", "provider/model", "--name", "conversation title", "--", "--herdr is prompt text"]
        result, invocation = self.launch(self.project, "--name", "backend", "--", *arguments)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(invocation["args"][-len(arguments):], arguments)
        result, invocation = self.launch("--", "--help")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(invocation["args"][-1], "--help")  # Pi help, not launcher help.

    def test_host_workspace_binding_is_scoped_to_integrated_compose(self):
        # Contract check: the fake Docker CLI does not evaluate Compose YAML.
        # The override consumes the launcher's resolved PI_WORKSPACE; there is
        # no passthrough from a possibly stale PI_DOCKER_HOST_WORKSPACE value.
        override = (self.setup / 'compose.herdr.yaml').read_text()
        base = (self.setup / 'compose.yaml').read_text()
        self.assertIn('      PI_DOCKER_HOST_WORKSPACE: "${PI_WORKSPACE:?}"', override)
        self.assertNotIn('PI_DOCKER_HOST_WORKSPACE', base)
        alias = self.root / 'project alias'
        alias.symlink_to(self.project, target_is_directory=True)
        for args, patch, integrated in (
            ((), {}, True),
            (('--herdr',), {}, True),
            (('--herdr', '--', '--no-skills'), {}, True),
            (('--no-herdr',), {}, False),
            ((), {'HERDR_ENV': '', 'HERDR_PANE_ID': '', 'HERDR_SOCKET_PATH': ''}, False),
            ((), {'HERDR_EXIT': '23'}, False),
        ):
            with self.subTest(args=args, patch=patch):
                result, invocation = self.launch(alias, '--name', 'backend', *args, env={
                    **self.env, 'PI_WORKSPACE': '/stale/project',
                    'PI_DOCKER_HOST_WORKSPACE': '/stale/host/project', **patch,
                })
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(invocation['env']['PI_WORKSPACE'], str(self.project))
                self.assertEqual(str(self.setup / 'compose.herdr.yaml') in invocation['args'], integrated)
                self.assertEqual('--skill' in invocation['args'], integrated)
                self.assertNotIn('/opt/pi-docker/skills/pi-docker-herdr/SKILL.md', invocation['args'])
                self.assertEqual(invocation['args'].count('--append-system-prompt'), 1)
                if integrated:
                    index = invocation['args'].index('--skill')
                    self.assertEqual(invocation['args'][index:index + 4], [
                        '--skill', '/usr/local/share/pi-skills/herdr',
                        '--skill', '/opt/pi-docker/skills/pi-docker-herdr',
                    ])

    def test_sibling_selection_has_explicit_project_and_separate_storage(self):
        original = self.initial_launch()
        helper = 'helper-a1b2c3'
        result, sibling = self.launch(self.project, '--name', helper, '--herdr', cwd=self.other)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(sibling['env']['PI_WORKSPACE'], original['env']['PI_WORKSPACE'])
        self.assertNotEqual(sibling['env']['PI_SESSIONS'], original['env']['PI_SESSIONS'])
        self.assertNotEqual(sibling['env']['PI_SESSION_TARGET'], original['env']['PI_SESSION_TARGET'])
        self.assertIn(str(self.setup / 'compose.herdr.yaml'), sibling['args'])
        self.assertNotIn('--name', sibling['args'])  # Consumed by host launcher, not Pi.
        self.assertNotIn('--herdr', sibling['args'])

    def test_herdr_record_publication_leaves_no_temporary_files(self):
        first = self.initial_launch()
        self.initial_launch()  # Reusing the same selection must be idempotent.
        records = self.root / "data/herdr-launches"
        self.assertEqual(len(list(records.glob("*.record"))), 1)
        self.assertEqual(list(records.glob(".launch.*")), [])
        self.assertEqual(first["env"]["PI_WORKSPACE"], str(self.project))

    def test_native_restore_recovers_selection_and_uses_fresh_context(self):
        original = self.initial_launch()
        self.assertIn(str(self.setup / "compose.herdr.yaml"), original["args"])
        self.assertEqual(original["env"]["HERDR_AGENT"], "pi")
        target = original["env"]["PI_SESSION_TARGET"]
        self.assertRegex(target, r"^/pi/herdr-sessions/[a-f0-9]{64}$")
        record = next((self.root / "data/herdr-launches").glob("*.record"))
        self.assertEqual(record.stat().st_mode & 0o777, 0o600)
        self.assertNotIn(b"herdr.sock", record.read_bytes())
        filename = "2026-01-01T12-00-00-000Z_example.jsonl"
        (Path(original["env"]["PI_SESSIONS"]) / filename).write_text('fixture conversation sentinel\n')
        reference = f"{target}/{filename}"
        fresh = {**self.env, "HERDR_PANE_ID": "w2:p3", "HERDR_SOCKET_PATH": str(self.make_socket("new.sock")),
                 "PI_WORKSPACE": str(self.other), "PI_DOCKER_HOST_WORKSPACE": "/stale/project", "DOCKER_EXIT": "17"}
        result, restored = self.launch("--session", reference, env=fresh, cwd=self.root)
        self.assertEqual(result.returncode, 17, result.stderr)  # exec preserves exit status
        for key in ("PI_WORKSPACE", "PI_SESSIONS", "PI_SESSION_TARGET"):
            self.assertEqual(restored["env"][key], original["env"][key])
        self.assertEqual(restored["env"]["HERDR_PANE_ID"], "w2:p3")
        self.assertEqual(restored["env"]["HERDR_SOCKET_HOST_PATH"], fresh["HERDR_SOCKET_PATH"])
        self.assertEqual(restored["env"]["HERDR_AGENT"], "pi")
        # Integrated Compose maps this recovered root into PI_DOCKER_HOST_WORKSPACE.
        self.assertIn(str(self.setup / 'compose.herdr.yaml'), restored['args'])
        self.assertEqual(restored['env']['PI_WORKSPACE'], str(self.project))
        self.assertEqual(restored["args"][-2:], ["--session", reference])
        index = restored['args'].index('--skill')
        self.assertEqual(restored['args'][index:index + 4], [
            '--skill', '/usr/local/share/pi-skills/herdr',
            '--skill', '/opt/pi-docker/skills/pi-docker-herdr',
        ])

    def test_missing_or_out_of_scope_restore_fails_without_launching(self):
        original = self.initial_launch()
        target = original["env"]["PI_SESSION_TARGET"]
        for reference, message in (
            (f"{target}/missing.jsonl", "missing session"),
            (f"{target}/../escape.jsonl", "Invalid managed session reference"),
            (f"/pi/herdr-sessions/{'0' * 64}/session.jsonl", "launch record"),
        ):
            with self.subTest(reference=reference):
                result, invocation = self.launch("--session", reference)
                self.assertEqual(result.returncode, 2)
                self.assertIn(message, result.stderr)
                self.assertIsNone(invocation)
        outside = self.root / "outside.jsonl"
        outside.touch()
        (Path(original["env"]["PI_SESSIONS"]) / "link.jsonl").symlink_to(outside)
        result, invocation = self.launch("--session", f"{target}/link.jsonl")
        self.assertEqual(result.returncode, 2)
        self.assertIn("outside", result.stderr)
        self.assertIsNone(invocation)

    def test_empty_native_restore_fails_before_launch_without_replacement(self):
        original = self.initial_launch()
        requested = Path(original['env']['PI_SESSIONS']) / 'empty.jsonl'
        requested.touch()
        record = next((self.root / 'data/herdr-launches').glob('*.record'))
        before_record = record.read_bytes()
        before_herdr = self.herdr_calls()
        before_sessions = {p.name: p.read_bytes() for p in requested.parent.iterdir()}
        self.probes.unlink()
        result, invocation = self.launch('--session', f"{original['env']['PI_SESSION_TARGET']}/empty.jsonl")
        self.assertEqual(result.returncode, 2)
        self.assertIn('empty or unreadable session', result.stderr)
        self.assertIsNone(invocation)
        # Read-only image selection may run first; Compose and reporter must not.
        probes = [json.loads(line) for line in self.probes.read_text().splitlines()]
        self.assertTrue(all(probe[0] == 'image' for probe in probes))
        self.assertEqual(self.herdr_calls(), before_herdr)
        self.assertEqual(record.read_bytes(), before_record)
        self.assertEqual({p.name: p.read_bytes() for p in requested.parent.iterdir()}, before_sessions)

    def test_conflicting_record_is_not_overwritten_or_executed(self):
        original = self.initial_launch()
        record = next((self.root / "data/herdr-launches").glob("*.record"))
        record.write_bytes(b"not executable configuration\0")
        result, invocation = self.launch("--session", f"{original['env']['PI_SESSION_TARGET']}/file.jsonl")
        self.assertEqual(result.returncode, 2)
        self.assertIn("launch record", result.stderr)
        self.assertIsNone(invocation)
        result, invocation = self.launch(self.project, "--name", "backend", "--herdr")
        self.assertEqual(result.returncode, 2)
        self.assertIn("Conflicting", result.stderr)
        self.assertEqual(record.read_bytes(), b"not executable configuration\0")
        self.assertIsNone(invocation)

    def test_context_and_unsupported_options_fail_before_compose_run(self):
        for args in (("--print", "hello"), ("--session-dir", "/other"), ("--no-session",), ("--no-extensions",), ("--session", "/other/file.jsonl")):
            with self.subTest(args=args):
                result, invocation = self.launch(self.project, "--name", "backend", "--herdr", "--", *args)
                self.assertEqual(result.returncode, 2)
                self.assertIsNone(invocation)
        for patch, message in (({"HERDR_ENV": ""}, "current Herdr pane"), ({"HERDR_SOCKET_PATH": str(self.project)}, "Unix socket")):
            result, invocation = self.launch(self.project, "--name", "backend", "--herdr", env={**self.env, **patch})
            self.assertEqual(result.returncode, 2)
            self.assertIn(message, result.stderr)
            self.assertIsNone(invocation)
        result = subprocess.run(
            [str(self.setup / "bin/pi"), str(self.project), "--name", "backend", "--herdr"],
            env=self.env, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("interactive terminal", result.stderr)
        self.assertFalse(self.log.exists())
        extension = self.root / "data/config/extensions/herdr-agent-state.ts"
        extension.unlink()
        result, invocation = self.launch(self.project, "--name", "backend", "--herdr", env={**self.env, "HERDR_SKIP_WRITE": "1"})
        self.assertEqual(result.returncode, 2)
        self.assertIn("no readable, nonempty extension", result.stderr)
        self.assertIsNone(invocation)

    def fixture_git(self, cwd, *args):
        return subprocess.run(['git', '-C', str(cwd), '-c', 'core.hooksPath=/dev/null',
                               '-c', 'commit.gpgSign=false', *args],
                              env={**self.env, 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null',
                                   'GIT_AUTHOR_NAME': 'Fixture', 'GIT_AUTHOR_EMAIL': 'fixture@example.invalid',
                                   'GIT_COMMITTER_NAME': 'Fixture', 'GIT_COMMITTER_EMAIL': 'fixture@example.invalid'},
                              check=True, capture_output=True, text=True).stdout.strip()

    def fixture_linked(self):
        self.fixture_git(self.project, 'init', '-q', '-b', 'main')
        (self.project / 'tracked').write_text('initial\n')
        self.fixture_git(self.project, 'add', 'tracked')
        self.fixture_git(self.project, 'commit', '-qm', 'fixture')
        linked = self.root / "linked 'quote' $cash:colon"
        self.fixture_git(self.project, 'worktree', 'add', '-q', '-b', 'helper', str(linked))
        return linked

    def test_linked_subdirectory_and_symlink_preserve_paths_storage_and_host_metadata(self):
        linked = self.fixture_linked()
        selected = linked / 'packages/a/b'
        selected.mkdir(parents=True)
        alias = self.root / 'selection-alias'
        alias.symlink_to(selected)
        for selection in [selected, alias]:
            result, invocation = self.launch(selection, '--name', 'backend', '--herdr')
            self.assertEqual(result.returncode, 0, result.stderr)
            env = invocation['env']
            self.assertEqual(env['PI_WORKSPACE'], str(selected))
            self.assertEqual(env['PI_CHECKOUT_SOURCE'], str(linked))
            self.assertEqual(env['PI_CHECKOUT_TARGET'], str(linked))
            self.assertEqual(env['PI_WORKDIR'], str(selected))
            self.assertEqual(env['PI_GIT_COMMON'], str(self.project / '.git'))
            self.assertIn(str(self.setup / 'compose.metadata.yaml'), invocation['args'])
        record = next((self.root / 'data/herdr-launches').glob('*.record')).read_bytes()
        self.assertIn(str(selected).encode() + b'\0', record)
        self.assertNotIn(b'image', record)
        filename = 'linked.jsonl'
        (Path(env['PI_SESSIONS']) / filename).write_text('fixture conversation sentinel\n')
        result, restored = self.launch('--session', f"{env['PI_SESSION_TARGET']}/{filename}")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(restored['env']['PI_WORKDIR'], str(selected))
        self.assertEqual(restored['env']['PI_CHECKOUT_SOURCE'], str(linked))

    def phase3_managed_selection(self):
        linked = self.fixture_linked()
        selected = linked / 'packages/a/b'
        selected.mkdir(parents=True)
        result, original = self.launch(selected, '--name', 'backend', '--herdr')
        self.assertEqual(result.returncode, 0, result.stderr)
        file = Path(original['env']['PI_SESSIONS']) / 'phase3.jsonl'
        file.write_text('fixture conversation sentinel\n')
        reference = f"{original['env']['PI_SESSION_TARGET']}/phase3.jsonl"
        self.probes.unlink()
        return linked, selected, file, reference, original

    def test_restore_accepts_current_replacement_checkout_without_historical_type(self):
        linked, selected, file, reference, original = self.phase3_managed_selection()
        # Unit-owned fixture only: replace linked layout with a conventional
        # checkout at the same path. No Git pointer repair or identity registry.
        shutil.rmtree(linked)
        selected.mkdir(parents=True)
        self.fixture_git(linked, 'init', '-q')
        result, restored = self.launch('--session', reference)
        self.assertEqual(result.returncode, 0, result.stderr)
        env = restored['env']
        self.assertEqual(env['PI_WORKSPACE'], str(selected))
        self.assertEqual(env['PI_CHECKOUT_SOURCE'], str(selected))
        self.assertEqual(env['PI_WORKDIR'], '/workspace')
        self.assertEqual(env['PI_SESSIONS'], original['env']['PI_SESSIONS'])
        self.assertEqual(env['PI_SESSION_TARGET'], original['env']['PI_SESSION_TARGET'])
        self.assertNotIn(str(self.setup / 'compose.metadata.yaml'), restored['args'])
        self.assertEqual(file.read_text(), 'fixture conversation sentinel\n')

    def test_restore_surviving_marker_free_directory_uses_current_ordinary_policy(self):
        linked, selected, file, reference, original = self.phase3_managed_selection()
        (linked / '.git').unlink()
        result, restored = self.launch('--session', reference)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(restored['env']['PI_WORKSPACE'], str(selected))
        self.assertEqual(restored['env']['PI_WORKDIR'], '/workspace')
        self.assertEqual(restored['env']['PI_SESSIONS'], original['env']['PI_SESSIONS'])
        self.assertFalse((linked / '.git').exists())
        self.assertEqual(file.read_text(), 'fixture conversation sentinel\n')

    def test_restore_invalid_discovered_metadata_fails_before_docker_without_repair(self):
        linked, selected, file, reference, original = self.phase3_managed_selection()
        contents = 'gitdir: /nonexistent/phase3-invalid-metadata\n'
        (linked / '.git').write_text(contents)
        result, invocation = self.launch('--session', reference)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIsNone(invocation)
        self.assertFalse(self.probes.exists())
        self.assertIn('invalid/inaccessible Git metadata', result.stderr)
        self.assertEqual((linked / '.git').read_text(), contents)
        self.assertEqual(file.read_text(), 'fixture conversation sentinel\n')

    def test_restore_missing_exact_subdirectory_fails_without_replacement(self):
        linked, selected, file, reference, original = self.phase3_managed_selection()
        selected.rmdir()
        result, invocation = self.launch('--session', reference)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIsNone(invocation)
        self.assertFalse(self.probes.exists())
        self.assertIn('Recorded workspace moved or no longer exists', result.stderr)
        self.assertTrue(linked.is_dir())
        self.assertFalse(selected.exists())
        self.assertEqual(file.read_text(), 'fixture conversation sentinel\n')

    def test_continue_and_resume_keep_exact_selected_directory_and_name_scope(self):
        linked = self.fixture_linked()
        selected = linked / 'packages/a/b'
        selected.mkdir(parents=True)
        seen = set()
        for directory in [linked, selected]:
            for name in ['backend', 'reviewer']:
                for flag in ['--continue', '--resume']:
                    result, invocation = self.launch(directory, '--name', name, '--herdr', '--', flag)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    env = invocation['env']
                    current = (env['PI_SESSIONS'], env['PI_SESSION_TARGET'])
                    self.assertEqual(env['PI_WORKSPACE'], str(directory))
                    self.assertEqual(env['PI_WORKDIR'], str(directory))
                    self.assertEqual(invocation['args'][-1], flag)
                    if flag == '--continue':
                        self.assertNotIn(current, seen)
                        seen.add(current)
                        expected = current
                    else:
                        self.assertEqual(current, expected)
        self.assertEqual(len(seen), 4)

    def test_ordinary_and_self_contained_subdirectories_keep_workspace_layout(self):
        self.fixture_git(self.project, 'init', '-q')
        selected = self.project / 'subdir'
        selected.mkdir()
        for selection in [selected, self.other]:
            result, invocation = self.launch(selection, '--no-herdr')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(invocation['env']['PI_CHECKOUT_SOURCE'], str(selection))
            self.assertEqual(invocation['env']['PI_CHECKOUT_TARGET'], '/workspace')
            self.assertEqual(invocation['env']['PI_WORKDIR'], '/workspace')
            self.assertNotIn(str(self.setup / 'compose.metadata.yaml'), invocation['args'])

    def test_separate_metadata_containment_and_direct_dotgit_symlink(self):
        for contained in [False, True]:
            checkout = self.root / ('contained' if contained else 'separate')
            checkout.mkdir()
            metadata = checkout / 'metadata' if contained else self.root / 'external metadata'
            self.fixture_git(checkout, 'init', '-q', '--separate-git-dir', str(metadata))
            for symlink in [False, True]:
                if symlink:
                    (checkout / '.git').unlink()
                    (checkout / '.git').symlink_to(metadata)
                result, invocation = self.launch(checkout, '--no-herdr')
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(invocation['env']['PI_CHECKOUT_SOURCE'], str(checkout))
                self.assertEqual(invocation['env']['PI_GIT_COMMON'], str(metadata))
                self.assertEqual(str(self.setup / 'compose.metadata.yaml') in invocation['args'], not contained)

    def test_invalid_git_marker_and_control_paths_fail_before_docker(self):
        (self.project / '.git').write_text('gitdir: /nonexistent/metadata\n')
        selected = self.project / 'a/b/c/d'
        selected.mkdir(parents=True)
        for path in [selected, str(self.project) + '\n']:
            result, invocation = self.launch(path, '--no-herdr')
            self.assertNotEqual(result.returncode, 0)
            self.assertIsNone(invocation)
            self.assertFalse(self.probes.exists())
        (self.project / '.git').unlink()
        (self.project / '.git').symlink_to('/nonexistent/dangling-metadata')
        result, invocation = self.launch(selected, '--no-herdr')
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(invocation)
        self.assertFalse(self.probes.exists())

    def test_deployment_control_path_cannot_select_a_sibling_deployment(self):
        unusual = self.root / 'deployment\n'
        (unusual / 'bin').mkdir(parents=True)
        shutil.copy2(self.setup / 'bin/pi', unusual / 'bin/pi')
        # The old dirname command substitution could strip the newline and
        # source this different sibling's helpers before showing help.
        shutil.copytree(self.setup / 'lib', self.root / 'deployment/lib')
        result = self.run_command(unusual / 'bin/pi', '--help')
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn('Control characters in deployment path', result.stderr)
        self.assertFalse(self.probes.exists())

    def test_control_character_socket_path_cannot_select_a_different_socket(self):
        unusual = self.make_socket('herdr.sock\n')
        result, invocation = self.launch(self.project, '--name', 'backend', '--herdr',
                                         env={**self.env, 'HERDR_SOCKET_PATH': str(unusual)})
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIsNone(invocation)
        self.assertIn('Cannot safely resolve HERDR_SOCKET_PATH', result.stderr)
        self.assertFalse((self.root / 'data/herdr-launches').exists())

    def test_restore_control_alias_is_rejected_as_a_changed_workspace(self):
        original = self.initial_launch()
        unusual = self.project.with_name(self.project.name + '\n')
        self.project.rename(unusual)
        self.project.symlink_to(unusual)
        self.probes.unlink()
        reference = f"{original['env']['PI_SESSION_TARGET']}/restored.jsonl"
        result, invocation = self.launch('--session', reference)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIsNone(invocation)
        self.assertIn('Recorded workspace moved or no longer exists', result.stderr)
        self.assertFalse(self.probes.exists())

    def test_multiline_gitfile_cannot_hide_an_unmounted_traversal(self):
        checkout = self.root / 'multiline-checkout'
        checkout.mkdir()
        metadata = self.root / 'metadata'
        self.fixture_git(checkout, 'init', '-q', '--separate-git-dir', str(metadata))
        # The first line alone names the represented metadata, but Git reads
        # the entire path through a different, unmounted newline-bearing dir.
        detour = self.root / 'metadata\n'
        detour.mkdir()
        contents = f'gitdir: {detour}/../metadata\n'.encode()
        (checkout / '.git').write_bytes(contents)
        self.assertEqual(self.fixture_git(checkout, 'rev-parse', '--absolute-git-dir'), str(metadata))
        result, invocation = self.launch(checkout, '--no-herdr')
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIsNone(invocation)
        self.assertFalse(self.probes.exists())
        self.assertIn('control-character/multiline', result.stderr)
        self.assertEqual((checkout / '.git').read_bytes(), contents)

    def test_git_pointer_files_reject_nul_and_additional_lines_without_mutation(self):
        linked = self.fixture_linked()
        admin = Path(self.fixture_git(linked, 'rev-parse', '--absolute-git-dir'))
        for pointer in [linked / '.git', admin / 'commondir', admin / 'gitdir']:
            original = pointer.read_bytes()
            for suffix in [b'\x00ignored', b'\n']:
                with self.subTest(pointer=pointer.name, suffix=suffix):
                    contents = original + suffix
                    pointer.write_bytes(contents)
                    result, invocation = self.launch(linked, '--name', 'backend', '--no-herdr')
                    self.assertEqual(result.returncode, 2, result.stderr)
                    self.assertIsNone(invocation)
                    self.assertFalse(self.probes.exists())
                    self.assertEqual(pointer.read_bytes(), contents)
                    pointer.write_bytes(original)

    def test_pointer_files_accept_single_line_without_a_final_lf(self):
        linked = self.fixture_linked()
        admin = Path(self.fixture_git(linked, 'rev-parse', '--absolute-git-dir'))
        pointers = [linked / '.git', admin / 'commondir', admin / 'gitdir']
        contents = {path: path.read_bytes().rstrip(b'\n') for path in pointers}
        for path, body in contents.items():
            path.write_bytes(body)
        result, invocation = self.launch(linked, '--name', 'backend', '--no-herdr')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(invocation['env']['PI_WORKDIR'], str(linked))
        for path, body in contents.items():
            self.assertEqual(path.read_bytes(), body)

    def test_administrative_pointer_files_cannot_hide_external_symlinks(self):
        linked = self.fixture_linked()
        admin = Path(self.fixture_git(linked, 'rev-parse', '--absolute-git-dir'))
        for name in ['commondir', 'gitdir']:
            with self.subTest(pointer=name):
                pointer = admin / name
                contents = pointer.read_bytes()
                external = self.root / f'external-{name}'
                external.write_bytes(contents)
                pointer.unlink()
                pointer.symlink_to(external)
                self.assertEqual(self.fixture_git(linked, 'rev-parse', '--is-inside-work-tree'), 'true')
                result, invocation = self.launch(linked, '--name', 'backend', '--no-herdr')
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertIsNone(invocation)
                self.assertFalse(self.probes.exists())
                self.assertIn('symlink alias', result.stderr)
                pointer.unlink()
                pointer.write_bytes(contents)

    def test_dotgit_readlink_control_characters_are_not_stripped_into_another_target(self):
        checkout = self.root / 'symlink-checkout'
        checkout.mkdir()
        metadata = self.root / 'metadata'
        self.fixture_git(checkout, 'init', '-q', '--separate-git-dir', str(metadata))
        (metadata / 'alias').mkdir()
        unusual_alias = metadata / 'alias\n'
        unusual_alias.symlink_to(metadata)
        (checkout / '.git').unlink()
        (checkout / '.git').symlink_to(unusual_alias)
        self.assertEqual(self.fixture_git(checkout, 'rev-parse', '--absolute-git-dir'), str(metadata))
        result, invocation = self.launch(checkout, '--no-herdr')
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIsNone(invocation)
        self.assertFalse(self.probes.exists())
        self.assertIn('control characters', result.stderr)

    def test_unmounted_non_symlink_pointer_detour_is_rejected_before_docker(self):
        linked = self.fixture_linked()
        admin = Path(self.fixture_git(linked, 'rev-parse', '--absolute-git-dir'))
        detour = self.root / 'unmounted-detour'
        detour.mkdir()
        (linked / '.git').write_text(f'gitdir: {detour}/../{admin.relative_to(self.root)}\n')
        # Git accepts the host layout, but the detour directory would not exist
        # in the container even though normalized/canonical endpoints agree.
        self.assertEqual(self.fixture_git(linked, 'rev-parse', '--absolute-git-dir'), str(admin))
        result, invocation = self.launch(linked, '--name', 'backend', '--no-herdr')
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIsNone(invocation)
        self.assertFalse(self.probes.exists())
        self.assertIn('unrepresented traversal directory', result.stderr)

    def test_canonical_control_character_path_cannot_alias_a_different_directory(self):
        normal = self.root / 'canonical'
        normal.mkdir()
        unusual = self.root / 'canonical\n'
        unusual.mkdir()
        alias = self.root / 'clean-selection'
        alias.symlink_to(unusual)
        result, invocation = self.launch(alias, '--no-herdr')
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIsNone(invocation)
        self.assertFalse(self.probes.exists())
        self.assertIn('control characters', result.stderr)

    def test_inherited_git_and_compose_overrides_do_not_redirect_selection(self):
        self.fixture_linked()
        result, invocation = self.launch(self.other, '--no-herdr', env={**self.env,
            'GIT_DIR': str(self.project / '.git'), 'GIT_WORK_TREE': str(self.project),
            'GIT_CONFIG_COUNT': '999', 'COMPOSE_FILE': '/untrusted/compose.yaml',
            'COMPOSE_ENV_FILES': '/untrusted/settings'})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(invocation['env']['PI_CHECKOUT_SOURCE'], str(self.other))
        self.assertEqual(invocation['env']['PI_WORKDIR'], '/workspace')
        self.assertIsNone(invocation['env']['COMPOSE_FILE'])
        self.assertIsNone(invocation['env']['COMPOSE_ENV_FILES'])
        self.assertIn('/dev/null', invocation['args'])
        self.assertIn('--pull', invocation['args'])

    def test_no_git_allows_only_marker_free_launch_and_diagnostics_still_work(self):
        tools = self.root / 'without-git'
        tools.mkdir()
        for name in ['bash', 'realpath', 'dirname', 'basename', 'sha256sum', 'cut', 'id', 'mkdir', 'env', 'uname']:
            (tools / name).symlink_to(shutil.which(name))
        env = {**self.env, 'PATH': f'{self.bin}:{tools}'}
        result, invocation = self.launch(self.other, '--no-herdr', env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.probes.unlink()
        (self.project / '.git').symlink_to('/nonexistent/metadata')
        result, invocation = self.launch(self.project, '--name', 'backend', '--no-herdr', env=env)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn('host Git required', result.stderr)
        self.assertIsNone(invocation)
        self.assertFalse(self.probes.exists())
        result = self.run_command(self.setup / 'bin/pi', str(self.project), '--name', 'backend', '--herdr-status', env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.probes.exists())


if __name__ == "__main__":
    unittest.main()
