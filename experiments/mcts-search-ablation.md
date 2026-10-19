# MCTS action priors + progressive widening — A/B/C/D experiment

**Status:** Exploratory GitHub Actions pilot complete (32/32 full expeditions); no validated winning arm.  
**Parent project:** Rogue Cards / printed-healing calibration.  
**Rules:** Identical canonical cards and Balanced B deck. The existing frozen reference policy is *not* overwritten.

## Experimental arms

| Arm | PUCT action priors | Progressive widening |
|---|---|---|
| `baseline` | Off | Off |
| `priors` | On | Off |
| `widening` | Off | On |
| `combined` | On | On |

- **Priors (revised after first pilot):** PUCT now uses a normalized **public-information prior** over legal actions. It weights known healing Items, printed Room REST outcomes, combat ATTACK vs PASS and the existing pragmatic combat/parley hint (3× its base weight). It does not inspect hidden cards/dice and is not a neural model. Without relevant observable features, the prior remains uniform. Existing implicit values remain active.
- **Exploration:** PUCT has a **separate** coefficient `--puct-c`, default **0.35**, deliberately not inherited from UCT `c=0.20`. The latter remains constant for the baseline/widening arms. The PUCT constant is **not yet statistically tuned**; the CI pilot explores 0.15, 0.35 and 0.70 on matched seeds.
- **Widening combined with priors:** new actions are admitted in descending public prior order; widening-only still uses seeded randomized ordering. Prior usage and widening counts are logged.
- **Widening:** for nodes with >3 legal actions, admit up to `ceil(2 * (N+1)^0.55)` actions as visits increase. The queue is deterministically seeded and randomized; the prioritized combination puts the existing pragmatic preference first. Nodes with <=3 actions are not restricted.
- **Combined:** PUCT selects within the progressively opened subset. Neither changes legal actions, chance sampling, actual card rules, or the hero's hidden-information view.
- The default `searchDecision()` flags remain `nodePriors=false` and `progressiveWidening=false`. This preserves previous MCTS agent identity.
- The existing policy can already force progress or profitable equipment actions; these are preserved.
- This initial widening still allocates candidate edge objects via `nodeFor()`; the aim of the pilot is better *decision allocation*, not a claimed performance/memory win.

## Running a quick verification

~~~bash
cd ~/Projects/rogue_cards
git pull --ff-only
npm run test:mcts:search-controls
npm run study:mcts:search-controls -- --dry-run
~~~

## Controlled, paired full-expedition study

~~~bash
node scripts/study-mcts-search-ablation.mjs \
  --budgets 16,32,64 \
  --runs-per-hero 5 \
  --puct-c 0.35 \
  --workers 8 \
  --minutes 600 \
  --out results/mcts-search-ablation-puct035-v2
~~~

This runs four variants for each of the eight Heroes, each budget, and the same initial seed per Hero/replicate across arms (**96 expeditions with one replicate per Hero**). It records `manifest.json`, `trials.ndjson`, and `summary.json`, supports exact resumption, and refuses incompatible git revisions/settings. For a more credible comparison increase `--runs-per-hero`, keeping a separate output directory per code revision.

The initial GitHub Actions pilot runs only budget 16 and one replicate per Hero, with a short cap; the result may be incomplete. It is a **smoke/pilot**, not statistical confirmation. Inspect artifacts and actual completed counts.

## Comparison criteria

1. Real complete runs (do not substitute truncated or nonterminal samples with defeats).
2. Paired wins/losses, Vault reach, win given Vault, by-Hero outcomes.
3. CPU wall/search time; evaluate strength *at equal requested rollouts* rather than comparing a slower/bigger-budget agent to a smaller one.
4. The percentage of root alternatives explored and whether widening excludes an essential recovery action. The search function exposes `searchControls` metrics when either feature is opted in.
5. Print-healing calibration must use an independently validated policy; otherwise an algorithmic improvement may be mistaken for a card-strength effect.

**Do not replace `solo-balance-reference-v1` with a new MCTS policy** unless a properly powered independent study establishes a stable benefit. Any adopted policy gets its own profile ID and results namespace.

## Files

- `src/mcts-search-controls.js` — PUCT and progressive widening.
- `src/session-mcts.js` — opt-in selection at the canonical search frontier.
- `src/session-policy.js` — pass-through flags.
- `scripts/study-solo-expedition-balance.mjs` — pass-through flags for fixed-agent full expeditions.
- `scripts/study-mcts-search-ablation.mjs` — worker-based reproducible A/B/C/D runner.
- `tests/mcts-search-controls.test.mjs` — pure operator and real session legality/state regression tests.
- `.github/workflows/mcts-search-ablation-pilot.yml` — short CI smoke/pilot.

## Evidence / decisions

- 2026-10-19: code integrated as opt-in only; tests configured. The user requested a practical comparison of all four arms.
- **2026-10-19 pilot complete:** [GitHub Actions run #39299199330](https://github.com/tpepels/rogue_cards/actions/runs/39299199330). All targeted unit/regression tests passed; all **32/32** pilot expeditions completed. Full raw `trials.ndjson`, `summary.json`, and manifest are retained as the `mcts-search-pilot` workflow artifact.
- Configuration: fixed `solo-balance-reference-v1` parameters, eight Heroes × four arms × **one initial seed per Hero**, budget **16**, Balanced B, fair-knowledge frontier search.
- Observations (exploratory):

  | Arm | Wins / 8 | Vault reached / 8 | Search time / expedition | Mean search time / decision |
  |---|---:|---:|---:|---:|
  | baseline | 0 | 1 | 19.02 s | 141 ms |
  | priors | 0 | 0 | 13.44 s | 131 ms |
  | widening | 1 | 3 | 16.32 s | 119 ms |
  | combined | 1 | 2 | 15.89 s | 122 ms |

- The baseline won none of these eight seeds. Both widening variants won on the Priest seed, while priors alone won none. The paired win difference relative to baseline is **+1 / 8** for widening and combined, and **0 / 8** for priors, with no baseline-only wins. **This is far too few samples to show a reliable difference or declare a stronger agent.** Mean per-decision time differs with state trajectories and search volume, not just node-selection overhead.
- **Provisional observation:** widening is worth further investigation; no strong evidence yet that PUCT priors improve this agent, nor that adding priors to widening helps.
- **Next:** hold rules and baseline fixed, validate at budgets 16, 32 and 64 with more independent seeds and Hero-level uncertainty. Only a properly powered independent study can justify a new frozen agent profile.

- 2026-10-19: **Found methodological weakness in the first pilot.** Priors were mostly uniform outside combat and parley, and copied `c=0.2` from the UCT experiment despite a different selection equation. The original eight-seed pilot **does not validate PUCT**. Revised public priors, explicit `--puct-c` and activity telemetry were committed. Keep the old experiment archive separate and rerun fresh independent comparisons on new revision/seeds; do not resume older pilot files.
