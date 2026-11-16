#!/usr/bin/env python3
"""Offline CLI double for test_herdr_contract.py. Never contacts a Herdr server."""
import json
import os
from pathlib import Path
import subprocess
import sys

state_path = Path(os.environ['CONTRACT_FAKE_STATE'])
args = sys.argv[1:]
mode = os.environ.get('CONTRACT_FAKE_MODE', '')
state = json.loads(state_path.read_text())
state['calls'].append(args)


def save():
    state_path.write_text(json.dumps(state))


def success(result):
    save()
    print(json.dumps({'id': 'fixture', 'result': result}))
    sys.exit(0)


def error(code):
    save()
    print(json.dumps({'id': 'fixture', 'error': {'code': code, 'message': code}}), file=sys.stderr)
    sys.exit(1)


def option(name):
    return args[args.index(name) + 1] if name in args else None


def git(cwd, *cmd):
    # Only fixture repositories are passed by the test harness.
    env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
    env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null')
    return subprocess.run(['git', '-C', cwd, *cmd], env=env, check=True,
                          capture_output=True, text=True).stdout.strip()


def workspace(path, linked=False):
    number = state['next']
    state['next'] += 1
    wid = f'w{number}'
    wid_path = str(path)
    record = {'workspace_id': wid, 'pane_count': 1, 'tab_count': 1,
              'worktree': {'repo_root': state.get('main', wid_path),
                           'checkout_path': wid_path, 'repo_key': 'fixture-repo',
                           'is_linked_worktree': linked}}
    state['workspaces'][wid] = record
    return record


def pane(wid):
    return {'pane_id': f'{wid}:p1', 'workspace_id': wid, 'tab_id': f'{wid}:t1', 'agent': None}


def records(wid, kind):
    ws = state['workspaces'][wid]
    path = ws['worktree']['checkout_path']
    return {'type': kind, 'workspace': ws, 'tab': {'tab_id': f'{wid}:t1'},
            'root_pane': pane(wid), 'worktree': {'path': path, 'open_workspace_id': wid}}


def find_workspace(path):
    for wid, ws in state['workspaces'].items():
        if ws['worktree']['checkout_path'] == path:
            return wid
    return None


if args == ['--version']:
    save()
    print('herdr 0.9.6' if mode == 'wrong-cli' else 'herdr 0.9.5')
    sys.exit(0)
if args == ['api', 'snapshot']:
    panes = [pane(wid) for wid in state['workspaces']]
    if mode == 'live-topology':
        panes.append({'pane_id': 'w1:p2'})
    success({'snapshot': {'version': '0.9.6' if mode == 'wrong-server' else '0.9.5',
                         'protocol': 1,
                         'focused_workspace_id': 'w1', 'focused_tab_id': 'w1:t1',
                         'focused_pane_id': 'w99:p1' if mode == 'changed-focus' and state['next'] > 2 else 'w1:p1',
                         'workspaces': list(state['workspaces'].values()),
                         'tabs': [{'tab_id': f'{wid}:t1'} for wid in state['workspaces']],
                         'panes': panes, 'agents': []}})
if args[:2] == ['workspace', 'create']:
    state['main'] = option('--cwd')
    ws = workspace(state['main'])
    state['parent'] = ws['workspace_id']
    success(records(ws['workspace_id'], 'workspace_created'))
if args[:2] == ['workspace', 'get']:
    success({'workspace': state['workspaces'][args[2]]})
if args[:2] == ['workspace', 'close']:
    del state['workspaces'][args[2]]
    success({'type': 'ok'})
if args[:2] == ['worktree', 'list']:
    source = {'repo_root': state['main'], 'source_checkout_path': state['main'],
              'source_workspace_id': state['parent']}
    entries = [{'path': path, 'open_workspace_id': find_workspace(path)} for path in state['paths']]
    success({'source': source, 'worktrees': entries})
if args[:2] in (['worktree', 'create'], ['worktree', 'open']):
    cwd = option('--cwd')
    if cwd and cwd != state['main']:
        error('linked_worktree_source')
    path = option('--path')
    branch = option('--branch')
    if path is None:
        path = state['branches'][branch]
    if args[1] == 'create':
        git(state['main'], 'worktree', 'add', '-q', '-b', branch, path, option('--base') or 'HEAD')
        state['paths'].append(path)
        state['branches'][branch] = path
    wid = find_workspace(path)
    already = wid is not None
    if wid is None:
        wid = workspace(path, linked=True)['workspace_id']
    result = records(wid, 'worktree_created' if args[1] == 'create' else 'worktree_opened')
    if args[1] == 'open':
        result['already_open'] = already
    if args[1] == 'create' and mode in ('timeout-create', 'malformed-create'):
        save()
        print(json.dumps({'result': result}) if mode == 'timeout-create' else 'not-json')
        sys.exit(124 if mode == 'timeout-create' else 0)
    if args[1] == 'create' and mode == 'missing-record':
        del result['root_pane']
    success(result)
if args[:2] == ['worktree', 'remove']:
    wid = option('--workspace')
    path = state['workspaces'][wid]['worktree']['checkout_path']
    if git(path, 'status', '--porcelain'):
        error('unrelated_error' if mode == 'wrong-dirty-error' else 'dirty_worktree_requires_force')
    git(state['main'], 'worktree', 'remove', path)
    state['paths'].remove(path)
    del state['workspaces'][wid]
    success({'workspace_id': wid, 'path': path, 'forced': False})
if args[:2] == ['pane', 'run']:
    state['occupied'] = args[2]
    save()
    sys.exit(0)  # Official send_ok_request acknowledges without stdout JSON.
if args[:2] == ['pane', 'wait-output']:
    success({'type': 'wait_matched'})
if args[:2] == ['pane', 'get']:
    success({'pane': {'pane_id': args[2], 'agent': None}})
if args[:2] == ['pane', 'process-info']:
    group = 101 if state.get('occupied') else 100
    processes = [{'pid': group, 'name': 'sh'}]
    if mode == 'unknown-occupancy' and state.get('occupied'):
        processes = []
    success({'process_info': {'pane_id': option('--pane'), 'shell_pid': 100,
                             'foreground_process_group_id': group,
                             'foreground_processes': processes}})
raise RuntimeError(f'unexpected fake Herdr command: {args!r}')
