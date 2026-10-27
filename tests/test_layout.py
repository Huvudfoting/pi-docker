"""Deployment layout contracts; no Docker daemon or private data required."""

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
SETUP = ROOT / "setup"


class LayoutTest(unittest.TestCase):
    def test_deployment_mount_is_setup_not_repository_root(self):
        compose = (SETUP / "compose.yaml").read_text()
        self.assertIn("    build: .\n", compose)
        self.assertIn(
            "        source: .\n"
            "        target: /opt/pi-docker\n"
            "        read_only: true\n"
            "        bind:\n"
            "          create_host_path: false\n",
            compose,
        )
        self.assertFalse((SETUP / "pi").exists())

    def test_build_context_allows_only_build_metadata(self):
        patterns = [
            line for line in (SETUP / ".dockerignore").read_text().splitlines()
            if line and not line.startswith("#")
        ]
        self.assertEqual(patterns, ["**", "!Dockerfile", "!.dockerignore"])
        # The allowlist must be revisited if local build inputs are introduced.
        dockerfile = (SETUP / "Dockerfile").read_text()
        self.assertNotRegex(dockerfile, r"(?m)^\s*(?:COPY|ADD)\s+(?!--from=)")

    def test_relative_documentation_links_resolve(self):
        for document in [ROOT / "README.md", *SETUP.rglob("*.md")]:
            for target in re.findall(r"\]\(([^)]+)\)", document.read_text()):
                if ":" in target or target.startswith("#"):
                    continue
                path = target.split("#", 1)[0]
                with self.subTest(document=document.relative_to(ROOT), target=target):
                    self.assertTrue((document.parent / path).exists())

    def test_mounted_agent_guide_paths_resolve(self):
        guide = (SETUP / "AGENTS.md").read_text()
        paths = re.findall(r"/opt/pi-docker/([^`\s]+\.md)", guide)
        self.assertTrue(paths)
        for path in paths:
            with self.subTest(path=path):
                self.assertTrue((SETUP / path).is_file())


if __name__ == "__main__":
    unittest.main()
