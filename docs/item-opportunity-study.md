# Rogue Cards - Item accessibility and controlled-use study

**Purpose:** distinguish unavailable Items, Item actions the scripted player ignores,
and genuinely unhelpful printed effects. This is a policy evaluation, not a
human-playtest balance certificate.

## Timing and execution

The [Item timing audit](../src/item-access.js) classifies all printed Objects
by actual trigger phase. A legal combat action is different from an automatic
reaction, passive equipment bonus, outside-combat scouting action, Room choice,
and post-roll intervention. The planner now considers printed combat ACTIONs,
situational Pitch Torch/Lantern Heart actions, eligible Potions/recovery tools,
and upright attack-Wand OVERCHARGE. Reactive Items are triggered at their
appropriate die rolls, attacks, Monster hits and status changes instead of
being presented as generic combat actions.

Several previously identified correctness gaps were closed:

- **Hungry Ring** now records an eligible opportunity when MAGIC triggers it.
- **Ring of Echoes** must actually respect its printed ONCE PER ROOM limit.
- **Coffin Moth** is no longer treated as emergency healing without POISONED.
- **Wand of Undoing**, **Wand of Almost Doors**, and **Wand of Bad Trades**
  cannot be overcharged as generic attack actions against Monsters.
- **Crown of Rehearsals** direct rescues and **Knotted Rope** Room overrides
  now generate direct-use records, rather than remaining invisible to metrics.
- Passive weapon/armour applications are recorded separately from dice actions.

## Per-Object measurements

The research output includes an entry for **every Object ID**, including
equipment that needs no separate activation:

- **Draws** - actual Object-deck draws, including each Hero's random starting draw.
  These are separate from starting gear and other acquisitions.
- **Acquisitions** - additions to Hero inventory, including starting equipment.
- **Opportunities by phase and mode** - legally available triggers
  (scouting, combat, Room choice, defence, after a d20, after MAGIC, and so on).
  These count opportunities on different turns, not unique owned copies.
- **Activated/used by mode** - actual rolled actions, printed triggers, and direct
  spends. Passive benefits have their own counters.
- **Observed results** - Monster damage, HP healed, self-damage, Items drawn,
  Item costs, skipped Monster responses, cures, Wand recharges, scouting.
  These are effects observed in the actual simulated state, not predicted values.
- **Passive equipment applications** - actual ATK/DEF modifiers and WIT
  disadvantages applied while resolving a roll. Their counts should not be
  compared directly to action counts.

Some combined effects are counted within both a parent action and a
nested triggered Item; raw outcome totals should not be summed across
Items to reconstruct total expedition damage.

## Policies in the controlled comparison

All variants use the *same printed Item/Room/Monster effects* and actual
card costs. They have independent initial seed sequences per Hero party
and playstyle, matched across variants within that cohort:

1. **Scripted** - the previous fixed Item-preference policy.
2. **Normal** - full cautious planner with dynamic, context-dependent future
   reservation (rooms remaining, plausible SEAL requirements, available gear,
   supply and current danger).
3. **Zero-reservation** - the same planner with future Item value omitted.
   Items **are not free**: cards are still discarded, Wands exhausted,
   HP costs paid and other printed effects observed.
4. **Forced-legal** - always choose the best *legally available* combat Item
   action whenever at least one is available, even where ordinary attack
   has higher expected value. Reactive and passive benefits still apply normally.

A low forced-use win rate is not proof that the printed Items are weak;
the forced policy is deliberately imprudent. A high count of legally available
but unchosen actions can justify investigating the planner score, not
automatically rewriting Item text.

## Verified independent-seed results

### All-Item policy comparison

