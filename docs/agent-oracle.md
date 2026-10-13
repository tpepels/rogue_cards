# Rogue Cards - fair-information agent and deck Oracle

The research agent is connected to the real full-effect expedition simulator.
It chooses legal Rooms, combat Items, PARLEY and SEAL actions. It does not
change printed cards, combat rules, damage, dice or any other tabletop rules.

This is **a heuristic optimization framework**, not an exact solution to
Rogue Cards or a measurement of expert human play.

## Four experimental arms

- **A: Existing cautious planner.** Current rules and ordinary information.
- **B: Optimized fair-information agent.** Trained weights; sees public
  state, inventory, current Room/Monster and counts of remaining cards.
  It cannot see hidden cards' identities or order.
- **D: Oracle with the fair agent's weights.** Exactly the SAME tuned
  weights and sampling budget as B, but also knows the complete order of
  the remaining Item, Monster and Room decks. **D minus B isolates the
  contribution of deck visibility at fixed heuristic settings.**
- **C: Optimized Oracle.** Deck visibility as in D, but independently
  optimized weights. **C minus D estimates the additional contribution of
  re-tuning the heuristic to use perfect card information.**

For all four, the underlying game runs original dice. Neither agent can
read the simulator's random number generator, actual future rolls or RNG
state. Hypothetical d6 outcomes are drawn by an *independent sampler*;
they cannot consume the real expedition's future dice.

### Planning and optimization

The adjustable decision parameters control survival, damage, resource
preservation, Item draw value, spell value, PARLEY preferences, the
combat attack-versus-Item margin, Room lookahead and SEAL threshold.

The Room planner performs bounded chance-sampled lookahead with a
configurable sample count. It evaluates printed room roll bands and
approximate subsequent Room hazards. Under fair information, future
card identities are sampled from public catalogue priors. The Oracle
uses the real *remaining* deck order. Combat uses typed expected
values of printed Item results, not foresight of dice.

**Important limitation:** This is not cloned, full-expedition
Monte Carlo tree search and the resulting Oracle is not an exact
optimal-policy upper bound. The agent remains a tunable approximation.

### Train / validate / holdout

The optimizer trains separate fair and oracle candidates on training
seeds. It selects among the highest training performers on a disjoint
validation seed set. Finally, the selected parameters are **frozen**
and compared with the cautious baseline and fixed-weight oracle control
using a third, independent, held-out set.

The objective combines 85% overall success with 15% success for solo
non-Knight Heroes. Knight is intentionally a stronger beginner class:
**no part of the optimizer penalizes the Knight for winning more.**

The held-out evaluation uses the same *starting seed* for each agent,
Hero combination and strategy. It reports matched discordant outcomes,
paired differences and approximate 95% intervals. Later dice may
diverge after different choices.

## Run on your laptop

Requires Node 22 or newer. From the checked-out repository:

~~~sh
git pull --ff-only
npm test
npm run agent:study -- --preset smoke --dry-run
~~~

Run the **smoke study** first (6,336 expeditions across all
training, validation and holdout phases):

~~~sh
npm run agent:study -- --preset smoke \
  --out results/agent-smoke-01
~~~

The **standard study** uses 1,065,600 expeditions:
16 parameter candidates, two optimization rounds, four training
seed batches, four validation seed batches, and six separate
held-out batches. All 8 solo Heroes and 28 two-Hero pairs appear
in each evaluated policy, for magic and treasure strategies.

~~~sh
npm run agent:study -- --preset standard --workers 8 \
  --out results/agent-standard-01
~~~

The **deep study** uses 11,232,000 expeditions across optimization
and evaluation, 40 candidates and 3 rounds, with a larger
hypothetical chance-sampling budget. Inspect before running:

~~~sh
npm run agent:study -- --preset deep --workers 8 --dry-run
npm run agent:study -- --preset deep --workers 8 \
  --out results/agent-deep-01
~~~

## Repeat with fresh, independent seed groups

~~~sh
npm run agent:study -- \
  --train-seeds 101001,101002,101003 \
  --validation-seeds 202001,202002,202003 \
  --test-seeds 303001,303002,303003,303004 \
  --candidates 20 --rounds 2 --finalists 4 \
  --train-runs 50 --validation-runs 150 --test-runs 500 \
  --budget 12 --workers 8 \
  --out results/agent-replication-02
~~~

The three seed lists must be nonempty and disjoint. The validator
rejects overlapping seed groups, invalid parameters, over-large
workloads and existing output directories.

Experiment with budget 0 (no sampled Room lookahead), 4, 8, 16 or 32
to see whether increasing stochastic lookahead consistently improves
decisions. Never tune directly to held-out results and then cite
them as an unbiased final evaluation.

## Output files

- `manifest.json` - Git revision, Node version, all seed splits,
  parameter search scope and chance-sampling budget.
- `candidates.json` - all training and validation parameter searches.
- `holdout.json` - complete A/B/C/D held-out results, per-Hero outcomes,
  Item and decision telemetry, and packed seed-level binary wins.
- `summary.md` - readable paired comparisons and selected weights.
- `validation.json` - validation checks and limitations.

Local datasets under `results/` are ignored by Git.

To share the finished standard run:

~~~sh
tar -czf agent-standard-01.tar.gz -C results agent-standard-01
~~~

Upload that archive for analysis.

## Interpretation

A meaningful advantage for B over A suggests the current heuristics are
leaving performance on the table. A D-over-B advantage indicates that
future **deck knowledge** helps, at fixed heuristic parameters.
A C-over-D advantage indicates that re-tuning helps the Oracle use it.

The strength of particular Heroes or Items should be judged under more
than one policy and on independent seeds. This agent is not a human;
its predictions may be confidently wrong if the heuristic game model
is wrong. More simulations narrow sampling noise but do not solve that.

No Hero or Item is automatically rebalanced by any of these experiments.
