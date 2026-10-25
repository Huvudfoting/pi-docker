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
        (self.bin / "pi").symlink_to(self.setup / "bin/pi")
        self.probes = self.root / "docker-probes.log"
        docker = self.bin / "docker"
        docker.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys\n"
            "with open(os.environ['DOCKER_PROBE_LOG'], 'a') as f: f.write('called\\n')\n"
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
            "DOCKER_PROBE_LOG": str(self.probes),
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
            "with open(os.environ['HERDR_LOG'], 'w') as f:\n"
            "    json.dump({'args': sys.argv[1:], 'config': str(config)}, f)\n"
            "if os.environ.get('HERDR_EXIT'): sys.exit(int(os.environ['HERDR_EXIT']))\n"
            "target = config / 'extensions/herdr-agent-state.ts'\n"
            "if sys.argv[1:] == ['integration', 'install', 'pi']:\n"
            "    if not os.environ.get('HERDR_SKIP_WRITE'):\n"
            "        target.parent.mkdir(exist_ok=True)\n"
            "        target.write_text('// managed test fixture\\n')\n"
            "elif sys.argv[1:] == ['integration', 'uninstall', 'pi']:\n"
            "    target.unlink(missing_ok=True)\n"
            "else: sys.exit(64)\n"
        )
        herdr.chmod(0o755)
        self.env['HERDR_LOG'] = str(self.root / 'herdr.json')
        return herdr

    def test_help_and_status_are_read_only_without_docker_calls(self):
        private = self.root / "data/config/auth.json"
        private.write_text('TEST-ONLY-secret-do-not-print')
        before = sorted(p.relative_to(self.root) for p in (self.root / "data").rglob("*"))
        result = self.run_command(self.setup / "bin/pi", "--help")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--herdr-status", result.stdout)
        self.assertIn("setup/bin/add-herdr-integration install", result.stdout)
        self.assertNotIn(str(self.root), result.stdout)
        self.assertNotRegex(result.stdout, r"(?:^|\s)/[^\s]*")
        result = self.run_command(self.setup / "bin/pi", str(self.project), "--name", "backend", "--herdr-status")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Official extension: present", result.stdout)
        self.assertIn("not created yet", result.stdout)
        self.assertIn("Native restore PATH: pi resolves to this launcher", result.stdout)
        self.assertIn("not contacted", result.stdout)
        self.assertIn("informational here", result.stdout)
        self.assertNotIn(private.read_text(), result.stdout + result.stderr)
        self.assertEqual(before, sorted(p.relative_to(self.root) for p in (self.root / "data").rglob("*")))
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
        alias.symlink_to(self.setup / "bin/add-herdr-integration")
        # Match the owning binary even if it is not named herdr on PATH.
        owning = herdr.with_name("owning-herdr")
        herdr.rename(owning)
        env = {**self.env, "HERDR_BIN_PATH": str(owning), "PI_CODING_AGENT_DIR": "/wrong/config"}
        for action in ((), ("install",), ("uninstall",)):
            result = self.run_command(alias, *action, env=env)
            self.assertEqual(result.returncode, 0, result.stderr)
            call = json.loads(Path(self.env['HERDR_LOG']).read_text())
            self.assertEqual(call['config'], str(config))
            self.assertEqual(call['args'], ['integration', action[0] if action else 'install', 'pi'])
            self.assertNotIn(private.read_text(), result.stdout + result.stderr)
        self.assertFalse((config / "extensions/herdr-agent-state.ts").exists())
        self.assertEqual(private.read_text(), 'TEST-ONLY-secret-do-not-print')
        self.assertFalse(self.probes.exists())

    def test_installer_creates_only_needed_state_and_reports_failures(self):
        self.fake_herdr()
        shutil.rmtree(self.root / "data")  # Only this test's private fixture.
        installer = self.setup / "bin/add-herdr-integration"
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

    def test_standalone_keeps_default_boundary_even_in_herdr_shell(self):
        env = {**self.env, "PI_SESSION_TARGET": "/unexpected"}
        result, invocation = self.launch(self.project, "--name", "backend", "--", "--version", env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(str(self.setup / "pi/compose.herdr.yaml"), invocation["args"])
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

    def test_herdr_record_publication_leaves_no_temporary_files(self):
        first = self.initial_launch()
        self.initial_launch()  # Reusing the same selection must be idempotent.
        records = self.root / "data/herdr-launches"
        self.assertEqual(len(list(records.glob("*.record"))), 1)
        self.assertEqual(list(records.glob(".launch.*")), [])
        self.assertEqual(first["env"]["PI_WORKSPACE"], str(self.project))

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