The [final 72,000-expedition holdout](https://github.com/tpepels/rogue_cards/actions/runs/38372942069)
ran at commit `d58fed55e93c77375774b0880bbb1a84ac726b66`,
seed `90827431`. It completed with **zero unresolved effects and zero stalls**.

| Policy | Overall win rate |
|---|---:|
| Original scripted Item handling | 60.56% |
| Full cautious planner with contextual reserve | **73.11%** |
| Identical planner without future-reservation penalty | 72.93% |
| Force the best legal Item action whenever available | 69.80% |

Removing future reservation barely changes wins on this holdout.
Forcing all Items lowers wins compared with the normal planner. Neither
result establishes intrinsic Item weakness: indiscriminate timing is poor
even when every printed effect works correctly.

Across 18,000 expeditions under the normal planner, the telemetry recorded
**105,308 direct activations** and **114,443 actual passive equipment
applications**. All 52 Object IDs have reviewed timing categories, and no
Object was drawn without a recorded legal opportunity in this cohort.

For illustration, Ring of Echoes had 5,894 opportunities and 5,894 uses
after the once-per-Room fix. Hungry Ring had 1,714 after-MAGIC opportunities
and 1,714 rolled uses. Ashwood Staff had no separate activation, as printed,
but its attack modifier was applied **27,505 times**. This distinction
explains why simply dividing combat-action choices by all turns is misleading.

### Force one specific Item, not all Items

The [targeted 165,600-expedition holdout](https://github.com/tpepels/rogue_cards/actions/runs/38373503104)
ran at commit `e4c8b547e54492d84d2a6d481c969f7f8b022e42`,
seed `10983427`. It tested 22 Items that have selectable combat actions.
For each trial, **only the named Item** was forced at legal opportunities;
the other Items and decisions retained their normal policy. There were
no unresolved effects and no stalls.

| Item forced when legal | Win-rate difference from normal | Approx. paired 95% CI | Expeditions with forced action |
|---|---:|---:|---:|
| Milky Potion | -0.85 pp | -1.36 to -0.33 | 1,234 |
| Smoky Potion | -0.81 pp | -1.33 to -0.28 | 1,330 |
| Antidote | -0.58 pp | -1.15 to -0.01 | 1,385 |
| Scroll of Misprint | -0.56 pp | -1.07 to -0.04 | 1,284 |
| Spore Jar | -0.56 pp | -1.02 to -0.09 | 1,000 |
| Amber Potion | -0.56 pp | -1.06 to -0.05 | 1,246 |
| Wand of Cold Shoulders | -0.36 pp | -0.78 to +0.06 | 804 |
| Wand of Questionable Shapes | +0.00 pp | -0.38 to +0.38 | 764 |
| Scroll of Hush | +0.21 pp | -0.25 to +0.66 | 1,221 |
| Lantern Heart | +0.26 pp | -0.00 to +0.53 | 678 |

The largest harms come from forcing situational Potions and volatile
effects at *every* legal combat opportunity; this is evidence of poor forced
timing rather than defective cards. Wands that were rarely selected in normal
play show **inconclusive** forced-use results, not proof they are weak.
Intervals are unadjusted across 22 candidate comparisons, so no individual
printed card is recommended for balance changes from these estimates alone.

## Reproduction

```sh
npm test
npm run --silent study:items -- 250 --all --seed 90827431 > item-trials.json
npm run --silent study:items:report -- item-trials.json > item-trials.md
npm run --silent study:items:targets -- 100 --all --seed 10983427 > item-targets.json
npm run --silent study:items:targets:report -- item-targets.json > item-targets.md
```

The automated [Item opportunity and value study](../.github/workflows/item-opportunity-study.yml)
runs the full 72,000-expedition comparison (8 solo Heroes, 28 distinct
two-Hero parties, 2 strategies, 250 starting seeds, 4 policies),
validates unresolved/stall counts, and uploads the full JSON and Markdown.

### Limitations

- This is not a comparison of real human play, especially for the chance-based
  use of unknown Potions, equipment decisions, and emergency actions.
- An Item can be drawn and retained without a legal trigger in the selected
  Rooms. An unused Item is not the same as a mechanically unusable Item.
- Passive protection and long-term scouting value cannot be reduced to
  direct Item activation effects.
- Once policies diverge, their later die rolls and deck consumption diverge
  even when the initial seed matches.
- Dynamic future resource value and response risk are approximate,
  deliberately kept transparent and reproducible rather than claiming
  exhaustive optimal play.
- New trigger correctness fixes can change simulated baseline results.
  Do not mix older ablation estimates with post-fix win rates.
