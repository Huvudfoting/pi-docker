#!/usr/bin/env bash
# Test-only source functions. No requests or launches when sourced.
native_stat() {
  local line
  IFS= read -r line < "/proc/$1/stat" || return 1
  read -r -a native_fields <<< "${line##*) }"
  [[ ${#native_fields[@]} -ge 6 && "${native_fields[4]}" != 0 ]]
}
native_context() {
  local expected_pane expected_socket
  {
    IFS= read -r expected_pane
    IFS= read -r expected_socket
  } < "$root/control/native-context" || return 1
  [[ "${HERDR_ENV:-}" == 1 && "${HERDR_PANE_ID:-}" == "$expected_pane" &&
     "${HERDR_SOCKET_PATH:-}" == "$expected_socket" && -S "$expected_socket" &&
     -O "$expected_socket" && -z "${HERDR_AGENT:-}" && -t 0 && -t 1 ]]
}
native_previous() {
  case "$1" in
    seed-ordinary) previous=''; marker=ready-native ;;
    restore-ordinary) previous=seed-ordinary; marker=after-seed-ordinary ;;
    seed-linked) previous=restore-ordinary; marker=after-restore-ordinary ;;
    restore-linked) previous=seed-linked; marker=after-seed-linked ;;
    assess) previous=restore-linked; marker=after-restore-linked ;;
    *) return 1 ;;
  esac
}
native_prior_ok() {
  [[ -f "$root/control/done-$1" && -f "$root/logs/native-$1-result.txt" &&
     "$(< "$root/logs/native-$1-result.txt")" == "STEP $1 exit=0; native protocol only, no server restart" ]]
}
# Call directly in the interactive Bash shell; built-ins observe its real PGID.
native_mark() {
  local root="$1" stage="$2" native_fields original ignored next previous marker
  [[ $- == *i* && "$BASHPID" == "$$" && "$root" == /tmp/pi-docker-native.* ]] || {
    printf 'STOP: call native_mark directly at the interactive Bash prompt\n' >&2; return 1;
  }
  native_context || { printf 'STOP: inherited context/terminal changed or shell marked as agent\n' >&2; return 1; }
  case "$stage" in
    ready-native) next=seed-ordinary ;;
    after-seed-ordinary) next=restore-ordinary ;;
    after-restore-ordinary) next=seed-linked ;;
    after-seed-linked) next=restore-linked ;;
    after-restore-linked) next=assess ;;
    *) return 1 ;;
  esac
  if [[ "$stage" != ready-native ]]; then
    native_prior_ok "${stage#after-}" || return 1
    read -r original ignored < "$root/logs/shell-ready-native.txt" || return 1
    [[ "$original" == "$BASHPID" ]] || return 1
  fi
  [[ ! -e "$root/control/started-$next" && ! -e "$root/logs/shell-$stage.txt" ]] || {
    printf 'STOP: marker/step already used; no retries\n' >&2; return 1;
  }
  native_stat "$BASHPID" || return 1
  [[ "${native_fields[2]}" == "$BASHPID" && "${native_fields[5]}" == "$BASHPID" ]] || {
    printf 'STOP: interactive shell must own the foreground group\n' >&2; return 1;
  }
  printf '%s %s %s %s\n' "$BASHPID" "${native_fields[2]}" "${native_fields[5]}" "$EPOCHREALTIME" \
    > "$root/logs/shell-$stage.txt"
  printf 'Recorded %s: shell foreground group %s\n' "$stage" "$BASHPID"
}
native_prepare() {
  printf '%s\n%s\n' "$HERDR_PANE_ID" "$HERDR_SOCKET_PATH" > "$root/control/native-context"
  {
    printf '#!/usr/bin/env bash\nset -euo pipefail\numask 077\n'
    # Explicit test/path scalars only, never an environment/credential dump.
    declare -p root tag image_id PHASE3_PROJECT herdr_bin focused_handover HOME DOCKER_CONFIG PATH selected_linked linked
    printf 'export HOME DOCKER_CONFIG PATH PHASE3_PROJECT\nexport HERDR_BIN_PATH="$herdr_bin"\n'
    declare -f fail docker_read herdr_read check_inputs prepare_turn capture confirm_visual probe_git
    printf 'source %q\nnative_step "$@"\n' "$root/control/native-boundary.sh"
  } > "$root/control/native-step.sh"
  sha256sum -- "$root/control/native-step.sh" "$root/control/native-context" > "$root/control/native-controls.sha256"
  {
    printf 'PREPARED ONLY: no Pi launched. NEW disposable Herdr session only.\n'
    printf 'Enter each command SEPARATELY at the SAME interactive Bash prompt.\n'
    printf 'Do not run this file, paste as a block, source native-step.sh, or use a wrapper/loop/subshell.\n'
    printf 'Do not set HERDR_AGENT in the shell or alter job control. Stop on errors; no retries.\n\n'
    printf 'source %q\n' "$root/control/native-boundary.sh"
    printf 'native_mark %q ready-native\n' "$root"
    local label key phase
    for label in seed-ordinary restore-ordinary seed-linked restore-linked; do
      key="${label#*-}"; phase="${label%%-*}"
      printf '\nNext TOP-LEVEL command:\n'
      printf 'bash %q %s\n' "$root/control/native-step.sh" "$label"
      if [[ "$phase" == seed ]]; then
        printf 'In Pi: send phase3-%s-seed, wait for offline-fixture response.\n' "$key"
      else
        printf 'Inspect original history; send phase3-%s-restored, wait for response.\n' "$key"
      fi
      printf 'Enter /phase3-native-checkpoint ONCE, wait for saved notification, /quit.\n'
      printf 'On STOP: /quit, let evidence save, stop; do not retry/reset.\n'
      printf 'Answer visual questionnaire; let command EXIT to the actual shell prompt.\n'
      printf 'Then record the shell return:\n'
      printf 'native_mark %q after-%s\n' "$root" "$label"
    done
    printf '\nFinal top-level assessment:\n'
    printf 'bash %q assess\n' "$root/control/native-step.sh"
    printf '\nPASS covers managed-path native launcher protocol ONLY, NOT server-restart restore.\n'
    printf 'Restore consumes the saved OFFICIAL seed path using only --session; no seed flags replayed.\n'
    printf 'Keep the complete fixture for review, not wholesale staging. Return snapshots/checkpoints,\n'
    printf 'histories/records, shell/process receipts, visual answers, all hashes, container queries,\n'
    printf 'receipts.jsonl, evidence.json, native-evidence.json and result.txt. No cleanup/server stop.\n'
  } > "$root/control/INSTRUCTIONS.txt"
  printf '\nPrepared native protocol shell-boundary commands: %s/control/INSTRUCTIONS.txt\n' "$root"
}
native_finish() {
  local rc=$? kind filter remaining
  trap - EXIT
  for kind in run project; do
    filter="label=pi-docker.phase3-run=$PHASE3_PROJECT"
    [[ "$kind" != project ]] || filter="label=com.docker.compose.project=$PHASE3_PROJECT"
    if remaining="$(docker_read ps --all --filter "$filter" --format '{{.ID}} {{.Names}} {{.Status}}')"; then
      printf '%s\n' "$remaining" > "$root/logs/native-$step-containers-$kind.txt"
      [[ -z "$remaining" ]] || { printf 'STOP: retained containers; inspect saved queries\n' >&2; rc=1; }
    else
      printf 'QUERY FAILED; state uncertain\n' > "$root/logs/native-$step-containers-$kind.txt"
      printf 'STOP: container inspection failed\n' >&2; rc=1
    fi
  done
  printf 'STEP %s exit=%s; native protocol only, no server restart\n' "$step" "$rc" > "$root/logs/native-$step-result.txt"
  if ((rc)); then
    printf 'RESULT: FAIL/INTERRUPTED at native boundary %s; no retries/cleanup\n' "$step" > "$root/result.txt"
  elif [[ "$step" == assess ]]; then
    printf 'RESULT: PASS (ordinary/linked native launcher protocol with shell boundaries; NOT server-restart restore or Phase 3 completion)\n' > "$root/result.txt"
  else
    printf 'RESULT: PARTIAL after %s; return to interactive shell\n' "$step" > "$root/result.txt"
  fi
  printf 'Native boundary step %s exit=%s. Evidence: %s\n' "$step" "$rc" "$root"
  exit "$rc"
}
native_assess() {
  local label previous marker host
  for label in seed-ordinary restore-ordinary seed-linked restore-linked; do native_prior_ok "$label" || fail 'incomplete/failed native step'; done
  [[ "$(find "$root/data/sessions" -type f -name '*.jsonl' | wc -l)" -eq 2 ]] || fail 'unexpected replacement/additional sessions'
  jq -se '
    length == 4 and .[0].sessionId == .[1].sessionId and .[0].sessionFile == .[1].sessionFile and
    .[2].sessionId == .[3].sessionId and .[2].sessionFile == .[3].sessionFile and
    .[0].sessionId != .[2].sessionId and .[0].sessionFile != .[2].sessionFile and
    (map(.hostname) | unique | length) == 4
  ' "$root/logs/seed-ordinary-phase3-result.json" "$root/logs/restore-ordinary-phase3-result.json" \
    "$root/logs/seed-linked-phase3-result.json" "$root/logs/restore-linked-phase3-result.json" >/dev/null || fail 'aggregate identity/container mismatch'
  for label in ordinary linked; do
    host="$(< "$root/logs/restore-$label.host-file.txt")"
    [[ "$host" == "$root/data/sessions/"* ]] || fail 'unexpected persisted host path'
    cmp -s "$host" "$root/logs/restore-$label.jsonl" || fail 'later step changed restored history'
  done
  [[ -f "$linked/.git" ]] || fail 'linked checkout missing'
  probe_git -C "$selected_linked" status --porcelain > "$root/logs/linked-git-status.txt"
  [[ ! -s "$root/logs/linked-git-status.txt" ]] || fail 'unexpected fixture checkout changes'
  jq -s 'map({stage,sessionId,sessionFile,sessionName,cwd,headerCwd,users,assistants,hasHerdr,piVersion,hostname})' \
    "$root/logs/seed-ordinary-phase3-result.json" "$root/logs/restore-ordinary-phase3-result.json" \
    "$root/logs/seed-linked-phase3-result.json" "$root/logs/restore-linked-phase3-result.json" > "$root/evidence.json"
  jq -n '{scope:"ordinary-and-linked-native-launcher-protocol",shellBoundariesRequired:true,
    serverRestartTested:false,phase3Complete:false}' > "$root/native-evidence.json"
}
native_step() {
  [[ $# == 1 ]] || fail 'one native step required'
  step="$1"
  local previous marker native_fields shell_pid shell_group shell_foreground epoch prior_pid prior_parent prior_group ignored
  native_previous "$step" || fail 'invalid native step'
  native_context || fail 'inherited context/terminal changed; no fallback'
  sha256sum --check --status "$root/control/native-controls.sha256" || fail 'control inputs changed'
  [[ -f "$root/logs/shell-$marker.txt" ]] || fail 'missing interactive shell marker'
  read -r shell_pid shell_group shell_foreground epoch < "$root/logs/shell-$marker.txt"
  [[ "$shell_pid" == "$PPID" && "$shell_group" == "$shell_pid" && "$shell_foreground" == "$shell_pid" ]] || fail 'invoke directly from the same interactive shell'
  native_stat "$BASHPID" || fail 'cannot inspect own PTY process'
  [[ "${native_fields[2]}" != "$shell_group" && "${native_fields[2]}" == "${native_fields[5]}" ]] || fail 'step must be a separate foreground job'
  [[ ! -e "$root/control/started-$step" ]] || fail 'step already started; no retries'
  if [[ -n "$previous" ]]; then
    native_prior_ok "$previous" || fail 'previous step incomplete/failed, including container queries'
    read -r prior_pid prior_parent prior_group ignored < "$root/logs/native-process-$previous.txt"
    [[ "$prior_parent" == "$PPID" && "$prior_group" != "${native_fields[2]}" ]] || fail 'distinct jobs of the same shell required'
  fi
  : > "$root/control/started-$step"
  printf '%s %s %s %s %s\n' "$BASHPID" "$PPID" "${native_fields[2]}" "${native_fields[5]}" "$EPOCHREALTIME" > "$root/logs/native-process-$step.txt"
  trap native_finish EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  check_inputs
  [[ "$(herdr_read --version)" == 'herdr 0.9.5' ]] || fail 'CLI changed'
  herdr_read api snapshot > "$root/logs/native-before-$step-snapshot.json"
  jq -e --arg pane "$HERDR_PANE_ID" '.result.snapshot | .version == "0.9.5" and
    (.workspaces|length)==1 and (.tabs|length)==1 and (.panes|length)==1 and
    .panes[0].pane_id==$pane and (.agents|length)==0 and (.panes[0].agent_session == null)
  ' "$root/logs/native-before-$step-snapshot.json" >/dev/null || fail 'Herdr did not clear prior identity or topology/version changed; no reset/retry'
  if [[ "$step" == assess ]]; then
    native_assess
  else
    local key="${step#*-}" phase="${step%%-*}" selected cwd title seed_ref
    selected="$root/fixtures/ordinary"; cwd=/workspace; title='Native ordinary'
    if [[ "$key" == linked ]]; then selected="$selected_linked"; cwd="$selected_linked"; title='Native linked subdirectory'; fi
    prepare_turn "$step"
    if [[ "$phase" == seed ]]; then
      printf 'Send phase3-%s-seed; wait for response; checkpoint ONCE, then /quit.\n' "$key"
      "$root/bin/pi" "$selected" --name backend --herdr --no-host-gitconfig -- \
        --offline --no-tools --no-mcp --no-skills --no-prompt-templates --no-themes \
        --no-context-files --no-approve --provider pi-docker-fixture --model fixed --name "$title"
      capture "$step" "$selected" "$title" "[\"phase3-$key-seed\"]" "$cwd"
      sha256sum -- "$root/logs/$step-phase3-native-checkpoint.json" "$root/logs/$step-phase3-result.json" \
        "$root/logs/$step.record" > "$root/logs/native-seed-$key.sha256"
    else
      sha256sum --check --status "$root/logs/native-seed-$key.sha256" || fail 'seed evidence changed'
      seed_ref="$(jq -er '.reported.agent_session.value' "$root/logs/seed-$key-phase3-native-checkpoint.json")"
      [[ "$seed_ref" =~ ^/pi/herdr-sessions/[a-f0-9]{64}/[a-zA-Z0-9_.-]+\.jsonl$ ]] || fail 'invalid official seed reference'
      jq -nc --arg stage "$step" --arg ref "$seed_ref" '{stage:$stage,consumedOfficialReference:$ref,argvShape:"--session only"}' >> "$root/receipts.jsonl"
      printf 'Inspect original history; send phase3-%s-restored; checkpoint ONCE, then /quit.\n' "$key"
      "$root/bin/pi" --session "$seed_ref"
      capture "$step" "$selected" "$title" "[\"phase3-$key-seed\",\"phase3-$key-restored\"]" "$cwd"
      [[ "$ref" == "$seed_ref" ]] || fail 'official restored path changed'
      jq -se '.[0].sessionId == .[1].sessionId and .[0].sessionFile == .[1].sessionFile' \
        "$root/logs/seed-$key-phase3-result.json" "$state" >/dev/null || fail 'native reopen changed identity'
      cmp -s "$root/logs/seed-$key.record" "$root/logs/$step.record" || fail 'native reopen changed launch record'
    fi
    confirm_visual "$step"
  fi
  : > "$root/control/done-$step"
  printf 'Return to the actual interactive shell prompt before the next marker.\n'
}
