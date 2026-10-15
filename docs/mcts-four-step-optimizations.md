# Four lossless MCTS performance steps

All changes are committed to main. Printed rules, card data, search budgets, game decisions and the ordinary MCTS defaults remain unchanged. The changes are opt-in until independently benchmarked.

## 1 - Empty reaction replay lists
Skip a needless array copy when a canonical action has no replay callbacks. Defensive copies are retained when callback switches are actually supplied.
Flag: reuseEmptyReplaySwitches

## 2 - Frozen legal actions
Reuse already-frozen canonical action objects as UCT edge records rather than allocating a shallow clone. Nonfrozen objects still get cloned.
Flag: reuseEdgeActions

## 3 - Streaming path hashes
Hash the UCT path prefix, phase, and action fingerprint consecutively without allocating a concatenated string. FNV-1a input order is unchanged.
Flag: streamHistoryHash

## 4 - UCT selection scratch buffers
Reuse three temporary arrays (unvisited candidates, scores and tied candidates) per search. UCT score arithmetic and the original seeded RNG tie-break are identical.
Flag: reuseSelectionScratch

These optimize allocation and bookkeeping; they do not eliminate the frequent full-state transaction forks, which were the largest cost in the earlier profile.

## Test the exact canonical behavior

    cd ~/Projects/rogue_cards
    git pull --ff-only
    npm run test:session
    npm run validate:deck

The new tests compare the complete seeded search result including tree nodes, terminal wins, visits, choices, and RNG integrity, under full-tree and frontier search, multiple Heroes and a real printed reaction. Fail immediately on a different result.

## Measure each step separately

    npm run bench:mcts-four-steps -- --budget 2 --samples 11
    npm run bench:mcts-four-steps -- --budget 8 --samples 11
    npm run bench:mcts-four-steps -- --budget 16 --samples 11

Results report medians for baseline, each opt-in change and all four together. The run alternates order to reduce systematic JIT and thermal bias.

## Verify actual complete-expedition throughput

    npm run bench:mcts-four-steps -- --mode expedition --budget 8 --runs 2

This compares baseline and the four combined switches on real expeditions with identical initial seeds. All canonical decisions, future dice and terminal outcomes must match exactly. It does not replace independent card-balance trials.

## Decision criteria

Do not enable these optimizations by default based on marginal or noisy improvements. Prefer an actual speed increase at both budget 8 and budget 16, with a corresponding reduction in full-expedition runtime. If they remain marginal, move next to safer reduction of repeated state-copying in canonical transactions, with comprehensive rollback and nested-reaction tests.
