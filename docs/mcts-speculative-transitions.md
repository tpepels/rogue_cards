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
    npm run bench:mcts-settlements -- --optimization speculative --budget 8 --samples 11 --checkpoint-every 8
    npm run bench:mcts-settlements -- --optimization speculative --budget 8 --samples 11 --checkpoint-every 64
    npm run bench:mcts-settlements -- --optimization speculative-frozen --budget 8 --samples 11

Then evaluate actual complete expedition throughput, not just a search microbenchmark:

    npm run bench:mcts-settlements -- --mode expedition --optimization speculative --budget 8 --runs 4

The `everything` mode also combines the four previous performance switches with guarded settlements and metrics cloning, *without* enabling anything by default:

    npm run bench:mcts-settlements -- --optimization everything --budget 8 --samples 11

Use the reported `totalSpeedup`, paired per-seed runtimes, and exact `canonicalParity` flag. If the speedup is not repeatable, keep speculation opt-in. Do not use checkpoints from balance experiments after changing study behavior or source commit without re-auditing.

## Not a change to rules or balance policy

UCT visit counts, selection, budgets, randomness, sampled hidden-deck fairness, and terminal victory criteria do not change. Existing experimental switches remain in the code. An unproven optimization is not automatically selected for canonical card-balance studies.

## Profiling and lazy initial checkpoints

An opt-in `lazyInitialCheckpoint` mode avoids cloning a second expedition
state at the beginning of each MCTS trial. Before the first periodic
checkpoint, a reaction reconstructs the initial trial from the same public
boundary, deterministic hidden-deck sample and chance seed, then replays
completed canonical decisions. All subsequent checkpoints and nested
reactions use the existing canonical replay mechanism.

`profileTransitions:true` adds a `transitionProfile` object with
per-phase and total counts and inclusive milliseconds for trial copies,
checkpoints, canonical forks, recovery copies, nested reactions and replayed
decisions. Timings overlap: recovery includes replay, and speculative
transition includes recovery. Profiling is disabled by default.

Compare uninstrumented throughput first, using a paired eager-versus-lazy
reference to avoid comparing runtimes from separate processes. The reference
option uses the same seeded canonical search and alternates execution order:

    npm run bench:mcts-settlements -- --reference speculative --optimization speculative-lazy --budget 16 --samples 33 --distinct-seeds
    npm run bench:mcts-settlements -- --reference speculative --optimization speculative-lazy --mode expedition --budget 8 --runs 8

Then inspect an instrumented run:

    npm run bench:mcts-settlements -- --optimization speculative --budget 16 --samples 33 --distinct-seeds
    npm run bench:mcts-settlements -- --optimization speculative-lazy --budget 16 --samples 33 --distinct-seeds
    npm run bench:mcts-settlements -- --mode expedition --optimization speculative-lazy --budget 8 --runs 8
    npm run bench:mcts-settlements -- --optimization speculative-lazy --budget 16 --samples 11 --distinct-seeds --profile
    npm run bench:mcts-settlements -- --mode expedition --optimization speculative-lazy --budget 8 --runs 4 --profile

The original fixed-three-seed microbenchmark remains the default to preserve
historical comparisons. Use `--distinct-seeds` to get unique initial seeds.
Profiled wall times include instrumentation overhead and should not be
compared with unprofiled timings. The new path remains disabled by default.

## Selective canonical reaction routing (experimental)

An 11-search profile showed 585 speculative Room transitions resulting in
585 nested recoveries and 7,059 replayed actions. The experimental
`canonicalReactionPhases:true` flag routes `room` and `retained-entry`
decisions through the existing canonical transaction instead. All other
phases can continue using speculative transitions. It changes no rules,
legal actions, dice, hidden information sampling or search policy.

The independently selectable `deferReactionCheckpoints:true` flag skips
checkpoint copies while an unresolved nested reaction is pending, and in
terminal states. Canonical fork/replay still handles every nested response;
a checkpoint is taken when the reaction resolves, before speculation resumes.

Paired eager-speculation versus selective variants:

    npm run bench:mcts-settlements -- --reference speculative --optimization speculative-selective --budget 16 --samples 33 --distinct-seeds
    npm run bench:mcts-settlements -- --reference speculative --optimization speculative-selective-deferred --budget 16 --samples 33 --distinct-seeds
    npm run bench:mcts-settlements -- --reference speculative --optimization speculative-selective-deferred --mode expedition --budget 8 --runs 8

An optional diagnostic profile:

    npm run bench:mcts-settlements -- --reference speculative --optimization speculative-selective-deferred --budget 16 --samples 11 --distinct-seeds --profile

These performance switches remain disabled by default. The original
speculation, lazy checkpoint, frozen actions and other prior experimental
flags are preserved.

## On-demand checkpoint experiment

`onDemandCheckpoints:true` creates a checkpoint immediately BEFORE an
actual speculative decision, not following every canonical transaction,
pending reaction or terminal state. A canonically executed decision
invalidates the checkpoint and prior speculative prefix; an interval
boundary also invalidates it so the NEXT speculative action gets a fresh
snapshot. This does not use lazy seed reconstruction, and all nested
reactions use the original canonical semantics.

Benchmark against the previous selective-deferred mode using paired seeds:

    npm run bench:mcts-settlements -- --reference selective-deferred --optimization speculative-selective-demand --budget 16 --samples 33 --distinct-seeds
    npm run bench:mcts-settlements -- --reference selective-deferred --optimization speculative-selective-demand --mode expedition --budget 8 --runs 8

Analyze remaining checkpoint and reaction costs with:

    npm run bench:mcts-settlements -- --reference selective-deferred --optimization speculative-selective-demand --budget 16 --samples 11 --distinct-seeds --profile

Every benchmark verifies full canonical search/expedition parity before
reporting speedup. The flag remains disabled unless proven faster.

## Faster canonical balance studies

The independent-seed `oracle:balance` runner accepts an explicit
`--mcts-mode selective-deferred` setting. It forwards previously
parity-verified `speculativeTransitions`, `canonicalReactionPhases`
and `deferReactionCheckpoints` to BOTH navigation and complete matched
counterfactual continuations. Search policy and all game rules are unchanged.

The selected mode is recorded in manifest, pilot output and result summary,
and mismatched resumptions are rejected. Historical default is
`canonical`; the newer unverified on-demand checkpoint mode is excluded.

First run the canonical audit at the current Git revision:

    npm run audit:canonical -- --runs 36 --seed 20261015 --out results/canonical-audit-balance-20261015

Then run a real-workload pilot on independent Room states:

    npm run oracle:balance -- --focus room --runs 7200 --workers 7 --hours 10 --navigate-budget 2 --future-budget 2 --mcts-mode selective-deferred --audit results/canonical-audit-balance-20261015/summary.json --out results/balance-room-20261015 --benchmark --benchmark-runs 18 --benchmark-minutes 15

Never mix checkpoint files across revisions, MCTS modes or search budgets.
