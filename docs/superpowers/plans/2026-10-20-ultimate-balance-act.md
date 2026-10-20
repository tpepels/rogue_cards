# Ultimate Balance Act implementation plan

**Goal:** Deliver the integrated experimental platform specified in `experiments/ultimate-balance-act.md` and the implementation handoff.

**Architecture:** Compile immutable declarative candidates into the existing staged canonical engine. Reuse the party-aware decision loop and event metrics. One deterministic worker laboratory supplies screening, adaptive Pareto search, held-out validation and card-impact compensation.

**Constraints:** Never promote cards automatically. Never change search defaults. Freeze agents independently of card optimization. Preserve physical-copy identities and fair hidden information. Report insufficient evidence honestly. Use no new runtime dependencies.

**Execution:** Implement directly on `feat/ultimate-balance-act`; parallel workers own disjoint files. The supplied architecture and explicit implementation request authorize execution without another design approval round.

## Interfaces and tasks

- [ ] Phase 0/2 foundation: `src/balance/candidate.js` exports `createCandidate(spec={})`, returning a deeply frozen `{schema,id,base,hash,...}`; `src/balance/compiler.js` exports `compileCandidate(candidate)` returning canonical `cardPools`, `printableDiff(candidate)` and `printableDeck(candidate)`. Candidate schema `uba-candidate-v1`, base `balanced-recovery-v1`, edits in `staging` (existing staging spec fields excluding schema/id), `additions` for allowlisted physical cards. Baseline is explicit Balanced B; raw catalogue remains explicit for historical suites. `src/balance/baseline.js` inventories exact physical copies and rules fingerprint. Test baseline print/live/fair sampling parity, immutability, joint changes, additions/removals and unsupported effects.
- [ ] Phase 1 telemetry/trial: `src/balance/trial.js` exports `playBalanceTrial({candidate,heroes,seed,profile,recordEvents=false,maxGameSteps})`, returning the existing party trial fields plus canonical event/resource/source metrics; `src/balance/profiles.js` exports `AGENT_PROFILES`, `getAgentProfile(id)`, immutable fixed reference/widening/priors/combined and weaker profile definitions. Tests prove enabled/disabled outcome parity, HP conservation/source attribution, no speculative event leakage and available/selected/resolved action counts.
- [ ] Phase 3 laboratory: `src/balance/runner.js` exports async `runLaboratory({candidates,profiles,parties,runsPerParty,seed,split,out,workers,budgetMs,maxTrials,...})`, yielding `{manifest,rows,complete,...}`. Runs canonical trials via worker_threads; persists candidate/profile/source fingerprints, deterministic task IDs, exact resumable plans and checksum-protected trials. `scripts/balance-run.mjs` consumes arbitrary candidate JSON files/directories. Tests cover incompatible resume, corrupt/duplicate/invented rows, partial final records, deterministic worker results, full 8+28 party plan and deadline/interrupt resume.
- [ ] Phase 3 scoring: goals JSON and loader separate constraints/targets; statistics supplies Wilson, stratified paired uncertainty; metrics preserve denominators and missing coverage; fitness produces objective vector and Pareto frontier. Tests exercise null denominators, weak Hero safeguards, missing data, duplicate seeds and multi-objective trade-offs.
- [ ] Phase 4 search: bounded declarative search-space paths; deterministic random/mutate/recombine, reject unsupported paths before simulation, hash cache, generation checkpoints, screening/refinement, diverse Pareto archive, finalists. `balance-optimize.mjs` persists exact configuration and reports printable trade-offs. Tests cover bounds/frozen parameters, reproducible resume, random baseline and independent agents.
- [ ] Phase 5 validation: lock finalists/goals before holdout, disjoint seed domains, compare fixed profiles, confidence/coverage thresholds and multiplicity, classify validated/rejected/uncertain. `balance-validate.mjs` reports solo/duo/Hero/pair/stage/source/endings, constraints and optional human feedback. Separate agent comparison freezes game and uses independent confirmation. Tests refuse tuning-only validation and underpowered success claims.
- [ ] Phase 6 impact: `balance-card-impact.mjs` evaluates a declarative add/edit/remove proposal with the same laboratory, constrains compensation edits, searches alternatives and validates proposals. Export full printable decks and diffs, report no feasible compensation honestly. Tests cover unsupported new mechanics and preservation of protected/proposed edits.
- [ ] Acceptance: run integrated tests and repository suite, execute genuine 2×2×2 Room × Monster × Item factorial, tiny full-party optimizer/holdout/resume/card-impact demonstrations, fresh review and fixes. Update roadmap checkboxes only with evidence; preserve unmet statistical gates explicitly.

## Review focus

Exact resume must detect changed dirty source, profiles, candidates and goals. Failed/capped nonterminal trials must never become losses. Missing telemetry must never become zeros in fitness. Physical duplicate Rooms must survive mid-run resampling. Tuning/validation collisions and incomplete Hero/pair coverage must prevent validation.

## Evidence ledger

- Initial repository clean; branch created for this implementation. Baseline suite launched before implementation.
- Supplied handoff explicitly requests executable implementation, not another design document; roadmap remains authoritative.
- Foundation, joint compiler, worker laboratory, bounded optimizer, independent validation and card-impact commands are implemented. Full repository verification: `npm test`, 533 passed / 0 failed; `git diff --check` clean.
- Actual engineering experiments: 288 factorial trials; 828 evolutionary and 828 random-control trials; two protected new-card compensation proposals; real held-out MCTS confirmation correctly classified as uncertain.
- Fresh reviews found and received failing regression tests plus fixes for objective order, policy coverage, missing telemetry, profile-aware pairing, physical complexity, REST normalization, Monster refill beliefs, starter reservation, Room legality/roll parity, profile normalization and active-search interruption.
- Statistical gates remain open: repeated adequately powered optimizer benchmarks; full required-party/profile confirmation; powered MCTS comparison. Working commands and preliminary outputs are not represented as validated balance results.
- Phase 1 follow-up closes known source attribution and healing availability accounting. Twenty actual seeded expeditions produced 369 positive HP events with no unknown source; the laboratory rejects missing annotations. Selection checkpoints now carry integrity hashes.
