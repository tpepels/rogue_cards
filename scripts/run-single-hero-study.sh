#!/usr/bin/env bash
# Single-Hero all-printed-card canonical study. Run on the user's workstation.
# Same seed/index protocol, seven worker threads, no reduced simulation.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Uncommitted tracked changes: commit or stash before a pinned balance study." >&2
  exit 1
fi

# The printable rules now use fixed AC. The earlier engine still used two
# opposed d20 rolls; measuring that engine would invalidate the study.
if grep -Eq 'let defense[[:space:]]*=[[:space:]]*rollD20|let def[[:space:]]*=[[:space:]]*s\.rerollIfKept\(h,rollD20' src/engine/combat.js; then
  echo "Canonical combat engine still uses the superseded opposed DEF roll." >&2
  echo "Implement and audit fixed AC = 12 + DEF before starting this study." >&2
  exit 1
fi

revision="$(git rev-parse HEAD)"
short="${revision:0:12}"
seed=20261016
audit="results/single-hero-audit-${short}"
study="results/all-cards-single-hero-${short}"

npm run test:session
npm run validate:deck

if [[ ! -f "${audit}/summary.json" ]]; then
  npm run audit:canonical -- \
    --runs 36 --seed "${seed}" --out "${audit}"
fi

mkdir -p results
printf '%s\n' "${study}" > results/current-single-hero-study.txt
printf '%s\n' "${audit}/summary.json" > results/current-single-hero-audit.txt

options=()
if [[ -d "${study}" ]]; then
  options+=(--resume)
fi

echo "Launching pinned single-Hero all-card study at ${revision}"
echo "Eight solo Heroes rotate for every non-Hero card; no two-Hero parties."
echo "Output: ${study}"

npm run oracle:all-cards -- \
  "${options[@]}" \
  --party-size single \
  --runs-per-card 250 \
  --min-paired 100 \
  --workers 7 \
  --hours 24 \
  --budget 2 \
  --seed "${seed}" \
  --audit "${audit}/summary.json" \
  --out "${study}"

echo "Results: ${study}/summary.md"
echo "To resume if incomplete: bash scripts/run-single-hero-study.sh"
