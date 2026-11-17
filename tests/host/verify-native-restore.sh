#!/usr/bin/env bash
# Host-only Phase 3 reporter + native launcher protocol gate, NOT server restart.
set -euo pipefail
umask 077
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
deployment="$(realpath -e -- "$here/../..")"
usage() {
  printf '%s\n' \
    'Usage: bash tests/host/verify-native-restore.sh --preflight' \
    '       bash tests/host/verify-native-restore.sh --run [--focused-handover] --confirm-disposable-session' \
    '--focused-handover: two fresh ordinary conversations, same directory/storage/pane; no worktrees or restore.' \
    '--prepare-shell-boundary: prepare separate top-level A/B commands; no Pi launched during preparation.' \
    '--prepare-native-boundary: prepare four separate seed/reopen commands with shell returns; no Pi launch.' \
    'Use --prepare-native-boundary for the full native gate; plain --run is the legacy single-job driver.' \
    'Run inside a NEW disposable Herdr 0.9.5 session with one shell pane and no agents.' \
    'Requires Linux Docker/Compose, existing base/custom image, Git, Bash, flock, coreutils, jq and host Herdr.' \
    'Tests official reporting and native launcher reopen using the reported managed path.' \
    'Does NOT stop/restart Herdr or certify automatic server-restart restoration.' \
    'Run mounts the live socket: it grants access to the ENTIRE disposable session.' \
    'Fresh private fixtures, offline provider, no network/credentials/host Git config.' \
    'No helpers, retries, cleanup, force, worktree removal or image changes.'
}
fail() { printf 'STOP: %s\n' "$*" >&2; exit 1; }
mode=''; consent=0; focused_handover=0; shell_boundary=0; native_boundary=0
while (($#)); do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --preflight|--run) [[ -z "$mode" ]] || fail 'choose one mode'; mode="$1"; shift ;;
    --confirm-disposable-session) consent=1; shift ;;
    --prepare-native-boundary) [[ "$focused_handover" == 0 && "$native_boundary" == 0 ]] || fail 'duplicate/conflicting handover mode'; native_boundary=1; shift ;;
    --focused-handover) [[ "$focused_handover" == 0 && "$native_boundary" == 0 ]] || fail 'duplicate/conflicting handover mode'; focused_handover=1; shift ;;
    --prepare-shell-boundary) [[ "$focused_handover" == 0 && "$native_boundary" == 0 ]] || fail 'duplicate/conflicting handover mode'; focused_handover=1; shell_boundary=1; shift ;;
    *) usage >&2; exit 2 ;;
  esac
done
[[ -n "$mode" ]] || { usage; exit 2; }
[[ "$mode" != --run || "$consent" == 1 ]] || fail 'run requires --confirm-disposable-session'
((!shell_boundary && !native_boundary)) || [[ -z "${HERDR_AGENT:-}" ]] || fail 'shell-boundary experiment requires surrounding shell without HERDR_AGENT'
[[ "$(uname -s)" == Linux && "$(id -u)" != 0 ]] || fail 'use the Linux Docker host as a normal user, not sudo/root'
[[ -t 0 && -t 1 ]] || fail 'interactive terminal required; do not pipe/redirect this driver'
for tool in herdr git jq flock realpath timeout cp mv mkdir mktemp sha256sum cut tr find tee cmp wc; do
  command -v "$tool" >/dev/null || fail "missing tool: $tool"
