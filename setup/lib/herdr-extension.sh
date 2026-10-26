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

# Called under the same preparation lock as the official reporting integration.
# Use the host binary's bundled skill; never fetch a separate moving copy.
herdr_ensure_skill() (
  set -euo pipefail
  local directory="$config/skills/herdr" version installed="" temporary="" marker=""
  version="$(PI_CODING_AGENT_DIR="$config" "$herdr_bin" --version)"
  [[ -n "$version" ]] || { printf 'Herdr returned an empty version.\n' >&2; exit 1; }
  if [[ -r "$directory/.herdr-version" ]]; then
    installed="$(<"$directory/.herdr-version")"
  fi
  if [[ "$installed" == "$version" && -s "$directory/SKILL.md" && -r "$directory/SKILL.md" ]]; then
    exit 0
  fi
  mkdir -p -- "$directory"
  trap 'rm -f -- "$temporary" "$marker"' EXIT
  temporary="$(mktemp "$directory/.skill.XXXXXX")"
  marker="$(mktemp "$directory/.version.XXXXXX")"
  PI_CODING_AGENT_DIR="$config" "$herdr_bin" --skill > "$temporary"
  [[ -s "$temporary" ]] || { printf 'Herdr returned an empty skill.\n' >&2; exit 1; }
  printf '%s\n' "$version" > "$marker"
  mv -f -- "$temporary" "$directory/SKILL.md"
  mv -f -- "$marker" "$directory/.herdr-version"
  printf 'Installed official Herdr skill (%s) in %s.\n' "$version" "$directory" >&2
)

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
