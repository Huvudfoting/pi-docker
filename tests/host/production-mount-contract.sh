# Test adapter only: reuse the Phase 1 assertion corpus against production code.
# Fixture Git creation remains isolated; discovery itself uses production Git.
source "$(dirname -- "${BASH_SOURCE[0]}")/mount-contract.sh"
source "$(dirname -- "${BASH_SOURCE[0]}")/../../lib/workspace-mounts.sh"
probe_safe_target() {
  mount_safe_target "$1" || return
  if mount_within "$1" /probe || mount_within /probe "$1"; then probe_error 'test-code mount conflict /probe'; return 1; fi
}
probe_scan_ancestors() { mount_scan_ancestors "$1"; }
probe_discover() {
  mount_discover "$1" || return
  if [[ "$mount_kind" == external ]]; then
    probe_safe_target "$mount_checkout" || return
    probe_safe_target "$mount_common" || return
  fi
  probe_selected="$mount_selected"; probe_checkout="$mount_checkout"
  probe_gitdir="$mount_gitdir"; probe_common="$mount_common"
  probe_target="$mount_target"; probe_workdir="$mount_workdir"
  probe_metadata="$mount_metadata"; probe_kind="$mount_kind"
}
