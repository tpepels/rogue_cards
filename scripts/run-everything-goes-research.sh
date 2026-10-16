#!/usr/bin/env bash
# Full Everything Goes balance campaign: one command, pinned revision.
# Run on your workstation; the study writes incremental crash-safe checkpoints.
# Repeating this exact command resumes from the last finished expedition.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! git diff --quiet || ! git diff --cached --quiet ||
   [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
 echo "Tracked or untracked source changes detected. Commit/stash first." >&2
 echo "Generated Monster/Item illustration mappings must be committed to" >&2
 echo "run a scientifically reproducible, resumable experiment." >&2
 exit 1
fi

revision="$(git rev-parse HEAD)"
short="${revision:0:12}"
output="results/everything-goes-deep-${short}"
seed=20261016

npm run test:experiment
npm run test:everything

resume=()
if [[ -d "${output}" ]]; then
 resume+=(--resume)
fi

echo "Everything Goes / revision ${revision}"
echo "3,600 organic MCTS expeditions covering 8 solo Heroes and 28 Hero pairs."
echo "18 * 120 matched Item pairs (4,320 paired games); 7,920 total games."
echo "Comparison: new extra Item versus extra Dry Rations (one physical copy)."
echo "Each and every real decision and committed die is saved; no truncated runs."
echo "Output: ${output}"
node scripts/study-everything-goes-deep.mjs \
 "${resume[@]}" \
 --mode all --runs 3600 --pairs-per-item 120 \
 --workers 6 --hours 72 --budget 2 --knowledge fair \
 --seed "${seed}" --max-game-steps 20000 \
 --max-search-steps 5000 --out "${output}"

echo "Study: ${output}/summary.md"
echo "Files: ${output}/card-coverage.csv, runs.csv, paired-item-effects.csv"
echo "Raw exact events: ${output}/raw/"
