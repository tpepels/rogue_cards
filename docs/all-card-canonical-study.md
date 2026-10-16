# All-printed-card canonical balance experiment

This runner exists because the original state-matched Room-choice study never
estimated the values of all printed cards. The legacy "oracle:overnight" runner
used the old rollout research agent. Neither is a universal card balance audit.

Use \`npm run oracle:all-cards\`. **All observations are complete production
decision sessions.** The policy uses every legal player action and canonical
effect engine, with the parity-verified selective-deferred MCTS acceleration.
Unresolved expeditions, errors or unaudited revisions fail closed.

## What "all cards" means

Every card in the physical \`CATALOGUE\` gets a row immediately, not only
cards naturally encountered by the navigator. One independent source seed per
card/trial index. The source card order, party and seed are reproducible.

- Room: reorder an existing Room to the next draw in its own printed stage.
  Compare this scheduled exposure to the unmodified shuffled stage deck.
- Item/Potion/Equipment: reorder an existing physical Item to the next Item
  draw. No extra supply, no invented starter Item, no scripted activation.
- Ordinary Monster: reorder an existing printed Monster to the next draw from
  its native stage deck. No monster is created, deleted or moved to a wrong
  stage.
- Hero: compare a Hero replacing another Hero in a real one- or two-Hero
  party. The companion, if any, is kept identical across the pair; all
  seven alternatives rotate through control groups.
- Vault, Warden, Warden Fury: real full-expedition reach / outcome observations
  are collected. Since the game has no printed alternative boss or Vault,
  **these rows are explicitly observational-only and cannot establish
  a causal balance score.**

These are different **estimands**: the Room / Item / Monster outcomes measure
value of moving that existing card earlier rather than the "intrinsic strength
of its text". An intervention not reached before an expedition ends remains
in its intention-to-schedule sample; its treatment exposure is shown.
That prevents filtering on favorable post-intervention survivorship.

An eligible paired comparison always uses identical initial chance seed and
same finite-budget search policy, but different actions can consume random
dice in different orders. No result is described as solved-optimal play.

## Run the experiment

Use a *new passing canonical audit from the exact Git revision* before starting:

    npm run test:session
    npm run audit:canonical -- --runs 36 --seed 20261016 --out results/canonical-audit-all-cards-01
    npm run oracle:all-cards -- --dry-run --runs-per-card 80

Then:

    npm run oracle:all-cards -- --runs-per-card 80 --workers 7 --hours 24 --budget 2 --min-paired 60 --seed 20261016 --audit results/canonical-audit-all-cards-01/summary.json --out results/all-card-canonical-01

Resume **the same revision and all experimental settings** after a time cap:

    npm run oracle:all-cards -- --resume --runs-per-card 80 --workers 7 --hours 24 --budget 2 --min-paired 60 --seed 20261016 --audit results/canonical-audit-all-cards-01/summary.json --out results/all-card-canonical-01

The worker queue interleaves card IDs so an early partial summary already
lists every card, including those without adequate observations. Each job
checkpoints atomically; \`summary.md\` and \`summary.json\` are refreshed
approximately once per minute. Revisions and designs cannot be merged.

For a quick initial canonical smoke experiment, use \`--runs-per-card 1\`
and a separate \`--out\` directory. Never present that one sample as
statistical proof.

## Statistical interpretation

The per-card contrast is the matched complete-expedition win-rate difference
(treatment minus control), paired normal 95% descriptive interval and exact
McNemar p-value. Holm familywise correction is applied across all tested
printed-card contrasts. A row must have at least \`--min-paired\`
eligible independent sources and adjusted p < 0.05 to be called
"significant"; "inconclusive" does **not** mean balanced.

This study can identify promising, harmful, beneficial and underpowered card
interventions. It cannot establish that every card is balanced, prove
equivalence, or isolate passive card text effects. Item activations and
passive triggers are counted separately to distinguish items that were
present from items the search agent actually exploited. Fixed encounters
are never assigned invented causal values.

Before making final card edits, validate stronger search budgets and
underrepresented mechanics with pre-registered, fresh independent seeds.
