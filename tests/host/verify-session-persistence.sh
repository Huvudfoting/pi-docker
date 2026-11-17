#!/usr/bin/env bash
# Phase 3, first host gate: actual launcher + actual image Pi entrypoint, offline.
# No live Herdr context/socket, real private data, pulls, retags or API requests.
set -euo pipefail
umask 077
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
deployment="$(realpath -e -- "$here/../..")"
source "$here/mount-contract.sh" # only probe_git is used, for disposable fixtures
fail() { printf 'FAIL %s\n' "$*" >&2; exit 1; }
usage() {
  printf '%s\n' 'Usage: bash tests/host/verify-session-persistence.sh --preflight|--run' \
    'Preflight is read-only. Run creates/retains an isolated /tmp/pi-docker-persistence.XXXXXXXX deployment.' \
    'Requires jq in addition to Phase 2 host tools; no host Python/Node required.' \
    'Uses real bin/pi and the image entrypoint, an offline fixture provider, no network and no real private data.' \
    'Does not test the interactive resume picker, native Herdr restore, live provider connectivity or rewind.' \
    'No automatic retry, cleanup, branch removal, or image modifications.'
}
[[ $# == 1 ]] || { usage; exit 2; }
case "$1" in --help|-h) usage; exit 0 ;; --preflight|--run) mode="$1" ;; *) usage; exit 2 ;; esac
command -v jq >/dev/null || fail 'test-only jq is required'
for tool in cp find sort; do command -v "$tool" >/dev/null || fail "missing test tool: $tool"; done
preflight="$(bash "$here/verify-worktree-mounts.sh" --production-preflight)" || fail 'Phase 2 tool/daemon/image preflight failed'
printf '%s\n' "$preflight"
tag=''; image_id=''
while IFS= read -r line; do
  case "$line" in 'Image: '*) tag="${line#Image: }" ;; 'Image ID: '*) image_id="${line#Image ID: }" ;; esac
