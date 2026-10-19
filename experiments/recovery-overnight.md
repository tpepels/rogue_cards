# Recovery calibration overnight — physical card combinations

**Status:** Implemented as staging-only, regression-tested for actual HP attribution. Overnight full-expedition results pending.  
**Decision:** More printed healing opportunities, no automatic healing in any deployable arm.  
**Baseline:** Same Balanced B physical Rooms; current Monsters, Warden, Heroes and all encounter rules unchanged.  
**AI:** Frozen `solo-balance-reference-v1` (fair, implicit MCTS, frontier, budget 32).

## Why we are repeating the experiment

The previous study completed 320 screening and 640 confirmation runs. With the original fixed AI, the +5-after-winning-regional-fight **diagnostic** arm reached the Vault ~60.9% of the time and won ~36.7% overall. The best printed proposals achieved ~26–27% wins and ~44–48% Vault entry. Increasing raw healing operations was not enough; available, chosen, effectively applied and wasted HP were not sufficiently separated.

**Instrumentation issue now fixed:** `ExpeditionState.heal()` is the single canonical HP mutation and now records actual resolved HP offered, restored and wasted by printed card, category and stage. Direct Item/Monster, special effect, paid REST and diagnostic healing paths pass explicit provenance. The study summarizes full `finalMetrics.healing` and existing `roomOptionAvailable` and `itemOpportunities`.

For any **complete** run, confirm that summed `bySource`, `byCategory` and `byStage` totals equal the `total`. `attempts` are resolutions, `offered` is numeric HP (including actual d6 results), `restored` is the effective increase before reaching the printed Hero cap, and `wasted=offered-restored`. The source ledger is *not* an estimate based on opcode counts.

## Hypotheses (26 physical + one diagnostic)

Three variables, evaluated alone and in combinations:

| Dimension | Current | Test ranges |
|---|---|---|
| Healing consumables | Bandages 3, Rations 3, Thorn Tonic 2 copies | 5/4/3, 9/6/5, 14/9/7, 20/12/10 |
| Existing REST choices | Coal Store 3 HP (Item cost), Barracks 4 HP (Item cost), Watchpost 2 HP (free) | 5/6/4, 7/8/6, 9/10/8, 10/10/10 |
| Existing Monster DEFEAT rewards | Original individual printed reward only | +2, +3 or +d6 HP attached to individual non-healing Monsters, optionally only UPPER, UPPER+MIDDLE, or all stages |

All values are *proposed physical card values*, not a new universal rule. Every Monster retains its original DEFEAT reward. No new card IDs, extra Room or Corridor copies, alternative action types or simulated hidden healing are introduced.

The 26 candidates include pure intervention arms and supply × REST, supply × DEFEAT, REST × DEFEAT and three-way interactions. Strong/high-copy arms are **exploratory upper bounds**, not an endorsement of printing an enormous Item deck. The `recovery-diagnostic-five` arm repeats the numerical **unprintable** +5 reference.

## Overnight comparison

Use a **fresh results directory**, distinct from the first recovery study:

~~~bash
cd ~/Projects/rogue_cards
git pull --ff-only
npm run test:balance:recovery-overnight
node scripts/study-balance-hypotheses.mjs \
  --suite recovery-overnight \
  --finalists 12 \
  --screen-repeats 4 \
  --confirm-repeats 16 \
  --workers 8 \
  --minutes 720 \
  --seed 20261021 \
  --out results/recovery-overnight-v1
~~~

At these settings: **896 screening** expeditions (27 hypotheses + control × 8 Heroes × 4) and **1664 independent confirmation** expeditions (12 finalists + control × 8 × 16), **2560** scheduled total if the screen and confirmation both finish. The study saves individual raw trials in `trials.ndjson`, the exact code/agent/candidate manifest in `manifest.json`, statistics in `summary.json` and the review table in `comparison.md`. It checkpoints incrementally and resumes via the **identical command, options, Git revision and output directory**.

To verify the plan without playing:

~~~bash
node scripts/study-balance-hypotheses.mjs \
  --suite recovery-overnight --finalists 12 \
  --screen-repeats 4 --confirm-repeats 16 --dry-run
~~~

A short CI workflow runs unit checks and canonical engine smoke before overnight sampling. No remote asynchronous promise is needed; the user's workstation performs the full run.

## Scoring and validation

Screening favors similarity to the earlier reference in (i) overall wins near 36.7%, (ii) Vault reach near 60.9%, (iii) conditional win near 60.3%, with a mild encounter-density preservation term. It is **not** a declaration of an optimal design; at least one arm from each intervention category is included for holdout where slots allow, plus the +5 diagnostic. The same dedicated frozen agent profile is used for every arm.

**Review confirmed outcomes**, not screening rankings:

1. Effective HP *by actual card source and stage* and HP wasted at max health.
2. Healing supply available vs taken, Items drawn/activated/left over, Room REST offered vs chosen, and Monster kills actually receiving healing.
3. Vault reach, conditional victory, all Heroes individually, causes of early death.
4. Preservation of ordinary encounters and fight conversion; no artificial reduction in confrontation to improve wins.
5. Card/deck size and physical/print usability; the highest numerical recovery does not necessarily make for a good physical game.

**Do not automatically promote any staged changes** to canonical printed cards. Do not change the baseline or frozen AI while a study is running. More heal opportunities can be desirable even if total offered recovery grows much faster than effective recovery; the aim is meaningful and accessible choices, not mere opcode count.

## Implementation and proof

- `src/engine/expedition-state.js` — canonical heal ledger.
- `src/engine/combat-outcomes.js`, `src/engine/index.js`, `src/odd-item-effects.js` — direct healing source attribution.
- `src/staging/recovery-overnight-hypotheses.js` — 26 printed candidates + 1 numerical reference.
- `scripts/study-balance-hypotheses.mjs` — resumable `--suite recovery-overnight`, detailed per-source accounting.
- `tests/recovery-overnight.test.mjs` — Item/Room/Monster attribution, HP waste, deep-fork independence, full study plan.
- `.github/workflows/recovery-overnight-smoke.yml` — targeted tests, dry-run, and real-game smoke.

## Checklist

- [x] Extract confirmed weakness in previous printed recovery study.
- [x] Define explicit actual healing (offered/restored/wasted) and source accounting.
- [x] Instrument central health mutation plus representative direct mechanic paths.
- [x] Define 26 mixed testable hypotheses and +5 numeric comparator.
- [x] Add strict regression tests and verify syntax.
- [ ] Complete real CI smoke on latest revision.
- [ ] Run full overnight screen and independent confirmation.
- [ ] Inspect by-Hero and by-source recovery results.
- [ ] Select a physically viable finalist and test further (without auto-promoting canonical cards).
