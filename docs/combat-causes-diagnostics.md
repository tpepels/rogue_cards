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

The Phase 2 search has *two successive Hero decisions*, with real stochastic
actions and compulsory Monster responses between them. In a two-Hero party,
choosing which Hero acts is also searched as a tactical decision (including
its subsequent combat action); the older policy always picked the strongest
printed attack. At the second Hero
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


## Phase 2b - 48 controlled wounded and equipped encounter positions

Phase 2b uses a **controlled intervention design**, not an estimate of naturally
observed encounter frequencies. It constructs 8 printed Monsters times 6 Hero
profiles: wounded Warrior, injured Knight, poisoned Witch, asymmetric
Warrior/Knight, weakened Wizard/Monk, and exhausted Rogue/Priest.

Each position uses real physical Items removed from the canonical Item deck,
appropriate equipped slots, intentionally wounded Heroes and printed status
conditions. Every combat action and Monster response uses the canonical engine.

Run:

    git pull --ff-only
    npm run test:phase2b
    npm run study:diagnose:phase2b -- --out results/combat-phase2b-local

Optional quick run:

    npm run study:diagnose:phase2b:smoke

The full study writes summary.json, fights.csv, and scenarios.json. Results
compare attack_only, phase2_safe, phase2_elbereth and phase2_parley using
the same 48 scenario/seed combinations. Every row contains starting and
remaining HP by Hero, survived/failed encounter, physical Item use,
Parley and Elbereth decisions, legal action opportunities, and how often
the chosen action differs from basic play **in that actual state**.

The summary reports mean paired HP savings relative to attack-only, better
or worse HP outcomes, safety improvements or regressions, number of
scenarios with different decisions, and total changed decision windows.
An action can consume a different number of dice; identical starting RNG
streams need not produce identical later individual die faces.

**Seed correction:** older phase-2 diagnostics derived seeds from the
position of each Monster in a loop, so selecting a subset changed the
scenario. That has been corrected in the baseline study to hash Monster,
Hero IDs and trial number. The older study schema is now v2; do not
directly pair pre-fix v1 results with new v2 subsets.

These states are plausible constructed experiments, not actual reached
expedition snapshots. Production MCTS, printed cards and rules are unchanged.


## Phase 2c - risk-aware Hero and Item choices with repeated independent dice

Run:

    npm run test:phase2c
    npm run study:diagnose:phase2c -- --scenarios 48 --repetitions 4 --samples 4 --followup 2 --out results/combat-phase2c-local

For a quick smoke run:

    npm run study:diagnose:phase2c:smoke

Phase 2c evaluates the same 48 constructed, wounded Hero-and-Item fixtures
from Phase 2b. Each fixture is repeated with independently hashed combat
RNG starts; the four policy arms share the exact same combat seed within
each fixture and replicate. Changing Monster filters or iteration order
does not change a fixture's starting deck or combat RNG.

Policies: attack_only, phase2c_safe, phase2c_elbereth and phase2c_parley.
Parley is a starting choice only when the canonical decision session offers
it; unsupported Monster/parley combinations revert to combat-hero.

The search uses legal actions, first-stage chance samples, the next Hero
decision, and full canonical encounter continuations. It compares candidate
utilities after rewarding party survival and penalising a dead individual
Hero, HP lost, consumables, persistent poison and severe post-fight injury.
An action must beat the baseline by a meaningful margin plus sampling
uncertainty. Higher measured wipe or individual-Hero-death probability
blocks speculative HP gains, as does most large lower-tail deterioration.
Elbereth is opt-in and evaluated separately. This is a deliberately
conservative experimental risk criterion, not an optimality guarantee.

The output files are summary.json, fights.csv, and scenarios.json.
Every CSV record contains the scenario, replicate, actual chosen actions,
Hero-selection deviations, Item decisions, Parley/Elbereth use, HP savings
vs the exact paired Attack-only replicate, and any difference in successful
encounter resolution. The summary reports overall and Monster/profile
breakdowns, safety gains and losses, and a clustered descriptive 95%
bootstrap interval for mean HP saved (resampling the 48 constructed
scenario IDs, not pretending that all repeated dice are independent
scenario designs).

New tactical results are not deployed in production MCTS. A neutral or
negative 48-state result means test and revise the search, not weaken
printed Monster cards. These are deliberately constructed encounter starts
and do not estimate natural expedition win probabilities.


## Experimental UCT hybrid: sampled combat expectimax and implicit backups

The **production default remains unchanged**: random frontier rollouts,
ordinary UCT selection and binary terminal rewards. Two separately
switchable research extensions now exist:

1. `rolloutCombatMode: "sampled-expectimax"` uses depth **two actual Hero
   combat decisions** (choosing a Hero does not consume a ply), true
   stochastic forward samples, and canonical resolution of pending nested
   reactions/Monster responses to a legal combat decision boundary.
   It is applied only after a frontier edge has expanded, never during
   the outer UCT tree phase. The default remains `"random"`.
2. `implicitWeight: 0.25` enables a **separate** backed-up heuristic
   channel for UCT exploitation. Ordinary `wins/visits` and terminal
   win-rate reporting remain untouched. In this single-agent cooperative
   stochastic game the backup takes the maximum across Hero-action
   successor estimates and averages outcomes over sampled chance.
   This is an *implicit MAX/expectation adaptation*, not a claim of
   a literal adversarial minimax agent.

The implicit heuristic is intentionally simple and provisional:
surviving Heroes, normalized HP, public cleared-Room progress and poison.
Only the implicit selection channel uses it. The blending weight is an
explicit opt-in experimental parameter, not a quality-based/reward bonus.

Both extensions are exposed in `searchDecision()` and
`selectSessionPolicyAction()`, but neither is the default. The
sampled-combat rollout mode requires `treeMode: "frontier"` so its
activation boundary cannot silently be mistaken for a full-tree search.
Search cost is bounded with `rolloutCombatSamples` (1-6) and
`rolloutCombatMaxDecisions` (1-64) per MCTS trial.

Run focused regression tests:

    npm run test:mcts-combat-hybrids

Run the three-way ablation (exact canonical search, not changed printed
rules) and inspect the elapsed time, chosen root action, terminal wins,
and number of local expectimax searches:

    npm run bench:mcts-combat-hybrids -- --budget 2 --samples 1 --monsters crawler,wisp --out results/hybrid-ablation-a

Modes: `uct`, `uct-expectimax`, `uct-expectimax-implicit`.
Equal **rollout** budgets are not equal **CPU** budgets; compare
wall-clock time before deciding whether the extensions are useful.
Terminal wins can remain at zero even if the implicit channel separates
explored local branches, so do not present heuristic values as win rates.

No QB/RB quality-based reward modulation, printed card or rule changes.
Further testing should hold elapsed computational cost approximately
constant and measure full-expedition outcomes separately from local
combat outcome scores.


### Hybrid parameter profile: C and implicit alpha (provisional)

The classical UCT path deliberately retains `exploration = sqrt(2)`
and `implicitWeight = 0`. The opt-in `combat-hybrid` search profile
starts with the following conservative, **not yet empirically tuned**
pair: **C = 0.7, alpha = 0.25**. The alpha value is inside the
0.15-0.4 range identified as a broadly safe starting interval in
Lanctot, Winands, Pepels and Sturtevant (2014); that result is from
different games, not evidence for a Rogue Cards optimum.

Example from the outer session policy:

    selectSessionPolicyAction(session,policy,{
      searchProfile:"combat-hybrid",
      budget:16,seed:20261017
    });

The named profile activates sampled combat expectimax, implicit MAX
backups, frontier mode, C=0.7 and alpha=0.25. For a meaningful number
of revisits it enforces at least 16 root trials and four visits per
available action, but the resulting CPU cost can be substantial.
Explicit `exploration` and `implicitWeight` override the preset.

Direct `searchDecision()` calls retain alpha=0 unless the caller
explicitly opts into implicit backups. An omitted exploration C
uses sqrt(2) for classic search, but 0.7 when either heuristic hybrid
extension is enabled; an explicit C always overrides that default.

The previous implicit progress heuristic incorrectly treated
`roomGoal` as the total number of Rooms rather than Rooms per stage.
Progress now divides `metrics.cleared` by `3*roomGoal` (all three
ordinary stages), avoiding a prematurely saturated heuristic.

The four-way benchmark additionally includes UCT with the *same low C*
to separate the exploration effect from the expectimax effect:

    npm run bench:mcts-combat-hybrids -- --budget 8 --samples 1 --c 0.7 --alpha 0.25 --monsters crawler,wisp --out results/mcts-hybrid-defaults-a

Arms: `uct-classic` (sqrt(2)), `uct-low-c` (0.7),
`uct-expectimax` (0.7, alpha=0), and
`uct-expectimax-implicit` (0.7, alpha=0.25).
At budget 1-2 the root is barely sampled and C has little or no
effect; use a larger budget for exploration comparisons. Equal visit
counts are not equal CPU-time budgets with nested expectimax, so
evaluate both wall time and strength before treating these defaults
as calibrated.


