# Canonical MCTS performance V3

This is an **unmerged optimization branch**, separate from the already
running paired agent-strength experiment at `6129a115`. It retains
the same printed rules and keeps historical full-tree MCTS as the default.

## Implemented

1. **Immutable card pile fast-copy.** `forkGameState` shallow-copies the
   hidden Item, Room and Monster pile arrays without recursively visiting
   the immutable card definitions. Remaining mutable ExpeditionState data
   is still cloned with preserved aliases. Switch:
   `forkGameState(state,{fastCardPiles:false})` for differential tests.
2. **Private isolated-state commits.** A canonical search trial already
   owns a separate game state. After a successful fork/replay, it adopts
   that verified fork rather than copying every field back into an
   otherwise unobserved ExpeditionState object. Public sessions still
   preserve their original state object identity by default. MCTS
   switch: `fastPrivateCommit:false` restores the old commit path.
3. **Reversible deterministic Vault FIGHT actions.** Initial Warden
   deployment and post-Warden FIGHT now bypass full-state cloning via a
   bounded rollback journal covering changed phase, actor, metrics,
   Monster and Warden flags. Room effects, combat attacks, equipment
   effects and *any* reaction-prone choices continue through the
   existing canonical fork/replay machinery.
4. **Reuse current public-root hash.** Every simulation beginning at the
   same observed decision boundary has the same *public* root hash even
   after legal hidden-deck resampling. Compute the public root hash
   once per `searchDecision`, not once per rollout. Toggle
   `cacheRootHash:false` for equivalence comparison.
5. **Compact error reproduction.** Fixed-size trace slots are reused
   rather than allocating another object and Hero HP array for every
   successful canonical game decision. On failure, the exact historical
   trace format is reconstructed. Toggle `compactTrace:false`.
6. **Lighter reaction replay setup.** Avoid empty replay-switch array
   copies and reuse already-verified pending reaction selections.
7. **Existing V2 optimizations remain:** frontier UCT,
   observation-free internal transitions, action-ticket legality reuse,
   streamed public hashes, and independent fair-information sampling.

These changes are implementation optimizations, not a new MCTS
policy. `treeMode:"full"` and `searchProfile:"classic"` remain
the historical experiment modes. `deep-uct` is still experimental and
requires separate statistical confirmation of playing strength.

## Local verification

```bash
npm run test:session
npm run validate:deck
npm run bench:state-copy -- --iterations 1000 --samples 5
npm run bench:mcts-root-hash -- --budget 4 --samples 5
npm run bench:mcts-private -- --budget 4 --samples 5
npm run bench:mcts-v3 -- --budget 4 --samples 5
npm run bench:mcts-frontier -- --budget 16 --samples 5
```

The benchmarks `bench:mcts-root-hash`, `bench:mcts-private`, and
`bench:mcts-v3` execute **complete real canonical expeditions** at
fixed MCTS seeds, checking equality of the entire search result (not
just win rate) and unchanged root public state/future dice.

For an actual Node CPU profile of the full-game benchmark:

```bash
node --cpu-prof --cpu-prof-dir=results scripts/benchmark-mcts-transitions.mjs --mode v3 --budget 16 --samples 10
```

A matching revision passing the full `npm run audit:canonical` gate is
required before starting any new long-running statistical study.

## Experiment isolation and migration

**Do not change or resume the already running 360-pair experiment
using these sources.** Keep that run on its pinned old revision.

Even implementation-only changes create a new Git revision. The Oracle
balance runner requires revision-matched audits; reusing prior
checkpoints across revisions requires the full independent per-seed
verification in `scripts/migrate-session-balance.mjs`.

The new branch includes regression tests for:
- Identical complete MCTS search results with old/new private commit.
- Identical full counterfactual paired evaluation.
- Exact public-root hashing across fair, oracle and reaction roots.
- Immutable Item/Room/Monster pile identity and mutable-state isolation.
- Canonical Vault and post-Warden FIGHT effects and rollback.
- Exactly identical diagnostic traces on nonterminal trial failure.

These tests must be executed locally; syntax validation alone is not
evidence of a performance gain or of complete behavioral parity.

## Scope limits

Fully journaling arbitrary combat, damage, dice, Item and Room effects
would require a more invasive transaction layer. They may trigger
nested player decisions in the middle of an effect. We deliberately
have **not** speculatively mutated unjournaled game state or introduced
an alternate simplified simulator. The canonical copy/replay system
remains active for those cases. Future broad journaling work should be
informed by CPU/heap profiling and validated against complete printed
reactions before it can replace those forks.
