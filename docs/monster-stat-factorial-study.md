# Rogue Cards — combined Monster HP × ATK study

The user prefers simpler changes to existing printed Monster cards before
introducing universal escape, morale, patrol or diplomacy subsystems. This
study treats Monster HP and ATK as **two independent factors** instead of
assuming that HP alone must solve difficulty and fight pacing.

## Full 4 × 3 × 3 design (36 cells)

| Factor | Levels | Exact rule |
|---|---|---|
| Regional Monster HP | original; 3/4; 2/3; 1/2 | `max(1, ceil(original HP × fraction))`; original is unchanged |
| Regional Monster ATK | original; −1; −2 | `max(0, original ATK − reduction)` |
| Monster encounter frequency | canonical; mild; strong | Original Room draws, or existing tested `encounter-mild` or `encounter-strong` Room effect patches |

**One cell is literally canonical**, with original HP, ATK and original
Room draw rates. The runner's shared canonical control supplies that cell;
the suite generates **35 changed arms**, for 36 treatments in total.

This gives proper controls for the pure ATK effect (original HP, ATK −1/−2),
the pure HP effect (lower HP, original ATK), and all six HP×ATK interactions
inside each of the three encounter contexts. Factor effects are not
estimated by comparing only combined changes to canonical.

All 24 ordinary regional Monster types get the treatment. **Warden Phase I
and Fury remain exactly unchanged**, as do Hero stats, Monster DEF, behavior,
copies, corpse/defeat rewards and all current global rules. Mild and strong
encounter arms use previously existing hypothetical Room effects; they do
not introduce patrol counters, negotiation, retreat or surrender mechanics.

### Example: integer math

| Original stat | At 3/4 HP | At 2/3 HP | At 1/2 HP |
|---|---:|---:|---:|
| 5 HP | 4 | 4 | 3 |
| 9 HP | 7 | 6 | 5 |
| 12 HP | 9 | 8 | 6 |

ATK 1 becomes 0 for either −1 or −2; ATK 2 becomes 1 or 0.
Some monsters therefore produce identical printed numbers under two
treatments. That is normal and explicitly tested, not a new mechanic.

## Results and causal comparisons

For every Hero and seed, the frozen MCTS agent plays the same seed in
each selected treatment. The study saves trial-level rows, original
canonical vs experimental paired deltas, per-Hero statistics, complete
36-Room observed encounters, fight conversion, damage and Vault outcomes.

A separate `factorial` object in both screening and confirmation reports
contains **each individual 4×3 cell** for every encounter context,
plus matched contrasts:

- HP-only effect: (lower HP, original ATK) − (original HP, original ATK)
- ATK-only effect: (original HP, ATK −1/−2) − (original HP, original ATK)
- HP×ATK interaction: **(both reduced − HP-only) − (ATK-only − original)**

The interaction contrasts match the *same Hero and replicate* across all
four cells, never compare unmatched or independently sampled arms.
Because choices diverge, identical seeds do not imply identical future
dice streams after the first divergence; they are a variance reduction,
not exact roll-by-roll counterfactuals.

The primary design criteria remain about **40% wins, 50% Vault reach,
16–20 encounters per 36 Rooms, and 55–70% of encounters becoming fights**.
Lower HP is expected to shorten combats, but alone cannot guarantee more
Monster draws; only the frequency arms test increased encounters.
Check all 8 Heroes and physical-table playtime before promoting cards.

The screening rank is exploratory and not a statistical decision rule.
Significance and practical adoption should use independent holdout
paired results with multiple-comparison caution.

## Full local run (8 cores)

**Do not pull while an earlier study is still running in this checkout.**
First stop or finish the previous HP-only or mechanical study; keep
their old output directories untouched. Then:

```bash
cd ~/Projects/rogue_cards
git pull --ff-only

npm run test:balance:stat-factorial
npm run test:balance:hp-ratios

npm run study:balance:hypotheses -- \
  --suite stat-factorial \
  --workers 8 --minutes 720 \
  --seed 20270401 \
  --screen-repeats 8 \
  --confirm-repeats 24 \
  --finalists 9 \
  --out results/monster-hp-atk-factorial-v1
```

Screening: **36 cells × 8 Heroes × 8 replicates = 2,304**
complete expeditions. Confirmation: **10 cells × 8 Heroes ×
24 new replicates = 1,920** complete expeditions.
**Total: 4,224** expeditions, with the frozen agent and one canonical
control per Hero/seed.

The nine validation treatments are chosen **only after the complete
screen**, preserving all five pure HP and ATK main-effect arms, and
at least one combined HP+ATK treatment in **each** of the canonical,
mild and strong encounter contexts. The ninth slot goes to the highest
remaining screening rank. Thus the holdout cannot inadvertently validate
only high-scoring variations of a single setting.

Study outcomes are stored in this new directory:
`manifest.json`, `trials.ndjson`, `summary.json`,
`comparison.md`. The manifest includes the exact source commit,
hypothesis hashes, frozen agent and seed plan. On SIGINT or the time
limit, completed individual trials stay saved; resume with exactly the
same command in the same **unchanged source revision**. It is not safe
to combine an earlier HP-only run with this larger factorial study.

## Promotion policy

First inspect whether 3/4 or 2/3 HP, alone or with ATK −1, gets us
close to the accessible win/Vault goals while preserving the identity
of dangerous Monsters. Distinguish increased victory due to HP from
increased survival due to ATK. Only then consider whether to modify
the encounter frequency, if the original ~6–7 per 36 Rooms remains too
low.

**No experiments change the canonical printable cards automatically.**
