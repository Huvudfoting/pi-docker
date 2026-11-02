"""Deployment layout contracts; no Docker daemon or private data required."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


def documents():
    return [ROOT / 'README.md', *[p for directory in ['docs', 'images', 'extensions', 'skills']
                                for p in (ROOT / directory).rglob('*.md')]]


class LayoutTest(unittest.TestCase):
    def test_deployment_mounts_only_allowlisted_source_not_repository_root(self):
        compose = (ROOT / 'compose.yaml').read_text()
        self.assertIn('image: "${PI_DOCKER_IMAGE:-pi-docker:base}"', compose)
        self.assertNotIn('    build:', compose)
        self.assertNotIn('EDITOR:', compose)
        self.assertNotIn('VISUAL:', compose)
        expected = ['bin', 'lib', 'docs', 'extensions', 'skills', 'images', 'README.md',
                    'compose.yaml', 'compose.git.yaml', 'compose.herdr.yaml']
        self.assertTrue(compose.startswith('x-readonly-bind: &readonly-bind\n'
                                           '  type: bind\n  read_only: true\n'
                                           '  bind:\n    create_host_path: false\n\n'))
        mounts = re.findall(r'^      - \{ <<: \*readonly-bind, source: ([^,]+), target: ([^ }]+) \}$',
                            compose, re.M)
        self.assertEqual(mounts, [('"${GH_CONFIG:?}"', '/run/gh-config'),
                                 *[(f'./{p}', f'/opt/pi-docker/{p}') for p in expected]])
        # Every long-form mount must use the shared options with no overrides.
        self.assertEqual(compose.count('      - {'), len(mounts))
        self.assertNotIn('      - type:', compose)
        for source, target in mounts[1:]:
            self.assertTrue((ROOT / source).exists())
        self.assertFalse((ROOT / 'setup').exists())

    def test_build_context_allows_only_image_metadata_and_custom_resources(self):
        patterns = [line for line in (ROOT / 'images/.dockerignore').read_text().splitlines()
                    if line and not line.startswith('#')]
        self.assertEqual(patterns, ['**', '!.dockerignore', '!base/', '!base/Dockerfile', '!base/pi-update-guard',
                                    '!custom/', '!custom/Dockerfile', '!custom/entrypoint', '!custom/AGENTS.md',
                                    '!custom/skills/', '!custom/skills/python-development/',
                                    '!custom/skills/python-development/SKILL.md'])
        base = (ROOT / 'images/base/Dockerfile').read_text()
        self.assertEqual(re.findall(r'(?m)^\s*(?:COPY|ADD)\s+(?!--from=)(.+)$', base),
                         ['base/pi-update-guard /usr/local/bin/pi-update-guard'])
        build = (ROOT / 'bin/build').read_text()
        self.assertIn('context="$root/images"', build)

    def test_herdr_adapter_uses_node_and_shutdown_helper_is_removed(self):
        adapter = ROOT / 'skills/pi-docker-herdr/scripts/herdr-helper.js'
        self.assertTrue(adapter.read_text().startswith('#!/usr/bin/env node\n'))
        self.assertFalse(adapter.with_suffix('.py').exists())
        self.assertFalse((ROOT / 'bin/stop-herdr').exists())
        skill = (ROOT / 'skills/pi-docker-herdr/SKILL.md').read_text()
        self.assertIn('node /opt/pi-docker/skills/pi-docker-herdr/scripts/herdr-helper.js', skill)
        for document in documents():
            self.assertNotIn('/opt/pi-docker/bin/stop-herdr', document.read_text())

    def test_relative_documentation_links_and_anchors_resolve(self):
        for document in documents():
            for target in re.findall(r'\]\(([^)]+)\)', document.read_text()):
                if ':' in target:
                    continue
                path, _, anchor = target.partition('#')
                dest = document.parent / path if path else document
                with self.subTest(document=document.relative_to(ROOT), target=target):
                    self.assertTrue(dest.exists())
                    if dest.is_file() and dest.suffix == '.md' and anchor:
                        headings = re.findall(r'^#{1,6}\s+(.+)$', dest.read_text(), re.M)
                        anchors = {re.sub(r'[^\w\- ]', '', h.lower()).replace(' ', '-') for h in headings}
                        self.assertIn(anchor, anchors)

    def test_mounted_agent_guide_paths_resolve_and_launcher_appends_container_guide(self):
        guide = (ROOT / 'docs/AGENTS.md').read_text()
        paths = re.findall(r'/opt/pi-docker/([^`\s]+\.md)', guide)
        self.assertTrue(paths)
        for path in paths:
            with self.subTest(path=path):
                self.assertTrue((ROOT / path).is_file())
        self.assertIn('--append-system-prompt /opt/pi-docker/docs/AGENTS.md', (ROOT / 'bin/pi').read_text())


if __name__ == '__main__':
    unittest.main()
