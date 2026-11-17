#!/usr/bin/env bash
# Source-only test functions. No live request or launch when sourced.

boundary_stat() {
  local line tail
  IFS= read -r line < "/proc/$1/stat" || return 1
  tail="${line##*) }"
  read -r -a boundary_fields <<< "$tail"
  # After comm: state ppid pgrp session tty_nr tpgid.
  [[ ${#boundary_fields[@]} -ge 6 && "${boundary_fields[4]}" != 0 ]]
}

# Must be called directly at the interactive Bash prompt, NOT through bash -c,
# command substitution, a pipeline, another driver, or a subshell.
boundary_mark() {
  local root="$1" stage="$2" boundary_fields line expected_pane expected_socket
  [[ $- == *i* && -t 0 && -t 1 && "$BASHPID" == "$$" ]] || {
    printf 'STOP: call boundary_mark directly in interactive Bash\n' >&2; return 1;
  }
  [[ "$root" == /tmp/pi-docker-native.* && -f "$root/control/boundary-context" ]] || return 1
  {
    IFS= read -r expected_pane
    IFS= read -r expected_socket
  } < "$root/control/boundary-context" || return 1
  [[ "${HERDR_ENV:-}" == 1 && "${HERDR_PANE_ID:-}" == "$expected_pane" &&
     "${HERDR_SOCKET_PATH:-}" == "$expected_socket" && -S "$expected_socket" &&
     -O "$expected_socket" && -z "${HERDR_AGENT:-}" ]] || {
    printf 'STOP: inherited context changed or surrounding shell has HERDR_AGENT set\n' >&2; return 1;
  }
  case "$stage" in
    ready-a) [[ ! -e "$root/control/started-a" ]] || return 1 ;;
    after-a) [[ -f "$root/control/done-a" && ! -e "$root/control/started-b" ]] || return 1 ;;
    after-b) [[ -f "$root/control/done-b" ]] || return 1 ;;
    *) return 1 ;;
  esac
  [[ ! -e "$root/logs/shell-$stage.txt" ]] || {
    printf 'STOP: marker already exists; no retries\n' >&2; return 1;
  }
  if [[ "$stage" != ready-a ]]; then
    local original_shell ignored
    read -r original_shell ignored < "$root/logs/shell-ready-a.txt" || return 1
    [[ "$original_shell" == "$BASHPID" ]] || return 1
  fi
  boundary_stat "$BASHPID" || return 1
  [[ "${boundary_fields[2]}" == "$BASHPID" && "${boundary_fields[5]}" == "$BASHPID" ]] || {
    printf 'STOP: interactive shell must own its foreground job group\n' >&2; return 1;
  }
  printf '%s %s %s %s\n' "$BASHPID" "${boundary_fields[2]}" "${boundary_fields[5]}" "$EPOCHREALTIME" \
    > "$root/logs/shell-$stage.txt"
  printf 'Recorded %s: interactive shell owns foreground group %s\n' "$stage" "$BASHPID"
}

