# Host-side discovery for bin/pi. Source only; no work at source time.
# Results are mount_* variables, never shell/YAML output. No lifecycle policy.
mount_error() { printf 'pi-docker: mount discovery: %s\n' "$*" >&2; return 1; }
mount_within() { [[ "$1" == "$2" || "$1" == "$2/"* || "$2" == / ]]; }
mount_clean_path() {
  [[ "$1" == /* && "$1" != *[[:cntrl:]]* ]] || mount_error 'expected an absolute path without control characters'
}
mount_capture_line() {
  # Preserve trailing newlines until validation. Plain $(realpath/readlink ...)
  # can turn 'project<newline>' into a different existing 'project' path.
  local output
  output="$("$@" && printf '.')" || return
  output="${output%.}"
  mount_line_result="${output%$'\n'}"
}
mount_capture_path() {
  mount_capture_line "$@" || return
  mount_path_result="$mount_line_result"
  mount_clean_path "$mount_path_result"
}
mount_read_pointer() {
  local file="$1"
  mount_pointer=''
  [[ -f "$file" && -r "$file" ]] || { mount_error "missing/unreadable pointer file: $file"; return 1; }
  # With NUL as the delimiter, read preserves every newline and reports success
  # only on a NUL byte (which is forbidden). EOF is the normal result. Remove
  # at most one conventional final LF; reject embedded/new extra control bytes
  # instead of validating just a prefix of the path Git actually reads.
  if IFS= read -r -d '' mount_pointer < "$file"; then
    mount_error "NUL byte in Git pointer file: $file"; return 1
  fi
  mount_pointer="${mount_pointer%$'\n'}"
  [[ -n "$mount_pointer" && "$mount_pointer" != *[[:cntrl:]]* ]] || {
    mount_error "empty or control-character/multiline Git pointer file: $file"; return 1;
  }
}
mount_safe_target() {
  local target="$1" reserved
  mount_clean_path "$target" || return
  [[ "$target" != /tmp ]] || { mount_error 'mount would replace container scratch directory /tmp'; return 1; }
  for reserved in /pi /run /var/run /var/lock /opt/pi-docker /usr /bin /sbin /lib /lib64 /etc /dev /proc /sys /boot /root /home/node; do
    if mount_within "$target" "$reserved" || mount_within "$reserved" "$target"; then
      mount_error "mount destination conflicts with reserved path $reserved: $target"; return 1
    fi
  done
}
mount_git() (
  # Discover only the selected filesystem checkout, not an inherited GIT_DIR,
  # index/config/object override. Honor normal host Git configuration (including
  # user-granted trust); never add safe.directory or mutate metadata/config.
  local variable
  for variable in "${!GIT_@}"; do unset "$variable"; done
  export GIT_OPTIONAL_LOCKS=0
  command git "$@"
)
mount_scan_ancestors() {
  local dir="$1"
  mount_marker=''
  while :; do
    [[ -r "$dir" && -x "$dir" ]] || { mount_error "cannot inspect ancestor: $dir"; return 1; }
    if [[ -e "$dir/.git" || -L "$dir/.git" ]]; then mount_marker="$dir/.git"; return 0; fi
    [[ "$dir" != / ]] || return 0
    dir="${dir%/*}"; [[ -n "$dir" ]] || dir=/
  done
}
mount_mapped_path() {
  local literal resolved component prefix=''
  local -a components
  mount_clean_path "$1" || return
  # Check literal traversal before normalizing '..'. Canonical endpoints alone
  # can conceal intermediate symlink aliases unavailable inside the container.
  IFS=/ read -r -a components <<< "$1"
  for component in "${components[@]}"; do
    [[ -n "$component" ]] || continue
    case "$component" in
      .) continue ;;
      ..) prefix="${prefix%/*}"; [[ -n "$prefix" ]] || prefix=/ ;;
      *) prefix="${prefix%/}/$component" ;;
    esac
    [[ ! -L "$prefix" ]] || { mount_error "Git pointer traverses a symlink alias: $prefix; layout is not supported (no metadata was changed)"; return 1; }
    # Docker supplies the bind trees and their parent directory hierarchy, not
    # unrelated host directories temporarily visited before a later '..'.
    if ! { mount_within "$prefix" "$mount_checkout" || mount_within "$prefix" "$mount_common" ||
           mount_within "$mount_checkout" "$prefix" || mount_within "$mount_common" "$prefix"; }; then
      mount_error "Git pointer needs an unrepresented traversal directory: $prefix (no metadata was changed)"; return 1
    fi
  done
  mount_capture_path realpath -ms -- "$1" || return
  literal="$mount_path_result"
  mount_capture_path realpath -e -- "$1" || return
  resolved="$mount_path_result"
  if { mount_within "$literal" "$mount_checkout" || mount_within "$literal" "$mount_common"; } &&
     { mount_within "$resolved" "$mount_checkout" || mount_within "$resolved" "$mount_common"; }; then return 0; fi
  mount_error "Git pointer needs an additional/unrepresented path: $1; choose a supported checkout layout (no metadata was changed)"
}
mount_discover() {
  local selected="$1" inside pointer actual_dotgit
  mount_selected=''; mount_checkout=''; mount_gitdir=''; mount_common=''
  mount_target=/workspace; mount_workdir=/workspace; mount_metadata=0; mount_kind=ordinary
  [[ "$selected" != *[[:cntrl:]]* ]] || { mount_error 'control characters in selected path'; return 1; }
  mount_capture_path realpath -e -- "$selected" || return
  mount_selected="$mount_path_result"
  [[ -d "$mount_selected" ]] || { mount_error 'selected path is not a directory'; return 1; }
  mount_scan_ancestors "$mount_selected" || return
  if ! command -v git >/dev/null 2>&1; then
    [[ -z "$mount_marker" ]] || { mount_error "host Git required to inspect $mount_marker"; return 1; }
    mount_checkout="$mount_selected"; return 0
  fi
  if ! inside="$(mount_git -C "$mount_selected" rev-parse --is-inside-work-tree 2>/dev/null)"; then
    [[ -z "$mount_marker" ]] || { mount_error "invalid/inaccessible Git metadata: $mount_marker"; return 1; }
    mount_checkout="$mount_selected"; return 0
  fi
  [[ "$inside" == true ]] || { mount_error 'bare repositories/metadata directories are not project checkouts'; return 1; }
  mount_capture_path mount_git -C "$mount_selected" rev-parse --show-toplevel || return
  mount_checkout="$mount_path_result"
  mount_capture_path mount_git -C "$mount_selected" rev-parse --absolute-git-dir || return
  mount_gitdir="$mount_path_result"
  mount_capture_path mount_git -C "$mount_selected" rev-parse --path-format=absolute --git-common-dir || return
  mount_common="$mount_path_result"
  mount_capture_path realpath -e -- "$mount_checkout" || return
  mount_checkout="$mount_path_result"
  mount_capture_path realpath -e -- "$mount_gitdir" || return
  mount_gitdir="$mount_path_result"
  mount_capture_path realpath -e -- "$mount_common" || return
  mount_common="$mount_path_result"
  [[ -d "$mount_gitdir" && -d "$mount_common" && -r "$mount_gitdir" && -x "$mount_gitdir" && -r "$mount_common" && -x "$mount_common" ]] || {
    mount_error 'missing/inaccessible Git metadata directories'; return 1;
  }
  mount_capture_path realpath -e -- "$mount_checkout/.git" || return
  actual_dotgit="$mount_path_result"
  if [[ "$actual_dotgit" == "$mount_checkout/.git" && -d "$actual_dotgit" && "$mount_gitdir" == "$actual_dotgit" && "$mount_common" == "$actual_dotgit" ]]; then
    mount_kind=checkout; mount_checkout="$mount_selected"; return 0
  fi
  mount_kind=external; mount_target="$mount_checkout"; mount_workdir="$mount_selected"
  mount_safe_target "$mount_checkout" || return
  mount_safe_target "$mount_common" || return
  mount_within "$mount_selected" "$mount_checkout" || { mount_error 'selected directory outside discovered checkout'; return 1; }
  if mount_within "$mount_common" "$mount_checkout"; then
    mount_metadata=0
  elif mount_within "$mount_checkout" "$mount_common"; then
    mount_error 'Git common directory contains checkout; refusing broader metadata mount'; return 1
  else
    mount_metadata=1
  fi
  mount_mapped_path "$actual_dotgit" || return
  mount_mapped_path "$mount_gitdir" || return
  if [[ -L "$mount_checkout/.git" ]]; then
    mount_capture_line readlink -- "$mount_checkout/.git" || return
    pointer="$mount_line_result"
    [[ "$pointer" == /* ]] || pointer="$mount_checkout/$pointer"
    mount_mapped_path "$pointer" || return
  fi
  if [[ -f "$mount_checkout/.git" ]]; then
    mount_read_pointer "$actual_dotgit" || return
    pointer="$mount_pointer"
    [[ "$pointer" == 'gitdir: '* ]] || { mount_error 'unsupported gitfile format'; return 1; }
    pointer="${pointer#gitdir: }"
    [[ "$pointer" == /* ]] || pointer="$mount_checkout/$pointer"
    mount_mapped_path "$pointer" || return
  fi
  if [[ "$mount_gitdir" != "$mount_common" ]]; then
    # These pointer files themselves must be reachable, not just their contents.
    # A symlinked file can otherwise hide an unmounted external dependency.
    mount_mapped_path "$mount_gitdir/commondir" || return
    mount_mapped_path "$mount_gitdir/gitdir" || return
    mount_read_pointer "$mount_gitdir/commondir" || return
    pointer="$mount_pointer"
    [[ "$pointer" == /* ]] || pointer="$mount_gitdir/$pointer"
    mount_mapped_path "$pointer" || return
    mount_read_pointer "$mount_gitdir/gitdir" || return
    pointer="$mount_pointer"
    [[ "$pointer" == /* ]] || pointer="$mount_gitdir/$pointer"
    mount_mapped_path "$pointer" || return
    mount_capture_path realpath -e -- "$pointer" || return
    [[ "$mount_path_result" == "$actual_dotgit" ]] || { mount_error 'reverse worktree pointer mismatch'; return 1; }
  fi
}
