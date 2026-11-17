# TEST ONLY, source-only classification. No Herdr requests or mutations.
# Inputs are observed references, never synthesized restore commands.
handover_classify() {
  local previous="$1" current="$2" reported="$3" ref
  for ref in "$previous" "$current" "$reported"; do
    [[ "$ref" =~ ^/pi/herdr-sessions/[a-f0-9]{64}/[a-zA-Z0-9_.-]+\.jsonl$ ]] || {
      printf 'Invalid managed reference in handover evidence\n' >&2; return 1;
    }
  done
  [[ "$previous" != "$current" && "${previous%/*}" == "${current%/*}" ]] || {
    printf 'Expected two distinct conversations in the same storage namespace\n' >&2; return 1;
  }
  if [[ "$reported" == "$current" ]]; then printf 'current\n'
  elif [[ "$reported" == "$previous" ]]; then printf 'stale_previous\n'
  else printf 'Unrelated reported reference; handover result is ambiguous\n' >&2; return 1; fi
}
