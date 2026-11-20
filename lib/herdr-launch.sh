# Herdr-specific support for bin/pi; source only, not an executable.
# The launcher supplies script/root and fail(). Selection state is
# workspace/name/image/session. Only herdr_load_restore changes workspace/name/image and
# sets restore_ref/restore_filename; herdr_prepare sets container environment.

readonly HERDR_SESSION_NAMESPACE=/pi/herdr-sessions
readonly HERDR_RECORDS="$root/data/herdr-launches"
readonly HERDR_EXTENSION="$root/data/config/extensions/herdr-agent-state.ts"
readonly HERDR_INSTALL_COMMAND='bin/herdr-extension install'

herdr_storage_key() {
  # Every image tag gets an image-aware v2 namespace.
  printf '%s\0%s\0%s' "$workspace" "$name" "$image" | sha256sum | cut -d' ' -f1
}

herdr_is_restore_request() {
  [[ ${1:-} == --session && ( ${2:-} == "$HERDR_SESSION_NAMESPACE" || ${2:-} == "$HERDR_SESSION_NAMESPACE/"* ) ]]
}

herdr_has_pane_context() {
  [[ ${HERDR_ENV:-} == 1 && -n ${HERDR_PANE_ID:-} ]]
}

herdr_has_owned_socket() {
  [[ ${HERDR_SOCKET_PATH:-} == /* && -S ${HERDR_SOCKET_PATH:-} && -O ${HERDR_SOCKET_PATH:-} ]]
}

herdr_has_extension() {
  [[ -f "$HERDR_EXTENSION" && -r "$HERDR_EXTENSION" ]]
}

herdr_load_restore() {
  local reference key record version extra
  restore_ref="$1"
  reference="${restore_ref#"$HERDR_SESSION_NAMESPACE/"}"
  key="${reference%%/*}"
  restore_filename="${reference#*/}"
  [[ "$key" =~ ^[a-f0-9]{64}$ && "$restore_filename" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.jsonl$ ]] \
    || fail "Invalid managed session reference: $restore_ref"
  record="$HERDR_RECORDS/$key.record"
  [[ -f "$record" && -r "$record" && -O "$record" && ! -L "$record" ]] \
    || fail "Missing or invalid Herdr launch record: $record. Restore this record from the same backup as your sessions; no replacement conversation will be created."

  # Records are NUL-delimited data, never executable shell configuration.
  {
    IFS= read -r -d '' version && IFS= read -r -d '' workspace && IFS= read -r -d '' name \
      || fail "Incomplete Herdr launch record: $record"
    case "$version" in
      pi-docker-herdr-v2)
        IFS= read -r -d '' image || fail "Incomplete Herdr launch record: $record" ;;
      *) fail "Invalid Herdr launch record: $record" ;;
    esac
    extra=""
    if IFS= read -r -d '' extra || [[ -n "$extra" ]]; then
      fail "Unexpected data in Herdr launch record: $record"
    fi
  } < "$record"
  [[ "$workspace" == /* && -n "$name" && -n "$image" ]] \
    || fail "Invalid Herdr launch record: $record"
  [[ "$(herdr_storage_key)" == "$key" ]] || fail "Herdr launch record does not match its storage key"
  [[ "$(realpath -e -- "$workspace" 2>/dev/null)" == "$workspace" && -d "$workspace" ]] \
    || fail "Recorded workspace moved or no longer exists: $workspace. Restore that path, or explicitly launch a new selection with pi <workspace> --herdr."
}

herdr_validate_arguments() {
  # Persistent interactive sessions only; keep storage/discovery launcher-owned.
  case "${1:-}" in
    install|remove|uninstall|update|list|config|auth|mcp)
      fail "Run Pi maintenance commands without --herdr" ;;
  esac
  local arg
  for arg in "$@"; do
    case "$arg" in
      --) break ;;  # Remaining arguments are Pi prompt text, not flags.
      --session|--session=*|--fork|--fork=*)
        fail "In Herdr mode use --continue or --resume; explicit session paths/forks are reserved for native restore" ;;
      --session-dir|--session-dir=*|--no-session|--no-extensions|-ne)
        fail "Herdr mode requires managed persistent storage and standard extension discovery: $arg" ;;
      --print|-p|--mode|--mode=*|--export|--export=*|--version|-v|--help|-h|--list-models|--list-models=*)
        fail "Herdr mode supports interactive TUI sessions only: $arg" ;;
    esac
  done
}

herdr_warn_fallback() {
  printf 'pi-docker: WARNING: Herdr integration unavailable; launching without socket access.\n  Herdr reporting and native restore are unavailable for this launch.\n' >&2
}

herdr_select_mode() {
  case "$herdr_mode" in
    disabled) return ;;
    required) herdr=1; return ;;
  esac
  # Reuse strict argument validation in a subshell: unsupported invocations stay
  # ordinary, and fail() cannot exit the parent launcher during auto detection.
  [[ -t 0 && -t 1 ]] || return 0
  (herdr_validate_arguments "$@") >/dev/null 2>&1 || return 0
  # Partial/stale pane context deserves a warning, but no installer invocation.
  if [[ ${HERDR_ENV:-} == 1 || -n ${HERDR_PANE_ID:-} || -n ${HERDR_SOCKET_PATH:-} ]]; then
    if (herdr_validate_context); then
      herdr=1
    else
      herdr_warn_fallback
    fi
  fi
}

herdr_validate_context() {
  [[ "$(uname -s)" == Linux ]] || fail "Herdr mode currently supports local Linux Docker Engine only"
  [[ -t 0 && -t 1 ]] \
    || fail "Herdr mode requires an interactive terminal (stdin and stdout). Run directly in a Herdr pane, without pipes or redirection."
  herdr_has_pane_context \
    || fail "Herdr mode requires a current Herdr pane (HERDR_ENV=1 and HERDR_PANE_ID). Open a Herdr pane, then retry; do not set fake pane variables. See pi --herdr-status."
  herdr_has_owned_socket \
    || fail "HERDR_SOCKET_PATH must select an existing Unix socket owned by the current user. Retry from a live same-user Herdr pane; pi --herdr-status shows local context checks."
}

herdr_validate_session_file() {
  [[ -d "$session" && -f "$session/$restore_filename" ]] \
    || fail "Cannot restore missing session: $session/$restore_filename. Restore it from backup; no replacement will be created. New conversations must persist a message before they can be restored."
  [[ "$(realpath -e -- "$session/$restore_filename")" == "$session/$restore_filename" ]] \
    || fail "Managed session must not resolve outside its recorded storage"
}

# A subshell keeps the restrictive umask and temporary-file trap local.
herdr_save_record() (
  local record temporary
  record="$HERDR_RECORDS/$(herdr_storage_key).record"
  umask 077
  mkdir -p "$HERDR_RECORDS"
  temporary="$(mktemp "$HERDR_RECORDS/.launch.XXXXXX")"
  trap 'rm -f -- "$temporary"' EXIT
  printf '%s\0%s\0%s\0%s\0' pi-docker-herdr-v2 "$workspace" "$name" "$image" > "$temporary"
  if [[ -e "$record" ]] && ! cmp -s -- "$temporary" "$record"; then
    fail "Conflicting Herdr launch record: $record"
  fi
  # Atomic publication prevents parallel launches reading incomplete records.
  mv -f -- "$temporary" "$record"
)

herdr_prepare() {
  # Context, arguments, restore file, and upstream integration were checked by
  # the caller. Never turn record/restore failures into an ordinary launch.
  HERDR_SOCKET_HOST_PATH="$(realpath -e -- "$HERDR_SOCKET_PATH")"
  export HERDR_SOCKET_HOST_PATH
  PI_SESSION_TARGET="$HERDR_SESSION_NAMESPACE/$(herdr_storage_key)"
  if [[ -n "$restore_ref" ]]; then
    herdr_validate_session_file
  else
    herdr_save_record
  fi
}

herdr_show_status() {
  local issues=0 key record pi_path
  key="$(herdr_storage_key)"
  record="$HERDR_RECORDS/$key.record"
  printf 'Docker-Pi Herdr: local diagnostics only (no connection or image checks)\n'
  printf 'Workspace: %q\nStorage name: %q\nHost sessions: %q\nImage: %q\n' "$workspace" "$name" "$session" "$image"
  printf 'Herdr session target: %s/%s\n' "$HERDR_SESSION_NAMESPACE" "$key"
  if herdr_has_extension; then
    printf 'Official extension: present, readable (%q)\n' "$HERDR_EXTENSION"
  else
    printf 'Official extension: missing or unreadable (%q)\n  Install/update from the docker-pi repo root: %s\n' "$HERDR_EXTENSION" "$HERDR_INSTALL_COMMAND"
    issues=1
  fi
  if [[ -f "$record" && -r "$record" && -O "$record" && ! -L "$record" ]]; then
    printf 'Launch record: present (%q; contents not inspected)\n' "$record"
  elif [[ -e "$record" || -L "$record" ]]; then
    printf 'Launch record: invalid type, ownership, or permissions (%q)\n' "$record"
    issues=1
  else
    printf 'Launch record: not created yet (normal before first Herdr launch)\n'
  fi
  if herdr_has_pane_context; then
    printf 'Pane context: present (%q)\n' "$HERDR_PANE_ID"
  else
    printf 'Pane context: missing; run from a live Herdr pane\n'
    issues=1
  fi
  if herdr_has_owned_socket; then
    printf 'Host socket: present, owned by current user (%q; not contacted)\n' "$HERDR_SOCKET_PATH"
  else
    printf 'Host socket: missing, not an absolute Unix socket, or not owned by current user\n'
    issues=1
  fi
  if [[ "$(uname -s)" != Linux ]]; then
    printf 'Platform: unsupported; Herdr mode requires local Linux Docker Engine\n'
    issues=1
  fi
  if command -v docker >/dev/null 2>&1; then
    printf 'Docker CLI: found (daemon, Compose, and image not checked)\n'
  else
    printf 'Docker CLI: missing; install Docker Engine and the Compose plugin on the host\n'
    issues=1
  fi
  pi_path="$(type -P pi || true)"
  if [[ -n "$pi_path" && "$(realpath -- "$pi_path")" == "$script" ]]; then
    printf 'Native restore PATH: pi resolves to this launcher\n'
  else
    printf 'Native restore PATH: pi does not resolve to this launcher; see docs/SETUP.md (host launcher symlink)\n'
    issues=1
  fi
  if [[ -t 0 && -t 1 ]]; then
    printf 'Terminal: stdin/stdout are TTYs\n'
  else
    printf 'Terminal: stdin/stdout are not both TTYs (informational here; required for launch)\n'
  fi
  printf 'No files changed. This does not prove live reporting or restore readiness.\n'
  return "$issues"
}
