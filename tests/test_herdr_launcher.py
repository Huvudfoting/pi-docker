"""Small launcher checks with a fake Docker CLI; no daemon or real private state.

Run: python3 -m unittest discover -s tests -p 'test_*.py' -v
The real Herdr launch/restart trial still runs on the host.
"""

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
        self.setup = self.root / "setup"
        shutil.copytree(SOURCE / "setup", self.setup)
        self.project = self.root / "project with 'quotes'"
        self.project.mkdir()
        self.other = self.root / "other"
        self.other.mkdir()
        self.log = self.root / "docker.json"
        self.bin = self.root / "bin"
        self.bin.mkdir()
        docker = self.bin / "docker"
        docker.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys\n"
            "if sys.argv[1:3] == ['image', 'inspect']: sys.exit(0)\n"
            "keys = ['PI_WORKSPACE', 'PI_SESSIONS', 'PI_SESSION_TARGET', "
            "'HERDR_ENV', 'HERDR_PANE_ID', 'HERDR_SOCKET_HOST_PATH', 'HERDR_AGENT']\n"
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
        }
        self.sock = self.make_socket("herdr.sock")
        self.env.update(HERDR_ENV="1", HERDR_PANE_ID="w1:p1", HERDR_SOCKET_PATH=str(self.sock))
        extension = self.root / "data/config/extensions/herdr-agent-state.ts"
        extension.parent.mkdir(parents=True)
        extension.write_text("// Installation placeholder; not an upstream extension copy.\n")

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

    def test_standalone_keeps_default_boundary_even_in_herdr_shell(self):
        env = {**self.env, "PI_SESSION_TARGET": "/unexpected"}
        result, invocation = self.launch(self.project, "--name", "backend", "--", "--version", env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(str(self.setup / "pi/compose.herdr.yaml"), invocation["args"])
        self.assertEqual(invocation["env"]["PI_SESSION_TARGET"], "/pi/sessions")
        self.assertIsNone(invocation["env"]["HERDR_AGENT"])
        self.assertEqual(invocation["args"][-1], "--version")
        self.assertFalse((self.root / "data/herdr-launches").exists())

    def test_native_restore_recovers_selection_and_uses_fresh_context(self):
        original = self.initial_launch()
        self.assertIn(str(self.setup / "pi/compose.herdr.yaml"), original["args"])
        self.assertEqual(original["env"]["HERDR_AGENT"], "pi")
        target = original["env"]["PI_SESSION_TARGET"]
        self.assertRegex(target, r"^/pi/herdr-sessions/[a-f0-9]{64}$")
        record = next((self.root / "data/herdr-launches").glob("*.record"))
        self.assertEqual(record.stat().st_mode & 0o777, 0o600)
        self.assertNotIn(b"herdr.sock", record.read_bytes())
        filename = "2026-01-01T12-00-00-000Z_example.jsonl"
        (Path(original["env"]["PI_SESSIONS"]) / filename).touch()
        reference = f"{target}/{filename}"
        fresh = {**self.env, "HERDR_PANE_ID": "w2:p3", "HERDR_SOCKET_PATH": str(self.make_socket("new.sock")), "DOCKER_EXIT": "17"}
        result, restored = self.launch("--session", reference, env=fresh, cwd=self.root)
        self.assertEqual(result.returncode, 17, result.stderr)  # exec preserves exit status
        for key in ("PI_WORKSPACE", "PI_SESSIONS", "PI_SESSION_TARGET"):
            self.assertEqual(restored["env"][key], original["env"][key])
        self.assertEqual(restored["env"]["HERDR_PANE_ID"], "w2:p3")
        self.assertEqual(restored["env"]["HERDR_SOCKET_HOST_PATH"], fresh["HERDR_SOCKET_PATH"])
        self.assertEqual(restored["env"]["HERDR_AGENT"], "pi")
        self.assertEqual(restored["args"][-2:], ["--session", reference])

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
        result, invocation = self.launch(self.project, "--name", "backend", "--herdr")
        self.assertEqual(result.returncode, 2)
        self.assertIn("official Herdr Pi extension", result.stderr)
        self.assertIsNone(invocation)


if __name__ == "__main__":
    unittest.main()
