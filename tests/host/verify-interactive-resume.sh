#!/usr/bin/env bash
# Host-only, manual TUI gate. No live provider, Herdr socket, or cleanup.
set -euo pipefail
umask 077
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source_root="$(realpath -e -- "$here/../..")"
usage() {
  printf '%s\n' \
    'Usage: bash tests/host/verify-interactive-resume.sh --preflight|--run' \
    'Run on the Linux Docker host in an interactive terminal.' \
    'Creates a fresh /tmp/pi-docker-resume.XXXXXXXX deployment; retains all evidence.' \
    'Requires existing local base/custom image, Bash, Git, Docker/Compose, coreutils and test-only jq.' \
    'You must select conversations in the real picker and confirm visible history/scoping.' \
    'No network, real credentials, Herdr API, image changes, automatic retries or cleanup.'
}
fail() { printf 'STOP: %s\n' "$*" >&2; exit 1; }
[[ $# == 1 ]] || { usage; exit 2; }
case "$1" in
  --help|-h) usage; exit 0 ;;
  --preflight|--run) mode="$1" ;;
  *) usage; exit 2 ;;
esac
for tool in docker git jq realpath sha256sum cut cp mv mkdir mktemp tr timeout sleep tee; do
  command -v "$tool" >/dev/null || fail "missing tool: $tool"
done
if [[ "$mode" == --run ]]; then
  [[ -t 0 && -t 1 ]] || fail 'run requires terminal stdin and stdout; do not pipe or redirect this script'
fi
preflight="$(bash "$here/verify-session-persistence.sh" --preflight)"
printf '%s\n' "$preflight"
tag=''; image_id=''
while IFS= read -r line; do
  case "$line" in
    'Image: '*) tag="${line#Image: }" ;;
    'Image ID: '*) image_id="${line#Image ID: }" ;;
  esac
done <<< "$preflight"
[[ "$tag" == pi-docker:custom || "$tag" == pi-docker:base ]] || fail 'unexpected selected image'
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'unexpected image identity'
[[ "$mode" == --run ]] || exit 0

root="$(mktemp -d /tmp/pi-docker-resume.XXXXXXXX)"
export PHASE3_PROJECT="piresume-$(basename -- "$root" | tr '[:upper:].' '[:lower:]-')"
mkdir "$root/logs"
printf 'root=%s\nproject=%s\nimage=%s\nimage_id=%s\n' \
  "$root" "$PHASE3_PROJECT" "$tag" "$image_id" > "$root/receipt.txt"
