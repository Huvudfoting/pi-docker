#!/usr/bin/env bash
# Host-only, standalone Phase 1 verification. Does not invoke bin/pi or Herdr.
set -euo pipefail
umask 077
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$here/mount-contract.sh"
source "$here/container-command.sh"
usage() {
  printf '%s\n' 'Usage: bash tests/host/verify-worktree-mounts.sh --preflight|--run' \
    '  --preflight  Read-only tool/daemon/local-image checks; creates no files or containers.' \
    '  --run        Create disposable fixtures and run isolated container tests.' \
    'No real configuration, credentials, sessions, or Herdr socket are mounted.' \
    'The suite retains its unique /tmp directory and reports it. No automatic retry.'
}
fail() { printf 'FAIL %s\n' "$*" >&2; exit 1; }
preflight() {
  local tool endpoint context tags os
  [[ "$(uname -s)" == Linux ]] || fail 'Linux host required'
  for tool in bash git docker realpath sha256sum mktemp timeout; do
    command -v "$tool" >/dev/null || fail "missing required test tool: $tool"
  done
  [[ "$(id -u)" != 0 ]] || fail 'run as your normal Docker-enabled user, not sudo/root'
  if [[ -n "${DOCKER_CONTEXT:-}" ]]; then
    endpoint="$(docker context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}')" || fail 'cannot inspect Docker context'
  elif [[ -n "${DOCKER_HOST:-}" ]]; then
    endpoint="$DOCKER_HOST"
  else
    context="$(docker context show)" || fail 'cannot select Docker context'
    endpoint="$(docker context inspect "$context" --format '{{.Endpoints.docker.Host}}')" || fail 'cannot inspect Docker context'
  fi
  [[ "$endpoint" == unix:///* ]] || fail 'only a local Unix-socket Docker endpoint is supported'
  os="$(docker info --format '{{.OSType}}')" || fail 'Docker daemon inspection failed (not image absence)'
  [[ "$os" == linux ]] || fail 'Linux Docker Engine required'
  compose_version="$(docker compose version --short)" || fail 'Docker Compose plugin unavailable'
  printf 'Docker Compose: %s\n' "$compose_version"
  # Listing failure is operational failure. Only a successful empty listing is absence.
  tags="$(docker image ls --filter reference=pi-docker:custom --format '{{.Repository}}:{{.Tag}}')" || fail 'local custom-image lookup failed'
  [[ -z "$tags" || "$tags" == pi-docker:custom ]] || fail 'unexpected custom-image lookup response'
  selected_tag=pi-docker:base
  if [[ "$tags" == pi-docker:custom ]]; then selected_tag=pi-docker:custom; fi
  selected_id="$(docker image inspect "$selected_tag" --format '{{.Id}}')" || fail "build $selected_tag on the host before running tests"
  [[ "$selected_id" == sha256:* ]] || fail 'unexpected image identity'
  printf 'Host Git: '; git --version
  printf 'Host Bash: %s\nDocker client: ' "$BASH_VERSION"
  docker_versions="$(docker version --format '{{.Client.Version}} (server {{.Server.Version}})')" || fail 'Docker version inspection failed'
  printf '%s\n' "$docker_versions"
  printf 'Image: %s\nImage ID: %s\nDocker endpoint: local Unix socket\n' "$selected_tag" "$selected_id"
  printf 'Preflight passed. No containers or test files created by preflight.\n'
}
case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --preflight|--run) [[ $# == 1 ]] || { usage; exit 2; } ;;
  *) usage; exit 2 ;;
esac
preflight
[[ "$1" == --run ]] || exit 0
root="$(mktemp -d /tmp/pi-docker-mount.XXXXXXXX)"
root="$(realpath -e -- "$root")"
fixtures="$root/fixtures"; mkdir "$fixtures" "$root/logs"
project="pimount-$(basename -- "$root" | tr '[:upper:].' '[:lower:]-')"
report="$root/report.txt"
case_number=0; passed=0
printf 'Standalone worktree mount-contract report\nImage: %s\nImage ID: %s\n' "$selected_tag" "$selected_id" > "$report"
printf 'Scope: experimental helper/static Compose, NOT production launcher or Herdr.\n' >> "$report"
printf 'Git: %s\nBash: %s\nCompose: %s\nDocker: %s\n' "$(git --version)" "$BASH_VERSION" "$compose_version" "$docker_versions" >> "$report"
finish() {
  local rc=$?
  trap - EXIT
  if ((rc == 0)); then printf '\nRESULT: PASS (%s checks)\n' "$passed" >> "$report"
  else printf '\nRESULT: FAIL/INTERRUPTED (exit %s); stop and inspect retained state.\n' "$rc" >> "$report"; fi
  printf '\nReport to return: %s\nRetained fixtures/logs: %s\nKnown container names: %s/containers.txt\n' "$report" "$root" "$root"
  printf 'No cleanup was attempted. On timeout, a named container may still be running.\n'
  exit "$rc"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
: > "$root/containers.txt"
sanitize_log() {
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//"$root"/<FIXTURES>}"
    line="${line//"$here"/<TEST_CODE>}"
    # Remove terminal control bytes from errors supplied by external programs.
    printf '%s\n' "$line" | LC_ALL=C tr -d '\000-\010\013-\037\177'
  done < "$1" >> "$report"
}
step() {
  local label="$1" rc=0; shift
  case_number=$((case_number + 1))
  printf 'CHECK %s: %s\n' "$case_number" "$label" | tee -a "$report"
  if "$@" > "$root/logs/check-$case_number.log" 2>&1; then
    passed=$((passed + 1)); sanitize_log "$root/logs/check-$case_number.log"
    printf 'PASS\n' | tee -a "$report"
  else
    rc=$?; sanitize_log "$root/logs/check-$case_number.log"
    printf 'FAIL exit=%s (no retry)\n' "$rc" | tee -a "$report"; return "$rc"
  fi
}
export PROBE_IMAGE_ID="$selected_id" PROBE_UID="$(id -u)" PROBE_GID="$(id -g)" PROBE_CODE="$here"
export GIT_AUTHOR_NAME=Fixture GIT_AUTHOR_EMAIL=fixture@example.invalid
export GIT_COMMITTER_NAME=Fixture GIT_COMMITTER_EMAIL=fixture@example.invalid
export PROBE_MAIN_SENTINEL='' PROBE_BARRIER='' PROBE_PARTICIPANT=''
configure() {
  probe_discover "$1" || return
  export PROBE_CHECKOUT="$probe_checkout" PROBE_TARGET="$probe_target" PROBE_WORKDIR="$probe_workdir"
  export PROBE_COMMON="$probe_common" PROBE_METADATA="$probe_metadata" PROBE_KIND="$probe_kind"
  export PROBE_ACTION="${2:-inspect}"
  compose_files=(-f "$here/compose.probe.yaml")
  if ((probe_metadata)); then compose_files+=(-f "$here/compose.metadata.yaml"); fi
}
compose() {
  env -u COMPOSE_FILE -u COMPOSE_ENV_FILES -u COMPOSE_PROJECT_NAME -u COMPOSE_PROFILES \
    -u COMPOSE_PATH_SEPARATOR COMPOSE_DISABLE_ENV_FILE=1 \
    docker compose --env-file /dev/null --project-directory "$fixtures" -p "$project" "${compose_files[@]}" "$@"
}
init_repo() {
  mkdir -p "$1"
  probe_git -C "$1" init -q -b main
  probe_git -C "$1" config core.hooksPath /dev/null
  probe_git -C "$1" config commit.gpgSign false
  printf 'initial\n' > "$1/tracked"
  probe_git -C "$1" add tracked
  probe_git -C "$1" commit -qm fixture
}
assert_equal() { [[ "$1" == "$2" ]] || { printf 'assertion mismatch\n' >&2; return 1; }; }
index_sha() { sha256sum -- "$1" | cut -d' ' -f1; }
expect_missing_source() {
  local missing="$1" rc=0 log="$root/logs/missing-$case_number.log" line
  if run_container missing-source > "$log" 2>&1; then probe_error 'missing source unexpectedly launched'; return 1; else rc=$?; fi
  while IFS= read -r line; do printf '%s\n' "$line"; done < "$log"
  # A timeout is an ambiguous outcome, not an expected negative assertion.
  [[ "$rc" != 124 && "$rc" != 137 && "$rc" != 130 && "$rc" != 143 ]] || return "$rc"
  [[ ! -e "$missing" ]] || { probe_error 'Docker created missing bind source'; return 1; }
  grep -Fq -- "$missing" "$log" && grep -Eiq 'does not exist|no such file|not exist' "$log" || {
    probe_error 'negative test failed for an unrelated reason, not a missing source'; return 1;
  }
  printf 'PASS missing source rejected without directory creation (exit %s)\n' "$rc"
}
concurrent_writes() {
  local pid_a pid_b rc_a=0 rc_b=0 line log
  (configure "$a" write && export PROBE_BARRIER="$PROBE_COMMON/mount-probe-barrier-$case_number" PROBE_PARTICIPANT=a && run_container concurrent-a) > "$root/logs/concurrent-a.log" 2>&1 & pid_a=$!
  (configure "$b" write && export PROBE_BARRIER="$PROBE_COMMON/mount-probe-barrier-$case_number" PROBE_PARTICIPANT=b && run_container concurrent-b) > "$root/logs/concurrent-b.log" 2>&1 & pid_b=$!
  wait "$pid_a" || rc_a=$?
  wait "$pid_b" || rc_b=$?
  for log in "$root/logs/concurrent-a.log" "$root/logs/concurrent-b.log"; do
    while IFS= read -r line; do printf '%s\n' "$line"; done < "$log"
  done
  [[ "$rc_a" == 0 && "$rc_b" == 0 ]] || {
    printf 'Concurrent outcomes: a=%s b=%s; inspect names, do not retry\n' "$rc_a" "$rc_b"; return 1;
  }
}
step 'offline Bash/Git contract checks' bash "$here/test-mount-contract.sh"
mkdir "$fixtures/ordinary directory"
configure "$fixtures/ordinary directory"
step 'ordinary directory' run_container ordinary
step 'ordinary writes reached host' test -f "$fixtures/ordinary directory/ordinary-written"
main="$fixtures/main checkout"
init_repo "$main"
configure "$main"
step 'self-contained checkout at /workspace' run_container ordinary-checkout
# Preserve staged state in the main checkout while child worktrees write.
printf 'staged main edit\n' >> "$main/tracked"
probe_git -C "$main" add tracked
main_index="$(index_sha "$main/.git/index")"
main_file="$(index_sha "$main/tracked")"
printf 'do not expose main source\n' > "$main/main-source-sentinel"
export PROBE_MAIN_SENTINEL="$main/main-source-sentinel"
a="$fixtures/worktree a 'quote' \$cash:colon"; b="$fixtures/worktree-b"
probe_git -C "$main" worktree add -q -b helper-a "$a"
probe_git -C "$main" worktree add -q -b helper-b "$b"
b_git="$(probe_git -C "$b" rev-parse --absolute-git-dir)"; b_index="$(index_sha "$b_git/index")"
configure "$a" write
# Save effective merged config as an artifact; it includes ONLY test values.
compose config --format json > "$root/effective-linked-compose.json"
step 'linked worktree with spaces/quotes/dollar/colon and no main sources' run_container linked-a
step 'main index unchanged after child commit' assert_equal "$main_index" "$(index_sha "$main/.git/index")"
step 'main staged file unchanged' assert_equal "$main_file" "$(index_sha "$main/tracked")"
step 'other worktree index unchanged' assert_equal "$b_index" "$(index_sha "$b_git/index")"
step 'other worktree working file unchanged' assert_equal "$(< "$b/tracked")" initial
step 'helper branch visible from main metadata' probe_git -C "$main" show-ref --verify refs/heads/helper-a
mkdir -p "$b/packages/backend/src"
configure "$b/packages/backend/src" write
step 'deep subdirectory mounts whole checkout; correct cwd and Git writes' run_container subdirectory
step 'two containers writing distinct worktrees concurrently' concurrent_writes
step 'main index unchanged after concurrent writes' assert_equal "$main_index" "$(index_sha "$main/.git/index")"
step 'main staged file unchanged after concurrent writes' assert_equal "$main_file" "$(index_sha "$main/tracked")"
ln -s "$b" "$fixtures/worktree-alias"
configure "$fixtures/worktree-alias/packages/backend/src"
step 'symlink selection resolves to canonical cwd' run_container symlink
probe_git -C "$main" worktree add -q -b nested "$main/nested-child"
configure "$main/nested-child"
step 'worktree nested under original checkout; only metadata exposed' run_container nested
export PROBE_MAIN_SENTINEL=''
separate="$fixtures/separate checkout"
mkdir "$separate"
probe_git -C "$separate" init -q -b main --separate-git-dir "$fixtures/external metadata"
probe_git -C "$separate" config core.hooksPath /dev/null
probe_git -C "$separate" config commit.gpgSign false
printf 'initial\n' > "$separate/tracked"
probe_git -C "$separate" add tracked
probe_git -C "$separate" commit -qm fixture
configure "$separate" write
step 'separate Git directory with normal Git writes' run_container separate-git-dir
# Direct .git symlinks are supported; further pointer aliases fail offline.
rm -- "$separate/.git"
ln -s "$fixtures/external metadata" "$separate/.git"
configure "$separate"
step 'direct .git symlink reaches represented physical metadata' run_container dotgit-symlink
contained="$fixtures/contained metadata checkout"
mkdir "$contained"
probe_git -C "$contained" init -q -b main --separate-git-dir "$contained/metadata"
printf 'initial\n' > "$contained/tracked"
probe_git -C "$contained" add tracked
probe_git -C "$contained" commit -qm fixture
configure "$contained"
step 'contained metadata needs no redundant bind mount' run_container contained-metadata
configure "$a"
export PROBE_CHECKOUT="$fixtures/source-that-does-not-exist"
step 'missing checkout bind source fails closed' expect_missing_source "$PROBE_CHECKOUT"
configure "$a"
export PROBE_COMMON="$fixtures/metadata-that-does-not-exist"
step 'missing metadata bind source fails closed' expect_missing_source "$PROBE_COMMON"
step 'container exits left linked worktree intact' test -f "$a/.git"
step 'container exits left separate checkout and direct .git symlink intact' test -d "$separate/.git"
printf '\nNot tested: production launcher merge, Herdr mutations, conversations, restore, rewind.\n' >> "$report"
printf 'These remain separate integration stages.\n' >> "$report"
