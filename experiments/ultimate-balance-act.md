# Ultimate Balance Act — architecture and development roadmap

**Project:** Rogue Cards  
**Status:** Architecture agreed in principle; implementation **not started** as a unified optimizer  
**Baseline:** Canonical Balanced B Rooms and the current printed rule set  
**Owner/decision maker:** Game designer; the optimizer may recommend, never automatically change canonical cards  
**Last roadmap update:** 2026-10-19

> This document is the long-lived roadmap and phase tracker for **Ultimate Balance Act (UBA)**. Keep it up to date when beginning or completing work; record decisions and evidence rather than silently changing targets. Existing balance-study scripts are reusable foundations, not evidence that a UBA phase is complete.

## 1. Mission

Build **one automatic, reproducible balancing system** that:

1. **Optimizes:** explores combinations of Room composition, Monster stats, Item quantities, printed recovery effects, Hero stats and Warden difficulty rather than isolated one-factor hypotheses.
2. **Validates:** checks candidates with independent runs, uncertainty estimates, individual Hero outcomes and multiple player policies.
3. **Evaluates new cards:** measures the impact of adding/changing/removing a physical card and proposes compensating changes where useful.

**Non-negotiable principle:** The optimizer must find balance using the *actual, physical, printed* game. It must not rely on hidden rules, automatic post-fight healing, unprintable effects or a separate simulation engine. Numeric healing injections (such as the +N HP study) remain *diagnostics only*, never deployable design candidates.

A candidate is a **proposal**, not a modification to the canonical cards. A human explicitly decides what to adopt.

## 2. Design targets and constraints

Treat the following as **initial targets, not statistically established facts**. Store their final definitions, acceptable ranges and validation sample sizes in a versioned machine-readable goals file during Phase 0/3.

| Measure | Initial target | How to interpret it |
|---|---:|---|
| Solo expeditions reaching Vault | 60% | Of **all** started runs, whether early trapdoors shorten the journey or not |
| Success after entering Vault | 60% | Wins / runs entering Vault; report Warden-fight and SEAL pathways **separately** |
| Overall solo victory probability | ~36% | Derived: 0.60 × 0.60; do not optimize it independently as if unrelated |
| Ordinary Monster encounters | 16–20 / 36 Rooms | Report observed complete-36 runs **and** normalized 36-Room equivalents, not as interchangeable quantities |
| Encounters leading to combat | 55–70% | Ordinary Monster fights / ordinary encounters |
| Automatic bonus healing after fighting | **0 HP** | Hard requirement for printable solutions; printed Monster/Room/Item healing remains legal |
| Every Hero playable | Yes | Set minimum per-Hero survival/performance safeguards rather than hiding weak Heroes in an average |
| Meaningful alternative decisions | Yes | Monitor diversity, opportunity rates, dominant strategies and risk/reward decisions |
| Solo human play time | 90–120 min | Requires actual human-playtest calibration; simulation runtime cannot establish this |
| Physical rules/deck validity | Mandatory | No unsupported opcodes, missing starter Items or impossible card counts |

Also measure: Vault entry HP, survival by depth, damage and healing by source, effective/wasted healing, Item acquisition/use, Warden combat participation, 36-Room completion, number/length of fights and causes of death.

The project may later add **duo** targets (previous design preference: ~55% victory and 120–150 min), but do **not** claim solo calibration covers duo play.

### Hard constraints versus objectives

- **Hard constraints:** physical/engine parity; canonical rule semantics; no hidden auto-heal; allowed card effect grammar; valid card identities and quantities; immutable canonical data during experiments; complete/replayable experiments.
- **Objectives:** Vault access, conditional victory, encounter density, fight conversion, Hero fairness, risk/reward choices, minimal rules/card churn.
- **Manual assessments:** fun, tension, clarity, handling time and actual physical game duration.

Avoid optimizing solely for a scalar win-rate: that can reward brittle or tedious mechanics.

## 3. Architecture

