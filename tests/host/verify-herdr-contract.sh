#!/usr/bin/env bash
# Host-only Phase 1 integration harness. Never sourced by the launcher.
set -euo pipefail
umask 077
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$here/mount-contract.sh"
usage() {
  printf '%s\n' \
    'Usage: bash tests/host/verify-herdr-contract.sh --preflight --launcher /host/path/bin/pi' \
    '       bash tests/host/verify-herdr-contract.sh --run --launcher /host/path/bin/pi --confirm-disposable-session' \
    'Run on Linux as your normal user, inside a fresh, explicitly created disposable Herdr session.' \
    'Requires Bash, Git 2.31+, jq 1.6+, GNU realpath/timeout, and Herdr CLI/server 0.9.5.' \
    'Preflight is read-only. Run creates fixture repositories/workspaces and tests explicit removal.' \
    'No Pi/agents, Docker, force/trust, retries, rollback, or automatic cleanup.'
}
fail() { printf 'FAIL %s\n' "$*" >&2; exit 1; }
mode=''; launcher=''; consent=0
while (($#)); do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --preflight|--run) [[ -z "$mode" ]] || fail 'choose one mode'; mode="$1"; shift ;;
    --launcher) [[ $# -ge 2 ]] || fail 'missing launcher path'; launcher="$2"; shift 2 ;;
    --confirm-disposable-session) consent=1; shift ;;
    *) usage >&2; exit 2 ;;
  esac
done
[[ -n "$mode" && "$launcher" == /* ]] || { usage >&2; exit 2; }
[[ "$mode" != --run || "$consent" == 1 ]] || fail 'run requires --confirm-disposable-session; never use an existing work session'
[[ "$(uname -s)" == Linux ]] || fail 'Linux host required'
[[ "$(id -u)" != 0 ]] || fail 'run as a normal user, not sudo/root'
for tool in herdr git jq realpath timeout mktemp; do command -v "$tool" >/dev/null || fail "missing test tool: $tool"; done
# Never select a session/socket or manufacture caller context.
[[ "${HERDR_ENV:-}" == 1 && -n "${HERDR_PANE_ID:-}" && -S "${HERDR_SOCKET_PATH:-}" ]] || fail 'genuine inherited Herdr pane/socket context required'
[[ -x "$launcher" && -f "$launcher" ]] || fail 'launcher must be an existing executable file'
resolved_pi="$(command -v pi)" || fail 'host pi not found on PATH'
[[ "$resolved_pi" == /* && "$(realpath -e -- "$resolved_pi")" == "$(realpath -e -- "$launcher")" ]] || fail 'host pi does not resolve to the supplied Docker-Pi launcher (symlinks supported)'
# Versions/help never launch Pi. All Herdr commands inherit exactly this context.
cli_version="$(timeout --kill-after=5s 15s herdr --version </dev/null)" || fail 'Herdr CLI version check failed'
[[ "$cli_version" == 'herdr 0.9.5' ]] || fail "expected reviewed CLI herdr 0.9.5, got: $cli_version"
snapshot="$(timeout --kill-after=5s 15s herdr api snapshot </dev/null)" || fail 'cannot inspect inherited Herdr session'
printf '%s\n' "$snapshot" | jq -e --arg pane "$HERDR_PANE_ID" '
  .result.snapshot | .version == "0.9.5" and (.protocol | type == "number") and
  (.panes | any(.pane_id == $pane))' >/dev/null || fail 'expected server 0.9.5 and a caller pane in its snapshot'
# Require an otherwise empty topology; consent alone must not enable live-session tests.
printf '%s\n' "$snapshot" | jq -e '
  .result.snapshot | (.workspaces | length) == 1 and (.tabs | length) == 1 and
  (.panes | length) == 1 and (.agents | length) == 0 and
  (.focused_workspace_id | type == "string") and (.focused_tab_id | type == "string") and
  (.focused_pane_id | type == "string")' >/dev/null || fail 'use a fresh disposable session with one workspace/tab/shell pane and no agents'
# The Git version floor covers --path-format without creating preflight fixtures.
read -r _ _ git_version _ <<< "$(git --version)"
IFS=. read -r major minor _ <<< "$git_version"
[[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ ]] || fail 'unrecognized Git version'
((major > 2 || (major == 2 && minor >= 31))) || fail 'Git 2.31+ required'
focus="$(printf '%s\n' "$snapshot" | jq -c '.result.snapshot | [.focused_workspace_id,.focused_tab_id,.focused_pane_id]')"
printf 'Host Git: %s\nBash: %s\njq: %s\nHerdr CLI: %s\n' "$(git --version)" "$BASH_VERSION" "$(jq --version)" "$cli_version"
printf 'Server: 0.9.5; protocol: %s\nHost pi: verified against supplied launcher (not executed)\n' "$(printf '%s\n' "$snapshot" | jq -r '.result.snapshot.protocol')"
printf 'Preflight passed: inherited context and fresh disposable topology verified; no mutations.\n'
[[ "$mode" == --run ]] || exit 0
root="$(mktemp -d /tmp/pi-herdr-contract.XXXXXXXX)"
root="$(realpath -e -- "$root")"
mkdir "$root/logs" "$root/fixtures"
report="$root/report.txt"; receipts="$root/receipts.jsonl"; number=0; checks=0
printf 'Herdr 0.9.5 host contract report\nScope: disposable Herdr lifecycle, not Docker/production launcher/restore/rewind.\nHost Git: %s\nBash: %s\njq: %s\nCLI: %s\nServer: 0.9.5\n' "$(git --version)" "$BASH_VERSION" "$(jq --version)" "$cli_version" > "$report"
: > "$receipts"
say() { printf '%s\n' "$*" | tee -a "$report"; }
finish() {
  local rc=$?
  trap - EXIT
  if ((rc == 0)); then say "RESULT: PASS ($checks assertions)"
  else say "RESULT: FAIL/INTERRUPTED (exit $rc); stop and inspect receipts and raw logs before recovery."; fi
  printf 'Report to return: %s\nReceipts and retained fixtures/logs: %s\n' "$report" "$root"
  printf 'No automatic cleanup/retry. Timeout or missing response may follow a completed mutation.\n'
  exit "$rc"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Keep all planned mutation stages visible even if an earlier step interrupts.
for label in parent create linked-create linked-open reused-open close reopen dirty-remove clean-remove occupied-create occupy occupied-open; do
  jq -nc --arg stage "$label" '{stage:$stage,outcome:"not_attempted"}' >> "$receipts"
done
sanitize() {
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//"$root"/<FIXTURES>}"
    line="${line//"$HERDR_SOCKET_PATH"/<HERDR_SOCKET>}"
    line="${line//"$launcher"/<LAUNCHER>}"
    printf '%s\n' "$line" | LC_ALL=C tr -d '\000-\010\013-\037\177'
  done
}
# Persist identities before validating assertions. Raw responses remain private.
call() {
  local stage="$1" kind="$2" expected="$3" rc=0 state; shift 3
  number=$((number + 1)); out="$root/logs/$number-$stage.stdout.json"; err="$root/logs/$number-$stage.stderr"
  jq -nc --arg stage "$stage" --arg kind "$kind" --argjson step "$number" \
    '{step:$step,stage:$stage,kind:$kind,outcome:"uncertain"}' >> "$receipts"
  if timeout --kill-after=5s 20s herdr "$@" > "$out" 2> "$err" </dev/null; then rc=0; else rc=$?; fi
  state=uncertain
  if ((rc == 0)) && jq -e '.result | type == "object"' "$out" >/dev/null 2>&1; then state=confirmed_success
  # pane run uses send_ok_request: successful admission has exit 0 and no JSON.
  elif ((rc == 0)) && [[ "$expected" == ack && ! -s "$out" && ! -s "$err" ]]; then state=confirmed_success
  elif ((rc == 1)) && jq -e '.error.code | type == "string"' "$err" >/dev/null 2>&1; then state=confirmed_failure; fi
  jq -nc --arg stage "$stage" --arg kind "$kind" --arg state "$state" --argjson step "$number" --argjson rc "$rc" \
    --slurpfile response "$out" --rawfile error "$err" '
    {step:$step,stage:$stage,kind:$kind,outcome:$state,exit:$rc,
     result:($response[0].result // null),error:$error}' >> "$receipts" 2>/dev/null || \
    jq -nc --arg stage "$stage" --argjson rc "$rc" '{stage:$stage,outcome:"uncertain",exit:$rc,detail:"non-JSON output; inspect raw logs"}' >> "$receipts"
  say "STEP $number $stage: $state (exit $rc)"
  # Report only fixture identities, never full snapshots/terminal contents/process argv.
  if jq -e '.result | type == "object"' "$out" >/dev/null 2>&1; then
    jq -c '.result | {type,workspace_id:(.workspace.workspace_id // .workspace_id),tab_id:.tab.tab_id,pane_id:.root_pane.pane_id,path:(.worktree.path // .path),already_open,forced} | with_entries(select(.value != null))' "$out" | sanitize >> "$report"
  fi
  if [[ ( "$expected" == success || "$expected" == ack ) && "$state" == confirmed_success ]]; then return; fi
  if [[ "$expected" != success && "$expected" != ack && "$state" == confirmed_failure ]] && jq -e --arg code "$expected" '.error.code == $code' "$err" >/dev/null; then return; fi
  sanitize < "$err" >> "$report"
  fail "unexpected result at $stage; no subsequent mutations attempted"
}
check() { local label="$1"; shift; "$@" || fail "$label"; checks=$((checks + 1)); say "PASS $label"; }
json() { jq -e "$@" "$out" >/dev/null; }
read_field() { jq -er "$1" "$out"; }
focus_check() {
  call focus read success api snapshot
  check 'focus preserved' json --argjson before "$focus" '.result.snapshot | [.focused_workspace_id,.focused_tab_id,.focused_pane_id] == $before'
}
records_check() {
  json --arg path "$child" --arg main "$main" '
    .result | (.workspace.workspace_id | type == "string") and
    (.tab.tab_id | type == "string") and (.root_pane.pane_id | type == "string") and
    .root_pane.workspace_id == .workspace.workspace_id and .root_pane.tab_id == .tab.tab_id and
    .workspace.worktree.repo_root == $main and .workspace.worktree.checkout_path == $path and
    .workspace.worktree.is_linked_worktree == true and .worktree.path == $path and
    .worktree.open_workspace_id == .workspace.workspace_id and
    .workspace.pane_count == 1 and .workspace.tab_count == 1'
}
main="$root/fixtures/main checkout"; child="$root/fixtures/linked checkout"
mkdir "$main"
probe_git -C "$main" init -q -b main
probe_git -C "$main" config core.hooksPath /dev/null
probe_git -C "$main" config commit.gpgSign false
printf 'initial\n' > "$main/tracked"
probe_git -C "$main" add tracked
probe_git -C "$main" commit -qm fixture
call parent mutation success workspace create --cwd "$main" --label phase1-parent --no-focus
parent="$(read_field '.result.workspace.workspace_id')"
call create mutation success worktree create --workspace "$parent" --branch phase1-child --base main --path "$child" --no-focus
check 'create returns checkout/workspace/tab/root-pane with grouped provenance, no second open/split' records_check
workspace="$(read_field '.result.workspace.workspace_id')"; pane="$(read_field '.result.root_pane.pane_id')"
check 'checkout exists' test -f "$child/.git"
call parent-membership read success workspace get "$parent"
check 'parent has matching primary repository membership' json --arg main "$main" '.result.workspace.worktree | .repo_root == $main and .checkout_path == $main and .is_linked_worktree == false'
focus_check
call linked-list read success worktree list --cwd "$child"
check 'linked list discovers explicit parent and open child' json --arg main "$main" --arg parent "$parent" --arg child "$child" --arg ws "$workspace" '
  .result | .source.repo_root == $main and .source.source_checkout_path == $main and
  .source.source_workspace_id == $parent and (.worktrees | any(.path == $child and .open_workspace_id == $ws))'
# Exercise rejection, not recovery: these requests must not create/open anything.
call linked-create mutation linked_worktree_source worktree create --cwd "$child" --branch must-not-exist --path "$root/fixtures/must-not-exist" --no-focus
check 'linked-source rejection created no checkout' test ! -e "$root/fixtures/must-not-exist"
call linked-open mutation linked_worktree_source worktree open --cwd "$child" --path "$child" --no-focus
call reused-open mutation success worktree open --cwd "$main" --path "$child" --no-focus
check 'open reuses existing workspace and pane' json --arg ws "$workspace" --arg pane "$pane" '.result | .already_open == true and .workspace.workspace_id == $ws and .root_pane.pane_id == $pane'
focus_check
call close mutation success workspace close "$workspace"
check 'workspace close retains checkout' test -f "$child/.git"
call closed-list read success worktree list --workspace "$parent"
check 'closed checkout retained without open workspace' json --arg child "$child" '.result.worktrees | any(.path == $child and .open_workspace_id == null)'
call reopen mutation success worktree open --workspace "$parent" --branch phase1-child --no-focus
check 'closed checkout opens as a new workspace' records_check
check 'reopen reports not already open' json '.result.already_open == false'
workspace="$(read_field '.result.workspace.workspace_id')"
printf 'dirty fixture\n' >> "$child/tracked"
call dirty-remove mutation dirty_worktree_requires_force worktree remove --workspace "$workspace"
check 'dirty removal preserves checkout and edit' grep -q 'dirty fixture' "$child/tracked"
call dirty-retained read success worktree list --workspace "$parent"
check 'dirty refusal preserves exact open workspace' json --arg child "$child" --arg ws "$workspace" '.result.worktrees | any(.path == $child and .open_workspace_id == $ws)'
# Restore only our known file contents; never reset/stash/force or failure-cleanup.
printf 'initial\n' > "$child/tracked"
call clean-remove mutation success worktree remove --workspace "$workspace"
check 'removal returns exact target and no force' json --arg ws "$workspace" --arg child "$child" '.result | .workspace_id == $ws and .path == $child and .forced == false'
check 'explicit clean removal deleted checkout' test ! -e "$child"
check 'removal retained branch' probe_git -C "$main" show-ref --verify --quiet refs/heads/phase1-child
call removed-snapshot read success api snapshot
check 'removed workspace is absent' json --arg ws "$workspace" '.result.snapshot.workspaces | all(.workspace_id != $ws)'
focus_check
# Occupancy test uses a bounded ordinary fixture process, not an agent or user pane.
child="$root/fixtures/occupied checkout"
call occupied-create mutation success worktree create --cwd "$main" --branch phase1-occupied --path "$child" --no-focus
check 'second child created and grouped' records_check
workspace="$(read_field '.result.workspace.workspace_id')"; pane="$(read_field '.result.root_pane.pane_id')"
# POSIX sh fixture prints unique markers; exits after release or 60s regardless of outcome.
cat > "$root/occupant.sh" <<'OCCUPANT'
#!/bin/sh
printf 'PHASE1_OCCUPANT_STARTED\n'
n=0
while [ ! -f "$0.release" ] && [ "$n" -lt 60 ]; do sleep 1; n=$((n + 1)); done
printf 'PHASE1_OCCUPANT_FINISHED\n'
OCCUPANT
# Do not submit a command to an agent/editor/startup process in the returned pane.
call shell-info read success pane get "$pane"
check 'test pane has no detected agent' json '.result.pane.agent == null'
call shell-process read success pane process-info --pane "$pane"
check 'test pane has only its shell in the foreground' json '
  .result.process_info | (.shell_pid | type == "number") and
  .foreground_process_group_id == .shell_pid and
  (.shell_pid as $shell | .foreground_processes | length == 1 and .[0].pid == $shell)'
# mktemp template guarantees no apostrophe; quote the absolute path explicitly.
call occupy mutation ack pane run "$pane" "sh '$root/occupant.sh'"
call occupied-ready read success pane wait-output "$pane" --match PHASE1_OCCUPANT_STARTED --timeout 5000
call occupied-process read success pane process-info --pane "$pane"
check 'returned pane has a non-shell foreground occupant; cannot start a helper there' json --arg pane "$pane" '
  .result.process_info | .pane_id == $pane and (.shell_pid | type == "number") and
  (.foreground_process_group_id | type == "number") and .foreground_process_group_id != .shell_pid and
  (.foreground_process_group_id as $group | .foreground_processes | any(.pid == $group))'
occupant_group="$(read_field '.result.process_info.foreground_process_group_id')"
call occupied-open mutation success worktree open --workspace "$parent" --path "$child" --no-focus
check 'already-open occupied pane returned unchanged, no agent replacement' json --arg ws "$workspace" --arg pane "$pane" '.result | .already_open == true and .workspace.workspace_id == $ws and .root_pane.pane_id == $pane'
call occupant-retained read success pane process-info --pane "$pane"
check 'open did not replace the foreground process group' json --argjson group "$occupant_group" '
  .result.process_info | .foreground_process_group_id == $group and (.foreground_processes | any(.pid == $group))'
# Normal test completion releases our process via its fixture file; failure never does cleanup.
: > "$root/occupant.sh.release"
call occupant-finished read success pane wait-output "$pane" --match PHASE1_OCCUPANT_FINISHED --timeout 5000
focus_check
say 'Not tested: Docker/production Compose, Pi startup/readiness, conversations/restore, rewind.'
say 'Parent and occupied checkout/workspace intentionally retained. See receipts before any requested cleanup.'
