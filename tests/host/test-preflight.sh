#!/usr/bin/env bash
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(mktemp -d /tmp/pi-preflight-unit.XXXXXXXX)"
trap 'rm -rf -- "$root"' EXIT
mkdir "$root/bin"
# No real Docker calls: preflight accepts only reads; the explicit regression
# mode checks the batch invocation/stdio and simulates a completed probe.
printf '%s\n' '#!/usr/bin/env bash' 'set -eu' \
  'printf "%s\n" "$*" >> "$FAKE_LOG"' \
  'case "$*" in' \
  '  "context show") printf "fixture\n" ;;' \
  '  "context inspect fixture --format {{.Endpoints.docker.Host}}") printf "unix:///tmp/fixture.sock\n" ;;' \
  '  "info --format {{.OSType}}") [[ "$FAKE_MODE" != daemon-failure ]] || exit 1; printf "linux\n" ;;' \
  '  "compose version --short") printf "2.35.0\n" ;;' \
  '  "image ls --filter reference=pi-docker:custom --format {{.Repository}}:{{.Tag}}")' \
  '    [[ "$FAKE_MODE" != lookup-failure ]] || exit 1' \
  '    if [[ "$FAKE_MODE" == custom || "$FAKE_MODE" == inspect-failure ]]; then printf "pi-docker:custom\n"; fi ;;' \
  '  "image inspect pi-docker:custom --format {{.Id}}") [[ "$FAKE_MODE" != inspect-failure ]] || exit 1; printf "sha256:fixture-custom\n" ;;' \
  '  "image inspect pi-docker:base --format {{.Id}}") printf "sha256:fixture-base\n" ;;' \
  '  "version --format {{.Client.Version}} (server {{.Server.Version}})") printf "fixture (server fixture)\n" ;;' \
  '  "compose --env-file /dev/null "*)' \
  '    [[ "$FAKE_MODE" == container-regression ]] || exit 99' \
  '    [[ " $* " == *" -T "* && " $* " == *" --interactive=false "* ]] || exit 98' \
  '    [[ "$(readlink /proc/self/fd/0)" == /dev/null ]] || exit 97' \
  '    printf "fake batch probe completed with closed stdin\n" ;;' \
  '  *) printf "unexpected command: %s\n" "$*" >&2; exit 99 ;;' \
  'esac' > "$root/bin/docker"
chmod +x "$root/bin/docker"
export PATH="$root/bin:$PATH" FAKE_LOG="$root/calls" FAKE_MODE=base
export PI_DOCKER_IMAGE=ignored-example:invalid
run() {
  env -u DOCKER_CONTEXT -u DOCKER_HOST -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    bash "$here/verify-worktree-mounts.sh" "$@"
}
run --help > "$root/result"
[[ ! -e "$FAKE_LOG" ]]
printf 'PASS help does not contact Docker\n'
if [[ "$(id -u)" == 0 ]]; then
  if run --preflight > "$root/result" 2>&1; then exit 1; fi
  grep -q 'not sudo/root' "$root/result"
  printf 'PASS root execution refused; normal-user preflight checks skipped\n'
  exit 0
fi
for mode in base custom; do
  export FAKE_MODE="$mode"
  : > "$FAKE_LOG"
  run --preflight > "$root/result"
  grep -q "Image: pi-docker:$mode" "$root/result"
  ! grep -Eq 'run |create |pull |build |remove |rm ' "$FAKE_LOG"
  printf 'PASS read-only preflight selects %s\n' "$mode"
done
for mode in daemon-failure lookup-failure inspect-failure; do
  export FAKE_MODE="$mode"
  : > "$FAKE_LOG"
  if run --preflight > "$root/result" 2>&1; then printf 'FAIL accepted %s\n' "$mode"; exit 1; fi
  ! grep -q 'image inspect pi-docker:base' "$FAKE_LOG"
  printf 'PASS %s is not custom absence or permission to fall back\n' "$mode"
done
: > "$FAKE_LOG"
if env -u DOCKER_CONTEXT DOCKER_HOST=tcp://fixture.invalid:2375 bash "$here/verify-worktree-mounts.sh" --preflight > "$root/result" 2>&1; then exit 1; fi
grep -q 'local Unix-socket' "$root/result"
[[ ! -s "$FAKE_LOG" ]]
printf 'PASS remote endpoint rejected before daemon access\n'
source "$here/container-command.sh"
export FAKE_MODE=container-regression
project=fixture; case_number=1; fixtures="$root/fixtures"
compose_files=(-f "$here/compose.probe.yaml")
run_container stdin-regression > "$root/batch-result"
grep -q 'fake batch probe completed with closed stdin' "$root/batch-result"
printf 'PASS batch probe disables TTY/interactivity and binds stdin to /dev/null\n'
printf 'All preflight/batch-command checks passed (fake Docker only).\n'
