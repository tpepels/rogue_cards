# Rogue Cards: optimized MCTS versus agent strength

This branch contains **two separate changes** that must not be conflated.

## 1. Canonical search implementation

`searchDecision(..., {treeMode:"full"})` is the historical MCTS behavior,
and remains the default for existing Oracle balance studies and migration.

`searchDecision(..., {treeMode:"frontier"})` is conventional UCT tree
selection + expansion + default rollout. On encountering the first unvisited
tree edge in a trial, the remainder is executed through the **same canonical
sessionActions/submitDecision engine** with actual printed dice, Monsters,
Items, Rooms, and nested reactions. It skips tree-node construction and
public-state hashing for that rollout tail. On later trials, visited edges
grow the tree farther down the game. This is MCTS, not a simplified game
simulator and not a root-only random rollout.

The experimental path also:
- Avoids extra copies of freshly allocated fair-information deck samples.
- Avoids copying and discarding display-only action histories.
- Handles combat PASS through a reversible canonical transaction (no dice
  or nested rules trigger).

For low budgets at which all selected root actions are first visits, the
full-tree and frontier modes must return identical sampled canonical results
(aside from tree-node counts). At higher budgets their selected actions can
differ because frontier MCTS uses a different tree-expansion policy.

## 2. Stronger policy experiment (not established superiority)

`selectSessionPolicyAction(..., {searchProfile:"classic"})` is unchanged
by default.

`searchProfile:"deep-uct"` explicitly enables the frontier tree and
allocates enough simulations to revisit alternatives:
`max(requested budget, deepMinBudget, legalActions.length * deepVisitsPerAction)`.
Defaults are 16 simulations minimum and 4 per legal root action.

A larger budget does **not** establish that the policy is stronger; it is
primarily more expensive, and the frontier exploration could be worse than
the baseline. The new independent-seed agent study compares actual terminal
wins (not heuristic proxy scores) on the same initial seed, printed decks
and Hero party. Paired results yield a two-sided exact McNemar p-value and
an approximate paired 95% interval.

The candidate costs more computation by default. For an equal-budget
frontier-vs-classic comparison, set `--baseline-budget 16
--candidate-min-budget 16 --candidate-visits-per-action 1`
(the candidate's allocation is then the same for <=16 legal root actions).

## Test locally

```bash
npm run test:session
npm run validate:deck
npm run bench:mcts-frontier -- --budget 2 --samples 5
npm run bench:mcts-frontier -- --budget 16 --samples 5
```

At budget 2 a typical two-action root sees much less tree allocation; at
budget 16 the algorithms may diverge in choices, so the benchmark reports
runtime and tree-node count but never falsely claims identical outcomes.
Run without other CPU-intensive jobs.

## Actual independent-seed agent-strength trial

The new experiment is intentionally **separate** from the 7,200-source
Room-balance study, with its own revision-bound manifest and checkpoints.

```bash
npm run audit:canonical -- --runs 36 --seed 20261014 --max-steps 3000 --out results/canonical-audit-agent-strength
npm run oracle:agent-strength -- --runs 360 --seed 20261014 --workers 7 --hours 10 --baseline-budget 2 --candidate-min-budget 16 --candidate-visits-per-action 4 --audit results/canonical-audit-agent-strength/summary.json --out results/mcts-agent-strength-01
```

Resume the *same* pinned revision and settings with `--resume`:

```bash
npm run oracle:agent-strength -- --resume --runs 360 --seed 20261014 --workers 7 --hours 10 --baseline-budget 2 --candidate-min-budget 16 --candidate-visits-per-action 4 --audit results/canonical-audit-agent-strength/summary.json --out results/mcts-agent-strength-01
```

Each source is one genuine pair of complete expeditions. Both agents use
fair-information MCTS with identical initial seeded setups, but later
decision paths can diverge, as a policy evaluation should allow.

The summary includes win difference, discordant-pair counts, exact
McNemar p, number of independent pairs, and requested rollout counts.
A minimum of 100 pairs is a reporting gate, **not** a guarantee of
sufficient statistical power. Non-significant is inconclusive, not
proof of equal strength.

Never combine the new strength experiment with old Room-balance
checkpoints or use this experimental branch to resume those old manifests.
The classic mode is preserved for reproducibility; older checkpoint
migration must perform its own complete per-seed replay verification.
