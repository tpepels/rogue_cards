# MCTS action priors + progressive widening — A/B/C/D experiment

**Status:** Code and tests implemented; exploratory GitHub Actions pilot launched 2026-10-19; no validated winning arm.  
**Parent project:** Rogue Cards / printed-healing calibration.  
**Rules:** Identical canonical cards and Balanced B deck. The existing frozen reference policy is *not* overwritten.

## Experimental arms

| Arm | PUCT action priors | Progressive widening |
|---|---|---|
| `baseline` | Off | Off |
| `priors` | On | Off |
| `widening` | Off | On |
| `combined` | On | On |

- **Priors:** PUCT uses only currently legal actions and the already-existing pragmatic soft recommendation (a 3× relative weight for the one recommended action). With no recommendation, action priors are uniform. It is not a neural model. Existing implicit UCT value estimates remain active.
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
  --runs-per-hero 1 \
  --workers 8 \
  --minutes 600 \
  --out results/mcts-search-ablation-v1
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
- _Append actual pilot results and completion status from the runner here; do not infer a winner from missing/incomplete studies._
