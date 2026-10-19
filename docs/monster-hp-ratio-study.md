# Rogue Cards — lower ordinary Monster HP, before adding mechanics

## Motivation

Explore a simpler alternative to universal retreat/mercy/negotiation
systems: make **every ordinary Monster** faster to beat while preserving
its printed combat behavior, ATK/DEF, loot and current parley rules.

This is a **staging-only** HP experiment. No canonical or printable
Monster cards are edited, and neither Warden phase is altered.

## Exact treatment

For each regional Monster with original integer HP `h`:

- `monster-hp-half`: `max(1, ceil(h * 1/2))`
- `monster-hp-two-thirds`: `max(1, ceil(h * 2/3))`
- `monster-hp-three-quarters`: `max(1, ceil(h * 3/4))`

Always round UP to keep cards playable with integer HP. Low-HP Monsters
may share the same HP between conditions, which should be reflected
in the per-card analysis. Example: canonical 5 HP -> 3, 4, 4;
canonical 9 HP -> 5, 6, 7.

The canonical Warden 20 HP and Warden Fury 10 HP, Hero stats, Monster
ATK/DEF/copies, Monster moves, Room and Item rewards remain unchanged.

## What we test at once — 3x3 design

Each HP fraction is crossed with three **existing** encounter contexts:

| Encounter context | Meaning | Purpose |
|---|---|---|
| canonical | Original Room draws/Monster probabilities | **Primary isolated causal HP comparison** |
| mild | Existing `encounter-mild` Room-effect intervention, no new mechanics | Check whether shorter fights support some extra encounters |
| strong | Existing `encounter-strong` Room-effect intervention | Check whether even much faster combat can support high frequency |

Nine treatments plus shared canonical control. All experiments use
existing physical-card Room effects, the **same frozen MCTS agent**,
and the ordinary Monster combat engine. There are **no** new global
mechanics, trackers, new dice or rulebooks in these alternatives.

The independent holdout first includes all three isolated HP treatments,
**even if an encounter-interaction arm gets a better exploratory score**.
The remaining three holdout slots are assigned by predefined
screening-rank order among the other six arms.

## What we will learn

- Whether 1/2, 2/3 or 3/4 HP can increase solo win rate toward 40%
  **without** reducing the Vault reach or changing Monster identity.
- How faster battles affect damage taken, number of combat responses,
  kill/negotiation ratio, equipment and Item use, and uneven Hero strength.
- Whether combined HP reduction plus mild/strong encounters approaches
  16–20 Monsters / 36 Rooms with about 55–70% of them resulting in combat,
  without collapsing the survival curve.
- How much of each change is a true improvement versus merely
  reducing number of Monster decisions; confirm pairwise effects on
  different start seeds and per-Hero breakdown.

The time a human takes to roll, decide and operate a real card still needs
physical playtesting. MCTS compute milliseconds are not tabletop minutes.

## Execute in a **new** local results directory

After finishing or stopping other studies in their own checkout:

```bash
cd ~/Projects/rogue_cards
git pull --ff-only
npm run test:balance:hp-ratios
npm run test:balance:hypotheses

npm run study:balance:hypotheses -- \
  --suite hp-ratios \
  --workers 8 --minutes 720 \
  --seed 20270301 \
  --screen-repeats 12 --confirm-repeats 24 \
  --finalists 6 \
  --out results/monster-hp-ratios-v1
```

- Screening: **10 arms** (9 treatments + canonical) x 8 Heroes x 12
  different start seeds = **960 full expeditions**.
- Confirmation: **7 arms** (6 selected treatments + canonical) x
  8 Heroes x 24 *independent* start seeds = **1,344** more.
- **2,304** planned full expeditions. Screening is exploratory,
  confirmation uses disjoint paired Hero/seed starts.

The first three holdout slots are reserved for `monster-hp-half`,
`monster-hp-two-thirds`, and `monster-hp-three-quarters`.

All results remain under `results/monster-hp-ratios-v1` with
`manifest.json`, `trials.ndjson`, `summary.json` and
`comparison.md`. A `SIGINT` or wall-clock stop writes a partial
report; run the exact same command under the **exact same git revision**
to resume. Never reuse the prior mechanical-prototypes result directory
or combine run files from different git revisions.

## Decision gates

- If one pure ratio moves overall wins toward 40% while maintaining
  reasonable Vault reach and no large Hero regressions, consider
  **printing only revised Monster HP**, no new rules.
- If only HP+encounter combinations work, test those physically
  before adopting rewritten Room outcomes.
- If faster fights improve survival but do not help Monster encounter
  frequency, report that candidly: **Monster HP alone cannot create
  more Monster draws**. Then deliberately decide whether the 16–20
  encounter target really matters, rather than adding systems by default.

No staged card change is automatically promoted to canonical.
