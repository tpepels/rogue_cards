# Oracle rollouts: local, real-game decision experiments

This is the entry point for testing Rogue Cards by **branching legal decisions
on cloned real game states**, rather than only measuring scripted expedition
policies. The relevant engine is in `src/engine/`, the rollout sampler in
`src/rollout-state.js`, the branch evaluator in `src/rollout-evaluator.js`,
and the checkpointed experiment runner in
`scripts/study-rollout-budgets.mjs`.

## What works and what does not

**Implemented:**

- At a Room decision, evaluate each legally available printed option.
  This includes the ten *retained fate Rooms* - their later effects are
  no longer bypassed in the rollout agent.
- At a combat action, evaluate an ordinary attack alongside every
  currently legal selectable combat Item action.
- Sample real die rolls, execute exact printed effects, resolve following
  combat and Rooms, and continue to the actual Vault/ending when full
  horizons are requested.
- **Fair:** sample unknown future Item/Room/Monster cards from the public
  history and reveal; **Oracle:** use exact remaining deck contents/order,
  but **neither** receives future dice.
- Use the **same independently sampled scenarios across sibling actions**.
  Future sampled decks and state mutations are isolated.
- Optionally **replan later Room/combat decisions** at a small nested
  sampling budget, with one extra branching level only.
- Track the number of evaluated Room/combat branches, how often the
  hypothetical run reached a **terminal win or loss**, how often it
  stopped early and was scored heuristically, and how much future
  replanning occurred. `--strict-terminal` refuses silently truncated
  decision evidence.

**Not implemented yet:**

- A shared-tree, information-set Monte Carlo tree search (ISMCTS/POMCP),
  visit counts, exploration policy, or action-value convergence.
- Enumeration/search of *every* player decision. PARLEY and Vault SEAL
  currently use heuristic selection; between-Room Item use, reactive
  timing, Hero ability timing and kept-Room return choices are only
  partially controlled by the scripted continuation. Underlying
  effects are executed, but those choice points are not all in the tree.
- A uniform legal-action and terminal-transition API with phase-machine
  control of the whole expedition. The engine already has atomic public
  calls, but lacks a single comprehensive decision boundary.
- Any guarantee of optimal decisions or exhaustive coverage of all
  Items/cards/sequences. More random games do not solve those gaps.

Do **not** describe this as a complete game-theoretic solver until
those remaining action types have been included in the search.

## Laptop quick start

Requires Node >=22. Clone and update your existing `rogue_cards`
checkout, then:

```bash
cd /path/to/rogue_cards
git pull --ff-only
node --version
npm run test:rollout
npm run validate:deck
```

Test the *real terminal* evaluator, first with very small budgets and no
nested replanning:

```bash
npm run agent:budgets -- \
  --runs 1 --seeds 91001 \
  --budgets 0,1 --party wizard --strategies magic \
  --rollout-rooms 9 --combat-actions 600 --combat-room-depth 9 \
  --strict-terminal --workers 4 --chunk-size 1 \
  --out results/oracle-terminal-smoke-01 --dry-run
```

Repeat the exact command without `--dry-run` to run it. This is a small
mechanical/scheduling test, **not a statistical balance study**.

Use `--party wizard` for one Hero or `--party warrior+wizard` for one pair.
The previous `--parties solo` / `--parties duo` / `--parties all` options
still run the larger cohorts. A single-party experiment is a mechanical
pilot and cannot establish game-wide balance.

After confirming that the terminal branches finish, run a **two-ply**
study: each real Room/combat decision branches every legal option with
the outer budget, then later decisions in the hypothetical continuation
each get a smaller one-sample comparison. Inner-inner forks have budget
zero, so no recursive explosion or oracle future-die leakage.

```bash
npm run agent:budgets -- \
  --runs 1 --seeds 92001 \
  --budgets 0,2 --replan-budget 1 \
  --party wizard --strategies magic \
  --rollout-rooms 9 --combat-actions 600 --combat-room-depth 9 \
  --strict-terminal --workers 4 --chunk-size 1 \
  --out results/oracle-two-ply-01 --dry-run
```

Review dry-run size, then remove `--dry-run`. Two-ply full-horizon
sampling can be *much* more expensive than one-ply sampling. Do not
scale seeds or budgets before measuring throughput locally.

Interrupted run: repeat **exactly** the same command with `--resume`
added (and `--dry-run` removed). Outputs are checkpointed per
small chunk and tied to the exact Git commit/settings. Workers may
be changed on resume, but not the study design.

If larger studies are blocked by the workload gate, use smaller
subsets rather than bypassing the safety limit.

## Reading the results

- `summary.md`: real full-expedition win rates and paired Fair / Oracle
  comparisons, plus a table of sampled Room/combat branches.
- `summary.json`: matched game-outcome sequences, full cohort results,
  and `rolloutAudit` by policy (roomBranches, combatBranches,
  terminalBranches, nonterminalBranches, terminalWins,
  futureReplannedBranches).
- `validation.json`: unresolved/stalled games and an explicit
  `allRolloutBranchesTerminal` indicator.
- `manifest.json`: commit, frozen parameters, seed splits, horizons.
- `checkpoints/`: resumable games.

A `--strict-terminal` run aborts if any decision branch ended
nonterminal, rather than quietly assigning an HP/resource heuristic
and claiming a complete win-rate evaluation. Without strict mode,
the number of incomplete sampled branches must be disclosed.

**An experiment's reported overall win rate always comes from real
unmodified completed expeditions.** Branch scores can use incomplete
heuristics only when not running strict terminal mode.

## How to get genuinely usable balance recommendations

The immediate next engineering work is a **complete decision state
machine**, not another million scripted-policy runs:

1. **Canonical decisions:** a legal-action enumerator for all decision
   points: Room, retained/return choices, combat, attacks, consumables,
   active/reactive Items, equipment, PARLEY, SEAL, post-Warden endings,
   rerolls and Hero abilities. Each action has one canonical transition
   in the actual engine. Chance outcomes and public observations are
   explicit.
2. **Information-set search:** a single MCTS tree (or POMCP/ISMCTS
   tree) over public decision histories. Fair determinizes only the
   cards consistent with public knowledge; Oracle uses the actual
   deck order. Every encountered decision expands alternative actions;
   chance nodes sample legal die outcomes. The playout policy is only
   a fallback *after the search horizon*.
3. **Evidence per decision:** output state/action IDs, visits, estimated
   value and uncertainty for **each** alternative, including fraction
   of terminal branches and sensitivity across independent samples.
   Automatically flag decisions with too few visits, dominated options,
   mechanically unvisited transitions and policies that fail to
   converge as budget rises.
4. **Independent evaluation:** freeze each search configuration and
   evaluate full expeditions on disjoint seeds across all eight Heroes
   and pairs. Only conclude a design is over- or underpowered after
   repeated state-matched interventions and phase-specific tests.

A game has exponentially many possible histories. A finite experiment
cannot literally exhaust every complete expedition. The useful target
is complete *mechanical and legal-action coverage*, reproducible
branch evaluations, calibrated uncertainty, and evidence showing which
design conclusions remain under stronger agents.

## Sending back locally generated results

```bash
tar -czf oracle-two-ply-01.tar.gz -C results oracle-two-ply-01
```

Share the archive containing the manifest, summary, validation and
checkpoints. Do not combine reports from different commits without
listing which printed card or engine mechanics changed.