~~~text
Versioned Balance Goals + Search Space + Hard Constraints
                           |
                           v
                Candidate Generator
                (initial pool / mutations
                 / recombination / proposals)
                           |
                           v
               Candidate Compiler & Validator
               (declarative printable rules)
                           |
                           v
              CANONICAL SIMULATION LABORATORY
            +-------------------------------+
            | Existing ExpeditionState      |
            | Existing decision-session     |
            | Existing fair-knowledge MCTS  |
            | Multiple fixed agent profiles |
            | Parallel, resumable runner    |
            +-------------------------------+
                           |
                           v
                  Event-level Telemetry
                           |
                           v
              Metrics + Fitness + Uncertainty
                    |               |
                    +--> Optimizer <-+
                           |
                   Diverse Pareto finalists
                           |
                           v
                 Independent Holdout Validation
                           |
                           v
                 Human-readable Design Proposals
                   / Card Impact Reports
                   / Optional Print Export
                           |
                   MANUAL ACCEPTANCE ONLY
~~~

### Existing components to reuse

| Component | Intended role | Current caveat |
|---|---|---|
| `src/engine/expedition-state.js` | Authoritative mutable rules state | Audit exact parity for staged physical repeats and all card operations |
| `src/engine/decision-session.js` | Player decisions and rule execution | Preserve transactional and speculative-decision correctness |
| `src/session-mcts.js` | Test-player search | A single policy is not a proxy for all human behavior |
| `experiments/agents/solo-balance-reference-v1.json` | Frozen reference player | Never silently retune or overwrite during comparisons |
| `src/staging/catalogue.js` | Safe declarative candidate compiler | Currently only supports a limited set of card fields and Room op rewrites |
| `scripts/study-balance-hypotheses.mjs` | Reusable parallel, resumable study runner | Currently suite-specific rather than search-driven |
| `scripts/study-solo-expedition-balance.mjs` | Full-expedition trial | Extend event-level metrics and diagnostics |
| `src/decks.js` / printbuilder | Materialize the selected printable deck | Align all copies and Room pools with the authoritative candidate manifest |
| `src/room-balance.js` | Current Balanced B Room recipe | Must be the same source of truth for play, staging, MCTS and printing |

**First known architectural gap:** `canonicalStagingCatalogue()` still starts from the full ordinary Room catalogue, whereas canonical Everything Goes play uses Balanced B. The unified system must make the **baseline deck explicit and identical** across compilation, execution, rollout resampling and reporting. Do not use the old “canonical = all Rooms” assumption as the control for Balanced B experiments.

### Proposed modules (not yet implemented)

~~~text
src/balance/
  goals.js          Targets, bounds, weights and hard constraints
  candidate.js      Immutable versioned candidate definition
  compiler.js       Candidate -> staged canonical card pools
  validator.js      Physical and executable-rule constraints
  metrics.js        Event-level and expedition-level measurements
  fitness.js        Multi-objective scores / constraint violations
  mutations.js      Search operators and physical-deck-preserving mutations
  optimizer.js      Multi-fidelity, multi-objective candidate search
  statistics.js     Paired estimates, CIs, holdout and policy robustness
  card-impact.js    Add/change/remove card analysis

scripts/
  balance-optimize.mjs
  balance-validate.mjs
  balance-card-impact.mjs
~~~

These are *target names*, not a requirement to create every file immediately. Prefer simple code over an artificial framework.

## 4. Candidate specification

A candidate is **data**, never arbitrary JavaScript generated or executed during optimization.

It identifies an immutable base edition/revision and explicit deltas such as:

- Per-stage Room IDs and **physical copy counts** (including duplicates and Corridors).
- Monster HP/ATK/DEF, regional copies, behaviors and **supported printed reward operations**.
- Hero HP/ATK/DEF/WIT within declared safe ranges.
- Item quantities, supported printed effects and costs.
- Warden phase stats and permitted printed phase/ending variants.
- Healing through printed Room decisions, Items, Monster DEFEAT rewards, or other supported physical actions, **not automatic `postCombatHeal`**.

Every candidate has a stable content hash. The compiled object, actual expedition, fair MCTS samples and printed deck must agree on card counts and semantics. Keep per-*physical copy* accounting: duplicate Room IDs are intentionally legal.

**Unsupported card mechanics:** Reject clearly or require explicit new deterministic engine/print handlers with tests. Never silently assume new rules exist.

## 5. Optimization methodology