done <<< "$preflight"
[[ "$tag" == pi-docker:custom || "$tag" == pi-docker:base ]] || fail 'unexpected preflight image'
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'unexpected image identity'
[[ "$mode" == --run ]] || exit 0
root="$(mktemp -d /tmp/pi-docker-persistence.XXXXXXXX)"
export PHASE3_PROJECT="pipersist-$(basename -- "$root" | tr '[:upper:].' '[:lower:]-')"
report="$root/report.txt"; steps=0; passed=0
mkdir "$root/logs"
printf 'Phase 3 real-Pi offline persistence report\nImage: %s\nImage ID: %s\nCompose project/label: %s\n' "$tag" "$image_id" "$PHASE3_PROJECT" > "$report"
printf '%s\n' 'Scope: actual copied launcher/image entrypoint, isolated fixture config/provider and print-mode turns; NOT interactive picker/native Herdr/live APIs/rewind.' >> "$report"
printf '%s\n' "$preflight" >> "$report"
printf 'project=%s\n' "$PHASE3_PROJECT" > "$root/containers.txt"
docker_read() { timeout --kill-after=5s 20s docker "$@" </dev/null; }
finish() {
  local rc=$? remaining=''
  trap - EXIT
  if remaining="$(docker_read ps --all --filter "label=pi-docker.phase3-run=$PHASE3_PROJECT" --format '{{.ID}} {{.Names}} {{.Status}}')"; then
    printf '%s\n' "$remaining" >> "$root/containers.txt"
    if [[ -n "$remaining" ]]; then
      printf 'Retained containers: %s\n' "$remaining" >> "$report"; rc=1
    fi
  else
    printf 'Container inspection failed/timed out; inspect the saved project/label manually.\n' >> "$report"; rc=1
  fi
  if ((rc == 0)); then printf '\nRESULT: PASS (%s checks)\n' "$passed" >> "$report"
  else printf '\nRESULT: FAIL/INTERRUPTED (exit %s); inspect retained state, do not retry automatically.\n' "$rc" >> "$report"; fi
  printf '\nReport: %s\nRetained deployment/data/fixtures/logs: %s\nReceipts: %s/containers.txt\nNo cleanup attempted.\n' "$report" "$root" "$root"
  exit "$rc"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
step() {
  local label="$1" rc=0 line; shift
  steps=$((steps + 1))
  printf 'CHECK %s: %s\n' "$steps" "$label" | tee -a "$report"
  if "$@" > "$root/logs/check-$steps.log" 2>&1; then passed=$((passed + 1)); else rc=$?; fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//"$root"/<FIXTURES>}"
    printf '%s\n' "$line" | LC_ALL=C tr -d '\000-\010\013-\037\177' >> "$report"
  done < "$root/logs/check-$steps.log"
  if ((rc)); then printf 'FAIL exit=%s; no retry\n' "$rc" | tee -a "$report"; return "$rc"; fi
  printf 'PASS\n' | tee -a "$report"
}
# Copy only the deployment allowlist, NEVER source data/, .git/, auth or .env.
for resource in bin lib docs extensions skills images README.md compose.git.yaml compose.herdr.yaml compose.metadata.yaml; do
  cp -R -- "$deployment/$resource" "$root/$resource"
done
cp -- "$deployment/compose.yaml" "$root/compose.production.yaml"
cp -- "$deployment/tests/session/compose.fixture.yaml" "$root/compose.yaml"
mkdir -p "$root/data/config/extensions" "$root/fixtures"
printf 'pi-docker-phase3-fixture\n' > "$root/data/config/phase3-fixture"
printf '{}\n' > "$root/data/config/auth.json"
printf '%s\n' '{"packages":[],"compaction":{"enabled":false},"retry":{"enabled":false}}' > "$root/data/config/settings.json"
cp -- "$deployment/tests/session/fixture-provider.ts" "$root/data/config/extensions/phase3-fixture.ts"
sha256sum -- "$root/bin/pi" "$root/lib/herdr-launch.sh" "$root/lib/workspace-mounts.sh" \
  "$root/compose.production.yaml" "$root/compose.yaml" "$root/data/config/extensions/phase3-fixture.ts" > "$root/inputs.sha256"
result="$root/data/config/phase3-result.json"
cli=(--offline --print --no-tools --no-mcp --no-skills --no-prompt-templates --no-themes --no-approve --provider pi-docker-fixture --model fixed)
store_for() {
  local canonical hash
  canonical="$(realpath -e -- "$1")" || return
  hash="$(printf '%s' "$canonical" | sha256sum | cut -c1-12)" || return
  printf '%s/data/sessions/%s-%s' "$root" "$2" "$hash"
}
launch() {
  local selected="$1" name="$2" cwd="$3" users="$4" prompt="$5" current tags store file; shift 5
  tags="$(docker_read image ls --filter reference=pi-docker:custom --format '{{.Repository}}:{{.Tag}}')" || return
  if [[ "$tag" == pi-docker:custom ]]; then
    [[ "$tags" == pi-docker:custom ]] || fail 'custom availability changed; stop without image overrides'
  else
    [[ -z "$tags" ]] || fail 'custom availability changed; stop without image overrides'
  fi
  current="$(docker_read image inspect "$tag" --format '{{.Id}}')" || return
  [[ "$current" == "$image_id" ]] || fail 'image tag changed during run; stop instead of replaying/overriding it'
  rm -f -- "$result" || return # only the previous private observation, never a conversation
  timeout --kill-after=5s 180s "$root/bin/pi" "$selected" --name "$name" --no-herdr --no-host-gitconfig -- "${cli[@]}" "$@" "$prompt" </dev/null || return
  [[ -f "$result" ]] || fail 'real Pi did not produce a fixture observation'
  cp -- "$result" "$root/logs/state-$steps.json" || return
  jq -e --arg cwd "$cwd" --argjson users "$users" '
    .stage == "settled" and .cwd == $cwd and .headerCwd == $cwd and
    .piVersion == "1.5.2" and (.hasHerdr | not) and .users == $users and
    .assistants == ($users | map("offline-fixture:" + .)) and
    (.sessionFile | test("^/pi/sessions/[a-zA-Z0-9_.-]+[.]jsonl$"))' "$result" >/dev/null || fail 'fixture snapshot/history/cwd mismatch'
  store="$(store_for "$selected" "$name")" || return
  file="$store/$(basename -- "$(jq -r .sessionFile "$result")")"
  [[ -f "$file" ]] || fail 'Pi session did not reach exact host directory/name storage'
  jq -se --arg cwd "$cwd" --arg id "$(jq -r .sessionId "$result")" --argjson users "$users" '
    def text: if type == "string" then . else map(select(.type == "text") | .text) | join("") end;
    .[0].type == "session" and .[0].id == $id and .[0].cwd == $cwd and
    ([.[] | select(.type == "message" and .message.role == "user") | .message.content | text] == $users) and
    ([.[] | select(.type == "message" and .message.role == "assistant") | .message.content | text] ==
      ($users | map("offline-fixture:" + .))) and
    all(.[] | select(.type == "message" and .message.role == "assistant");
      .message.provider == "pi-docker-fixture" and .message.stopReason == "stop")' "$file" >/dev/null || fail 'persisted JSONL header/messages mismatch'
  printf 'Container hostname receipt: %s\n' "$(jq -r .hostname "$result")" | tee -a "$root/containers.txt"
  printf 'Session ID: %s; file: %s\n' "$(jq -r .sessionId "$result")" "$file"
}
assert_same() { [[ "$1" == "$2" ]] || fail 'conversation identity changed'; }
assert_different() { [[ "$1" != "$2" ]] || fail 'unrelated selection shared conversation identity'; }
history_digest() { find "$root/data/sessions" -type f -name '*.jsonl' -exec sha256sum '{}' + | sort; }
expect_rejected() {
  local selected="$1" expected="$2" before after rc=0
  before="$(history_digest)" || return
  rm -f -- "$result" || return
  if timeout --kill-after=5s 60s "$root/bin/pi" "$selected" --name backend --no-herdr --no-host-gitconfig -- "${cli[@]}" --continue phase3-forbidden > "$root/logs/negative-$steps.log" 2>&1; then
    fail 'invalid selection unexpectedly launched'
  else rc=$?; fi
  [[ "$rc" == 2 ]] || fail "unexpected/ambiguous negative exit $rc"
  grep -Fq -- "$expected" "$root/logs/negative-$steps.log" || fail 'failure was unrelated to the intended path guard'
  [[ ! -e "$result" ]] || fail 'Pi started after a launcher path failure'
  after="$(history_digest)" || return
  [[ "$before" == "$after" ]] || fail 'rejected launch changed conversation files'
  printf 'Expected launcher rejection before Pi startup; history unchanged\n'
}
ordinary="$root/fixtures/ordinary"; main="$root/fixtures/main"; a="$root/fixtures/linked 'quote' \$cash:colon"; b="$root/fixtures/linked-b"
mkdir "$ordinary" "$main"
probe_git -C "$main" init -q -b main
printf 'fixture\n' > "$main/tracked"
probe_git -C "$main" add tracked
probe_git -C "$main" commit -qm fixture
probe_git -C "$main" worktree add -q -b helper-a "$a"
probe_git -C "$main" worktree add -q -b helper-b "$b"
sub="$a/packages/a/b"; mkdir -p "$sub"
ln -s "$a" "$root/fixtures/alias"
step 'ordinary: real entrypoint, fresh conversation and display name' launch "$ordinary" backend /workspace '["phase3-first"]' phase3-first --name 'Fixture display title'
ordinary_id="$(jq -r .sessionId "$result")"; ordinary_file="$(jq -r .sessionFile "$result")"
[[ "$(jq -r .sessionName "$result")" == 'Fixture display title' ]] || fail 'Pi title was not distinct from storage selection'
step 'ordinary: continue same ID/file/history' launch "$ordinary" backend /workspace '["phase3-first","phase3-second"]' phase3-second --continue
assert_same "$ordinary_id" "$(jq -r .sessionId "$result")"; assert_same "$ordinary_file" "$(jq -r .sessionFile "$result")"
step 'ordinary: explicit selected-session reopen' launch "$ordinary" backend /workspace '["phase3-first","phase3-second","phase3-third"]' phase3-third --session "$ordinary_file"
assert_same "$ordinary_id" "$(jq -r .sessionId "$result")"
step 'different storage name does not continue the other conversation' launch "$ordinary" reviewer /workspace '["phase3-reviewer"]' phase3-reviewer --continue
assert_different "$ordinary_id" "$(jq -r .sessionId "$result")"
step 'self-contained checkout does not pool ordinary /workspace history' launch "$main" backend /workspace '["phase3-main"]' phase3-main --continue
assert_different "$ordinary_id" "$(jq -r .sessionId "$result")"
step 'linked checkout: exact cwd, real persisted turn' launch "$a" backend "$a" '["phase3-linked"]' phase3-linked
linked_id="$(jq -r .sessionId "$result")"; linked_file="$(jq -r .sessionFile "$result")"
step 'symlink selection continues canonical linked history' launch "$root/fixtures/alias" backend "$a" '["phase3-linked","phase3-alias"]' phase3-alias --continue
assert_same "$linked_id" "$(jq -r .sessionId "$result")"
step 'deep selection does not pool checkout-root history' launch "$sub" backend "$sub" '["phase3-sub"]' phase3-sub --continue
sub_id="$(jq -r .sessionId "$result")"; assert_different "$linked_id" "$sub_id"
step 'return to root: original conversation and explicit session' launch "$a" backend "$a" '["phase3-linked","phase3-alias","phase3-return"]' phase3-return --session "$linked_file"
assert_same "$linked_id" "$(jq -r .sessionId "$result")"
step 'deep continue retains its own ID/history' launch "$sub" backend "$sub" '["phase3-sub","phase3-sub-second"]' phase3-sub-second --continue
assert_same "$sub_id" "$(jq -r .sessionId "$result")"
step 'sibling linked checkout has independent conversation' launch "$b" backend "$b" '["phase3-sibling"]' phase3-sibling --continue
assert_different "$linked_id" "$(jq -r .sessionId "$result")"
step 'container exit leaves checkout and Git metadata intact' test -f "$a/.git"
step 'missing selected directory fails before Pi/fallback without changing history' expect_rejected "$root/fixtures/missing-selected" 'Cannot resolve a safe existing workspace'
# Deliberate final negative fixture state, retained without repair/rollback.
printf 'gitdir: /nonexistent/phase3-metadata\n' > "$b/.git"
step 'recognized invalid metadata fails before Pi without changing history' expect_rejected "$b" 'invalid/inaccessible Git metadata'
printf '\nNot tested: native Herdr restore/socket, interactive resume picker/TUI, cross-image tag changes, replacement-layout header/cwd transitions, live APIs or rewind.\n' >> "$report"
