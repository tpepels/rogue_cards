# Full-game player-decision MCTS - laptop milestone

The previous Oracle studies optimized *some* Room and combat choices, then
resolved many later choices using policy scripts. The canonical-session agent
now calls `sessionActions()` at every exposed decision, and calls
`searchDecision()` for **every** situation with two or more legal actions.
There is no hardcoded fallback player strategy for those exposed decisions.
MCTS simulations continue through real printed mechanics to actual wins or
losses. Unknown remaining card piles are resampled without replacement in
`fair` mode. The alternate `oracle` mode knows the actual current hidden
order (but not future dice).

The session engine supports start-to-end decision stepping, actual Hero
ability triggers, timing-dependent Item reactions, equipment changes,
Elbereth, escalating push-your-luck, PARLEY, retained Rooms, revealed
corridor branches, Monster response, corpse eating, SEAL, both Warden
phases and optional Vault endings. Nested choices use deterministic
transaction replay: all dice and revealed information *before* the
pending prompt are held fixed; only the unknown future is resampled.

**Not a complete solver yet:** some printed effects in the older mutable
engine still make implicit strategy-dependent decisions. A game with one
fixed set of cards and random chance is not a proof that every printed
branch is reachable or balanced. `validation.json` therefore always
marks `completeActionSearchImplemented: false`.

## Verify locally

Node 22+ and an up-to-date checkout:

```bash
cd /path/to/rogue_cards
git pull --ff-only
npm run validate:deck
npm run test:session
npm run test:rollout
```

Run a small, complete full-game MCTS experiment in the current shell:

```bash
npm run oracle:play -- \
  --runs 8 --workers 4 --budget 2 --hours 1 \
  --knowledge fair --seed 20261021 \
  --out results/session-mcts-pilot
```

This attempts eight distinct game seeds, using all eight solo Heroes.
Each trial is a **real complete expedition** under a sequentially replanned
UCT policy. MCTS is invoked at each non-forced decision. Within each
UCT simulation, later actions also come from `sessionActions()`, not a
scripted room/combat bot. Single-option transitions consume no search
budget.

## Overnight experiment on an 8-core laptop

Preview the run before starting:

```bash
npm run oracle:play -- \
  --runs 3600 --workers 7 --budget 4 --hours 10 \
  --knowledge fair --seed 20261022 \
  --out results/session-mcts-night-01 --dry-run
```

Run in the foreground, or use a detached Linux terminal with sleep
inhibited:

```bash
mkdir -p results
nohup systemd-inhibit --what=idle:sleep --mode=block \
  --why="Rogue Cards canonical full-decision MCTS" \
  npm run oracle:play -- \
  --runs 3600 --workers 7 --budget 4 --hours 10 \
  --knowledge fair --seed 20261022 \
  --out results/session-mcts-night-01 \
  > results/session-mcts-night-01.log 2>&1 < /dev/null &
echo "Agent process: $!"
```

Keep the machine plugged in, sufficiently ventilated and awake, with
its lid open. `systemd-inhibit` depends on your local Linux power
management rules and might not suppress a lid-close suspend.

For progress:

```bash
tail -n 35 results/session-mcts-night-01.log
```

If the run reaches its time cap, resume with identical experiment
parameters and `--resume` instead of `--dry-run`. `--workers` and
`--hours` may change, but the Git revision, seed, budget and complete
sampling design may **not** change. Do not `git pull` between a
partial experiment and its continuation.

```bash
npm run oracle:play -- \
  --runs 3600 --workers 7 --budget 4 --hours 10 \
  --knowledge fair --seed 20261022 \
  --out results/session-mcts-night-01 --resume
```

To replicate with independent seeds, start a **new** output directory
and a different `--seed`. To evaluate a stronger Oracle, change
`--knowledge oracle` but use a different directory. These study arms
need matched scenario seeds and party allocations before causal
attribution of observed differences.

## What the report genuinely measures

Each completed independent seed stores:

- Actual win/loss and printed ending
- Hero party and exact physical seed
- Every selected action at player decision boundaries
- MCTS root action visits, sampled terminal outcomes, tree nodes and depth
- Every printed Room option visited and selected
- Every Item acquisition, legal opportunity, activation and die band reached
- Monster encounters and behavior outcomes
- Which cards were *never* encountered, used, or compared

Outputs:

- `manifest.json`: source SHA, Node version, experiment signature and
  fixed game/search settings
- `summary.json`: win-rate Wilson confidence interval across independent
  games, counts by Hero party, and per-card coverage and missing branches
- `summary.md`: readable overview and blind spots
- `validation.json`: honest completeness and capability flags
- `checkpoints/000000.json` etc.: individual reproducible completed
  expeditions and root search statistics

A rule exception or unfinished round causes a **nonzero exit**, not a
quietly invented failed expedition. Successfully completed seeds remain
saved and can be examined. A result with a few hundred games may still
leave many cards unvisited.

For review in ChatGPT, after the run:

```bash
tar -czf session-mcts-night-01.tar.gz \
  -C results session-mcts-night-01
```

Attach that archive and, if a worker failed, also the `.log` file.

**Important statistical limitation:** a frequent Item activation is not
evidence of its power, and a high win rate with a particular Monster is
not an Item-specific causal effect. The experimental agent covers real
player decisions, but balance revisions still require state-matched
counterfactuals and independent statistical tests. The resulting
coverage report tells us *which* mechanics can be studied fairly next.

## Development requirements still open

- Move remaining implicit policy decisions (automatic Item/Room
  overrides, ally/equipment selection and other effects) behind the
  same legal-action boundary. No automatic choice can be called tested.
- Improve information-set node reuse and selection with more robust
  convergence and memory controls. The current UCT approach is a
  legitimate full-session search, not proven optimal.
- Run legal-transition and conditional reachability tests for every
  printed card and dice band; not merely observe random encounters.
- Support real state-matched, card-level ablation or swap comparisons
  using identical resources, matched chance, a checked choice tree
  and properly corrected uncertainty estimates.