1. **Generate valid configurations only.** Respect stage progression, copy bounds, fixed cards, starting equipment, action legality and printable wording.
2. **Cheap screening.** Run limited reproducible seeds per Hero to reject clearly dominated or invalid candidates.
3. **Adaptive allocation.** Invest more trials in promising or uncertain arms; preserve adequate coverage across all eight Heroes.
4. **Joint optimization.** Use constrained multi-objective evolution (e.g. Pareto/NSGA-style), mutations and recombination. Begin with a simpler reproducible search baseline before adopting sophisticated algorithms.
5. **Preserve diversity.** Retain several non-dominated play styles instead of optimizing a single opaque score.
6. **Independent confirmation.** Fresh, held-out Hero/seed sets; report uncertainty, not merely point estimates.
7. **Policy robustness.** Validate with different agent profiles and stronger search budgets; distinguish AI artifacts from rules-driven effects.
8. **Human playtest feedback.** Separate measured/verified simulation outcomes from calibrated play duration, engagement and perceived tension.

### Measurement cautions

- Report **conditional** Warden victory separately from **overall** win rate and from Vault access.
- Report actual 36-Room survivor encounters separately from 36-equivalent extrapolations; trapdoors and premature death matter.
- Healing “offered” and **actual HP restored** differ due to HP caps, timing, Items used and early deaths.
- Do not treat many repeated starts of one Hero as independent evidence for all Heroes.
- A candidate selected after exploring many arms is not “proven” until a genuinely independent holdout.
- Paired seeds improve comparison precision but paths, RNG consumption and MCTS behavior can diverge after a change.
- Fitness targets should have **predeclared tolerances** and confidence requirements; do not retrofit thresholds to results.

## 6. Development phases and progress tracker

Update the checkboxes on completing tasks. A phase is **complete only when its acceptance gate passes**, not when files merely exist.

| Phase | Name | Status | Milestone |
|---|---|---|---|
| **0** | Canonical foundation and goals | ⬜ Planned | One physical baseline for all pathways |
| **1** | Universal telemetry | ⬜ Planned | Explain where HP, deaths and decisions came from |
| **2** | Universal candidate system | ⬜ Planned | Combine multiple printable changes in one candidate |
| **3** | Batch simulation and fitness | ⬜ Planned | **First useful MVP** |
| **4** | Autonomous optimization | ⬜ Planned | System discovers candidates without hand-authored hypotheses |
| **5** | Statistical confirmation and robustness | ⬜ Planned | Reliably accept/reject/flag candidate evidence |
| **6** | Card impact and rebalancing | ⬜ Planned | Add/change a card and generate viable counter-adjustments |

### Phase 0 — Canonical foundation and goals

**Goal:** one exact, versioned definition of “the game we are balancing.”

- [ ] Introduce a versioned `balance-goals` definition with agreed targets, constraints, metric denominators and acceptance tolerances.
- [ ] Centralize Balanced B as a complete physical-deck manifest (including duplicate Rooms, Items, Monsters, fixed cards and allowed variants).
- [ ] Fix/replace staging's differing canonical Room baseline; explicitly select the control deck for each study.
- [ ] Verify physical-copy equality across printbuilder, game state, MCTS fair resampling, staging and reports.
- [ ] Add deterministic smoke/parity tests for initial decks, mid-run revealed/visited/discarded copies and resulting print quantities.
- [ ] Freeze and identify reference game revision, cards, agent profile and validation seed sets.

**Acceptance gate:** one manifest deterministically produces identical expected physical copies and semantics in all consumers, with regression tests; all old baseline assumptions audited.

**Output:** authoritative deck manifest, goals file, parity test suite, baseline report.

### Phase 1 — Universal telemetry

**Goal:** explain the sources and decisions behind balance outcomes.

- [ ] Define a stable event schema covering Room/Monster draws, encounter start, fighting/parley/retreat, damage, healing, Items, Warden transitions and ending.
- [ ] Attribute HP lost/restored to the specific printed card, effect, decision and depth.
- [ ] Record healing opportunities **available / offered / selected / effectively applied / wasted**.
- [ ] Track current HP at Room entry/exit, before/after each fight and at Vault entry.
- [ ] Measure opportunity and selection rates for meaningful alternatives, including whether one strategy dominates.
- [ ] Aggregate outcomes by Hero, stage, physical card and complete expedition.
- [ ] Make event tracing optional/efficient; preserve exact outcome parity with telemetry disabled.

**Acceptance gate:** a sampled run can be reconstructed into a truthful HP/resources timeline, and adding telemetry does not change seeded outcomes.

**Output:** event schema, per-run diagnostic trace, balance metrics library.

### Phase 2 — Universal candidate system

**Goal:** specify multiple simultaneous, printable changes in one candidate.

