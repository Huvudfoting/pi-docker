"""Offline CLI-contract tests. No Herdr server or live pane control."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'setup/skills/pi-docker-herdr/scripts/herdr-helper.py'
AGENT = dict(pane_id='w1:p2', terminal_id='terminal-2', name='helper', agent='pi',
             agent_status='idle', interactive_ready=True, launch_pending=False)
FAKE = r'''#!/usr/bin/env python3
import json, os, pathlib, sys, time
root = pathlib.Path(os.environ['FAKE_ROOT'])
log = root / 'calls'
with log.open('a') as f:
    f.write(json.dumps({'args':sys.argv[1:], 'socket':os.environ.get('HERDR_SOCKET_PATH'),
                        'pane':os.environ.get('HERDR_PANE_ID')}) + '\n')
index = len(log.read_text().splitlines()) - 1
steps = json.loads((root / 'steps').read_text())
if index >= len(steps):
    print('unexpected extra CLI call', file=sys.stderr); sys.exit(91)
s = steps[index]
if s.get('sleep'): time.sleep(s['sleep'])
if 'stdout' in s: print(s['stdout'], end='')
elif 'result' in s: print(json.dumps({'result':s['result']}))
if 'error' in s: print(json.dumps({'error':s['error']}), file=sys.stderr)
if 'stderr' in s: print(s['stderr'], file=sys.stderr)
sys.exit(s.get('exit', 1 if 'error' in s else 0))
'''


def agent(**patch):
    return {'result': {'agent': {**AGENT, **patch}}}


def error(code='timeout'):
    return {'error': {'code': code, 'message': 'original upstream message', 'data': {'preserve': True}}}


class HelperTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        binary = self.root / 'herdr'
        binary.write_text(FAKE)
        binary.chmod(0o755)
        self.sock = socket.socket(socket.AF_UNIX)
        self.sock.bind(str(self.root / 'context.sock'))
        self.addCleanup(self.sock.close)
        self.env = {**os.environ, 'PATH': f'{self.root}:{os.environ["PATH"]}',
                    'FAKE_ROOT': str(self.root), 'HERDR_ENV': '1', 'HERDR_PANE_ID': 'w1:p1',
                    'HERDR_SOCKET_PATH': str(self.root / 'context.sock'),
                    'PI_DOCKER_HOST_WORKSPACE': '/host/a project\'s "quoted" root'}

    def calls(self):
        log = self.root / 'calls'
        return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []

    def launch(self, steps, *args, env=None):
        (self.root / 'steps').write_text(json.dumps(steps))
        (self.root / 'calls').unlink(missing_ok=True)
        result = subprocess.run([sys.executable, str(SCRIPT), *args], env=env or self.env,
                                capture_output=True, text=True, timeout=8)
        self.assertEqual(result.stderr, '', result.stderr)
        receipt = json.loads(result.stdout)
        calls = self.calls()
        for call in calls:
            self.assertEqual(call['socket'], (env or self.env)['HERDR_SOCKET_PATH'])
            self.assertEqual(call['pane'], 'w1:p1')
            self.assertNotIn(call['args'][:2], [['pane', 'run'], ['pane', 'close'], ['agent', 'send-keys']])
        return result.returncode, receipt, [c['args'] for c in calls]

    def start_steps(self, width=160, height=40):
        return [{'result': {'agents': []}},
                {'result': {'layout': {'panes': [{'pane_id': 'w1:p1', 'rect': {'width': width, 'height': height}}]}}},
                {'result': {'pane': {'pane_id': 'w1:p2'}}}, agent(), agent()]

    def ask_steps(self):
        return [agent(), agent(agent_status='done'), agent(agent_status='done'),
                {'stdout': '\x1b[31mok\x1b[0m\n'}, agent(agent_status='done')]

    def test_start_exact_contract_and_geometry(self):
        for width, height, direction in [(160, 40, 'right'), (79, 20, 'down'), (100, 70, 'down')]:
            with self.subTest(width=width):
                code, r, calls = self.launch(self.start_steps(width, height), 'start', '--name', 'helper')
                self.assertEqual(code, 0, r)
                self.assertEqual(r['agent'], AGENT)
                self.assertEqual(r['startup'], 'acknowledged')
                self.assertEqual(calls[:3], [
                    ['agent', 'list'], ['pane', 'layout', '--pane', 'w1:p1'],
                    ['pane', 'split', '--current', '--direction', direction, '--cwd',
                     self.env['PI_DOCKER_HOST_WORKSPACE'], '--no-focus']])
                self.assertEqual(calls[3], ['agent', 'start', 'helper', '--kind', 'pi', '--pane', 'w1:p2',
                                           '--timeout', '120000', '--', self.env['PI_DOCKER_HOST_WORKSPACE'],
                                           '--name', 'helper', '--herdr'])
                self.assertEqual(calls[4], ['agent', 'get', 'w1:p2'])

    def test_explicit_direction_skips_geometry(self):
        steps = self.start_steps(); del steps[1]
        code, r, calls = self.launch(steps, 'start', '--name', 'helper', '--direction', 'down')
        self.assertEqual(code, 0, r)
        self.assertEqual(calls[1][4], 'down')
        self.assertEqual(len(calls), 4)

    def test_ask_exact_contract_plaintext_and_quoted_prompt(self):
        text = 'Answer only "ok"; $(not-a-shell)\nsecond line'
        code, r, calls = self.launch(self.ask_steps(), 'ask', '--target', 'w1:p2', '--prompt', text)
        self.assertEqual(code, 0, r)
        self.assertEqual(calls, [['agent', 'get', 'w1:p2'],
                                ['agent', 'prompt', 'w1:p2', text, '--wait', '--timeout', '120000'],
                                ['agent', 'get', 'w1:p2'],
                                ['agent', 'read', 'w1:p2', '--source', 'recent-unwrapped', '--lines', '40'],
                                ['agent', 'get', 'w1:p2']])
        self.assertEqual(r['delivery'], 'acknowledged')
        self.assertEqual(r['output']['text'], 'ok')
        self.assertEqual(r['task_completion'], 'not_asserted')
        steps = self.ask_steps(); steps[3] = {'stdout': '{"error":{"code":"just terminal text"}}'}
        self.assertEqual(self.launch(steps, 'ask', '--target', 'helper', '--prompt', 'ok')[0], 0)

    def test_invalid_context_and_inputs_never_invoke_cli(self):
        cases = [('start', '--name', 'Bad'), ('start', '--name', 'helper', '--direction', 'left'),
                 ('ask', '--target', '--machine', '--prompt', 'ok'),
                 ('ask', '--target', 'helper', '--prompt', ''),
                 ('ask', '--target', 'helper', '--prompt', 'ok', '--lines', '121'),
                 ('start', '--name', 'helper', '--timeout-ms', '0'),
                 ('start', '--name', 'helper', '--deadline-seconds', '361'),
                 ('start', '--nam', 'helper'), ()]
        for args in cases:
            with self.subTest(args=args):
                code, r, calls = self.launch([], *args)
                self.assertEqual(code, 2, r); self.assertEqual(calls, [])
        for patch in [{'HERDR_ENV': ''}, {'HERDR_PANE_ID': ''}, {'HERDR_SOCKET_PATH': '/absent'},
                      {'HERDR_SOCKET_PATH': str(SCRIPT)}, {'PI_DOCKER_HOST_WORKSPACE': ''},
                      {'PI_DOCKER_HOST_WORKSPACE': 'relative'}, {'PI_DOCKER_HOST_WORKSPACE': '/a\nb'}]:
            with self.subTest(patch=patch):
                code, r, calls = self.launch([], 'start', '--name', 'helper', env={**self.env, **patch})
                self.assertEqual(code, 2, r); self.assertEqual(calls, [])

    def test_missing_cli_structured(self):
        code, r, calls = self.launch([], 'start', '--name', 'helper', env={**self.env, 'PATH': '/absent'})
        self.assertEqual(r['error']['code'], 'cli_unavailable'); self.assertEqual(calls, [])

    def test_duplicate_alias_before_mutation(self):
        code, r, calls = self.launch([{'result': {'agents': [AGENT]}}], 'start', '--name', 'helper')
        self.assertEqual(r['error']['code'], 'duplicate_name'); self.assertEqual(len(calls), 1)
        self.assertEqual(r['mutation'], 'not_attempted')

    def test_malformed_preflight_and_split(self):
        cases = [([{'stdout': 'garbage'}], 'check_alias', 'failure'),
                 ([{'result': {'agents': None}}], 'check_alias', 'failure'),
                 (self.start_steps()[:1] + [{'result': {'layout': []}}], 'layout', 'failure'),
                 (self.start_steps()[:1] + [{'result': {'layout': {'panes': []}}}], 'layout', 'failure'),
                 (self.start_steps()[:1] + [{'result': {'layout': {'panes': [
                     {'pane_id': 'w1:p1', 'rect': {'width': 10 ** 500, 'height': 40}}
                 ]}}}], 'layout', 'failure'),
                 (self.start_steps()[:2] + [{'result': {'pane': {}}}], 'split', 'partial_failure'),
                 (self.start_steps()[:2] + [{'stdout': 'lost JSON'}], 'split', 'partial_failure')]
        for steps, stage, status in cases:
            with self.subTest(stage=stage, steps=steps):
                code, r, calls = self.launch(steps, 'start', '--name', 'helper')
                self.assertEqual(r['stage'], stage); self.assertEqual(r['status'], status)
                self.assertEqual(r['error']['code'], 'malformed_response')
                self.assertEqual(len(calls), len(steps))

    def test_split_and_start_upstream_failures_preserve_known_ids(self):
        for index, stage in [(2, 'split'), (3, 'start'), (4, 'resolve_started')]:
            steps = self.start_steps()[:index] + [error('agent_not_ready')]
            if index == 4: steps += [{'stdout': 'diagnostic'}]
            code, r, calls = self.launch(steps, 'start', '--name', 'helper')
            self.assertEqual(r['stage'], stage); self.assertEqual(r['status'], 'partial_failure')
            self.assertEqual(r['pane_id'], None if index == 2 else 'w1:p2')
            self.assertEqual(r['error']['upstream'], error('agent_not_ready')['error'])
            self.assertEqual(r['error']['cli_exit_code'], 1)
            if index == 3: self.assertEqual(r['startup'], 'uncertain')
            self.assertEqual(len([c for c in calls if c[:2] == ['pane', 'split']]), 1)

    def test_busy_blocked_unknown_pending_and_self_rejected_before_prompt(self):
        for patch in [{'agent_status': 'working'}, {'agent_status': 'blocked'}, {'agent_status': 'unknown'},
                      {'interactive_ready': False}, {'launch_pending': True}, {'pane_id': 'w1:p1'}]:
            with self.subTest(patch=patch):
                code, r, calls = self.launch([agent(**patch), {'stdout': 'evidence'}], 'ask', '--target', 'helper', '--prompt', 'ok')
                self.assertNotEqual(code, 0)
                self.assertEqual(r['delivery'], 'not_attempted')
                self.assertFalse(any(c[:2] == ['agent', 'prompt'] for c in calls))

    def test_prompt_failure_uncertainty_and_primary_error_survives_diagnostic_failure(self):
        for upstream in ['timeout', 'agent_prompt_stalled', 'connection_error', 'agent_blocked']:
            code, r, calls = self.launch([agent(), error(upstream), error('diagnostic_failure')],
                                         'ask', '--target', 'helper', '--prompt', 'ok')
            self.assertEqual(r['error']['code'], upstream)
            self.assertEqual(r['delivery'], 'rejected' if upstream == 'agent_blocked' else 'uncertain')
            self.assertEqual(r['pane_id'], 'w1:p2'); self.assertEqual(r['agent'], AGENT)
            self.assertEqual(r['diagnostic_error']['code'], 'diagnostic_failure')
            self.assertEqual(sum(c[:2] == ['agent', 'prompt'] for c in calls), 1)

    def test_read_failure_keeps_acknowledged_delivery(self):
        steps = self.ask_steps()[:3] + [error('read_failed'), {'stdout': 'last evidence'}]
        code, r, calls = self.launch(steps, 'ask', '--target', 'helper', '--prompt', 'ok')
        self.assertEqual(r['stage'], 'read'); self.assertEqual(r['delivery'], 'acknowledged')
        self.assertEqual(r['error']['code'], 'read_failed')
        self.assertEqual(r['diagnostic']['trust'], 'untrusted')

    def test_replacement_detected_without_overwriting_identity(self):
        for index in [1, 2, 4]:
            steps = self.ask_steps()[:index] + [agent(terminal_id='replacement')] + [{'stdout': 'evidence'}]
            code, r, calls = self.launch(steps, 'ask', '--target', 'helper', '--prompt', 'ok')
            self.assertEqual(r['error']['code'], 'identity_changed')
            self.assertEqual(r['agent']['terminal_id'], AGENT['terminal_id'])
            self.assertEqual(r['observed_agent']['terminal_id'], 'replacement')
            self.assertEqual(sum(c[:2] == ['agent', 'prompt'] for c in calls), 1)

    def test_blocked_after_submission_returns_state_not_completion(self):
        steps = self.ask_steps()
        for i in [1, 2, 4]: steps[i] = agent(agent_status='blocked', interactive_ready=False)
        code, r, calls = self.launch(steps, 'ask', '--target', 'helper', '--prompt', 'ok')
        self.assertEqual(code, 0, r); self.assertEqual(r['agent']['agent_status'], 'blocked')
        self.assertEqual(r['task_completion'], 'not_asserted')

    def test_output_and_diagnostics_bounded(self):
        steps = self.ask_steps(); steps[3] = {'stdout': '\x1b[31m' + ('x' * 1000 + '\n') * 100}
        code, r, calls = self.launch(steps, 'ask', '--target', 'helper', '--prompt', 'ok')
        self.assertEqual(code, 0, r); self.assertTrue(r['output']['truncated'])
        self.assertLessEqual(len(r['output']['text'].encode()), 16384)
        self.assertNotIn('\x1b', r['output']['text'])
        code, r, calls = self.launch([agent(), error(), {'stdout': 'x' * 10000}], 'ask', '--target', 'helper', '--prompt', 'ok')
        self.assertLessEqual(len(r['diagnostic']['text'].encode()), 2048)

    def test_client_deadline_after_prompt_has_no_resend(self):
        before = time.monotonic()
        code, r, calls = self.launch([agent(), {'sleep': 5}], 'ask', '--target', 'helper', '--prompt', 'ok', '--deadline-seconds', '1')
        self.assertLess(time.monotonic() - before, 2.5)
        self.assertEqual(r['error']['code'], 'client_timeout'); self.assertEqual(r['delivery'], 'uncertain')
        self.assertEqual(len(calls), 2)
        self.assertLess(int(calls[1][-1]), 1000)

    def test_start_timeout_preserves_pane_and_deadline_does_not_restart(self):
        steps = self.start_steps()[:3] + [{'sleep': 5}]
        before = time.monotonic()
        code, r, calls = self.launch(steps, 'start', '--name', 'helper', '--deadline-seconds', '1')
        self.assertLess(time.monotonic() - before, 2.5)
        self.assertEqual(r['pane_id'], 'w1:p2'); self.assertEqual(r['startup'], 'uncertain')
        self.assertEqual(r['error']['code'], 'client_timeout')
        self.assertLess(int(calls[3][calls[3].index('--timeout') + 1]), 1000)

    def test_cancel_after_split_or_submission_no_diagnostics(self):
        for operation, steps, args, stage, field in [
            ('ask', [agent(), {'sleep': 5}], ['--target', 'helper', '--prompt', 'ok'], 'prompt', 'delivery'),
            ('start', self.start_steps()[:3] + [{'sleep': 5}], ['--name', 'helper'], 'start', 'startup')]:
            for sig in [signal.SIGINT, signal.SIGTERM]:
                with self.subTest(operation=operation, sig=sig):
                    (self.root / 'steps').write_text(json.dumps(steps))
                    (self.root / 'calls').unlink(missing_ok=True)
                    proc = subprocess.Popen([sys.executable, str(SCRIPT), operation, *args], env=self.env,
                                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                    try:
                        end = time.monotonic() + 3
                        while len(self.calls()) < len(steps) and time.monotonic() < end:
                            time.sleep(.02)
                        self.assertEqual(len(self.calls()), len(steps))
                        proc.send_signal(sig)
                        out, err = proc.communicate(timeout=2)
                        r = json.loads(out)
                        self.assertEqual(err, '')
                        self.assertEqual(r['error']['code'], 'cancelled')
                        self.assertEqual(r['stage'], stage); self.assertEqual(r[field], 'uncertain')
                        self.assertEqual(len(self.calls()), len(steps))
                        self.assertEqual(r['pane_id'], 'w1:p2')
                    finally:
                        if proc.poll() is None: proc.kill(); proc.communicate()

    def test_cumulative_deadline_and_bounded_diagnostic(self):
        steps = self.start_steps()[:3] + [{'sleep': 5}]
        for step in steps[:3]: step['sleep'] = .2
        before = time.monotonic()
        code, r, calls = self.launch(steps, 'start', '--name', 'helper', '--deadline-seconds', '1')
        self.assertLess(time.monotonic() - before, 1.8)
        self.assertEqual(r['error']['code'], 'client_timeout')
        self.assertEqual(r['pane_id'], 'w1:p2')
        self.assertLess(int(calls[3][calls[3].index('--timeout') + 1]), 400)
        before = time.monotonic()
        code, r, calls = self.launch([agent(), error('agent_prompt_stalled'), {'sleep': 5}],
                                     'ask', '--target', 'helper', '--prompt', 'ok')
        self.assertLess(time.monotonic() - before, 2.5)
        self.assertEqual(r['error']['code'], 'agent_prompt_stalled')
        self.assertEqual(r['diagnostic_error']['code'], 'client_timeout')
        self.assertEqual(len(calls), 3)

    def test_split_timeout_unknown_id_and_readiness_after_start(self):
        code, r, calls = self.launch(self.start_steps()[:2] + [{'sleep': 5}],
                                     'start', '--name', 'helper', '--deadline-seconds', '1')
        self.assertEqual(r['status'], 'partial_failure'); self.assertIsNone(r['pane_id'])
        self.assertEqual(r['mutation'], 'uncertain'); self.assertEqual(r['startup'], 'not_attempted')
        steps = self.start_steps()[:4] + [agent(interactive_ready=False), {'stdout': 'evidence'}]
        code, r, calls = self.launch(steps, 'start', '--name', 'helper')
        self.assertEqual(r['error']['code'], 'target_not_ready'); self.assertEqual(r['pane_id'], 'w1:p2')
        self.assertEqual(r['startup'], 'acknowledged')

    def test_missing_target_transport_loss_and_malformed_agent_fail_closed(self):
        for failure in [error('agent_not_found'), error('connection_error'),
                        agent(name=['invalid']), {'result': {'agent': {}}}]:
            code, r, calls = self.launch([failure], 'ask', '--target', 'helper', '--prompt', 'ok')
            self.assertEqual(r['delivery'], 'not_attempted'); self.assertEqual(len(calls), 1)
            self.assertEqual(r['status'], 'failure')
        # Ask needs socket context, but not Docker-only startup metadata.
        code, r, calls = self.launch(self.ask_steps(), 'ask', '--target', 'helper', '--prompt', 'ok',
                                     env={**self.env, 'PI_DOCKER_HOST_WORKSPACE': ''})
        self.assertEqual(code, 0, r)

    def test_response_size_syntax_error_and_malformed_prompt_receipt(self):
        for step, expected in [({'stdout': 'x' * (1024 * 1024 + 1)}, 'response_too_large'),
                               ({'stderr': 'usage failure', 'exit': 2}, 'cli_failed'),
                               ({'stdout': '{"result": []}'}, 'malformed_response'),
                               ({'stdout': '[' * 2000 + ']' * 2000}, 'malformed_response'),
                               ({'error': {'code': [], 'message': []}}, 'upstream_error')]:
            code, r, calls = self.launch([step], 'start', '--name', 'helper')
            self.assertEqual(r['error']['code'], expected)
        code, r, calls = self.launch([agent(), {'stdout': 'malformed'}, {'stdout': 'evidence'}],
                                     'ask', '--target', 'helper', '--prompt', 'ok')
        self.assertEqual(r['delivery'], 'uncertain'); self.assertEqual(r['status'], 'partial_failure')


if __name__ == '__main__':
    unittest.main()
