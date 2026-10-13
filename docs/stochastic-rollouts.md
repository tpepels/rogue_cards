# Full-effect stochastic rollouts (local laptop experiments)

The latest research agent can now **fork the actual expedition state at a
Room or combat decision**, try each legal action, and evaluate outcomes
using the existing printed-effect engine. A Room rollout runs real card
choices, d6 results, traps, Item draws and Monster fights. Combat forks
perform the selected attack/Item action and resolve actual Monster
responses, reactions and the remaining combat. With an extended horizon,
the fork continues to the Vault, including SEAL and Warden phases.

No Hero, Item, Room or Monster rules are changed.

## Fair vs Oracle vs true dice

**Fair** knows the current public game situation, starters and acquired
Items, previously entered Rooms, any publicly scouted Room identities,
and how many cards remain. Unknown future Item, Monster and Room piles
are **re-sampled from this public information** without looking at the
real hidden pile contents/order. This matters: merely shuffling the
true hidden deck would leak information about its unrevealed composition.

**Oracle** keeps the full real remaining hidden pile ordering.
Neither policy copies or sees the expedition's actual PRNG state or
future dice.

For each independent hypothetical scenario, **all alternative actions
get the same separately generated deck and dice seeds** (common random
numbers). This reduces noise in direct comparisons between attacking,
playing an Item, or picking another Room option.

All action effects and future rolls take place on isolated forks.
The original state and its dice stream are untouched.

## One important distinction: finite versus full horizon

With the default short horizon, incomplete forks are scored using
an explicit nonterminal estimate of party HP, Items, MAGIC, Monster
health and progress. An observed wipe scores zero; an actual victory
scores one. This is useful for cheap comparative decisions, but
is not an estimate from fully completed expeditions.

Set these parameters for **terminal full-expedition rollouts**:

- `--rollout-rooms 9` - current Room plus enough remaining Rooms to
  reach the Vault from any depth.
- `--combat-actions 600` - enough Hero actions to resolve any ordinary
  300-round combat (the existing engine limit).
- `--combat-room-depth 9` - after current combat, continue all
  remaining Rooms and the actual Vault.

This option returns sampled complete expedition win/loss outcomes
when the simulated party reaches the ending. It follows the existing
tuned **continuation** policy with stochastic dice, not exhaustive
search at every future decision. Inner rollouts have planning
budget zero to prevent recursive searches.

## 1. Validate locally before doing large studies

Requires Node 22 or later, from the repository root:

~~~sh
git pull --ff-only
npm test
npm run agent:budgets -- --runs 2 --seeds 71001 \
  --budgets 0,8 --parties solo --strategies magic \
  --workers 4 --out results/rollout-smoke-01
~~~

This performs a tiny end-to-end validation of the same search and
reporting components used by larger studies. No network or cloud
execution is required.

## 2. Run an affordable, checkpointed experiment

**The previous 100-runs × 3-seeds × 0/8/32/128 command was
excessively expensive.** It launched 194,400 actual expeditions,
and 7,257,600 hypothetical scenarios *per applicable decision
position* across the cohorts. Each scenario copies the state and
potentially runs several Rooms/Monster responses. The original
runner printed nothing until each 7,200-expedition Worker job had
completed, so the 32- and 128-sample arms could appear hung for hours.

That command is **deprecated and should not be restarted**.

The new runner is checkpointed, can resume, and reports active Workers.
Start with a smaller run:

~~~sh
npm run agent:budgets -- \
  --runs 5 --seeds 71001 \
  --budgets 0,8,16 --parties solo --strategies magic \
  --workers 4 --chunk-size 1 \
  --out results/rollout-pilot-v2
~~~

If that works, collect a moderate amount of useful data across
all 8 Heroes and 28 pairs:

~~~sh
npm run agent:budgets -- \
  --runs 25 --seeds 71001,72001,73001 \
  --budgets 0,8,16 --parties all \
  --strategies magic,treasure \
  --workers 4 --chunk-size 5 \
  --out results/rollout-standard-v2
~~~

A 32- or 128-sample arm should only be added after confirming
that the smaller budget consistently helps. Compare higher
budgets in separately scoped runs:

