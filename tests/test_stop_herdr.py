"""Exercise stop-herdr against temporary sockets only; never a real Herdr server."""

import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import unittest


NODE = shutil.which("node")
HELPER = Path(__file__).resolve().parents[1] / "setup/bin/stop-herdr"


@unittest.skipUnless(NODE and sys.platform == "linux", "requires Linux and Node.js")
class StopHerdrTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="stop-herdr-")
        self.addCleanup(self.temp.cleanup)
        self.endpoint = str(Path(self.temp.name) / "herdr.sock")
        self.listener = socket.socket(socket.AF_UNIX)
        self.addCleanup(self.listener.close)
        self.listener.bind(self.endpoint)
        self.listener.listen()
        self.listener.settimeout(4)
        # Never inherit a real host/container Herdr endpoint.
        self.env = {
            "PATH": os.environ["PATH"], "HERDR_ENV": "1",
            "HERDR_PANE_ID": "w1:p1", "HERDR_SOCKET_PATH": self.endpoint,
        }

    def run_helper(self, *args, env=None):
        return subprocess.run(
            [NODE, str(HELPER), *args], env=self.env if env is None else env,
            capture_output=True, text=True, timeout=5,
        )

    def exchange(self, responder):
        requests, errors = [], []

        def serve():
            try:
                connection, _ = self.listener.accept()
                with connection:
                    connection.settimeout(3)
                    request = b""
                    while b"\n" not in request:
                        chunk = connection.recv(4096)
                        if not chunk:
                            raise AssertionError("client closed before request")
                        request += chunk
                    payload = json.loads(request)
                    requests.append(payload)
                    responder(connection, payload)
            except Exception as error:
                errors.append(error)

        thread = threading.Thread(target=serve, daemon=True)
        thread.start()
        result = self.run_helper("--yes")
        thread.join(timeout=5)
        self.assertFalse(thread.is_alive(), "mock server did not finish")
        self.assertEqual(errors, [])
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0]["method"], "server.stop")
        self.assertEqual(requests[0]["params"], {})
        return result

    def test_help_confirmation_and_context_never_contact_socket(self):
        for args, expected in ((("--help",), 0), ((), 2), (("--yes", "extra"), 2)):
            with self.subTest(args=args):
                result = self.run_helper(*args)
                self.assertEqual(result.returncode, expected, result.stderr)
        result = self.run_helper("--yes", env={**self.env, "HERDR_ENV": ""})
        self.assertEqual(result.returncode, 2)
        self.assertIn("launched with --herdr", result.stderr)
        self.listener.settimeout(0.02)
        with self.assertRaises(socket.timeout):
            self.listener.accept()

    def test_acknowledged_stop(self):
        def respond(connection, request):
            data = json.dumps({"id": request["id"], "result": {"type": "ok"}}).encode() + b"\n"
            connection.sendall(data[:5])
            connection.sendall(data[5:])

        result = self.exchange(respond)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ENTIRE connected Herdr session", result.stderr)
        self.assertIn("acknowledged", result.stderr)

    def test_rejected_and_invalid_responses_are_not_success(self):
        for reply, message in (
            ({"error": {"code": "unsupported_method", "message": "not supported"}}, "rejected shutdown"),
            ({"id": "different", "result": {"type": "ok"}}, "ID mismatch"),
            ({"result": {"type": "unexpected"}}, "Unexpected response"),
        ):
            with self.subTest(reply=reply):
                def respond(connection, request):
                    connection.sendall((json.dumps({"id": request["id"], **reply}) + "\n").encode())

                result = self.exchange(respond)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertIn(message, result.stderr)
                self.assertNotIn("acknowledged the shutdown", result.stderr)

    def test_lost_acknowledgement_is_explicitly_ambiguous(self):
        result = self.exchange(lambda connection, request: None)
        self.assertEqual(result.returncode, 1)
        self.assertIn("shutdown may already have happened", result.stderr)
        self.assertIn("before retrying", result.stderr)
        # A retry would leave another connection waiting on the mock listener.
        self.listener.settimeout(0.02)
        with self.assertRaises(socket.timeout):
            self.listener.accept()


if __name__ == "__main__":
    unittest.main()