- [ ] Create immutable `BalanceCandidate` schema and stable candidate hash.
- [ ] Generalize `compileStaging()` into an independently usable candidate compiler.
- [ ] Support Room composition/copies, Monster parameters/copies, Item copies, Hero stats and Warden parameters together.
- [ ] Add validated, printed **Monster defeat and Room/Item healing** edits using an allowlisted executable opcode vocabulary.
- [ ] Reject unsupported effects, impossible card configurations and implicit mechanics.
- [ ] Verify compiled game rules match actual card effects and the printable deck.
- [ ] Add combined-intervention tests and an executable no-change reference candidate.

**Acceptance gate:** one candidate simultaneously changes Room distribution, Monster stats and recovery opportunities in both live gameplay and MCTS, without changing any original card objects.

**Output:** candidate schema/compiler/validator, combined-candidate examples.

### Phase 3 — Batch simulation and fitness (**MVP**)

**Goal:** test *many jointly varying candidates* from one CLI and report actionable trade-offs.

- [ ] Unify suite-specific experiments behind one runner accepting a list of candidates.
- [ ] Implement per-Hero fixed/paired seed plans, worker pools, checkpoints and safe exact resumption.
- [ ] Implement hard constraints separately from a multi-objective fitness function.
- [ ] Include Vault reach, conditional wins, encounters, fight conversion, Hero equity and meaningful-choice metrics.
- [ ] Produce comparable `manifest.json`, raw trials, summary, and human-readable comparisons.
- [ ] Include a factorial or designed combined test that demonstrates non-additive interactions.
- [ ] Add output provenance: candidate hash, agent/profile hash, code revision, seeds, budget and compiler version.

**Acceptance gate:** **one command** tests mixed Room × Monster × healing/Item candidates, can resume, and reports statistically honest comparisons without hand-adding a study suite.

**Output:** `balance-runner`, initial fitness metrics, first joint-optimization report.

### Phase 4 — Autonomous optimization

**Goal:** find promising combinations without manually writing each hypothesis.

- [ ] Implement legal candidate mutations (add/remove/swap physical cards, stats, rewards and supported effects).
- [ ] Implement seeded generation, optional recombination and bounded search-space definitions.
- [ ] Introduce efficient first-pass simulations and adaptive trial allocation.
- [ ] Preserve a diverse Pareto frontier of valid candidate sets.
- [ ] Prevent repeated identical candidates using hashes and cached results where valid.
- [ ] Support CPU/time budget caps, interrupt/resume and transparent progress.
- [ ] Benchmark against random search and hand-designed Balanced B adjustments.

**Acceptance gate:** on at least one constrained benchmark, repeated optimization reliably finds candidates that dominate the starting baseline across predefined objectives, within a fixed computational budget.

**Output:** `balance-optimize`, Pareto candidate archive, reproducible benchmark.

### Phase 5 — Statistical confirmation and robustness

**Goal:** separate genuine improvements from Monte-Carlo noise and agent exploitability.

- [ ] Lock candidates and goals **before** opening independent holdout seeds.
- [ ] Establish appropriate confidence intervals/paired comparisons, with Hero clustering and multiple-arm selection explicitly handled.
- [ ] Evaluate all eight Heroes individually and report minimum/fairness constraints.
- [ ] Cross-check with alternative policies/search budgets, including less optimized play.
- [ ] Distinguish Vault wins through combat vs SEAL, and conditional combat outcomes.
- [ ] Assign `validated`, `rejected`, or `uncertain` only by predeclared acceptance rules.
- [ ] Add an explicit human playtest-feedback input for enjoyment and real-time duration.

**Acceptance gate:** candidates cannot be marked validated using their own tuning trials, and failures/uncertainties are explained.

**Output:** `balance-validate`, independent validation report and decision log.

### Phase 6 — Card impact and automatic rebalancing

**Goal:** assess adding/modifying a physical card and restore overall balance.

- [ ] Accept a proposed new card with a valid printed and executable effect definition.
- [ ] Compare baseline vs new card at allowed copy counts using paired seeds and per-card telemetry.
- [ ] Measure synergies, replacement effects, Hero-specific impact and opportunity/activation rates.
- [ ] Restrict optimization to explicitly allowed compensating edits (“do not touch these cards”).
- [ ] Produce a small set of alternative patches with estimated statistical outcomes and gameplay trade-offs.
- [ ] Generate a printable deck proposal and diff **without committing canonical card changes**.
- [ ] Validate the chosen proposal again using independent trials.