done
[[ "${HERDR_ENV:-}" == 1 && -n "${HERDR_PANE_ID:-}" &&
   "${HERDR_SOCKET_PATH:-}" == /* && -S "${HERDR_SOCKET_PATH:-}" && -O "${HERDR_SOCKET_PATH:-}" ]] \
  || fail 'genuine inherited same-user Herdr context/socket required; do not set fake pane variables'
herdr_bin="$(type -P herdr)"
export HERDR_BIN_PATH="$herdr_bin"
herdr_read() { timeout --kill-after=5s 20s "$herdr_bin" "$@" </dev/null; }
[[ "$(herdr_read --version)" == 'herdr 0.9.5' ]] || fail 'reviewed host Herdr CLI 0.9.5 required; no upgrade/restart'
snapshot="$(herdr_read api snapshot)"
printf '%s\n' "$snapshot" | jq -e --arg pane "$HERDR_PANE_ID" '
  .result.snapshot | .version == "0.9.5" and
  (.workspaces | length) == 1 and (.tabs | length) == 1 and
  (.panes | length) == 1 and .panes[0].pane_id == $pane and
  (.agents | length) == 0
' >/dev/null || fail 'use a NEW disposable session: one workspace/tab/shell pane, no agents, server 0.9.5'
preflight="$(bash "$here/verify-session-persistence.sh" --preflight)"
printf '%s\n' "$preflight"
tag=''; image_id=''
while IFS= read -r line; do
  case "$line" in 'Image: '*) tag="${line#Image: }" ;; 'Image ID: '*) image_id="${line#Image ID: }" ;; esac
done <<< "$preflight"
[[ "$tag" == pi-docker:custom || "$tag" == pi-docker:base ]] || fail 'unexpected selected image'
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'unexpected image ID'
printf 'Herdr preflight: inherited same-user context, CLI/server 0.9.5 and empty topology verified.\n'
[[ "$mode" == --run ]] || exit 0
printf '\nWARNING: the test container will control the WHOLE inherited Herdr session.\n'
read -r -p 'Confirm this is a NEW disposable session. Type disposable: ' answer
[[ "$answer" == disposable ]] || fail 'disposable-session confirmation required'

root="$(mktemp -d /tmp/pi-docker-native.XXXXXXXX)"
export PHASE3_PROJECT="pinative-$(basename -- "$root" | tr '[:upper:].' '[:lower:]-')"
mkdir "$root/logs"
printf 'root=%s\nproject=%s\nimage=%s\nimage_id=%s\npane=%s\n' \
  "$root" "$PHASE3_PROJECT" "$tag" "$image_id" "$HERDR_PANE_ID" > "$root/receipt.txt"
printf '%s\n' "$preflight" > "$root/preflight.txt"
printf '%s\n' "$snapshot" > "$root/logs/preflight-snapshot.json"
if ((native_boundary)); then
  printf '%s\n' 'Scope: PREPARATION of four separate ordinary/linked seed/native-reopen jobs with verified shell returns. No Pi launch during preparation; NOT server restart or Phase 3 completion.' > "$root/scope.txt"
elif ((shell_boundary)); then
  printf '%s\n' 'Scope: PREPARATION of same-pane ordinary A/B shell-boundary diagnostic; separate top-level foreground jobs, no native reopen or server restart. No Pi launched by preparation.' > "$root/scope.txt"
elif ((focused_handover)); then
  printf '%s\n' 'Scope: two ordinary conversations in the same directory/storage/pane; no worktrees, native reopen or server restart. A stale_previous result is a finding, NOT a pass.' > "$root/scope.txt"
else
  printf '%s\n' 'Scope: official reporter and native managed-path reopen; NOT Herdr server restart or Phase 3 completion.' > "$root/scope.txt"
fi
docker_read() { timeout --kill-after=5s 20s docker "$@" </dev/null; }
finish() {
  local rc=$? kind filter remaining
  trap - EXIT
  for kind in run project; do
    filter="label=pi-docker.phase3-run=$PHASE3_PROJECT"
    [[ "$kind" != project ]] || filter="label=com.docker.compose.project=$PHASE3_PROJECT"
    if remaining="$(docker_read ps --all --filter "$filter" --format '{{.ID}} {{.Names}} {{.Status}}')"; then
      printf '%s\n' "$remaining" > "$root/logs/containers-$kind.txt"
      if [[ -n "$remaining" ]]; then printf 'Retained containers: inspect %s\n' "$root/logs/containers-$kind.txt" >&2; rc=1; fi
    else printf 'Container inspection failed; state uncertain. Inspect %s manually.\n' "$filter" >&2; rc=1; fi
  done
  if ((rc == 0 && native_boundary)); then
    printf 'RESULT: PREPARED ONLY; native shell-boundary gate NOT RUN (see control/INSTRUCTIONS.txt)\n' > "$root/result.txt"
  elif ((rc == 0 && shell_boundary)); then
    printf 'RESULT: PREPARED ONLY; shell-boundary diagnostic NOT RUN (see control/INSTRUCTIONS.txt)\n' > "$root/result.txt"
  elif ((rc == 0 && focused_handover)); then
    printf 'RESULT: DIAGNOSTIC COMPLETE (see handover.json; NOT a native restore pass)\n' > "$root/result.txt"
  elif ((rc == 0)); then
    printf 'RESULT: PASS (native launcher protocol only; NOT server-restart restore)\n' > "$root/result.txt"
  else
    printf 'RESULT: FAIL/INTERRUPTED (exit %s); inspect retained evidence; no automatic retry/cleanup\n' "$rc" > "$root/result.txt"
  fi
  printf '\nEvidence/fixtures retained: %s\nNo cleanup or Herdr stop performed.\n' "$root"
  exit "$rc"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'Fresh test deployment: %s\n' "$root"
for resource in bin lib docs extensions skills images README.md compose.git.yaml compose.herdr.yaml compose.metadata.yaml; do
  cp -R -- "$deployment/$resource" "$root/$resource"
done
cp -- "$deployment/compose.yaml" "$root/compose.production.yaml"
mkdir -p "$root/data/config/extensions" "$root/data/gh-config" "$root/host-home" "$root/fixtures/ordinary"
cp -- "$deployment/tests/session/fixture-provider.ts" "$root/data/config/extensions/phase3-fixture.ts"
cp -- "$deployment/tests/session/native-checkpoint.ts" "$root/data/config/extensions/phase3-native-checkpoint.ts"
printf 'pi-docker-phase3-fixture\n' > "$root/data/config/phase3-fixture"
printf 'pi-docker-phase3-native\n' > "$root/data/config/phase3-native"
printf '{}\n' > "$root/data/config/auth.json"
printf '%s\n' '{"packages":[],"defaultProvider":"pi-docker-fixture","defaultModel":"fixed","defaultTools":[],"compaction":{"enabled":false},"retry":{"enabled":false},"enableAnalytics":false,"enableInstallTelemetry":false}' > "$root/data/config/settings.json"
cat > "$root/compose.yaml" <<'YAML'
name: "${PHASE3_PROJECT:?}"
services:
  pi:
    extends:
      file: ./compose.production.yaml
      service: pi
    environment:
      HOME: /tmp
      PI_OFFLINE: "1"
    network_mode: none
    read_only: true
    mem_limit: 1g
    cpus: 2
    pids_limit: 256
    tmpfs:
      - /tmp:rw,nosuid,nodev,size=128m,mode=1777
    labels:
      pi-docker.phase3-run: "${PHASE3_PROJECT:?}"
YAML
sha256sum -- "$root/bin/pi" "$root/bin/herdr-extension" "$root/lib/herdr-launch.sh" \
  "$root/lib/herdr-extension.sh" "$root/lib/workspace-mounts.sh" \
  "$root/compose.production.yaml" "$root/compose.yaml" "$root/compose.herdr.yaml" "$root/compose.metadata.yaml" \
  "$root/data/config/extensions/phase3-fixture.ts" "$root/data/config/extensions/phase3-native-checkpoint.ts" \
  > "$root/inputs.sha256"
sha256sum -- "${BASH_SOURCE[0]}" > "$root/driver.sha256"
if ((focused_handover)); then
  mkdir "$root/control"
  cp -- "$here/session-handover.sh" "$root/control/session-handover.sh"
  sha256sum -- "$root/control/session-handover.sh" >> "$root/inputs.sha256"
  source "$root/control/session-handover.sh"
  if ((shell_boundary)); then
    cp -- "$here/shell-boundary-handover.sh" "$root/control/shell-boundary-handover.sh"
    sha256sum -- "$root/control/shell-boundary-handover.sh" >> "$root/inputs.sha256"
    source "$root/control/shell-boundary-handover.sh"
  fi
fi
if ((native_boundary)); then
  mkdir "$root/control"
  cp -- "$here/native-boundary.sh" "$root/control/native-boundary.sh"
  sha256sum -- "$root/control/native-boundary.sh" >> "$root/inputs.sha256"
  source "$root/control/native-boundary.sh"
fi
# PATH changes only this driver/children; never install a host launcher symlink.
export PATH="$root/bin:$PATH"
[[ "$(realpath -e -- "$(type -P pi)")" == "$root/bin/pi" ]] || fail 'private PATH did not resolve copied launcher'
# Current pane launches, not helpers; no pane creation or background agent adapter.
# Restore cannot take --no-host-gitconfig: a fresh host HOME has no Git config.
# Keep Docker's original host context/config selection when isolating HOME.
# This path is used by the host CLI only; it is not read or mounted into Pi.
export DOCKER_CONFIG="${DOCKER_CONFIG:-$HOME/.docker}"
export HOME="$root/host-home"
if ((!focused_handover)); then
  source "$here/mount-contract.sh" # isolated probe_git environment for fixture Git only
  main="$root/fixtures/main"; linked="$root/fixtures/linked checkout"
  mkdir "$main"
  probe_git -C "$main" init -q -b main
  printf 'fixture\n' > "$main/tracked"
  probe_git -C "$main" add tracked
  probe_git -C "$main" commit -qm fixture
  probe_git -C "$main" worktree add -q -b native-test "$linked"
  selected_linked="$linked/packages/backend"; mkdir -p "$selected_linked"
fi
# Explicit host installer touches only this fresh copied deployment's config.
"$root/bin/herdr-extension" ensure
sha256sum -- "$root/data/config/extensions/herdr-agent-state.ts" > "$root/reporter.sha256"

check_inputs() {
  local tags current
  sha256sum --check --status "$root/inputs.sha256"
  sha256sum --check --status "$root/reporter.sha256"
  tags="$(docker_read image ls --filter reference=pi-docker:custom --format '{{.Repository}}:{{.Tag}}')"
  if [[ "$tag" == pi-docker:custom ]]; then [[ "$tags" == pi-docker:custom ]]; else [[ -z "$tags" ]]; fi
  current="$(docker_read image inspect "$tag" --format '{{.Id}}')"
  [[ "$current" == "$image_id" ]] || fail 'image changed; stop without replaying/overriding image choice'
}
prepare_turn() {
  local label="$1" file
  check_inputs
  for file in phase3-result.json phase3-native-checkpoint.json phase3-native-snapshot.json phase3-native-error.txt; do
    if [[ -e "$root/data/config/$file" ]]; then
      mv -- "$root/data/config/$file" "$root/logs/before-$label-$file"
    fi
  done
  jq -nc --arg stage "$label" '{stage:$stage,outcome:"uncertain",kind:"interactive_launcher"}' >> "$root/receipts.jsonl"
}
capture() {
  local label="$1" selected="$2" title="$3" users="$4" cwd="$5" policy="${6:-strict}" file observed_ref
  [[ "$policy" == strict || ( "$policy" == diagnostic && "$focused_handover" == 1 ) ]] || fail 'invalid capture policy'
  for file in phase3-result.json phase3-native-checkpoint.json phase3-native-snapshot.json phase3-native-error.txt; do
    if [[ -e "$root/data/config/$file" ]]; then cp -- "$root/data/config/$file" "$root/logs/$label-$file"; fi
  done
  state="$root/logs/$label-phase3-result.json"
  checkpoint="$root/logs/$label-phase3-native-checkpoint.json"
  [[ -s "$state" ]] || fail 'missing settled result; do not retry'
  jq -e --arg title "$title" --arg cwd "$cwd" --argjson users "$users" '
    .stage == "settled" and .piVersion == "1.5.2" and .hasHerdr == true and
    .cwd == $cwd and .headerCwd == $cwd and .sessionName == $title and
    .users == $users and .assistants == ($users | map("offline-fixture:" + .)) and
    (.sessionFile | test("^/pi/herdr-sessions/[a-f0-9]{64}/[a-zA-Z0-9_.-]+[.]jsonl$"))
  ' "$state" >/dev/null || fail 'settled observation/history/cwd mismatch'
  # Local persistence is checked against Pi's observation, never presented as
  # official reporting. Strict mode separately requires the identical official ref.
  observed_ref="$(jq -er .sessionFile "$state")"
  local hash store host_file key record version recorded_selection recorded_name extra
  hash="$(printf '%s' "$selected" | sha256sum | cut -c1-12)"
  store="$root/data/sessions/backend-$hash"; host_file="$store/$(basename -- "$observed_ref")"
  [[ -s "$host_file" ]] || fail 'missing exact directory/name session file'
  cp -- "$host_file" "$root/logs/$label.jsonl"
  printf '%s\n' "$host_file" > "$root/logs/$label.host-file.txt"
  jq -se --arg id "$(jq -r .sessionId "$state")" --arg cwd "$cwd" --argjson users "$users" '
    def text: if type == "string" then . else map(select(.type == "text") | .text) | join("") end;
    .[0].type == "session" and .[0].id == $id and .[0].cwd == $cwd and
    ([.[] | select(.type == "message" and .message.role == "user") | .message.content | text] == $users) and
    ([.[] | select(.type == "message" and .message.role == "assistant") | .message.content | text] ==
      ($users | map("offline-fixture:" + .))) and
    all(.[] | select(.type == "message" and .message.role == "assistant");
      .message.provider == "pi-docker-fixture" and .message.stopReason == "stop")
  ' "$host_file" >/dev/null || fail 'persisted session mismatch'
  key="${observed_ref#/pi/herdr-sessions/}"; key="${key%%/*}"; record="$root/data/herdr-launches/$key.record"
  {
    IFS= read -r -d '' version && IFS= read -r -d '' recorded_selection && IFS= read -r -d '' recorded_name \
      || fail 'incomplete v3 record'
    [[ "$version" == pi-docker-herdr-v3 && "$recorded_selection" == "$selected" && "$recorded_name" == backend ]] \
      || fail 'record selection/name mismatch'
    extra=''
    if IFS= read -r -d '' extra || [[ -n "$extra" ]]; then fail 'unexpected launch record data'; fi
  } < "$record"
  cp -- "$record" "$root/logs/$label.record"
  if [[ "$policy" == diagnostic ]]; then
    jq -nc --arg stage "$label" --arg id "$(jq -r .sessionId "$state")" \
      '{stage:$stage,outcome:"local_history_verified",sessionId:$id,official_reporting:"not_yet_classified"}' >> "$root/receipts.jsonl"
    printf 'PASS %s: LOCAL persisted history/storage/v3 record only; official report assessed separately\n' "$label" | tee -a "$root/checks.txt"
    return
  fi
  [[ ! -e "$root/data/config/phase3-native-error.txt" ]] || fail "checkpoint failed: inspect logs/$label-phase3-native-error.txt"
  [[ -s "$checkpoint" ]] || fail 'missing official checkpoint; do not retry'
  jq -e --slurpfile state "$state" --arg pane "$HERDR_PANE_ID" '
    .observation == $state[0] and .paneId == $pane and
    .reported.pane_id == $pane and .reported.agent == "pi" and
    .snapshot.version == "0.9.5" and
    ([.snapshot.agents[] | select(.pane_id == $pane)] == [.reported]) and
    .reported.agent_session.source == "herdr:pi" and
    .reported.agent_session.kind == "path" and
    .reported.agent_session.value == $state[0].sessionFile and
    (.reported.agent_status == "idle" or .reported.agent_status == "done") and
    (.reported.launch_pending | not)
  ' "$checkpoint" >/dev/null || fail 'official reporting/checkpoint mismatch'
  ref="$(jq -er '.reported.agent_session.value' "$checkpoint")"
  jq -nc --arg stage "$label" --arg id "$(jq -r .sessionId "$state")" --arg ref "$ref" \
    '{stage:$stage,outcome:"confirmed_success",sessionId:$id,reference:$ref}' >> "$root/receipts.jsonl"
  printf 'PASS %s: official reporter + persisted history + exact v3 selection\n' "$label" | tee -a "$root/checks.txt"
}
confirm_visual() {
  local label="$1" note answer
  printf '\n%s visual check: verify title, original user/assistant history and no recovery/fork UI.\n' "$label"
  read -r -p 'Describe what you observed (nonempty): ' note
  printf '%s: %s\n' "$label" "$note" >> "$root/observations.txt"
  [[ -n "$note" ]] || fail 'visual observation required; stop without retry'
  read -r -p 'All expected history/title/cwd checks matched, with no fallback? Type yes or no: ' answer
  printf '%s confirmed=%s\n' "$label" "$answer" >> "$root/observations.txt"
  [[ "$answer" == yes ]] || fail 'visual check failed/ambiguous'
}
run_case() {
  local key="$1" selected="$2" cwd="$3" title="$4" seed_ref seed_state
  printf '\n=== %s seed ===\nSend phase3-%s-seed; wait for its offline-fixture response.\n' "$key" "$key"
  printf 'Then /phase3-native-checkpoint; wait for the saved notification; then /quit.\n'
  read -r -p 'Press Enter to launch: ' answer
  prepare_turn "seed-$key"
  "$root/bin/pi" "$selected" --name backend --herdr --no-host-gitconfig -- \
    --offline --no-tools --no-mcp --no-skills --no-prompt-templates --no-themes \
    --no-context-files --no-approve --provider pi-docker-fixture --model fixed --name "$title"
  capture "seed-$key" "$selected" "$title" "[\"phase3-$key-seed\"]" "$cwd"
  seed_ref="$ref"; seed_state="$state"
  confirm_visual "seed-$key"
  printf '\n=== %s native reopen ===\nUses the OFFICIAL reported path; no original flags are replayed.\n' "$key"
  printf 'Inspect original history. Send phase3-%s-restored; wait for the response.\n' "$key"
  printf 'Then /phase3-native-checkpoint; wait for saved notification; then /quit.\n'
  read -r -p 'Press Enter to reopen the reported session: ' answer
  prepare_turn "restore-$key"
  "$root/bin/pi" --session "$seed_ref"
  capture "restore-$key" "$selected" "$title" "[\"phase3-$key-seed\",\"phase3-$key-restored\"]" "$cwd"
  [[ "$ref" == "$seed_ref" ]] || fail 'official reported reference changed'
  jq -se '.[0].sessionId == .[1].sessionId and .[0].sessionFile == .[1].sessionFile' \
    "$seed_state" "$state" >/dev/null || fail 'native reopen changed conversation identity'
  cmp -s "$root/logs/seed-$key.record" "$root/logs/restore-$key.record" || fail 'native reopen changed launch record'
  confirm_visual "restore-$key"
}
run_focused_handover() {
  local selected="$root/fixtures/ordinary" key title previous current reported verdict raw
  printf '\nFOCUSED DIAGNOSTIC: same pane, exact directory and backend storage; two NEW conversations.\n'
  printf 'No --continue/--resume/--session, worktree creation, native reopen or lifecycle reset.\n'
  for key in a b; do
    title="Handover ${key^^}"
    printf '\n=== %s ===\nSend phase3-handover-%s; wait for its offline-fixture response.\n' "$title" "$key"
    printf 'Enter /phase3-native-checkpoint ONCE. Then /quit.\n'
    if [[ "$key" == b ]]; then
      printf 'A checkpoint STOP about identity/path is a possible FINDING here: /quit anyway.\n'
      printf 'Do not retry it. The host will classify the saved raw snapshot.\n'
      printf 'B should be a fresh history containing only B, not A.\n'
    else
      printf 'A must produce the saved checkpoint notification before /quit.\n'
    fi
    read -r -p 'Press Enter to launch: ' answer
    prepare_turn "handover-$key"
    "$root/bin/pi" "$selected" --name backend --herdr --no-host-gitconfig -- \
      --offline --no-tools --no-mcp --no-skills --no-prompt-templates --no-themes \
      --no-context-files --no-approve --provider pi-docker-fixture --model fixed --name "$title"
    if [[ "$key" == a ]]; then
      capture handover-a "$selected" "$title" '["phase3-handover-a"]' /workspace
    else
      capture handover-b "$selected" "$title" '["phase3-handover-b"]' /workspace diagnostic
    fi
    if [[ "$key" == a ]]; then confirm_visual handover-a; fi
  done
  assess_handover
}
assess_handover() {
  local previous current reported verdict raw
  previous="$(jq -er .sessionFile "$root/logs/handover-a-phase3-result.json")"
  current="$(jq -er .sessionFile "$root/logs/handover-b-phase3-result.json")"
  jq -se '.[0].sessionId != .[1].sessionId and .[0].sessionFile != .[1].sessionFile' \
    "$root/logs/handover-a-phase3-result.json" "$root/logs/handover-b-phase3-result.json" >/dev/null \
    || fail 'B did not create distinct history; no handover classification'
  raw="$root/logs/handover-b-phase3-native-snapshot.json"
  [[ -s "$raw" ]] || fail 'missing B snapshot; result ambiguous, no retry'
  # Only classify an otherwise valid official idle/done report in the SAME pane.
  jq -e --arg pane "$HERDR_PANE_ID" '
    .result.snapshot | .version == "0.9.5" and
    ([.agents[] | select(.pane_id == $pane)] | length) == 1 and
    ([.agents[] | select(.pane_id == $pane)][0] |
      .agent == "pi" and .agent_session.source == "herdr:pi" and
      .agent_session.agent == "pi" and .agent_session.kind == "path" and
      (.agent_status == "idle" or .agent_status == "done") and (.launch_pending | not))
  ' "$raw" >/dev/null || fail 'B official snapshot is missing/blocked/pending/invalid; result ambiguous'
  reported="$(jq -er --arg pane "$HERDR_PANE_ID" '.result.snapshot.agents[] | select(.pane_id == $pane) | .agent_session.value' "$raw")"
  verdict="$(handover_classify "$previous" "$current" "$reported")" || fail 'unrecognized handover result; inspect evidence'
  if [[ "$verdict" == current ]]; then
    [[ ! -e "$root/logs/handover-b-phase3-native-error.txt" ]] || fail 'B checkpoint also reported an error; do not declare a clean handover'
    jq -e --arg pane "$HERDR_PANE_ID" --slurpfile state "$root/logs/handover-b-phase3-result.json" --slurpfile raw "$raw" '
      .observation == $state[0] and .snapshot == $raw[0].result.snapshot and
      .paneId == $pane and ([.snapshot.agents[] | select(.pane_id == $pane)] == [.reported])
    ' "$root/logs/handover-b-phase3-native-checkpoint.json" >/dev/null || fail 'B successful checkpoint disagrees with raw snapshot'
  else
    [[ ! -e "$root/logs/handover-b-phase3-native-checkpoint.json" &&
       -s "$root/logs/handover-b-phase3-native-error.txt" ]] || fail 'stale report did not produce expected checkpoint rejection'
    [[ "$(< "$root/logs/handover-b-phase3-native-error.txt")" == 'Error: Official reporter identity/path/settled-state mismatch; stop and inspect' ]] \
      || fail 'additional checkpoint error/retry makes outcome ambiguous'
  fi
  [[ "$(find "$root/data/sessions" -type f -name '*.jsonl' | wc -l)" -eq 2 ]] || fail 'unexpected session count'
  cmp -s "$root/logs/handover-a.record" "$root/logs/handover-b.record" || fail 'same selection/name produced different launch record'
  cmp -s "$(< "$root/logs/handover-a.host-file.txt")" "$root/logs/handover-a.jsonl" || fail 'B changed A history'
  jq -n --arg classification "$verdict" --arg pane "$HERDR_PANE_ID" \
    --arg previous "$previous" --arg current "$current" --arg reported "$reported" '
    {diagnostic:"same-pane-ordinary-handover",classification:$classification,pane:$pane,
     previous:$previous,current:$current,reported:$reported,nativeRestorePass:false,
     interpretation:(if $classification == "stale_previous" then
       "Stale conversation reference reproduced without linked worktrees; exact mechanism unproven"
       else "Reference followed B in this run; prior linked-stage mismatch remains unexplained" end)}
  ' > "$root/handover.json"
  jq -nc --arg classification "$verdict" '{stage:"handover-assessment",outcome:"confirmed_observation",classification:$classification}' >> "$root/receipts.jsonl"
  jq -s 'map({stage, sessionId, sessionFile, sessionName, cwd, headerCwd, users, assistants, hasHerdr, piVersion, hostname})' \
    "$root/logs/handover-a-phase3-result.json" "$root/logs/handover-b-phase3-result.json" > "$root/evidence.json"
  # Save the assessment BEFORE asking about B's visual history. A negative or
  # interrupted visual answer must not discard an already observed stale ref.
  printf '\nRecorded automated handover classification: %s\n' "$verdict"
  local note answer
  read -r -p 'Describe B title/new history only (checkpoint status is already recorded): ' note
  printf 'handover-b: %s\n' "$note" >> "$root/observations.txt"
  [[ -n "$note" ]] || fail 'B visual observation required; automated assessment is retained in handover.json'
  read -r -p 'Did B show Handover B and only its own user/assistant turn, with no A history? Type yes or no: ' answer
  printf 'handover-b history_confirmed=%s\n' "$answer" >> "$root/observations.txt"
  [[ "$answer" == yes ]] || fail 'B visual history check not confirmed; automated assessment is retained in handover.json'
  printf '\nDIAGNOSTIC COMPLETE: %s (NOT a native restore pass).\n' "$verdict"
  printf 'Return handover.json, evidence.json, observations.txt, receipt.txt, receipts.jsonl,\n'
  printf 'inputs.sha256, reporter.sha256, checks.txt, scope.txt and result.txt; retain raw logs.\n'
}
if ((native_boundary)); then
  native_prepare
  exit 0
fi
if ((shell_boundary)); then
  boundary_prepare
  exit 0
fi
if ((focused_handover)); then
  run_focused_handover
  exit 0
fi
run_case ordinary "$root/fixtures/ordinary" /workspace 'Native ordinary'
run_case linked "$selected_linked" "$selected_linked" 'Native linked subdirectory'
[[ "$(find "$root/data/sessions" -type f -name '*.jsonl' | wc -l)" -eq 2 ]] || fail 'unexpected replacement/additional sessions'
test -f "$linked/.git"
probe_git -C "$selected_linked" status --porcelain > "$root/logs/linked-git-status.txt"
[[ ! -s "$root/logs/linked-git-status.txt" ]] || fail 'unexpected fixture checkout changes'
jq -s 'map({stage, sessionId, sessionFile, sessionName, cwd, headerCwd, users, assistants, hasHerdr, piVersion, hostname})' \
  "$root"/logs/seed-*-phase3-result.json "$root"/logs/restore-*-phase3-result.json > "$root/evidence.json"
printf '\nNative managed-path reopen checks complete. Automatic server restart remains UNTESTED.\n'
printf 'Return scope.txt, receipt.txt, inputs.sha256, reporter.sha256, checks.txt, observations.txt,\n'
printf 'receipts.jsonl, evidence.json and result.txt. Keep raw logs/fixtures for review.\n'
