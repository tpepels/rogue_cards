#!/usr/bin/env bash
set -euo pipefail
# Matched 2 algorithms x 8 heroes x N starts x 4 internal policies.
# Every variant uses the same canonical starting seed, budget and cards.
cd "$(dirname "$0")/.."
OUT="${OUT:-results/pragmatic-ablation-v1}"
RUNS_PER_HERO="${RUNS_PER_HERO:-2}"
WORKERS="${WORKERS:-8}"
HOURS="${HOURS:-2}"
BUDGET="${BUDGET:-8}"
SEED="${SEED:-20261101}"
SOURCE_STUDY="${SOURCE_STUDY:-results/mcts-solo-overnight/summary.json}"
if [[ ! -f "$SOURCE_STUDY" ]]; then
 echo "Missing --from-study source: $SOURCE_STUDY" >&2
 exit 1
fi
mkdir -p "$OUT"
for variant in external-only tree-only rollout-only both; do
 echo "Running matched $variant policy, $RUNS_PER_HERO seeds per hero"
 node scripts/study-solo-expedition-balance.mjs \
  --workers "$WORKERS" --hours "$HOURS" \
  --runs-per-hero "$RUNS_PER_HERO" --budget "$BUDGET" \
  --seed "$SEED" --c 0.35 --alpha 0.4 \
  --equipment-policy solo-pragmatic --mcts-pragmatic "$variant" \
  --from-study "$SOURCE_STUDY" \
  --out "$OUT/$variant"
done
node scripts/report-pragmatic-ablation.mjs "$OUT"