boundary_prepare() {
  [[ -z "${HERDR_AGENT:-}" ]] || fail 'surrounding shell/driver must not have HERDR_AGENT set'
  printf '%s\n%s\n' "$HERDR_PANE_ID" "$HERDR_SOCKET_PATH" > "$root/control/boundary-context"
  {
    printf '#!/usr/bin/env bash\nset -euo pipefail\numask 077\n'
    # Only explicit path/test scalars, never a dump of environment/credentials.
    declare -p root tag image_id PHASE3_PROJECT herdr_bin focused_handover HOME DOCKER_CONFIG PATH
    printf 'export HOME DOCKER_CONFIG PATH PHASE3_PROJECT\nexport HERDR_BIN_PATH="$herdr_bin"\n'
    declare -f fail docker_read herdr_read check_inputs prepare_turn capture confirm_visual assess_handover handover_classify
    printf 'source %q\nboundary_step "$@"\n' "$root/control/shell-boundary-handover.sh"
  } > "$root/control/boundary-step.sh"
  sha256sum -- "$root/control/boundary-step.sh" "$root/control/boundary-context" \
    > "$root/control/boundary-controls.sha256"
  {
    printf 'PREPARED ONLY. No Pi launched. NEW disposable session only. Do not rerun preparation.\n'
    printf 'Keep this SAME pane. Enter each command separately at its interactive BASH prompt.\n'
    printf 'Do NOT paste as one block, wrap in a loop/script, source boundary-step.sh, or use a subshell.\n'
    printf 'Do not export HERDR_AGENT in the shell. Stop on any error; do not retry/reset.\n\n'
    printf 'source %q\n' "$root/control/shell-boundary-handover.sh"
    printf 'boundary_mark %q ready-a\n' "$root"
    printf 'bash %q a\n' "$root/control/boundary-step.sh"
    printf '\nIn A: send phase3-handover-a, wait for offline-fixture response,\n'
    printf '/phase3-native-checkpoint ONCE, wait for notification, /quit. Confirm A visually.\n'
    printf 'Wait until the actual interactive shell prompt returns, then:\n'
    printf 'boundary_mark %q after-a\n' "$root"
    printf 'bash %q b\n' "$root/control/boundary-step.sh"
    printf '\nIn B: send phase3-handover-b, wait for response, checkpoint ONCE, /quit.\n'
    printf 'A wrong-path checkpoint STOP is a possible finding: quit; do not retry.\n'
    printf 'The automated finding is saved before the separate B history question.\n'
    printf 'After the actual interactive shell prompt returns:\n'
    printf 'boundary_mark %q after-b\n' "$root"
    printf 'bash %q assess\n' "$root/control/boundary-step.sh"
    printf '\nNo native reopen or server restart is tested. No lifecycle state is reset.\n'
    printf 'Return the complete fixture copy for review; do not stage it wholesale.\n'
    printf 'Durable review should include boundary-process-*.txt, shell-*.txt,\n'
    printf 'boundary-before-b-snapshot.json, handover.json, evidence.json, observations.txt,\n'
    printf 'receipt/receipts, input/control/reporter hashes, result and container queries.\n'
    printf 'No cleanup, server stop, automatic retry or production fix is authorized.\n'
  } > "$root/control/INSTRUCTIONS.txt"
  printf '\nPrepared separate shell-boundary commands: %s/control/INSTRUCTIONS.txt\n' "$root"
}

boundary_finish() {
  local rc=$? kind filter remaining
  trap - EXIT
  for kind in run project; do
    filter="label=pi-docker.phase3-run=$PHASE3_PROJECT"
    [[ "$kind" != project ]] || filter="label=com.docker.compose.project=$PHASE3_PROJECT"
    if remaining="$(docker_read ps --all --filter "$filter" --format '{{.ID}} {{.Names}} {{.Status}}')"; then
      printf '%s\n' "$remaining" > "$root/logs/boundary-$step-containers-$kind.txt"
      if [[ -n "$remaining" ]]; then
        printf 'STOP: retained containers; inspect boundary-%s-containers-%s.txt\n' "$step" "$kind" >&2
        rc=1
      fi
    else
      printf 'QUERY FAILED; container state uncertain\n' > "$root/logs/boundary-$step-containers-$kind.txt"
      printf 'STOP: container inspection failed; no continuation\n' >&2
      rc=1
    fi
  done
  printf 'STEP %s exit=%s; no native restore PASS, no retries/cleanup\n' "$step" "$rc" \
    > "$root/logs/boundary-$step-result.txt"
  if ((rc)); then
    printf 'RESULT: FAIL/INTERRUPTED at shell-boundary %s; inspect retained evidence\n' "$step" > "$root/result.txt"
  elif [[ "$step" == assess ]]; then
    printf 'RESULT: SHELL-BOUNDARY DIAGNOSTIC COMPLETE (handover.json); NOT native restore PASS\n' > "$root/result.txt"
  else
    printf 'RESULT: SHELL-BOUNDARY PARTIAL after %s; return to interactive shell\n' "$step" > "$root/result.txt"
  fi
  printf 'Shell-boundary step %s exit=%s. Evidence: %s\n' "$step" "$rc" "$root"
  exit "$rc"
}

