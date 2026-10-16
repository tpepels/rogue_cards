# Everything Goes - frozen numerical balance targets (v1.0.0)

**Prepared:** 16 October 2026, *before* the planned 7,920-game study.
**Mode:** twelve non-Corridor Rooms per UPPER/MIDDLE/DEEP region (36 total),
with optional Corridors, depth skips, two-Hero parties and the Vault.
**Sources:** the player's answers to ten explicit design questions.
The user's choices define the ideals and intended experiences; the broader
acceptable/action bands and evidence gates are analytical proposals, not
claims of player endorsement.

**Machine-readable and revision-controlled source of truth:**
[`config/everything-goes-targets.v1.json`](../config/everything-goes-targets.v1.json).
The study includes a SHA-256 of this exact file in its design and manifest.
A changed target file means a different analysis specification: a resumed
batch cannot silently inherit it.

## The ten preregistered questions

| Question | Primary outcome | Ideal | Acceptable range | Strong intervention concern |
| --- | --- | --- | --- | --- |
| 1 | Solo physical playtime | 105 minutes | 90-120 | Outside 90-120 |
| 1 | Two-Hero physical playtime | 135 minutes | 120-150 | Outside 120-150 |
| 2 | Solo win rate | 40% | 30-50% | Below 25% or above 55% |
| 2 | Two-Hero win rate | 55% | 45-65% | Below 40% or above 70% |
| 3 | Enter the Vault | 50% of runs | 40-60% | Below 35% or above 65% |
| 4 | Ordinary Monster encounters across **all 36 visited normal Rooms** | 18 | 16-20 | Fewer than 13 or more than 23 |
| 5 | Encounters that become ordinary Monster fights | 62.5% | 55-70% | Below 45% or above 80% |
| 6 | HP lost *per ordinary fight* as fraction of total starting maximum party HP | 15% | 10-20% | Below 6% or above 25% |
| 7 | New Item acquisitions per 12 non-Corridor Rooms | **Not selected** | **Not selected** | **No threshold until confirmed** |
| 8 | Actual dice-manipulation / chaotic Item activations | 1 per 5 normal Rooms | 1 per 4-6 | Less than 1 per 8 or more than 1 per 3 |
| 9 | Difference in solo win rate between strongest and weakest of eight Heroes | Prefer less than 15 pp | At most 25 pp | Above 35 pp |
| 10 | Room choices have two distinct executable printed outcomes | 100% of applicable option branches tested | 100% | A missing or invalid effect must be repaired |

**Question 7 was left blank.** The provisional 5-7 Items per 12 Rooms
sometimes discussed as a design suggestion is **not** a committed objective.
Acquisitions, Item draws, discarded/reacquired cards, initial gear, skipped
depths and survival bias must still be measured; none earns a green/red
status until a user-selected quantitative target exists.

**Question 10 does not require a 50/50 choice split.** A one-sided choice may
be intentional risk versus reward. What matters is that both printed
branches can be selected when legal, execute their effects and give players
a meaningful trade-off. A deterministic focused action test is the
correct evidence; no amount of sampling can prove correctness by itself.

## Exactly what goes into each denominator

1. **Win rates:** successful finishes divided by *all* completed organic
   sessions, including death and escape, split by exactly one vs exactly two
   Heroes. The randomly selected Item intervention runs are excluded.
2. **Vault reach:** the engine's actual `metrics.vaultEntered` divided by
   all completed organic sessions - NOT only Vault survivors and NOT just
   `cleared===36`.
3. **Encounter count:** each regional Monster encounter, including queued
   Monsters, within an organic run that *really visited all 36 normal
   regional Rooms*. A trapdoor that skips a depth does not qualify as a
   complete 36-Room traversal. Partial paths are retained separately for
   per-Room exposure estimates; early death is not missing data.
4. **Combat conversion:** regional Monster fight starts / regional Monster
   encounters; the boss is excluded. Both count physical encounter/fight
   transitions, not Hero turns or repetitions of the same Monster's d6.
5. **Fight difficulty:** damage recorded while a regional Monster is active,
   relative to maximum party HP and fight starts. This **includes Item
   backfires during combat** and thus is explicitly *combat-context* HP
   loss, not pure attack damage. The raw decision log allows separate
   attribution studies. Noncombat Room/trap damage is excluded.
6. **Loot:** acquisitions after initial Hero equipment and intervention
   gifts divided by regional normal Room entries / 12, *including any
   reacquisitions*. Item copies are tracked separately in raw events.
7. **Chaos frequency:** total activated instances of Loaded Coin, Crooked
   Die, Lucky Thread, Jinx Powder, Bent Mirror, Hooked Chain, Trick Knife,
   Chaos Idol, Witchbones, Bone Dice and Red String divided by normal
   regional Room entries. Their *legal trigger opportunities* are recorded
   separately. This is an explicit 11-card definition; other strange
   cards remain in the per-card report but are not silently added to the
   target numerator.
8. **Hero fairness:** eight individual solo-Hero win rates; max minus min
   in absolute percentage points. Report the eight rates and sample
   sizes, not just a pooled average.

## Evidence, uncertainty and decisions

All numeric verdicts use **two information layers**: the point estimate and
95% uncertainty interval. Proportion intervals use Wilson's method; per
Room frequencies use bootstrap resampling of *whole independent games*;
Hero fairness bootstrap resamples within each Hero; other means use
run-level CIs. The CI is not a promise that the threshold is correct.