~~~sh
npm run agent:budgets -- \
  --runs 10 --seeds 71001 \
  --budgets 0,8,32,128 \
  --parties solo --strategies magic \
  --workers 4 --chunk-size 1 \
  --out results/rollout-highbudget-v2
~~~

Use `--dry-run` to see the scope. The runner prints a
**hypothetical scenario workload** as well as expedition count.
The estimate does not even include the number of actual Room and
combat decisions or the cost of the state copies, so it is not
a wall-clock runtime prediction.

### Progress and resume

Each complete chunk writes a separate atomic JSON checkpoint in
`results/<run>/checkpoints/`. The terminal prints
a line for each chunk, and a 15-second heartbeat showing how many
games have completed inside active chunks.

If the run is interrupted with Ctrl-C, execute **the exact same command
with `--resume` added**:

~~~sh
npm run agent:budgets -- \
  --runs 25 --seeds 71001,72001,73001 \
  --budgets 0,8,16 --parties all \
  --strategies magic,treasure \
  --workers 4 --chunk-size 5 \
  --out results/rollout-standard-v2 --resume
~~~

The runner verifies the study settings and current Git commit before
resuming and refuses to silently merge incompatible data. You may
change `--workers`, but keep the other settings
including `--chunk-size` identical.
Only a partly completed chunk is retried. **Runs started with the
old version had no checkpoints and cannot be recovered from their
progress logs.**

The scripts produce a complete `summary.json` and
`summary.md` only after every chunk has been
validated; an interrupted run retains its intermediate checkpoints.

### How to interpret the results

A zero-sample agent uses the current heuristic without state-fork
planning. Positive budgets use the indicated number of independent
matched hypothetical scenarios **per legal action**. Both fair
and Oracle have the **same weights and same budget**.

For the effect of hidden information, compare Oracle against
fair at one budget. For the effect of planning depth, compare
different budgets on the same information level.

If you have the previous optimizer's frozen fair weights, use
`--weights results/agent-standard-01/holdout.json`
in all arms, rather than selecting weights on the new holdout seeds.

## 3. Evaluate the full expedition as a win/loss

Because these experiments run considerably more game logic
inside each decision, start with a small Hero/seed cohort:

~~~sh
npm run agent:budgets -- \
  --runs 2 --seeds 91001 \
  --budgets 0,4,8 --workers 4 --chunk-size 1 \
  --parties solo --strategies magic,treasure \
  --rollout-rooms 9 --combat-actions 600 \
  --combat-room-depth 9 \
  --out results/rollout-terminal-03
~~~

For complete no-truncation rollouts, use the full horizons above.
There are still limitations when a live fight itself hits its
300-round safety limit; such outcomes fail the mechanical study
validation rather than being silently counted as wins.

The original optimizer can also train its weights on the new
state-rollout evaluator (this is **much** more expensive than its
old algebraic heuristic):

~~~sh
npm run agent:study -- --preset smoke \
  --planning rollout --budget 8 \
  --rollout-rooms 2 --combat-actions 14 --combat-room-depth 0 \
  --out results/agent-rollout-training-04
~~~

That training run keeps disjoint training, validation and
held-out seed sets; compare it with budget studies, which
deliberately do **not** tune weights.

## Reports and what to inspect

The fixed-weight budget command writes a new output directory with:

- `summary.md` - each policy's win rate, paired differences
  against the cautious baseline, and fair-vs-Oracle contrasts
  at identical budgets.
- `summary.json` - full per-party, per-strategy, per-seed
  outcomes and the actual frozen parameters.
- `validation.json` - unresolved/stalled game checks.
- `manifest.json` - complete configuration and source commit.
- `checkpoints/*.json` - individually recoverable completed chunks.

Partial horizon scores are used **only to choose** actions; the
reported win rate is always the outcome of the actual unmodified
full expedition run.

Re-run on fresh seed batches for credible validation. A
positive win-rate difference might mean stronger planning,
but finite samples, heuristic continuation assumptions, and
multiple comparisons can mislead. Oracle is a stronger-information
agent, not a certified optimal player or a benchmark for humans.

Knight remains the intentionally strong beginner class and is
not a balance-error trigger.

To send a completed local study back:

~~~sh
tar -czf rollout-budgets-01.tar.gz -C results rollout-budgets-01
~~~
