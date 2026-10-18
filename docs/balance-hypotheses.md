# Everything Goes: controlled physical-card balancing study

This is **game design research**, not a project to maximize MCTS strength.
The player is frozen at `experiments/agents/solo-balance-reference-v1.json`
(implicit tree, C=0.2, alpha=0.5, 32 visits).
The canonical cards and printed rules are never edited or auto-promoted.

## Questions

| ID | Hypothesis | Design mechanism |
|---|---|---|
| encounter-mild | More Monster appearances from Rooms | Add one Monster draw result to four rolled Rooms per stage |
| encounter-strong | Frequency is the dominant limiter | Add a Monster draw to up to two nonhazardous results on all eligible Rooms |
| encounter-deck-bias | Too many safe Rooms dilute encounters | Exclude four low-encounter Rooms per stage |
| monsters-atk-minus-1 | Combat accuracy drives attrition | Lower all ordinary Monster ATK by 1 |
| monsters-hp-minus-2 | Fights are too long | Lower ordinary Monster HP by 2 |
| recovery-room-plus | Recovery chances are too scarce | Enhance four existing Room healing effects |
| recovery-item-copies | Healing Items are too scarce | More bandages, rations and needles in physical deck |
| warden-hp-down | Final Warden fight is overtuned | Phase I HP 20 to 18; Fury HP 10 to 8 |
| trapdoor-fall-safer | Sudden pre-Vault falls produce unfair deaths | Reduce selected Upper/Deep trapdoor fall damage |
| wisp-hp-8 | The returning Wisp is disproportionately difficult | Wisp HP 9 to 8 |
| encounter-mild-atk-lower | Moderate encounters + safer fights | Mild encounter interventions and ATK-1 |
| encounter-strong-atk-lower | More encounters require gentler fights | Strong encounter interventions and ATK-1 |
| encounter-strong-recovery | More encounters require restorative tools | Strong encounters and Room recovery |
| encounter-strong-atk-recovery | Damage and recovery interact with frequency | Strong encounters, ATK-1 and Room recovery |

For all encounter interventions the runner patches **existing legal Room dice results**
with the canonical `MONSTER_DRAW` operation; it does not insert new cards
or use an invented combat engine. The result is a **hypothetical printed-rule
rewrite**; the visible printed card wording is unchanged for experiments.
No stage can automatically promote an experiment.

## Primary and secondary indicators

**Primary:** number of ordinary Monster appearances per **completed Room**,
with a target equivalent to 16-20 appearances/36 Rooms. Always also report
actual appearances among **truly completed 36-Room** runs. A normalized
encounters-per-36 equivalent is NOT a substitute for fully observed expeditions.

**Safety:** wins (target around 40% solo), reaching Vault (around 50%),
HP at first actionable Vault entry, deaths by stage/cause and lost Rooms.
**Interaction:** fraction of ordinary appearances that lead to fighting
(target 55-70%); HP damage attributable to combat; kills and recoveries.
**Physical constraints:** no stopwatch human-play duration can be inferred
from simulation milliseconds. Human playtests must establish 90-120 minute
solo playtime, readable card effects and whether choices feel consequential.

Neither a bigger encounter count nor a higher AI win rate is automatically
a better game. Variant ranking penalizes reductions in rooms, wins and
Vault reach, and increased combat damage. It is **exploratory**; do not
promote without testing on independent starts and at the tabletop.

## Reproducible protocol

The runner screens **14 variants plus a shared canonical control**, then
validates the best four variants (and a NEW canonical control) on different,
predeclared seeds. Each Hero gets the same seed within a study phase;
the canonical control is computed only once per Hero/seed. No AI parameters
are retuned to compensate for a more dangerous or easier card set.

A large workstation study with eight Heroes has 720 full-expedition runs:

```bash
git pull --ff-only
npm run test:balance:hypotheses
npm run study:balance:hypotheses -- \
  --workers 8 --minutes 180 \
  --screen-repeats 4 --confirm-repeats 6 \
  --out results/balance-assumptions-v1
```

The automatically launched GitHub Actions study uses a smaller but still
substantial first wave (2 screen starts and 4 independent confirmation starts
per Hero). It is deliberately not the same as the 720-run workstation study.

Outputs: `manifest.json` with source revision/hypothesis hashes/frozen player;
`trials.ndjson` resumable trials;
`summary.json` full cross-Hero and cross-card comparisons;
`comparison.md` human-readable sortable overview.
Run the SAME command to resume only while code and study options are unchanged;
otherwise use a new `--out`. Fatal errors fail the run. A time limit yields an
explicit partial report; **do not interpret partial results as a winner**.

## Multiple comparisons and causal limits

The 14-arm screening is exploratory; confidence intervals that happen to
exclude zero there may be false positives. Held-out confirmation must be
interpreted independently, looking at paired effect size, exposure, sample
size, variability between Heroes and meaningful physical playtest outcomes.
This is a policy-specific simulation under shared *initial* dice seeds;
later RNG streams diverge when the decision paths diverge.

The setup tests **global mechanic hypotheses**. A combination that improves
outcomes does not identify which of its components caused the change
without the single-factor variants (included here) and replication. For
individual rare cards (e.g. Wisp), low exposure means no balance conclusion.
