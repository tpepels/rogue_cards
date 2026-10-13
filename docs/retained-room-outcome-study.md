# Retained Rooms, Items and path coverage - 13 October 2026

## Questions

1. Does a Room kept for a later effect actually change survival, Vault access, or the final ending?
2. Does the second choice offered by a returning Room make a difference?
3. Which printed Room choices, d6 bands, alternate victories, and Item triggers are absent or ignored in ordinary scripted expeditions?
4. Which Items appear over- or underpowered after conditioning on drawing them, having a legal opportunity, actually using them and their effect?

## Study

The reproducible runner is `scripts/study-retained-paths.mjs` and the
separate CI workflow is `.github/workflows/retained-paths.yml`.

```sh
npm test
npm run study:retained -- \
  --runs 200 --coverage-runs 250 --seed 20261013 \
  --out results/retained-paths
```

Default work: **92,600 complete expeditions**, independently verified by [GitHub Actions](https://github.com/tpepels/rogue_cards/actions/runs/38458231817) at commit `7073bd612c261696c13f5522294dca31797c0408`. All study checks passed.
The matched portion compares **27 retained-Room effects** across a solo
Wizard and a Warrior/Wizard pair, each using magic and treasure policies.
For each seed, the intervention keeps the initial printed choice, reward,
cost and initial dungeon state unchanged, then discards the specified saved
Room immediately after its placement. Only trials where the target was
actually kept count toward the conditional effect comparison.

A second matched portion compares **nine returning-Room choices**, including
the Ferryman's Oath SMUGGLE route, the Hollow Knight escape, Bottomless Well
item recovery versus healing, Garden alternatives, and deferred debt/bridge
choices. The intervention changes one second-choice instruction rather than
rewriting the printed Room.

Natural-policy coverage uses **all eight solo Heroes, six different
two-Hero pairs and five strategies**, independent seeds for 250 runs in
each of 70 configurations (17,500 expeditions for scripted choices and an additional 17,500 with random legal Room choices). It counts:
- Rooms encountered and the two Room options available/selected.
- Actual resolved Room and Object d6 bands, not just the card being drawn.
- Kept Room placements, alternate ending gates, and ending kinds.
- Items acquired, available legal triggers, direct use and passive benefit.
- Trapdoor destinations, rerolls and ELBERETH usage.

Full JSON records conditional win differences, approximate paired 95%
intervals, different ending / Vault arrival rates and example seeds.

## Verified findings (seed 20261013)

The 17,500 normal-policy expeditions won **63.34%**, reached the Vault
**94.39%**, and produced 219 BARGAIN, 3 UNTHRONE, and no SMUGGLE victories.
There were **28 legal Room options never selected**; none were mechanically
unavailable. The separate 17,500-expedition random-choice cohort reached
all **28 previously ignored choices**, resolved **61 of the 64** absent
Room d6 bands, and achieved **230 SMUGGLE** victories in 1,420 unlocked
SMUGGLE routes. Its win rate was 59.34%, versus 63.34% for the
scripted cohort. This is a comparison of choice policies, not a paired
causal estimate of the value of exploration.

Conditional retained-effect removal while deliberately pursuing
the relevant Vault resolution gave:

| Room | Conditional win difference from preserving the Room |
|---|---:|
| Gilded Hallway / SMUGGLE | +26.61 percentage points (124 cases) |
| Ferryman's Oath / SMUGGLE | +18.18 points (110 cases) |
| The Last Witness / BARGAIN | +16.78 points (143 cases) |
| The Unburied Seed | +8.15 points (135 cases) |
| Wax Bridge | +7.96 points (113 cases) |
| Bridge of Whispering Rope | +7.94 points (126 cases) |
| Shrine of the Second Name | +7.20 points (125 cases) |
| Forgotten Apothecary | +6.62 points (151 cases) |

Results remain exploratory and multiple comparisons were not
corrected. The experimental ablation counts only seeds in which the
target Room was actually kept; values are not average per-expedition
effects or guaranteed benefits of drawing the Room.

The Sleeping Crown produced **0.00 percentage points** additional wins
in 152 comparable kept-Room seeds even with UNTHRONE targeted.
This is not proof that its effect is irrelevant: the companion
Crown of the Unking is rare and the card may change other tactical
choices. The ability to reach UNTHRONE has been demonstrated.

### Dead printed d6 table: Gilded Hallway

The three d6 outcome bands still not observed by either policy are
**exactly** `d-gilded:0`, `d-gilded:1`, and `d-gilded:2`.
All 2,951 Gilded Hallway encounters in the random-legal cohort could
take either of its two printed options, but **neither printed option
calls the Room d6 table**. The special Room data currently still
defines its generic `path` table and the print validator requires
a d6 table on every non-fate Room. This is a genuine orphaned
printing/handler entry, not evidence of insufficient sampling.

Remove the unused Gilded Hallway d6 table only after deliberately
changing the validator's non-fate Room contract and adding a
regression test; do not invent an extra d6 roll in either option,
because that would change the established SMUGGLE route.

Several retained effects produced zero observed victory changes,
including Treasure That Sings, Clockwork Confessional, Leech Pool,
and The Puppet Judge, despite changes in some endings.
They require more appropriate conditional tests before redesign.

A separate current-version Item value screen is registered as
`npm run study:v4-item-value -- --runs 60 --seed 20261013`.
It compares moving an existing named Item copy into the Hero's
starting hand while preserving the remainder of the physical deck.

## Current audit limitations

**Never observed does not mean unreachable.** A card can be absent because
its prerequisite is extremely rare, or because the tested scripted policy
does not select it. The printed Vault paths require different prerequisites
and may require dedicated witness seeds.

**A changed ending is not necessarily a changed victory.** One variant may
die in a different room, or win by SMUGGLE rather than ordinary combat;
the report keeps both kinds of divergence separate.

**The Room-ablation intervention is intentional artificial play.** It measures
the incremental later value of a saved Room *after* paying its original
cost. It is not a legal game option or the total difference between the two
printed first choices. Once variants diverge, later random draws may differ.

**Item telemetry is not Item balance.** Opportunities are counted by
trigger phase. Direct-use and passive application are separate, and
repeated opportunities are not independent copies. A costly or volatile
Item with many uses may be weak. A reserved one-use Item may have zero
uses yet still affect decisions. The existing
[Item opportunity study](item-opportunity-study.md) and
[controlled extra-Item study](post-hp-study-findings.md)
should be read alongside the new coverage rather than reduced to a ranking.

**Multiple testing and sparse comparisons:** numerical estimates are
exploratory, with unadjusted intervals. Sampled policies are not human
or optimal play. No printed rules or Item statistics were changed for
this study.

## Pre-existing signals worth investigating

The 81,600-expedition V4 study found conditional win differences of
**-9.28 percentage points** for Last Witness SILENCE versus FREE and
**-7.69 points** for Drowned Banner BURN versus RAISE. This does not by
itself isolate the value of the saved effect.

The post-Hero-rebalance Item study recorded overall **72.6%** wins with
normal cautious Item selection and **69.4%** when an available combat Item
action was always forced. Forced use can be wasteful, so this is not
evidence that particular Items are underpowered.

Earlier ordinary simulation found no UNTHRONE victories, but the new
17,500-run normal-policy holdout obtained three. UNTHRONE is reachable
in ordinary expeditions, albeit rare.

## Architecture

The new research interventions live in the policy-driven campaign runner.
The headless reusable engine has only additional d6 outcome-band counters;
it does not reference the experiment or any planner. Default calls to
`simulateFullExpedition` retain the same mechanics and decisions.
