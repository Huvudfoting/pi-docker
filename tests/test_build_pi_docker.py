"""Build wrapper tests; no Docker daemon or downloads required."""
import json
import os
from pathlib import Path
import shutil
import shlex
import subprocess
import sys
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]


class BuildPiDockerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pi build ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'bin').mkdir()
        self.script = self.root / 'bin/build'
        shutil.copy2(SOURCE / 'bin/build', self.script)
        self.context = self.root / 'images'
        self.context.mkdir()
        self.log = self.root / 'docker.jsonl'
        binaries = self.root / 'fake-bin'
        binaries.mkdir()
        docker = binaries / 'docker'
        docker.write_text(f'#!{sys.executable}\n'
                          'import json, os, sys\n'
                          'from pathlib import Path\n'
                          'with Path(os.environ["BUILD_LOG"]).open("a") as f: f.write(json.dumps(sys.argv[1:]) + "\\n")\n'
                          'key = "INSPECT_EXIT" if sys.argv[1:3] == ["image", "inspect"] else "BUILD_EXIT"\n'
                          'sys.exit(int(os.environ.get(key, "0")))\n')
        docker.chmod(0o755)
        self.env = {'PATH': f'{binaries}:{os.environ["PATH"]}', 'BUILD_LOG': str(self.log)}

    def build(self, *args, env=None):
        self.log.unlink(missing_ok=True)
        result = subprocess.run([str(self.script), *args], cwd='/tmp', capture_output=True,
                                text=True, env={**self.env, **(env or {})}, timeout=10)
        calls = [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []
        return result, calls

    def test_image_extracts_skill_from_installed_cli_and_rejects_empty_output(self):
        dockerfile = (SOURCE / 'images/base/Dockerfile').read_text()
        block = next(block for block in dockerfile.split('\n\n') if 'herdr --skill >' in block)
        command = block[block.index('RUN ') + 4:].replace('\\\n', '')
        self.assertLess(command.index('herdr --version'), command.index('herdr --skill'))
        command = command[command.index('mkdir -p /usr/local/share/pi-skills/herdr'):]
        binary = self.root / 'herdr'
        binary.write_text('#!/bin/sh\n[ "$1" = --skill ] || exit 64\n'
                          'printf "%s" "$SKILL_TEXT"\nexit "$SKILL_EXIT"\n')
        binary.chmod(0o755)
        command = command.replace('/usr/local/share/pi-skills', shlex.quote(str(self.root / 'skills')))
        for text, exit_code, success in [('official skill', '0', True), ('', '0', False), ('partial', '23', False)]:
            result = subprocess.run(['sh', '-c', command], capture_output=True, text=True,
                                    env={**os.environ, 'PATH': f'{self.root}:{os.environ["PATH"]}',
                                         'SKILL_TEXT': text, 'SKILL_EXIT': exit_code}, timeout=10)
            self.assertEqual(result.returncode == 0, success, result.stderr)
            if success:
                skill = self.root / 'skills/herdr/SKILL.md'
                self.assertEqual(skill.read_text(), text)
                self.assertEqual(skill.stat().st_mode & 0o777, 0o644)

    def test_image_pins_versions_and_rejects_empty_herdr_version(self):
        dockerfile = (SOURCE / 'images/base/Dockerfile').read_text()
        self.assertIn('ARG PI_VERSION=1.5.2\n', dockerfile)
        self.assertIn('ARG HERDR_VERSION=0.9.5\n', dockerfile)
        self.assertIn('npm install -g "@earendil-works/pi-coding-agent@${PI_VERSION}"', dockerfile)
        block = next(block for block in dockerfile.split('\n\n') if 'herdr --skill >' in block)
        command = block[block.index('RUN ') + 4:].replace('\\\n', '')
        result = subprocess.run(['/bin/sh', '-c', command], capture_output=True, text=True,
                                env={'PATH': '/nonexistent'}, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('HERDR_VERSION', result.stderr)

    def test_base_context_argument_boundaries_and_exit_status(self):
        for variant in [[], ['base']]:
            for exit_code in [0, 17]:
                result, calls = self.build(*variant, '--no-cache', '--label', 'test=value with spaces',
                                           env={'BUILD_EXIT': str(exit_code)})
                self.assertEqual(result.returncode, exit_code, result.stderr)
                self.assertIn('Building base image', result.stdout)
                self.assertEqual(calls, [['build', '--no-cache', '--label', 'test=value with spaces',
                                 '--file', str(self.context / 'base/Dockerfile'),
                                 '--tag', 'pi-docker:base', str(self.context)]])

    def test_build_resolves_launcher_symlink(self):
        alias = self.root / 'build-alias'
        alias.symlink_to(self.script)
        self.script = alias
        result, calls = self.build()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls[0][-1], str(self.context))

    def test_custom_build_uses_inspected_base_and_new_paths(self):
        result, calls = self.build('custom', '--no-cache', '--tag', 'my-pi:dev')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, [['image', 'inspect', 'pi-docker:base'],
                         ['build', '--no-cache', '--tag', 'my-pi:dev', '--build-arg', 'BASE_IMAGE=pi-docker:base',
                          '--file', str(self.context / 'custom/Dockerfile'), '--tag', 'pi-docker:custom', str(self.context)]])
        for exit_code, base_image in [(0, 'local-base:dev'), (1, 'missing:base')]:
            result, calls = self.build('custom', '--build-arg', 'BASE_IMAGE=ignored:override',
                                       env={'PI_DOCKER_BASE_IMAGE': base_image, 'INSPECT_EXIT': str(exit_code)})
            self.assertEqual(result.returncode, exit_code, result.stderr)
            self.assertEqual(calls[0], ['image', 'inspect', base_image])
            if exit_code:
                self.assertEqual(len(calls), 1)
                self.assertIn('build base first', result.stderr)
            else:
                self.assertEqual(calls[1][3:5], ['--build-arg', f'BASE_IMAGE={base_image}'])

    def test_help_invalid_variant_and_custom_pull_make_no_docker_calls(self):
        for args, expected in [(['--help'], 0), (['unknown'], 2), (['personal'], 2),
                               (['custom', '--pull'], 2), (['custom', '--pull=true'], 2),
                               (['custom', '--pull=false'], 2)]:
            result, calls = self.build(*args)
            self.assertEqual(result.returncode, expected, result.stderr)
            self.assertEqual(calls, [])


if __name__ == '__main__':
    unittest.main()
