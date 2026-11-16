#!/usr/bin/env bash
# Offline tests for the experimental Bash/Git contract. No Docker/Node/Python.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$here/mount-contract.sh"
root="$(mktemp -d /tmp/pi-mount-unit.XXXXXXXX)"
trap 'rm -rf -- "$root"' EXIT
export GIT_AUTHOR_NAME=Fixture GIT_AUTHOR_EMAIL=fixture@example.invalid
export GIT_COMMITTER_NAME=Fixture GIT_COMMITTER_EMAIL=fixture@example.invalid
pass() { printf 'PASS %s\n' "$*"; }
reject() {
  local label="$1"; shift
  if "$@" > "$root/rejection.log" 2>&1; then printf 'FAIL expected rejection: %s\n' "$label" >&2; exit 1; fi
  pass "$label"
}
mkdir "$root/plain"
probe_discover "$root/plain"
[[ "$probe_kind" == ordinary && "$probe_target" == /workspace ]]
pass ordinary
main="$root/main checkout"; mkdir "$main"
probe_git -C "$main" init -q -b main
printf 'initial\n' > "$main/tracked"
probe_git -C "$main" add tracked
probe_git -C "$main" commit -qm fixture
probe_discover "$main"
[[ "$probe_kind" == checkout && "$probe_target" == /workspace ]]
pass self-contained
linked="$root/linked 'space' \$cash:colon"
probe_git -C "$main" worktree add -q -b helper "$linked"
mkdir -p "$linked/a/b/c/d"
probe_discover "$linked/a/b/c/d"
[[ "$probe_kind" == external && "$probe_metadata" == 1 && "$probe_checkout" == "$linked" && "$probe_workdir" == "$linked/a/b/c/d" ]]
pass 'linked checkout, deep subdirectory, spaces/quotes/dollar/colon, Git pointers'
ln -s "$linked" "$root/alias"
probe_discover "$root/alias/a/b"
[[ "$probe_selected" == "$linked/a/b" ]]
pass 'symlink selection canonicalization'
probe_git -C "$main" worktree add -q -b nested "$main/nested"
probe_discover "$main/nested"
[[ "$probe_metadata" == 1 && "$probe_common" == "$main/.git" ]]
pass 'worktree nested beneath original checkout'
mkdir "$root/separate"
probe_git -C "$root/separate" init -q --separate-git-dir "$root/external metadata"
probe_discover "$root/separate"
[[ "$probe_kind" == external && "$probe_metadata" == 1 && "$probe_gitdir" == "$root/external metadata" ]]
pass separate-git-dir
# Required metadata can be inside the mounted checkout: deduplicate it.
mkdir "$root/contained"
probe_git -C "$root/contained" init -q --separate-git-dir "$root/contained/metadata"
probe_discover "$root/contained"
[[ "$probe_kind" == external && "$probe_metadata" == 0 ]]
pass 'contained metadata deduplicated'
for target in / /pi /pi/child /run /run/child /var /var/run /var/run/child /var/lock /tmp /opt /opt/pi-docker /usr/example /bin /sbin /lib /lib64 /etc /dev /proc /sys /boot /root /home /home/node/project /proc/self /probe; do
  reject "reserved target $target" probe_safe_target "$target"
done
probe_safe_target /runaway/project
probe_safe_target /home/another-user/project
probe_safe_target /var/runaway/project
probe_safe_target /var/tmp/project
probe_safe_target /tmp/project
probe_safe_target /workspace/project
pass 'reserved component boundaries, no project-prefix allowlist'
reject 'control character path' probe_discover "$root/"$'bad\nname'
mkdir -p "$root/broken/a/b/c/d"
printf 'gitdir: /nonexistent/pi-mount-metadata\n' > "$root/broken/.git"
reject 'broken enclosing metadata with Git available' probe_discover "$root/broken/a/b/c/d"
# No-Git branch: only realpath remains on PATH, not a fake Git implementation.
mkdir "$root/no-git-bin"
ln -s "$(command -v realpath)" "$root/no-git-bin/realpath"
saved_path="$PATH"; PATH="$root/no-git-bin"
probe_discover "$root/plain"
[[ "$probe_kind" == ordinary ]]
pass 'no Git: ordinary launch allowed'
reject 'no Git: marker beyond two ancestors' probe_discover "$linked/a/b/c/d"
reject 'no Git: conventional .git directory' probe_discover "$main"
reject 'no Git: broken gitfile' probe_discover "$root/broken/a/b/c/d"
PATH="$saved_path"
mkdir "$root/dangling"
ln -s "$root/absent" "$root/dangling/.git"
PATH="$root/no-git-bin"
reject 'no Git: dangling .git symlink' probe_discover "$root/dangling"
PATH="$saved_path"
mkdir -p "$root/unreadable/a/b"
chmod a-r "$root/unreadable"
if [[ ! -r "$root/unreadable" ]]; then
  reject 'uninspectable ancestor' probe_scan_ancestors "$root/unreadable/a/b"
else
  printf 'SKIP unreadable-ancestor assertion (privileged user bypasses permissions)\n'
fi
chmod u+r "$root/unreadable"
# An absolute pointer through an unmounted alias must not pass on realpath alone.
ln -s "$main/.git" "$root/metadata-alias"
admin="$(probe_git -C "$linked" rev-parse --absolute-git-dir)"
printf 'gitdir: %s\n' "$root/metadata-alias/${admin#"$main/.git/"}" > "$linked/.git"
reject 'literal Git pointer through unmounted alias' probe_discover "$linked"
grep -Eq 'additional/unrepresented path|symlink alias' "$root/rejection.log"
# A symlinked .git must validate its literal target, not only its realpath.
rm "$root/separate/.git"
ln -s '../external metadata' "$root/separate/.git"
probe_discover "$root/separate"
[[ "$probe_kind" == external && "$probe_metadata" == 1 ]]
pass 'direct .git symlink to represented physical metadata'
ln -s "$root/external metadata" "$root/external-alias"
rm "$root/separate/.git"
ln -s "$root/external-alias" "$root/separate/.git"
reject '.git symlink through unmounted alias' probe_discover "$root/separate"
grep -q 'symlink alias' "$root/rejection.log"
# Even matching canonical endpoints can hide an unavailable intermediate hop.
mkdir "$root/external metadata/subdir"
ln -s "$root/external metadata/subdir" "$root/bridge"
ln -s "$root/bridge" "$root/external metadata/alias"
rm "$root/separate/.git"
printf 'gitdir: %s\n' "$root/external metadata/alias/.." > "$root/separate/.git"
reject 'intermediate pointer alias hidden by parent traversal' probe_discover "$root/separate"
grep -q 'symlink alias' "$root/rejection.log"
reject 'missing checkout' probe_discover "$root/does-not-exist"
printf 'All offline mount-contract checks passed.\n'
