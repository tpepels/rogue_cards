# Rogue Cards - short combat and MCTS diagnostics

These pilots do not alter printed cards, encounters or core game rules.

## Run

    npm run test:diagnose
    npm run study:diagnose:combat -- --trials 4 --samples 3 --out results/combat-phase1-a
    npm run study:diagnose:mcts -- --monsters wisp,troll,crawler,sentinel --out results/mcts-pilot-a

Alternatively, npm run study:diagnose runs both with default output folders.
Use a new --out folder for every run.

## Isolated combat pilot

Tests eight selected Monsters in UPPER, MIDDLE and DEEP using the real
canonical engine. Two party profiles: solo Warrior and Warrior + Knight.
All arms of a scenario share the same starting setup and initial dice seed.

Six arms: basic attacks, basic with Monster initially at -2 HP, Parley
first if legal, up to two Elbereth attempts, sampled tactical choice,
and the tactical choice with Monster initially at -2 HP.

Phase 1: every tactical candidate now continues through the entire
canonical encounter with a basic follow-up policy before being scored.
The tactical choice is not yet a full multi-ply policy (Phase 2).

The short tactical search selects from real legal combat actions, simulates
shared sampled chance streams and scores surviving HP, Monster HP, status
effects and spent resources. This is sampled expectimax-style lookahead;
alpha-beta is not directly suitable to chance-driven Monster behavior.
It is a separate experimental policy, not a change to production MCTS.

Outputs:
- summary.json: results grouped by party size, stage, and test arm.
- fights.csv: each Monster, party, trial, arm, losses and effects.

Per-run telemetry distinguishes net party HP change from actual cumulative
damage, Item activations from Items spent, and tracks post-fight HP by Hero,
Hero deaths, poison observed during combat, extra Monster draws, and the
number of Monsters handled. Inventory changes may also reflect reward draws.
A safely resolved encounter requires a cleared Room with no active Monster,
no remaining Monster queue and no suspended reaction.

These are controlled encounters at starting Hero HP, without preceding
Rooms or their attrition. Initial Monster damage is a test intervention;
the printed Monster card and regeneration cap remain unchanged.
Every queued Monster must now be resolved through the canonical session,
including nested reactions, Parley, combat, Monster responses and corpse
settlement. A party wipe is a separate terminal result. Any step-limit or
engine round-limit is an explicit study error, never a victory or safe clear.

## MCTS root pilot

Runs the existing, unmodified, full-expedition MCTS from constructed combat
decisions at budgets 2 and 16 (effective budget is at least the number of
legal options, as in the production policy). Reports root visit counts,
terminal wins, all-zero results, and first-action selection.

These are diagnostic states, not natural full-expedition win-rate estimates.
If no sampled rollout wins, that indicates sparse MCTS reward information;
it does not by itself prove that one candidate action is wrong.

## Validity

Use paired trial comparisons for direction and effect size, not isolated
arm percentages. Large changes can justify further tests with naturally
encountered fights and independent seeds. Do not rebalance cards based
on this pilot alone. The equipment smoke test checks fixed AC, weapon ATK,
and each of the seven new printed equipment bonuses.

## Phase 2 - two-ply stochastic tactical search

The Phase 1 pilot was complete (384/384 encounters resolved, zero truncated
runs and zero queued Monsters after safe clearance). It showed the original
one-ply tactical policy was not reliably better than basic attacks.

Run a bounded Phase 2 comparison:

    npm run test:diagnose
    npm run study:diagnose:phase2 -- --out results/combat-phase2-a

A smaller smoke study is available with:

    npm run study:diagnose:phase2:smoke

The experiment contains five matched arms: `basic`, `legacy_tactical`,
`phase2_safe`, `phase2_elbereth`, and `phase2_parley`. The last arm starts
at the canonical Parley boundary. All arms use the same encounter start
and initial dice seed per Monster, Hero party and trial.

The Phase 2 search has *two distinct Hero decisions*, with real stochastic
actions and compulsory Monster responses between them. At the second Hero
decision it compares sampled full-encounter continuations through the same
Phase 1 canonical engine. It chooses based on encounter survival, Hero
deaths, resulting HP, poisoned Heroes, real spent resources and Monster
responses. A simple attack/fight baseline is always included; alternatives
require a nontrivial expected improvement and cannot have a higher sampled
wipe risk. The `phase2_safe` arm never selects Elbereth. The
`phase2_elbereth` arm considers it with an additional safety margin; this
is not a claim that the spell is always useful. `phase2_parley` tests
negotiation at an eligible initial encounter boundary.

The implementation is intentionally independent of production MCTS; no
rules, cards or expedition policy are changed. It is a small stochastic
expectimax-style experiment, not classical adversarial alpha-beta. Its
limited samples and baseline completion policy are hypotheses to test,
not guarantees of optimal or superior decisions. The pilot uses starter
parties at full HP, not naturally accumulated campaign damage.

For a specific Monster or a different sample budget, run for example:

    npm run study:diagnose:phase2 -- --trials 4 --samples 3 --monsters wisp,troll,sentinel --out results/combat-phase2-targeted

Each run needs a fresh output directory. The summary reports separate
`outcome` and `defeated` fields: the latter is a kill occurrence, not
proof that the entire encounter was survived. Use `resolvedSafely` for
encounter completion and `heroDeaths` to detect duo losses.