printf '%s\n' "$preflight" > "$root/preflight.txt"
docker_read() { timeout --kill-after=5s 20s docker "$@" </dev/null; }
finish() {
  local rc=$? kind filter remaining
  trap - EXIT
  for kind in run project; do
    filter="label=pi-docker.phase3-run=$PHASE3_PROJECT"
    [[ "$kind" != project ]] || filter="label=com.docker.compose.project=$PHASE3_PROJECT"
    if remaining="$(docker_read ps --all --filter "$filter" --format '{{.ID}} {{.Names}} {{.Status}}')"; then
      printf '%s\n' "$remaining" > "$root/logs/containers-$kind.txt"
      if [[ -n "$remaining" ]]; then
        printf 'STOP: retained containers; inspect %s\n' "$root/logs/containers-$kind.txt" >&2
        rc=1
      fi
    else
      printf 'Container inspection failed; state uncertain. Inspect label %s manually.\n' "$filter" >&2
      rc=1
    fi
  done
  if ((rc == 0)); then
    printf 'RESULT: PASS (automated assertions and manual confirmations; review evidence)\n' > "$root/result.txt"
  else
    printf 'RESULT: FAIL/INTERRUPTED (exit %s); no retry or cleanup attempted\n' "$rc" > "$root/result.txt"
  fi
  printf '\nEvidence retained: %s\nNo cleanup performed.\n' "$root"
  exit "$rc"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '\nFresh deployment: %s\nRun label: %s\n' "$root" "$PHASE3_PROJECT"

# Deployment allowlist: NEVER copy real data/, .git/, .env or host configuration.
for resource in bin lib docs extensions skills images README.md \
  compose.git.yaml compose.herdr.yaml compose.metadata.yaml; do
  cp -R -- "$source_root/$resource" "$root/$resource"
done
cp -- "$source_root/compose.yaml" "$root/compose.production.yaml"
mkdir -p "$root/data/config/extensions" "$root/data/gh-config" "$root/fixtures/project/subdir"
cp -- "$source_root/tests/session/fixture-provider.ts" "$root/data/config/extensions/phase3-fixture.ts"
printf 'pi-docker-phase3-fixture\n' > "$root/data/config/phase3-fixture"
printf '{}\n' > "$root/data/config/auth.json"
printf '%s\n' '{"packages":[],"compaction":{"enabled":false},"retry":{"enabled":false}}' \
  > "$root/data/config/settings.json"
# Production stdin/TTY, entrypoint and command are inherited without changes.
cat > "$root/compose.yaml" <<'YAML'
name: "${PHASE3_PROJECT:?}"
services:
  pi:
    extends:
      file: ./compose.production.yaml
      service: pi
    environment:
      HOME: /tmp
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
sha256sum -- "$root/bin/pi" "$root/lib/herdr-launch.sh" "$root/lib/workspace-mounts.sh" \
  "$root/compose.production.yaml" "$root/compose.yaml" \
  "$root/data/config/extensions/phase3-fixture.ts" > "$root/inputs.sha256"
sha256sum -- "${BASH_SOURCE[0]}" > "$root/driver.sha256"
project="$root/fixtures/project"; sub="$project/subdir"
result="$root/data/config/phase3-result.json"
cli=(--offline --no-tools --no-mcp --no-skills --no-prompt-templates
     --no-themes --no-context-files --no-approve --provider pi-docker-fixture --model fixed)
check_inputs() {
  local tags current
  sha256sum --check --status "$root/inputs.sha256"
  tags="$(docker_read image ls --filter reference=pi-docker:custom --format '{{.Repository}}:{{.Tag}}')"
  if [[ "$tag" == pi-docker:custom ]]; then
    [[ "$tags" == pi-docker:custom ]] || fail 'custom availability changed'
  else
    [[ -z "$tags" ]] || fail 'custom availability changed'
  fi
  current="$(docker_read image inspect "$tag" --format '{{.Id}}')"
  [[ "$current" == "$image_id" ]] || fail 'image tag changed; do not override launcher selection'
}
prepare_turn() {
  local label="$1"
  check_inputs
  if [[ -e "$result" ]]; then
    [[ ! -e "$root/logs/before-$label.json" ]]
    mv -- "$result" "$root/logs/before-$label.json"
  fi
}
capture_check() {
  local label="$1" selected="$2" storage="$3" title="$4" users="$5"
  local state hash store file
  state="$root/logs/$label.json"
  [[ -s "$result" && ! -e "$state" ]] || fail 'missing observation or duplicate evidence name'
  cp -- "$result" "$state" # Save before assertions, including on a failed assertion.
  jq -e --arg title "$title" --argjson users "$users" '
    .stage == "settled" and .cwd == "/workspace" and .headerCwd == "/workspace" and
    .piVersion == "1.5.2" and .hasHerdr == false and .sessionName == $title and
    .users == $users and .assistants == ($users | map("offline-fixture:" + .)) and
    (.sessionId | type == "string" and length > 0) and
    (.sessionFile | test("^/pi/sessions/[a-zA-Z0-9_.-]+[.]jsonl$"))
  ' "$state" >/dev/null || fail "observation/history mismatch: $label"
  hash="$(printf '%s' "$(realpath -e -- "$selected")" | sha256sum | cut -c1-12)"
  store="$root/data/sessions/$storage-$hash"
  file="$store/$(basename -- "$(jq -r .sessionFile "$state")")"
  [[ -s "$file" ]] || fail 'session missing from exact directory/name storage'
  cp -- "$file" "$root/logs/$label.jsonl"
  printf '%s\n' "$file" > "$root/logs/$label.host-file.txt"
  jq -se --arg id "$(jq -r .sessionId "$state")" --argjson users "$users" '
    def text: if type == "string" then . else map(select(.type == "text") | .text) | join("") end;
    .[0].type == "session" and .[0].id == $id and .[0].cwd == "/workspace" and
    ([.[] | select(.type == "message" and .message.role == "user") |
      .message.content | text] == $users) and
    ([.[] | select(.type == "message" and .message.role == "assistant") |
      .message.content | text] == ($users | map("offline-fixture:" + .))) and
    all(.[] | select(.type == "message" and .message.role == "assistant");
      .message.provider == "pi-docker-fixture" and .message.stopReason == "stop")
  ' "$file" >/dev/null || fail "persisted JSONL mismatch: $label"
  printf 'PASS %s: %s\n' "$label" "$(jq -r .sessionId "$state")" | tee -a "$root/checks.txt"
}
seed() {
  local key="$1" selected="$2" storage="$3" title="$4"
  prepare_turn "seed-$key"
  # Keep terminal transport even for print-mode seeding.
  "$root/bin/pi" "$selected" --name "$storage" --no-herdr --no-host-gitconfig -- \
    "${cli[@]}" --print --name "$title" "phase3-$key-seed"
  capture_check "seed-$key" "$selected" "$storage" "$title" "[\"phase3-$key-seed\"]"
}
seed alpha "$project" backend 'Phase3 Alpha'
sleep 2
seed beta "$project" backend 'Phase3 Beta'
seed reviewer "$project" reviewer 'Phase3 Reviewer'
seed sub "$sub" backend 'Phase3 Subdirectory'
[[ "$(jq -sr 'map(.sessionId) | unique | length' "$root"/logs/seed-*.json)" == 4 ]] \
  || fail 'seeds did not produce four distinct conversations'

resume_test() {
  local key="$1" selected="$2" storage="$3" title="$4" expected="$5" answer note
  printf '\n=== Interactive check: %s ===\n' "$title"
  printf 'Default/local list should contain ONLY: %s\n' "$expected"
  printf 'Do not switch to global/all-session browsing to make the check pass.\n'
  printf 'Select "%s"; inspect its original user AND assistant seed history.\n' "$title"
  printf 'Send: phase3-%s-resume\nWait for: offline-fixture:phase3-%s-resume\nThen enter /quit.\n' "$key" "$key"
  [[ "$key" != alpha ]] || printf 'Choose older Alpha deliberately, NOT newer Beta.\n'
  read -r -p 'Press Enter to open the picker (Ctrl-C to stop): ' answer
  prepare_turn "resume-$key"
  "$root/bin/pi" "$selected" --name "$storage" --no-herdr --no-host-gitconfig -- \
    "${cli[@]}" --resume
  capture_check "resume-$key" "$selected" "$storage" "$title" \
    "[\"phase3-$key-seed\",\"phase3-$key-resume\"]"
  jq -se '
    .[0].sessionId == .[1].sessionId and .[0].sessionFile == .[1].sessionFile and
    .[0].sessionName == .[1].sessionName and .[0].cwd == .[1].cwd and
    .[0].headerCwd == .[1].headerCwd
  ' "$root/logs/seed-$key.json" "$root/logs/resume-$key.json" >/dev/null \
    || fail "conversation identity changed: $key"
  read -r -p 'Describe titles visible in the DEFAULT/LOCAL list and original history seen: ' note
  printf '%s: %s\n' "$key" "$note" >> "$root/observations.txt"
  [[ -n "$note" ]] || fail 'visual observation required'
  read -r -p 'Correct local scope, selected title and original history? Type yes or no: ' answer
  printf '%s confirmed=%s\n' "$key" "$answer" >> "$root/observations.txt"
  [[ "$answer" == yes ]] || fail 'manual check failed/ambiguous; retain state, do not retry'
  printf 'PASS stable identity/history and manual confirmation: %s\n' "$key" | tee -a "$root/checks.txt"
}
resume_test alpha "$project" backend 'Phase3 Alpha' 'Phase3 Alpha, Phase3 Beta'
resume_test beta "$project" backend 'Phase3 Beta' 'Phase3 Alpha, Phase3 Beta'
resume_test reviewer "$project" reviewer 'Phase3 Reviewer' 'Phase3 Reviewer'
resume_test sub "$sub" backend 'Phase3 Subdirectory' 'Phase3 Subdirectory'
jq -s 'map({stage, sessionId, sessionFile, sessionName, cwd, headerCwd,
  users, assistants, hasHerdr, piVersion, hostname})' \
  "$root"/logs/seed-*.json "$root"/logs/resume-*.json > "$root/evidence.json"
printf '\nAll picker steps complete. Both directory selections used /workspace;\n'
printf 'distinct host storage and session identities establish isolation, not cwd alone.\n'
printf 'Return receipt.txt, inputs.sha256, checks.txt, observations.txt, evidence.json and result.txt.\n'
printf 'Keep fixtures until reviewed. Native Herdr/base/cross-image/layout-transition gates remain pending.\n'
