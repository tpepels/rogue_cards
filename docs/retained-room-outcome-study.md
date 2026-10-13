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

Default work: **75,100 complete expeditions** (estimate before running).
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
each of 70 configurations (17,500 expeditions). It counts:
- Rooms encountered and the two Room options available/selected.
- Actual resolved Room and Object d6 bands, not just the card being drawn.
- Kept Room placements, alternate ending gates, and ending kinds.
- Items acquired, available legal triggers, direct use and passive benefit.
- Trapdoor destinations, rerolls and ELBERETH usage.

Full JSON records conditional win differences, approximate paired 95%
intervals, different ending / Vault arrival rates and example seeds.

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

Previous ordinary simulation produced no UNTHRONE endings, while dedicated
mechanics tests passed its two-Crown prerequisite. The distinction between
rare and unreachable must be maintained.

## Architecture

The new research interventions live in the policy-driven campaign runner.
The headless reusable engine has only additional d6 outcome-band counters;
it does not reference the experiment or any planner. Default calls to
`simulateFullExpedition` retain the same mechanics and decisions.
