"""Image separation and image-owned entrypoint contracts; no Docker required."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

IMAGES = Path(__file__).resolve().parents[1] / 'images'


class CustomImageTest(unittest.TestCase):
    def test_base_retains_integrations_but_not_custom_tooling(self):
        base = (IMAGES / 'base/Dockerfile').read_text()
        self.assertIn('FROM node:24-bookworm-slim', base)
        for required in ['git', 'gh', 'openssh-client', 'ripgrep', 'herdr --skill', '@earendil-works/pi-coding-agent']:
            self.assertIn(required, base)
        for optional in ['python:', '/uvx', 'pi-rewind-hook@', 'pi-web-access@', 'pi-ask-user@',
                         'rpiv-ask-user-question@', 'pi-subscription-usage@', 'pi-deepinfra-provider@',
                         '        nano']:
            self.assertNotIn(optional, base)
        derived = (IMAGES / 'custom/Dockerfile').read_text()
        self.assertIn('ARG BASE_IMAGE=pi-docker:base', derived)
        self.assertIn('FROM ${BASE_IMAGE}', derived)
        self.assertIn('USER root', derived)
        self.assertIn('USER node', derived)
        self.assertIn('EDITOR=nano', derived)
        self.assertIn('python3 -c', derived)
        self.assertIn('COPY custom/skills/', derived)
        self.assertNotIn('rpiv-ask-user-question', derived)
        for package in ['pi-rewind-hook@1.8.8', 'pi-web-access@0.48.0',
                        'pi-ask-user@0.17.2', '@specode/pi-subscription-usage@1.5.0']:
            self.assertIn(package, derived)
        self.assertIn('npm install -g --legacy-peer-deps @cad0p/pi-deepinfra-provider@0.1.5', derived)
        self.assertNotIn('@latest', derived)

    def test_reviewed_base_versions(self):
        base = (IMAGES / 'base/Dockerfile').read_text()
        self.assertIn('ARG PI_VERSION=1.5.2', base)
        self.assertIn('ARG HERDR_VERSION=0.9.5', base)

    def test_self_update_guard_is_image_owned_inherited_and_refuses_updates(self):
        base = (IMAGES / 'base/Dockerfile').read_text()
        custom = (IMAGES / 'custom/Dockerfile').read_text()
        self.assertIn('COPY base/pi-update-guard /usr/local/bin/pi-update-guard', base)
        self.assertIn('chmod 755 /usr/local/bin/pi-update-guard', base)
        self.assertIn('PI_SELF_UPDATE_COMMAND=/usr/local/bin/pi-update-guard', base)
        self.assertNotIn('PI_SELF_UPDATE_COMMAND', custom)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            marker = root / 'unexpected-update'
            for command in ['npm', 'docker', 'pi']:
                fake = root / command
                fake.write_text('#!/bin/sh\nprintf called > "$UPDATE_MARKER"\n')
                fake.chmod(0o755)
            result = subprocess.run(['/bin/sh', str(IMAGES / 'base/pi-update-guard'), '--force', 'test-only-unused-value'],
                                    env={'PATH': str(root), 'UPDATE_MARKER': str(marker)},
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertEqual(result.stdout, '')
            self.assertIn('in-container self-updates are disabled', result.stderr)
            self.assertIn('update PI_VERSION in images/base/Dockerfile', result.stderr)
            self.assertIn('./bin/build', result.stderr)
            self.assertIn('./bin/build custom', result.stderr)
            self.assertNotIn('test-only-unused-value', result.stderr)
            self.assertFalse(marker.exists())

    def test_custom_entrypoint_loads_resources_and_forwards_arguments(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fake = root / 'pi'
            log = root / 'args.json'
            fake.write_text(f'#!{sys.executable}\n'
                            'import json, os, sys\n'
                            'from pathlib import Path\n'
                            'Path(os.environ["ARG_LOG"]).write_text(json.dumps(sys.argv[1:]))\n'
                            'sys.exit(17)\n')
            fake.chmod(0o755)
            args = ['--model', 'provider/model', '--', 'quoted "prompt" with spaces']
            result = subprocess.run(['sh', str(IMAGES / 'custom/entrypoint'), *args],
                                    env={**os.environ, 'PATH': f'{root}:{os.environ["PATH"]}', 'ARG_LOG': str(log)},
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 17, result.stderr)
            actual = json.loads(log.read_text())
            self.assertEqual(actual[-len(args):], args)
            self.assertEqual(actual.count('--extension'), 5)
            self.assertIn('/usr/local/lib/node_modules/pi-ask-user', actual)
            self.assertFalse(any('rpiv-ask-user-question' in arg for arg in actual))
            self.assertIn('/usr/local/share/pi-custom/AGENTS.md', actual)
            self.assertIn('/usr/local/share/pi-custom/skills', actual)
            self.assertNotIn('/pi/agent', ' '.join(actual))


if __name__ == '__main__':
    unittest.main()
