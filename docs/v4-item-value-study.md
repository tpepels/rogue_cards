# V4 Item effectiveness audit - 13 October 2026

## Result and source

[Verified 57,240-expedition GitHub Actions run](https://github.com/tpepels/rogue_cards/actions/runs/38459112065) at commit `b868ae68b10914c9a7d8ab9fb01cd101a1bb5714`, seed `20261013`.
The study used **52 distinct existing Items**, six Hero parties, three ordinary strategies
(survival, magic, seal), and 60 starting seeds for each party/strategy/Item.
All source checks, mechanical regression tests and deck validation passed;
simulated expeditions did not stall or report unresolved effects.

The executable is `scripts/study-v4-item-value.mjs`:

```sh
npm test
npm run study:v4-item-value -- --runs 60 --seed 20261013 --out results/v4-item-value
```

The run performed 57,240 actual complete expeditions because the
1,080 normal baseline expeditions are memoized and compared separately
against each of 52 gifted-Item cohorts. The main JSON report also
records exclusions when the Item was not available in the deck.

## What the intervention measures

An Item's existing copy is moved from the shuffled Item deck to the first
Hero's inventory before exploration. All other rules and costs remain
unchanged. Matched seeds give a controlled estimate of the marginal
benefit or cost of **receiving that Item early**, conditional on a copy
being available. It is not an unconditional causal estimate of the
printed Item's inherent strength.

Item acquisition, trigger opportunities, actual uses, passive bonuses,
damage, endings and Vault arrival are recorded separately. Passive
equipment such as Ashwood Staff can be beneficial even if it has zero
explicit activations.

## Screening results

| Gifted Item | Victory difference | Approximate paired 95% interval |
|---|---:|---:|
| Notched Sword | +7.22 percentage points | +4.55 to +9.89 |
| Ashwood Staff | +6.30 | +3.88 to +8.72 |
| Hungry Ring | +4.99 | +1.85 to +8.12 |
| Warded Shield | +4.46 | +1.76 to +7.16 |
| Mirror Shard of Yesterday | +4.22 | +1.19 to +7.25 |
| Crown of Rehearsals | +3.88 | +1.04 to +6.71 |
| Spore Jar | -3.24 | -6.20 to -0.28 |
| Very Helpful Skull | -2.52 | -5.02 to -0.02 |
| Ring of Echoes | -2.08 | -5.60 to +1.44 |
| Wand of Cold Shoulders | -1.89 | -5.05 to +1.26 |
| Whispering Blade | -1.41 | -4.10 to +1.28 |
| Wand of Questionable Shapes | -1.31 | -4.60 to +1.97 |

Six Items have nominal paired intervals entirely above zero, two
entirely below zero. The 95% intervals are **not adjusted** for 52
comparisons. These are screening signals, not grounds to rebalance
specific cards automatically.

## Interpretation of unusually strong or weak cards

- **Early equipment appears reliably valuable.** Notched Sword and
  Ashwood Staff are the strongest gift effects. These effects are
  largely ongoing combat modifiers rather than one-time choices.
  A substantial gift effect might reflect persistent value over nine
  Rooms rather than imbalance in the normal item-draw distribution.
- **Spore Jar and Very Helpful Skull** have nominally negative early
  gift effects. That can result from poor scripted use, valuable
  alternative Items displaced in subsequent draws, Item costs, or
  genuinely unattractive printed outcomes. The effect must be
  reproduced under a more capable Item policy before changing text.
- **Zero activations are not zero benefit.** Ashwood Staff registers zero
  explicit activations but 6,865 passive applications in the gifted cohort.
  A frequently used Item may still reduce win probability.

## Next test before changing Items

For Spore Jar and Very Helpful Skull, compare a cautious Item planner,
normal selection, forced use when legal, and targeted **never-use**
decisions on the same starting seeds. Record actual opportunity-to-use,
net Monster responses skipped, damage/HP, and victory. A targeted
late-acquisition study is also needed: an Item gifted at expedition
start can look far stronger than one usually found near the Vault.

Use independent seed batches and multiple-comparison corrections before
making numerical balance claims. Do not mix these V4 results with the
older October 12 marginal Item rankings measured under previous Hero
and HP rules.

## Other study

See [retained Room, ending and path audit](retained-room-outcome-study.md)
for 92,600 expeditions testing Room persistence, alternative endings,
ignored choices and d6 path coverage.
