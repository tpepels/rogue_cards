# Local state-matched Oracle action comparisons

This tool compares choices at a single naturally reachable canonical decision.
Each root alternative starts from the same actual state, matched hidden-deck
sample, and future dice seed. All subsequent optional choices use the
canonical session MCTS, without a scripted continuation policy or a heuristic
victory proxy.

Each report includes:
- Per-action terminal wins and win-rate differences from the reference
- Discordant matched outcomes, exact two-sided McNemar p-values
- Holm-adjusted p-values within the current decision
- Approximate paired 95% confidence intervals
- Source commit, exact observation, and one checkpoint per complete matched seed

A single source state is **not** enough to declare a card balanced. Repeat
across naturally reached states with different initial seeds and Hero parties,
then adjust for multiple comparisons across all cards examined.

## Validate locally

No balance experiments need to run in GitHub Actions.

~~~bash
git pull --ff-only
npm run test:session
npm run validate:deck
~~~

## Small first experiment

~~~bash
npm run oracle:contrast -- \
  --seed 100 --heroes warrior \
  --trials 2 --knowledge fair \
  --navigate-budget 2 --future-budget 2 \
  --out results/contrast-smoke-100
~~~

The command navigates with session MCTS to the first Room offering at
least two legal choices. It then forks every alternative and follows it
to a real game ending. It explicitly fails if a printed decision is
unsupported or cannot reach a terminal state.

Inspect summary.md, summary.json, manifest.json, and checkpoints/.

## Focus on one Room

~~~bash
npm run oracle:contrast -- \
  --seed 315 --heroes warrior,wizard \
  --target-phase room --target-room m-ladder \
  --trials 200 --knowledge fair \
  --navigate-budget 4 --future-budget 4 \
  --out results/ladder-315
~~~

If seed 315 does not encounter Rope Ladder Junction naturally, it exits
with a clear not-reached error. The runner does not fabricate early access
to a card. Try another source seed to obtain a genuinely reachable decision.

If the run is interrupted, use the same command with --resume:

~~~bash
npm run oracle:contrast -- \
  --seed 315 --heroes warrior,wizard \
  --target-phase room --target-room m-ladder \
  --trials 200 --knowledge fair \
  --navigate-budget 4 --future-budget 4 \
  --out results/ladder-315 --resume
~~~

Do not pull different code or change the options before resuming. The
manifest verifies the commit, source observation, and all settings. Each
checkpoint represents one fully completed trial across every root action;
an interrupted partial trial is recomputed.

Other root phases include reaction:reroll where those legal actions are
visible. Multi-switch nested transaction replay remains unsupported in
the comparator and fails explicitly rather than leaking unrevealed dice.

## Return results

~~~bash
tar -czf contrast-smoke-100.tar.gz \
  -C results contrast-smoke-100
~~~

Upload the archive containing the manifest, checkpoints, summary.json and
summary.md. To judge a card across many contexts, collect independent
archives from different source game seeds and Hero parties.

## Interpretation and open correctness work

Matched alternatives control the starting game state and do not grant
additional starting Items. This fixes the main defect in the original Item
ownership intervention. However, these estimates are conditional on
the particular state and on the continuation MCTS budget. Different choices
can consume a shared dice stream in different places.

The paired normal confidence interval is not reliable for very small
samples. Holm correction within a single state does not control error
across many source states or cards.

The comparator is not an all-card experimental certificate. The canonical
controller still has synchronous printed-effect paths requiring stronger
coverage proofs; deeper nested reaction replay needs additional engineering.
Do not describe an unvisited or unsupported branch as balanced.
