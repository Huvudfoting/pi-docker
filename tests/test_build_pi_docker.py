"""Build wrapper tests; no Docker daemon or downloads required."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1]


class BuildPiDockerTest(unittest.TestCase):
    def test_image_extracts_skill_from_installed_cli_and_rejects_empty_output(self):
        dockerfile = (SOURCE / 'setup/Dockerfile').read_text()
        block = next(block for block in dockerfile.split('\n\n')
                     if 'herdr --skill >' in block)
        command = block[block.index('RUN ') + 4:].replace('\\\n', '')
        self.assertIn('/usr/local/share/pi-skills/herdr/SKILL.md', command)
        self.assertLess(command.index('herdr --version'), command.index('herdr --skill'))
        # Exercise extraction without downloading/reinstalling the CLI.
        command = command[command.index('mkdir -p /usr/local/share/pi-skills/herdr'):]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            binary = root / 'herdr'
            binary.write_text('#!/bin/sh\n[ "$1" = --skill ] || exit 64\n'
                              'printf "%s" "$SKILL_TEXT"\nexit "$SKILL_EXIT"\n')
            binary.chmod(0o755)
            command = command.replace('/usr/local/share/pi-skills', str(root / 'skills'))
            for text, exit_code, success in (('official skill', '0', True),
                                              ('', '0', False), ('partial', '23', False)):
                result = subprocess.run(['sh', '-c', command], capture_output=True, text=True,
                                        env={**os.environ, 'PATH': f'{root}:{os.environ["PATH"]}',
                                             'SKILL_TEXT': text, 'SKILL_EXIT': exit_code}, timeout=10)
                self.assertEqual(result.returncode == 0, success, result.stderr)
                if success:
                    skill = root / 'skills/herdr/SKILL.md'
                    self.assertEqual(skill.read_text(), text)
                    self.assertEqual(skill.stat().st_mode & 0o777, 0o644)

    def test_image_requires_herdr_version(self):
        dockerfile = (SOURCE / 'setup/Dockerfile').read_text()
        block = next(block for block in dockerfile.split('\n\n')
                     if 'herdr --skill >' in block)
        command = block[block.index('RUN ') + 4:].replace('\\\n', '')
        # Without the pinned version the build must fail before downloading.
        result = subprocess.run(['/bin/sh', '-c', command], capture_output=True,
                                text=True, env={'PATH': '/nonexistent'}, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('HERDR_VERSION', result.stderr)

    def test_pins_context_argument_boundaries_and_exit_status(self):
        with tempfile.TemporaryDirectory(prefix="pi build ") as temporary:
            root = Path(temporary)
            context = root / "setup"
            (context / "bin").mkdir(parents=True)
            script = context / "bin/build"
            shutil.copy2(SOURCE / "setup/bin/build", script)
            self.assertTrue(os.access(script, os.X_OK))
            binaries = root / "bin"
            binaries.mkdir()
            log = root / "docker.json"
            docker = binaries / "docker"
            docker.write_text(
                f"#!{sys.executable}\n"
                "import json, os, sys\n"
                "from pathlib import Path\n"
                "Path(os.environ['BUILD_LOG']).write_text(json.dumps(sys.argv[1:]))\n"
                "sys.exit(int(os.environ['BUILD_EXIT']))\n"
            )
            docker.chmod(0o755)
            for exit_code in (0, 17):
                result = subprocess.run(
                    [str(script), "--no-cache", "--label", "test=value with spaces"],
                    cwd="/tmp", capture_output=True, text=True,
                    env={"PATH": f"{binaries}:{os.environ['PATH']}",
                         "BUILD_LOG": str(log), "BUILD_EXIT": str(exit_code)},
                    timeout=10,
                )
                self.assertEqual(result.returncode, exit_code, result.stderr)
                self.assertIn("Pi v1.4.0 and Herdr v0.9.5", result.stdout)
                self.assertEqual(json.loads(log.read_text()), [
                    "build", "--no-cache", "--label", "test=value with spaces",
                    "--build-arg", "PI_VERSION=1.4.0",
                    "--build-arg", "HERDR_VERSION=0.9.5",
                    "--tag", "pi-agent:latest", str(context),
                ])


if __name__ == "__main__":
    unittest.main()