boundary_step() {
  [[ $# == 1 ]] || fail 'one step required: a, b or assess'
  step="$1"
  local expected_pane expected_socket marker shell_pid shell_group shell_foreground epoch boundary_fields
  [[ "$step" == a || "$step" == b || "$step" == assess ]] || fail 'invalid step'
  [[ -t 0 && -t 1 && "${HERDR_ENV:-}" == 1 && -z "${HERDR_AGENT:-}" ]] || fail 'genuine terminal/context required; shell must not be marked as agent'
  sha256sum --check --status "$root/control/boundary-controls.sha256" || fail 'control inputs changed'
  {
    IFS= read -r expected_pane
    IFS= read -r expected_socket
  } < "$root/control/boundary-context"
  [[ "${HERDR_PANE_ID:-}" == "$expected_pane" && "${HERDR_SOCKET_PATH:-}" == "$expected_socket" &&
     -S "$expected_socket" && -O "$expected_socket" ]] || fail 'inherited context changed; no fallback'
  marker=ready-a
  [[ "$step" != b ]] || marker=after-a
  [[ "$step" != assess ]] || marker=after-b
  [[ -f "$root/logs/shell-$marker.txt" ]] || fail 'missing interactive-shell marker'
  read -r shell_pid shell_group shell_foreground epoch < "$root/logs/shell-$marker.txt"
  [[ "$shell_pid" == "$PPID" && "$shell_group" == "$shell_pid" && "$shell_foreground" == "$shell_pid" ]] \
    || fail 'invoke directly from the same interactive shell, not a wrapper'
  boundary_stat "$BASHPID" || fail 'cannot inspect own PTY process identity'
  [[ "${boundary_fields[2]}" != "$shell_group" && "${boundary_fields[2]}" == "${boundary_fields[5]}" ]] \
    || fail 'step must be a separate foreground job; enable normal interactive job control, not driver job control'
  [[ ! -e "$root/control/started-$step" ]] || fail 'step already started; stop without retry'
  [[ "$step" != b || -f "$root/control/done-a" ]] || fail 'A must complete first'
  [[ "$step" != assess || -f "$root/control/done-b" ]] || fail 'B must complete first'
  if [[ "$step" != a ]]; then
    local previous_step=a
    [[ "$step" != assess ]] || previous_step=b
    [[ "$(< "$root/logs/boundary-$previous_step-result.txt")" == "STEP $previous_step exit=0; no native restore PASS, no retries/cleanup" ]] \
      || fail 'previous step failed or its container inspection was uncertain'
  fi
  : > "$root/control/started-$step"
  printf '%s %s %s %s %s\n' "$BASHPID" "$PPID" "${boundary_fields[2]}" "${boundary_fields[5]}" "$EPOCHREALTIME" \
    > "$root/logs/boundary-process-$step.txt"
  trap boundary_finish EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  check_inputs
  if [[ "$step" == assess ]]; then
    [[ -s "$root/handover.json" && -s "$root/evidence.json" ]] || fail 'missing automated assessment'
    : > "$root/control/done-assess"
    printf 'Shell-return receipts complete. Diagnostic only; review handover.json and all boundaries.\n'
    return
  fi
  if [[ "$step" == b ]]; then
    local a_pid a_parent a_group a_foreground a_epoch
    read -r a_pid a_parent a_group a_foreground a_epoch < "$root/logs/boundary-process-a.txt"
    [[ "$a_parent" == "$PPID" && "$a_group" != "${boundary_fields[2]}" ]] || fail 'A/B must be distinct jobs of the same shell'
  fi
  [[ "$(herdr_read --version)" == 'herdr 0.9.5' ]] || fail 'CLI changed'
  herdr_read api snapshot > "$root/logs/boundary-before-$step-snapshot.json"
  jq -e --arg pane "$HERDR_PANE_ID" --arg step "$step" '.result.snapshot | .version == "0.9.5" and
    (.workspaces|length)==1 and (.tabs|length)==1 and (.panes|length)==1 and .panes[0].pane_id==$pane and
    ($step != "a" or (.agents|length)==0)' \
    "$root/logs/boundary-before-$step-snapshot.json" >/dev/null || fail 'topology/version/initial empty pane changed'
  prepare_turn "handover-$step"
  printf '\nSend phase3-handover-%s, wait for response, checkpoint ONCE, then /quit.\n' "$step"
  "$root/bin/pi" "$root/fixtures/ordinary" --name backend --herdr --no-host-gitconfig -- \
    --offline --no-tools --no-mcp --no-skills --no-prompt-templates --no-themes \
    --no-context-files --no-approve --provider pi-docker-fixture --model fixed --name "Handover ${step^^}"
  if [[ "$step" == a ]]; then
    capture handover-a "$root/fixtures/ordinary" 'Handover A' '["phase3-handover-a"]' /workspace
    confirm_visual handover-a
  else
    capture handover-b "$root/fixtures/ordinary" 'Handover B' '["phase3-handover-b"]' /workspace diagnostic
    assess_handover
  fi
  : > "$root/control/done-$step"
  printf '\nReturn to the interactive shell prompt before recording the next shell marker.\n'
}
