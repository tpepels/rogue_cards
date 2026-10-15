# Checkpointed canonical MCTS transitions

## Why this exists

`submitDecision` previously forked the entire ExpeditionState before most printed Room choices and combat actions. This guaranteed correct suspension when a rule requested a nested reaction, but repeated the expensive fork on ordinary uninterrupted decisions. Previous hidden-pile and metrics-only copy optimizations had inconclusive or negative laptop results.

## Mechanism

An opt-in MCTS-only `speculativeTransitions` option uses the **same canonical phase machine and legal reaction enumeration** as the existing fork-and-replay transition. Its temporary `_decisionHook` is identical to the hook used by the ordinary rules path.

At the start of a hypothetical rollout, the search stores a checkpoint **after the fair hidden-deck determinization and future-dice seed are assigned**. Successfully resolved actions run directly on the search-owned disposable state without a full-state fork. Their canonical action records are retained until the next checkpoint, by default at most 32 decisions later.

If a printed Room, Item, Hero, Monster or combat effect asks for a nested reaction, its exact trigger/actions/observed game are captured. The simulation is restored by cloning the last checkpoint and replaying the handful of successfully committed actions using the ORIGINAL fork-and-replay submitDecision. Only then is `pendingNested` exposed to MCTS. The next response (or any action requiring observed chance switches) always uses the original transactional replay mechanism; that transition becomes a new checkpoint. Non-reaction rule exceptions also restore the checkpoint and propagate.

The optimization does **not** change the real player's game session. The normal `submitDecision()` defaults remain untouched. Speculation is used only in `searchDecision()` after explicit `speculativeTransitions:true` and when `transactional:true`. Passing `transactional:false` keeps the normal implementation. The separate `checkpointEvery` integer (1–256, default 32) caps replay work per recovery.

## Correctness checks

    git pull --ff-only
    npm run test:session
    npm run validate:deck

`tests/mcts-speculative-transitions.test.mjs` compares ordinary and speculative canonical Room/combat transitions, confirms exact nested suspension and subsequent response parity, verifies rollback after a rule exception, and compares COMPLETE seeded full-tree and frontier MCTS reports at checkpoint intervals 1 and 32. Any difference is a failure; the shortcut is never a separate simplified simulator.

## Performance benchmark

The existing paired benchmark now supports these additional modes:

    npm run bench:mcts-settlements -- --optimization speculative --budget 2 --samples 11
    npm run bench:mcts-settlements -- --optimization speculative --budget 8 --samples 11
    npm run bench:mcts-settlements -- --optimization speculative --budget 16 --samples 11
    npm run bench:mcts-settlements -- --optimization speculative-frozen --budget 8 --samples 11

Then evaluate actual complete expedition throughput, not just a search microbenchmark:

    npm run bench:mcts-settlements -- --mode expedition --optimization speculative --budget 8 --runs 4

The `everything` mode also combines the four previous performance switches with guarded settlements and metrics cloning, *without* enabling anything by default:

    npm run bench:mcts-settlements -- --optimization everything --budget 8 --samples 11

Use the reported `totalSpeedup`, paired per-seed runtimes, and exact `canonicalParity` flag. If the speedup is not repeatable, keep speculation opt-in. Do not use checkpoints from balance experiments after changing study behavior or source commit without re-auditing.

## Not a change to rules or balance policy

UCT visit counts, selection, budgets, randomness, sampled hidden-deck fairness, and terminal victory criteria do not change. Existing experimental switches remain in the code. An unproven optimization is not automatically selected for canonical card-balance studies.
