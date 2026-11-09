#!/usr/bin/env bash
# Experimental Phase 1 contract, NOT sourced by the production launcher.
# Call probe_discover SELECTED; outputs are probe_* variables, not parsed text.

probe_error() { printf 'mount-contract: %s\n' "$*" >&2; return 1; }
probe_within() { [[ "$1" == "$2" || "$1" == "$2/"* || "$2" == / ]]; }
probe_clean_path() {
  [[ "$1" == /* && "$1" != *[[:cntrl:]]* ]] || probe_error 'expected an absolute path without control characters'
}
probe_safe_target() {
  local target="$1" reserved
  probe_clean_path "$target" || return
  # Component comparisons, both directions. /probe is specific to this harness.
  for reserved in /pi /run /opt/pi-docker /usr /bin /sbin /lib /lib64 /etc /dev /proc /sys /boot /root /home/node /probe; do
    if probe_within "$target" "$reserved" || probe_within "$reserved" "$target"; then
      probe_error "mount destination conflicts with reserved path $reserved: $target"; return 1
    fi
  done
}
probe_git() {
  # Fixture-only: no inherited Git overrides, tracing, config, or credentials.
  env -i PATH="$PATH" HOME=/nonexistent LC_ALL=C \
    GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_COUNT=0 \
    GIT_AUTHOR_NAME=Fixture GIT_AUTHOR_EMAIL=fixture@example.invalid \
    GIT_COMMITTER_NAME=Fixture GIT_COMMITTER_EMAIL=fixture@example.invalid \
    GIT_OPTIONAL_LOCKS=0 git -c core.hooksPath=/dev/null -c commit.gpgSign=false "$@"
}
probe_scan_ancestors() {
  local dir="$1"
  probe_marker=''
  while :; do
    [[ -r "$dir" && -x "$dir" ]] || { probe_error "cannot inspect ancestor: $dir"; return 1; }
    if [[ -e "$dir/.git" || -L "$dir/.git" ]]; then probe_marker="$dir/.git"; return 0; fi
    [[ "$dir" != / ]] || return 0
    dir="${dir%/*}"; [[ -n "$dir" ]] || dir=/
  done
}
probe_mapped_path() {
  # Check the literal normalized path AND resolved target. Canonical paths alone
  # can conceal pointers through aliases absent from the container.
  local literal resolved
  literal="$(realpath -ms -- "$1")" || return
  resolved="$(realpath -e -- "$1")" || return
  if { probe_within "$literal" "$probe_checkout" || probe_within "$literal" "$probe_common"; } &&
     { probe_within "$resolved" "$probe_checkout" || probe_within "$resolved" "$probe_common"; }; then return 0; fi
  probe_error "Git pointer needs an additional/unrepresented path: $1"
}
probe_discover() {
  local selected="$1" inside pointer actual_dotgit
  probe_selected=''; probe_checkout=''; probe_gitdir=''; probe_common=''
  probe_target=/workspace; probe_workdir=/workspace; probe_metadata=0; probe_kind=ordinary
  [[ "$selected" != *[[:cntrl:]]* ]] || { probe_error 'control characters in selected path'; return 1; }
  probe_selected="$(realpath -e -- "$selected")" || return
  [[ -d "$probe_selected" ]] || { probe_error 'selected path is not a directory'; return 1; }
  probe_scan_ancestors "$probe_selected" || return
  if ! command -v git >/dev/null 2>&1; then
    [[ -z "$probe_marker" ]] || { probe_error "host Git required to inspect $probe_marker"; return 1; }
    probe_checkout="$probe_selected"; return 0
  fi
  if ! inside="$(probe_git -C "$probe_selected" rev-parse --is-inside-work-tree 2>/dev/null)"; then
    [[ -z "$probe_marker" ]] || { probe_error "invalid/inaccessible Git metadata: $probe_marker"; return 1; }
    probe_checkout="$probe_selected"; return 0
  fi
  [[ "$inside" == true ]] || { probe_error 'bare repositories/metadata directories are not project checkouts'; return 1; }
  probe_checkout="$(probe_git -C "$probe_selected" rev-parse --show-toplevel)" || return
  probe_gitdir="$(probe_git -C "$probe_selected" rev-parse --absolute-git-dir)" || return
  probe_common="$(probe_git -C "$probe_selected" rev-parse --path-format=absolute --git-common-dir)" || return
  for pointer in "$probe_checkout" "$probe_gitdir" "$probe_common"; do probe_clean_path "$pointer" || return; done
  probe_checkout="$(realpath -e -- "$probe_checkout")" || return
  probe_gitdir="$(realpath -e -- "$probe_gitdir")" || return
  probe_common="$(realpath -e -- "$probe_common")" || return
  [[ -d "$probe_gitdir" && -d "$probe_common" && -r "$probe_gitdir" && -x "$probe_gitdir" && -r "$probe_common" && -x "$probe_common" ]] || {
    probe_error 'missing/inaccessible Git metadata directories'; return 1;
  }
  actual_dotgit="$(realpath -e -- "$probe_checkout/.git")" || return
  # Only a conventional physical .git directory is self-contained. Symlinks and
  # gitfiles use path preservation so existing metadata need not be rewritten.
  if [[ "$actual_dotgit" == "$probe_checkout/.git" && -d "$actual_dotgit" && "$probe_gitdir" == "$actual_dotgit" && "$probe_common" == "$actual_dotgit" ]]; then
    probe_kind=checkout; probe_checkout="$probe_selected"; return 0
  fi
  probe_kind=external; probe_target="$probe_checkout"; probe_workdir="$probe_selected"
  probe_safe_target "$probe_checkout" || return
  probe_safe_target "$probe_common" || return
  probe_within "$probe_selected" "$probe_checkout" || { probe_error 'selected directory outside discovered checkout'; return 1; }
  if probe_within "$probe_common" "$probe_checkout"; then
    probe_metadata=0
  elif probe_within "$probe_checkout" "$probe_common"; then
    probe_error 'Git common directory contains checkout; refusing broader metadata mount'; return 1
  else
    probe_metadata=1
  fi
  probe_mapped_path "$actual_dotgit" || return
  probe_mapped_path "$probe_gitdir" || return
  if [[ -f "$probe_checkout/.git" ]]; then
    IFS= read -r pointer < "$probe_checkout/.git" || return
    [[ "$pointer" == 'gitdir: '* ]] || { probe_error 'unsupported gitfile format'; return 1; }
    pointer="${pointer#gitdir: }"
    [[ "$pointer" == /* ]] || pointer="$probe_checkout/$pointer"
    probe_mapped_path "$pointer" || return
  fi
  if [[ "$probe_gitdir" != "$probe_common" ]]; then
    IFS= read -r pointer < "$probe_gitdir/commondir" || return
    [[ "$pointer" == /* ]] || pointer="$probe_gitdir/$pointer"
    probe_mapped_path "$pointer" || return
    IFS= read -r pointer < "$probe_gitdir/gitdir" || return
    [[ "$pointer" == /* ]] || pointer="$probe_gitdir/$pointer"
    probe_mapped_path "$pointer" || return
    [[ "$(realpath -e -- "$pointer")" == "$actual_dotgit" ]] || { probe_error 'reverse worktree pointer mismatch'; return 1; }
  fi
}