An observed estimate inside the acceptable band is **not automatically
green** if its confidence interval crosses the band. Conversely,
`INTERVENE` requires its entire CI outside the more generous action
boundary. An estimate outside the acceptable band with an overlapping CI
is `REVIEW`; insufficient independent samples are
`INSUFFICIENT_EXPOSURE`. A report from incomplete runs is explicitly
`PRELIMINARY`.

Minimum evidence to *judge*, not guaranteed outcomes:

- At least **400 organic solo runs** for pooled solo win rate and at least
  **400 organic duo runs** for pooled duo win rate.
- At least **600 completed organic runs** for Vault reach.
- At least **60 fully traversed 36-normal-Room runs** for the full-run
  encounter count; otherwise label the specific target unmeasured even if
  thousands of shorter runs exist.
- At least **300 actual encounter opportunities** and **100 runs** for
  fight conversion; similarly 300 fights and 100 runs with fights for
  fight HP impact.
- At least **1,000 visited normal Rooms** across **200 runs** for the chaos
  activation frequency.
- At least **80 complete runs per solo Hero** before judging the maximum
  win-rate gap. With only ~100 each, a spread of 25 pp may still be
  statistically uncertain; the report must not overstate certainty.
- At least **12 physically timed sessions per solo/duo category** for
  physical duration. CPU walltime is not playtime, and physical duration
  remains `NOT_MEASURED_IN_SIMULATION` until actually timed.

## Item and whole-card usability - a separate release gate

The catalogue has **193 card designs**: **79 Rooms, 24 regional Monsters,
79 Items and 11 fixed cards** (Heroes, Vault and bosses). The Item
report covers all 79 cards even if a card was never drawn.

For every Item the experiment records **drawn, acquired, held across Rooms,
equipped exposure, legal trigger opportunities, actual uses, passive
effect triggers, printed-effect outcomes and Item-specific search choices**.
These different observations answer different questions:

| Observation | Interpretation | Required response |
| --- | --- | --- |
| Never acquired | Insufficient random reachability evidence; could be rare | Run focused acquisition/draw test |
| Acquired, no opportunity | Trigger could be rare or impossible | Construct trigger deterministically |
| At least 30 legal offers, no use | Possible policy preference or weak/broken effect | Compare offered choices and test actual activation |
| Equipped across at least 30 Rooms, no passive trigger | Possible mechanics bug or irrelevant matchup | Construct a matching combat/WIT scenario |
| Used and effect recorded | Reachability evidence in observed gameplay | Inspect size and consequences of effect |
| Printed but no deterministic test | **Not verified executable**, even if seen once | Create a focused execution test |

For evaluating a card's actual use rate, require at least **30 eligible
trigger opportunities**, not 30 draws or 30 owned Rooms. For general
acquisition coverage, flag Items with fewer than **30 acquisitions**.
For passive equipment, check at least **30 equipped Room exposures**.
Every new odd Item has **120 paired interventions** planned, but this does
not guarantee 30 eligible triggers; any shortfall requires a targeted test,
not a claim that the Item is useless.

**Red String requires two Heroes.** Its matched intervention therefore
uses a two-Hero party rather than the solo groups used for the other
17 new Items; otherwise 120 perfect pairs would never permit its action.
Item comparisons against one extra Dry Rations card are experimental
*starting-resource interventions*, not estimates of a card's abstract
strength in every possible deck.

Likewise, for all 79 Rooms, each printed outcome needs a focused executable
test (not a popularity target); for all 24 regional Monsters, printed
behaviour/parley/remains/DEFEAT interactions need focused checks.
Zero observed triggers does **not** establish impossibility.
The audit is intentionally capable of saying `FOCUSED_TEST_REQUIRED`
when the available experiments cannot make that distinction.

## Deliverables added to the large experiment

`targets.json` - point estimate, confidence interval, denominator and
status for all ten questions plus physical-time placeholders.

`targets.md` - one glance target-vs-result table with `ON_TARGET`,
`REVIEW`, `UNCERTAIN`, `INTERVENE` or
`INSUFFICIENT_EXPOSURE`, including the open Item-acquisition target.

`item-audit.json` and `item-audit.csv` - every Item's acquisition,
availability, use and focused-test status; lists of underexposed Rooms and
Monsters, weakly tested odd Items and unreachable-looking situations.

The existing `summary.md`, `summary.json`, `card-coverage.csv`,
`runs.csv`, `paired-item-effects.csv` and per-decision gzip tapes remain.
The results report cites the SHA of the target definitions; retrospective
changes to the targets must be versioned and cannot be disguised as
pre-registered decisions.

## Interpretation priority

1. Broken rules, impossible items and incomplete metric reconciliation
   precede all balance tweaks.
2. Assess win rate, Vault access, full-run encounters, fight rate and HP
   difficulty before tuning individual rewards.
3. Assess unusual Item frequency *and* whether those Items have chances
   to work; tweak draw frequencies separately from activation value.
4. Assess eight solo Heroes and 28 two-Hero parties without masking
   diversity through pooled averages.
5. Tackle underexposed cards with focused exercises, not with a second
   unplanned general-run study.
6. Only after those checks, adjust Item supply and physical playtime
   against their own chosen/independently measured targets.
