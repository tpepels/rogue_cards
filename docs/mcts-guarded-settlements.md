# Canonical MCTS: guarded no-fork settlements

## Status

Implemented directly on main. `directSettlements` is opt-in for both `submitDecision()` and `searchDecision()`; default remains false. This work does not remove the four earlier opt-in performance switches (`reuseEmptyReplaySwitches`, `reuseEdgeActions`, `streamHistoryHash`, `reuseSelectionScratch`).

## What is allowed to execute without cloning the entire expedition

- `vault` + `fight`: the printed transition only begins the Warden fight and updates deterministic bookkeeping.
- `post-warden` + `fight`: the printed transition enters Warden Fury (or resolves the already defeated Fury) using its existing canonical handler.
- `corpse` + `leave`: only when there is no queued Monster, pending Item draw, pending heal, stashed Monster Item, or tucked Item to return for the current Room. The transition runs the original `settleMonsterVictory()`, `roomSettled()` and `endRoom()` methods.

All other Room choices, die rolls, Item use, combat responses, deferred rewards, nested reactions and replay callbacks continue through the existing full-state fork and replay.

### Rollback guarantee

`beginDirectTransaction()` records all fields touched by these deterministic transitions (Monster/Room, battle and kill counters, Warden availability, Hero end-of-Room effects, stage progress, and existing property presence). On error it restores original state objects and physical-card aliases. The canonical action legality check is unchanged.

## Verification

    git pull --ff-only
    npm run test:session
    npm run validate:deck

The new `tests/mcts-direct-settlements.test.mjs` covers three transitions, failure rollback, an unsafe delayed reward that must still suspend for a player, and full-tree/frontier MCTS parity. The tests must pass before performance conclusions.

### Identical canonical MCTS search

    npm run bench:mcts-settlements -- --budget 2 --samples 11
    npm run bench:mcts-settlements -- --budget 8 --samples 11
    npm run bench:mcts-settlements -- --budget 16 --samples 11

Each paired sample executes actual complete MCTS rollouts from the same starting state and verifies equality of search decisions, terminal results, tree visits, state observations and RNG. The source scenarios emphasize the three transitions; this is *not* a forecast of total expedition throughput.

### Actual full expeditions

    npm run bench:mcts-settlements -- --mode expedition --budget 8 --runs 2

Runs two independent source seeds under the same canonical game rules and MCTS search. Every chosen action, final public state and future RNG snapshot must match. The report includes the number of encountered eligible settlement actions, to distinguish real improvement from benchmark noise.

Only enable the faster path by default after repeatable, meaningful full-expedition speedups. This optimization deliberately avoids speculative direct execution of general Room, combat or Item effects where player prompts or dice may invalidate a direct transaction.
