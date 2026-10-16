# Optional compiled MCTS state hashing (experimental)

Node's V8 already JIT-compiles the JavaScript rules and tree search. Native
C++ does not automatically make *canonical game transitions* faster.
The new zero-dependency N-API addon compiles one hot MCTS component:
UTF-16/FNV public-information state hashing. It does not rewrite gameplay,
UCT statistics, dice selection, legal actions, rules effects, or forks.

A local kernel microbenchmark showed native hashing faster, but native UCT
scoring slower due to the JS/native call boundary. Only the hash kernel is
enabled. **Do not infer end-to-end throughput from this microbenchmark.**

## Build on Linux or macOS

Node development headers and a C++17 compiler are required.

    npm run build:native-mcts
    npm run test:native-mcts

The compiled binary lives at \`native/build/mcts.node\` and is Git-ignored.
No binary or compiler/toolchain dependency is checked in. If your Node
version changes, rebuild the addon. It uses the stable N-API version 8.

## Measure actual canonical speed and exact parity

    npm run bench:mcts-settlements -- --reference selective-deferred --optimization speculative-selective-native-hash --budget 16 --samples 33 --distinct-seeds
    npm run bench:mcts-settlements -- --reference selective-deferred --optimization speculative-selective-native-hash --mode expedition --budget 8 --runs 8

The same seeded game states, deterministic search actions, and complete
canonical terminal outcomes are checked against the previously
parity-tested \`speculative-selective-deferred\` JS implementation.

A native option must be explicit: all normal tests and studies remain
on the existing JS implementation until full-expedition benchmarks on
the user's machine demonstrate a statistically useful improvement.

## Apply to all-card studies only after measuring

Use \`--native-hash\` alongside \`oracle:all-cards\` only if the benchmark
is reliably faster. The study's manifest and summary record the change,
so a partially completed JS study cannot accidentally resume with
native hashing. Workers each load the addon in their Node process.

    npm run oracle:all-cards -- --dry-run --runs-per-card 80 --native-hash

This is a *compiled kernel inside the real MCTS*, not a fully native
rules engine. A fully native end-to-end MCTS requires porting the
canonical ExpeditionState transition/reaction logic, physical card
references, observation hashing, and random-stream determinization.
Any such port must pass seeded state-by-state and whole-expedition parity
before its outcomes are valid for balance.
