#!/usr/bin/env bash
# Remove obsolete clean local worktrees; preserve all Git branches and balance results.
# Preview first: bash scripts/cleanup-worktrees.sh
# Apply:         bash scripts/cleanup-worktrees.sh --apply
set -euo pipefail
mode=${1:---dry-run}
if [[ "$mode" != "--dry-run" && "$mode" != "--apply" ]] || [[ $# -gt 1 ]]; then
  echo "Usage: $0 [--dry-run|--apply]" >&2
  exit 2
fi
root=$(git rev-parse --show-toplevel)
cd "$root"
echo "Worktree cleanup ($mode)"
wt=''
branch=''
locked=0
detached=0
prunable=0
keep_or_remove() {
  [[ -n "$wt" ]] || return 0
  if [[ "$wt" == "$root" || "$branch" == main || "$branch" == master ]]; then
    echo "KEEP: $wt (current or primary branch)"
  elif [[ "$locked" == 1 || "$detached" == 1 || "$prunable" == 1 || -z "$branch" || ! -d "$wt" ]]; then
    echo "SKIP: $wt (locked, detached, prunable or unavailable)"
  elif [[ -n "$(git -C "$wt" status --porcelain --untracked-files=all)" ]]; then
    echo "SKIP: $wt (local changes or untracked files)"
  elif [[ -d "$wt/results" ]] && [[ -n "$(find "$wt/results" -type f -print -quit 2>/dev/null)" ]]; then
    echo "SKIP: $wt (ignored balance results must be preserved)"
  else
    echo "$mode: $wt (branch $branch retained)"
    if [[ "$mode" == "--apply" ]]; then
      git worktree remove -- "$wt"
    fi
  fi
}
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    '') keep_or_remove; wt=''; branch=''; locked=0; detached=0; prunable=0 ;;
    worktree\ *) wt=${line#worktree } ;;
    branch\ refs/heads/*) branch=${line#branch refs/heads/} ;;
    locked*) locked=1 ;;
    prunable*) prunable=1 ;;
    detached) detached=1 ;;
  esac
done < <(git worktree list --porcelain; echo)
if [[ "$mode" == "--apply" ]]; then
  git worktree prune --verbose
  echo "Done. No Git branches or balance study results were deleted."
else
  echo "Review above, then run with --apply to remove eligible worktrees."
fi
