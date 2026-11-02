# Host-only support for manual and launcher-triggered integration preparation.
# Sourcing does not inspect configuration or create state.
herdr_resolve_binary() {
  if [[ -n ${HERDR_BIN_PATH:-} ]]; then
    [[ "$HERDR_BIN_PATH" == /* && -f "$HERDR_BIN_PATH" && -x "$HERDR_BIN_PATH" ]] || {
      printf 'HERDR_BIN_PATH is not an absolute executable host binary. Run on the host from a fresh Herdr pane, or unset that stale variable to use herdr on PATH.\n' >&2
      return 1
    }
    herdr_bin="$HERDR_BIN_PATH"
  else
    herdr_bin="$(type -P herdr || true)"
    [[ -n "$herdr_bin" ]] || {
      printf 'Herdr executable not found. Install Herdr on the host and put herdr on PATH.\n' >&2
      return 1
    }
  fi
}

herdr_pi_integration_state() {
  local output line state="" count=0 suffix=" ($extension)"
  output="$(PI_CODING_AGENT_DIR="$config" "$herdr_bin" integration status)" || {
    printf 'Could not query upstream Herdr integration status.\n' >&2
    return 1
  }
  # Upstream currently has no JSON status option (src/cli/integration.rs).
  # Accept only its exact Pi line and this deployment's exact destination.
  # Unknown output fails closed; never infer "current" from an exit code alone.
  while IFS= read -r line; do
    [[ "$line" == pi:* ]] || continue
    count=$((count + 1))
    [[ "$line" == "pi: "*"$suffix" ]] || continue
    state="${line#pi: }"
    state="${state%"$suffix"}"
  done <<< "$output"
  [[ "$count" == 1 ]] || state=""
  if [[ "$state" =~ ^current\ \(v[0-9]+\)$ ]]; then
    printf 'current\n'
  elif [[ "$state" == 'not installed' ]]; then
    printf 'missing\n'
  elif [[ "$state" =~ ^outdated\ \((v[0-9]+|legacy)\ \<\ v[0-9]+\)$ || "$state" =~ ^needs\ repair\ \((v[0-9]+|legacy)\)$ ]]; then
    printf 'outdated\n'
  else
    printf 'Unrecognized upstream Pi integration status; cannot safely prepare integration. Check this Herdr release with integration status.\n' >&2
    return 1
  fi
}