**Acceptance gate:** given one valid new Room/Monster/Item, the tool provides a credible impact analysis and at least one legal compensating proposal—or explicitly reports that no feasible solution was found.

**Output:** `balance-card-impact`, proposed card/deck patch, print preview and validation evidence.

### Optional Phase 7 — Designer interface

Only after the CLI and validation are reliable:

- [ ] Dashboard for goals, Pareto candidates and uncertainty.
- [ ] Per-Hero, per-stage and per-card drill-down.
- [ ] Side-by-side printable candidate diffs.
- [ ] Interactive inclusion/exclusion and “freeze this parameter” controls.
- [ ] User-initiated approval/export; never silent canonical edits.

## 7. Milestones and development order

**M0: Trust the baseline** — Phase 0 complete.  
**M1: Understand attrition** — Phase 1 complete.  
**M2: Express joint changes** — Phase 2 complete.  
**M3: One command, all hypotheses** — Phase 3 complete (**MVP**).  
**M4: Automatic search** — Phase 4 complete.  
**M5: Independently defensible result** — Phase 5 complete.  
**M6: Drop in a new card and rebalance** — Phase 6 complete.

**Recommended order:** 0 → 1 → 2 → 3 → 4 → 5 → 6. Bring forward the independent-seed discipline and elementary statistical checks from Phase 5 into Phase 3 so the optimizer does not train on invalid evaluation practices.

Do **not** start with a large evolutionary framework or UI. First demonstrate reproducible, combined candidate evaluation with a real printed deck.

## 8. Proposed command-line UX (future, not yet implemented)

~~~bash
# Joint test of a fixed set of candidate manifests
node scripts/balance-run.mjs \
  --goals experiments/balance-goals.json \
  --candidates experiments/candidates/ \
  --workers 8 \
  --out results/ultimate-balance-batch

# Autonomous search
node scripts/balance-optimize.mjs \
  --goals experiments/balance-goals.json \
  --base balanced-b \
  --workers 8 \
  --budget-hours 10 \
  --out results/ultimate-balance-v1

# Independent held-out validation
node scripts/balance-validate.mjs \
  --candidate results/ultimate-balance-v1/finalist.json \
  --out results/ultimate-balance-validation

# New card or card revision impact and compensating proposals
node scripts/balance-card-impact.mjs \
  --card experiments/new-card.json \
  --base balanced-b \
  --out results/new-card-impact
~~~

All of the above are **proposed interfaces**, not commands available in today's repository.

## 9. Operational rules for future coding agents

1. Start by reading **this file**, `src/staging/catalogue.js`, `src/room-balance.js`, and the canonical engine / MCTS test paths.
2. Work one phase at a time; update task checkboxes and status **only with test evidence**.
3. Never modify canonical printed cards as a side effect of running an optimizer or experiment.
4. Do not weaken or quietly move goalposts to make a candidate appear successful.
5. Every new optimization parameter must have a valid physical manifestation, except explicitly labeled diagnostic-only parameters that cannot be deployed.
6. Keep raw data, source revision, candidate hashes, seeds, agent profile and objective definitions reproducible.
7. Require parity tests for changes touching fair hidden-deck resampling and duplicate physical Room IDs.
8. Publish both improvements and regressions, including cross-Hero failures and evidence uncertainty.
9. At each phase, write a **short completion note** below explaining implementation paths, tests and known limitations.
10. Human approval remains required for adopting recommendations into printed canonical card definitions.

## 10. Progress and decision log

| Date | Change | Evidence / next step |
|---|---|---|
| 2026-10-19 | Roadmap created. Phase 0 next. | Existing engine/MCTS/staging/study pipeline provides a starting point; no unified autonomous optimizer exists yet. |
| 2026-10-19 | Balanced B selected as the current physical Room baseline. | Must unify the default staging baseline with gameplay/print; see Phase 0. |
| 2026-10-19 | Diagnostic after-fight healing study used to estimate required recovery capacity. | **Not** permission to add automatic healing to the final game; use findings to redesign printed rewards/choices. |

### Phase completion notes

_Add entries here when a phase or acceptance gate is verified._

- **Phase 0:** not started.
- **Phase 1:** not started.
- **Phase 2:** not started.
- **Phase 3:** not started.
- **Phase 4:** not started.
- **Phase 5:** not started.
- **Phase 6:** not started.
