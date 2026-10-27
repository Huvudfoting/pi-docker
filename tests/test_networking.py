"""Networking configuration checks without requiring a Docker daemon."""

from pathlib import Path
import unittest


SETUP = Path(__file__).resolve().parents[1] / "setup"


class NetworkingTest(unittest.TestCase):
    def test_pi_uses_host_network_without_external_network_dependency(self):
        compose = (SETUP / "compose.yaml").read_text()
        self.assertIn("    network_mode: host\n", compose)
        self.assertNotIn("networks:", compose)
        self.assertNotIn("depends_on:", compose)


if __name__ == "__main__":
    unittest.main()
