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