### Interpreting the initial 16-rollout hybrid benchmark

The first benchmark on Crawler and Wisp had exactly 128 sampled
lookaheads in every 16-rollout hybrid arm: the default budget of eight
tactical searches PER MCTS trial was saturated on all 16 trials.
Expectimax took about 3-4 times the CPU time of regular UCT, while
the in-search terminal-win counts were 0/16 rather than 1/16 or 2/16.
Those terminal-win counts are not out-of-sample playing strength.

The benchmark now exposes `--tactical-max` (default 2 for this
diagnostic script only, canonical engine default still 8). Compare
e.g. `--tactical-max 2`, `--tactical-max 4`, `--tactical-max 8`
using unique `--out` paths. Each row records the cap used and
the actual number of tactical lookahead calls.

Do not increase sample counts or tune alpha/C aggressively until
the marginal performance of these tactical calls has been evaluated.
Concentrating eight calls in each early encounter of a sampled
expedition can exhaust the budget before later fights. Further
experiments should schedule the lookahead by decision value and
compare at matched CPU time, not merely matched rollout count.


## Two-hour, 8-worker calibration: C and implicit alpha

The previous implementation had a weak implicit heuristic: it tracked
HP and expedition progress but did not distinguish an untouched Monster
from a Monster at one remaining HP. The heuristic now includes public
Monster HP progress, remaining Monster queue, Item retention and Hero
survival. At a Hero's combat-action boundary, it now also distinguishes
acting Heroes using an approximate printed-AC hit likelihood and their
immediate exposure to a Monster response. These are heuristic estimates,
not substitutes for canonical dice and printed combat resolution.
The original terminal-win statistic remains separate.

**The optimizer measures independent canonical encounter outcomes**,
not the MCTS rollout wins from the search that selected each action.
It is an empirical test of the local hybrid combat-root policy.
Implicit backups are not guaranteed to improve results across all
games; the success criterion is measured out-of-search improvement.

Use a unique directory for the first run:

    cd ~/Projects/rogue_cards
    git pull --ff-only
    npm run test:mcts-implicit-tuner
    npm run tune:mcts-implicit -- --minutes 120 --workers 8 --budget 32 --samples 2 --tactical-max 2 --validate-minutes 15 --out results/hybrid-tune-20261017

The same command with the same output directory may be run again to
resume incomplete tuning work; a manifest prevents incompatible
configuration changes. The default 120-minute wall-clock limit applies
to each invocation, and the script stops/terminates active workers at
the deadline. A short SIGINT also writes the current summary.

Optimization considers 16 (C,alpha) combinations: C in
{0.35,0.55,0.7,1.0}, alpha in {0,0.1,0.25,0.4}, plus a classic
UCT reference (sqrt(2), alpha=0, random rollouts). The sampled
expectimax mode and capped lookahead are otherwise held fixed.
Training uses 36 constructed encounter fixtures, with a 12-fixture
held-out set never consulted for selecting finalists. A progressive
schedule eliminates unpromising candidates and spends extra trials
on the survivors. Training-state seeds and independently evaluated
continuation dice are matched across candidates.

Each root action is selected by full canonical fair-information
MCTS, then scored on two **new, unobserved** canonical encounter
continuations, with survival preferred over Hero losses, HP loss
and Item consumption. Thus implicit alpha is assessed by how well
it changes root actions, NOT by reusing its own value predictions.
The selected constants are provisional: only held-out results and
the observed compute cost justify a recommendation.

Files in the chosen output directory:

- `manifest.json`: fixed parameters for safe restart
- `trials.ndjson`: append-only completed trials, one row per trial
- `summary.json`: training and held-out leaderboards, paired
  out-of-sample confidence intervals and CPU costs
- `best.json`: numeric C/alpha parameters for the best measured
  held-out candidate, its matched alpha=0 control at the same C,
  comparison with classic UCT, and whether improvement is demonstrated

**Scope:** these are controlled Monster encounter starts and
out-of-search encounter continuations, not 36-Room full expedition
win-rate measurements. The tuner never changes `mcts-hybrid-defaults.js`
automatically. Test the held-out winner in full expeditions before
promoting it to a production default.

The optimizer includes the no-implicit (alpha=0) counterpart at the
**same C** for each training finalist in the held-out phase. Paired
comparison resamples scenario IDs (cluster bootstrap), not arbitrary
rows. An inconclusive interval must not be advertised as an implicit
minimax speed or strength improvement.
