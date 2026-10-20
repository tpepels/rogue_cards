# Balanced Recovery v1 — eight solo Heroes and all 28 duo pairs

**Purpose:** Determine whether the actual new physical edition is balanced across
Heroes and whether any duo combination is disproportionately powerful.
**Do not alter any printed cards or co-op rules before observing the results.**

## Design

- **Actual current rules:** the headless `createDecisionSession()` for
  `gameMode:"everything-goes"`, the Balanced B **36-Room** deck, all
  24 current Monsters, Item healing and three improved REST cards,
  current Warden and printed co-op rules.
- **36 configurations:** 8 singleton Heroes + all 28 unordered distinct
  pairs from those eight Heroes. No duplicates and no one-off handpicked duo.
- **Exactly one identical baseline agent** for each party: public/fair
  frontier MCTS, `c=0.2`, implicit `alpha=0.5`, **party-compatible
  legacy heuristic**, `equipmentMode=party-efficient` (identical public-equipment upgrade shortcut for both party sizes),
  random rollout combat. Default budget 8, configurable.
- **Paired starts, not paired random events:** initial chance seed repeats
  across the 36 parties for each replicate. Different actions consume RNG
  differently; results are *not* counterfactual paired playthroughs.
- **Complete terminal expeditions only:** no capped game counted as a loss.
  Wipe/escape/win classified separately. Hidden cards are not inspected
  when choosing the next action. Simulator game rules are not modified.
- **Fresh code revision pinning:** resume is rejected if source commit,
  seeds, budget, party count or policy configuration differ.

## Smoke / pilot

The automated [GitHub Actions pilot](../.github/workflows/balanced-recovery-party-pilot.yml)
checks all-party enumeration and runs one complete expedition per each
of the 36 party compositions (36 expeditions total) at budget 2
with checkpoints. **One result per duo absolutely cannot
establish a meaningful win rate** or justify printed rule changes.
Artifacts include `manifest.json`, `trials.ndjson`, `summary.json`
and `comparison.md`. The pilot is explicitly a feasibility smoke.

## Local study: enough to see patterns

~~~bash
cd ~/Projects/rogue_cards
git pull --ff-only
npm run test:balance:parties
node scripts/study-balanced-recovery-parties.mjs \
 --runs-per-party 32 --budget 8 --workers 8 --minutes 720 \
 --seed 20261021 --out results/balanced-recovery-parties-32
~~~

This requests **1,152** complete expeditions, 32 per party. It is capped
at 12 hours of wall time and checkpoints as work completes. If fewer than
1,152 finish, `summary.json` reports `complete:false` and the
comparison report clearly marks the run PARTIAL. Resume by repeating
the **identical command** on the **same Git commit**, without `git pull`
in between. For reliable estimates of rare 95%+ win pairs, more seeds
may be necessary after initial screening.

## Reading the output

The report lists all eight solo Heroes and all 28 pairs with independent
denominators, wins, Vault success, healing, fights, damage and
`liftVsBestSolo` in **percentage points**.

Interpret with caution:
- An extra Hero gives extra HP and action flexibility but the Monster
  responds after **each** Hero action under current phase rules, not
  once per pair's two actions. Separately, printed Vault SEAL already
  charges double the MAGIC Items in two-Hero play.
- Do not select the most extreme winner from 28 pairs without considering
  multiple comparisons and confidence intervals. The JSON includes
  Wilson intervals per pair, solo and duo aggregate.
- Look for **persistent co-op-only synergies** that leave solo performance
  unchanged, rather than weakening individual Hero cards based on a tiny sample.
- Any co-op adjustment should be a small physical, readable co-op rule and
  evaluated with matched independent starts against this frozen edition.
  No automatic global Monster stats, hidden bonus or simulator-only nerf.
- Baseline is a common, co-op-compatible MCTS policy. It is *not identical*
  to the older frozen solo-only reference policy, because the old
  `solo-threat` heuristic and `solo-pragmatic` equipment mode explicitly
  reject two Heroes. Do **not** compare its percentages directly against
  the older solo healing studies.

## Suggested next experiment (only if duo dominance is clear)

Keep solo cards untouched and compare **one** candidate co-op-only
mechanism at a time. Possible hypotheses (not yet implemented or approved):
a shared limitation on Item usage within a fight, a co-op-only increase in
encounter pressure (must be printed and easily administered), or an
opportunity-cost adjustment to co-op recovery. Select based on which metrics
actually explain strong duo results. Avoid arbitrary nerfs to everyone.
