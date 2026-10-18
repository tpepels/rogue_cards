# Rogue Cards: research workflows and cleanup status

Updated 18 October 2026. **The print catalogue, canonical rules and game
effects are not altered by any of these studies.**

## Active experimental pipeline

### Phase A – Solo tactical research (already available)

```sh
npm run test:mcts-solo-overnight
npm run study:mcts-solo-overnight -- \
  --minutes 480 --workers 8 --budget 32 \
  --target-ms 1200 --max-budget 96 \
  --scenarios 192 --repetitions 12 \
  --c 0.35 --alpha 0.4 --seed 20261018 \
  --out results/mcts-solo-overnight
```

This **does not play full expeditions**. It tests a single canonical Monster
encounter's first search decision, followed by a fixed downstream policy.
It compares three implicit value functions and three sampled expectimax
intensities under equal-visits and approximately equal-CPU budgets.
The resulting `summary.json` includes actual sample counts, matched-seed
comparisons and computed search time. If a time-boxed run ends early, the
partial report must not be mistaken for a finished optimization.

### Phase B – Full solo Everything Goes balance (new, prepared)

Dry run to inspect the design, with **no data/files created**:

```sh
npm run study:solo:balance -- --dry-run \
  --runs-per-hero 80 --workers 8 --hours 12 \
  --budget 8 --c 0.35 --alpha 0.4 \
  --from-study results/mcts-solo-overnight/summary.json \
  --seed 20261101 --out results/solo-balance-v1
```

Start after the tactical experiment (80 independent seeds per Hero, so
the minimum per-Hero evidence gate can be assessed if all jobs finish):

```sh
npm run test:solo:balance
systemd-inhibit --what=sleep:idle \
  --why="Rogue Cards solo 36-Room balance" \
  npm run study:solo:balance -- \
    --runs-per-hero 80 --workers 8 --hours 12 \
    --budget 8 --c 0.35 --alpha 0.4 \
    --from-study results/mcts-solo-overnight/summary.json \
    --seed 20261101 --out results/solo-balance-v1
```

If the tactical run has too few evenly exposed candidate trials, the
automatic selector **fails rather than inventing a winner**. It reads
only the summary from the tactical study and chooses the highest
CPU-calibrated hybrid score among `legacy`, `solo-hp` and
`solo-threat`. For a deliberately specified profile, omit
`--from-study` and pass `--heuristic solo-threat` (or another
known profile). The balance run evaluates on new starting seeds.

Three arms compete **on matched initial full-expedition seeds** for each
of the eight individual Heroes: plain UCT, UCT+implicit, and
UCT+implicit+sampled-expectimax. All three commit every move through the
same canonical 36-Room `everything-goes` game. All live episodes must
end in a genuine printed win, death or escape; nonterminal/stalled/
unimplemented branches halt the run with an error and are not treated
as losses. They use equal MCTS visit budgets, **not** equal CPU time.
Actual search seconds are recorded separately.

The `summary.json` reports per-Hero win rates with Wilson confidence
intervals, Vault reach, 36-normal-Room completions, regional Monster
encounters and fights, Monster deaths, causes of death, Elbereth,
Parley and Item activity. It also reports exact paired agent comparisons
on completed shared Hero-seed records.

The current solo design targets remain:
- Approximately 40% full solo expedition wins.
- Approximately 50% of expeditions reach the Vault.
- 16–20 ordinary Monster encounters *among runs actually visiting
  all 36 normal regional Rooms*.
- 55–70% encounter-to-fight conversion (ordinary Monsters only).
- 10–20% max-HP loss per ordinary combat, using the engine's
  **combat-context** damage rather than all-source HP damage.

These are target ranges, not passing correctness assertions. The
80-per-Hero protocol requires up to 1,920 full games (8 Heroes × 80
seeds × 3 policies); a 12-hour wall limit may leave the report partial,
and the output can be resumed on the exact same Git revision. To first
measure throughput, use a separate `--runs-per-hero 2 --out results/
solo-balance-pilot` directory; those results do NOT meet the balance
sample threshold. Small samples are inconclusive, and *card causality*
requires subsequent
paired card interventions rather than interpreting usage as power.

### Study storage and reproducibility

The balance directory saves `manifest.json` (including source Git SHA,
fixed study parameters and optional nightly study hash),
`trials.ndjson` (every completed canonical expedition) and
`summary.json` (checkpointable descriptive and paired results).
Repeat the **identical** command to resume; any change to the source
revision or source tactical study fails closed. No study output under
`results/` belongs in Git, and no source file is deleted in order to
resume a run.

## Research catalogue: active, supporting and historical

The top-level `scripts/` directory accumulated numerous parameter
studies, throughput benchmarks and one-off diagnostics. They are
**not interchangeable** and should not all be recommended to players.
The following categorization is the supported entrypoint:

| Lifecycle | Commands / files | Intended use |
|---|---|---|
| Active, solo | `study:mcts-solo-overnight`, `study:solo:balance` | Tactics first; full solo balance second |
| Active, testing | `test:mcts-solo-overnight`, `test:solo:balance`, `test:session` | Regression and canonical integrity |
| Supporting | `src/session-mcts.js`, `src/mcts-implicit.js`, `src/session-policy.js`, `scripts/tune-mcts-hybrid-core.mjs` | Shared implementations; do not delete |
| Historical experiments | `study:mcts-factorial`, `tune:mcts-implicit`, `bench:mcts-combat-hybrids`, Phase 2/2b/2c diagnostics | Reproduce the previous non-solo or two-Hero studies; **not** the current balance protocol |
| Separate, still useful | `oracle:all-cards`, `audit:canonical`, `validate:deck`, `layouts:build` | Card reachability, correctness and print tooling |
| Legacy comparisons | `balance`, `study:planner`, `oracle:play`, `study:everything` | Different policy/edition assumptions; don't mix estimates across revisions |

### Safe cleanup audit

The October 2026 repository inventory contained 469 tracked files,
67 `.mjs` scripts and 71 tests. Nearly all runnable scripts are linked
from `package.json` or directly imported by tests/other scripts.
A small number of files without npm commands are **shared modules**,
for example `tune-mcts-hybrid-core.mjs`, `validation-report.mjs`
and `illustration-catalogue.mjs` (used by artwork tooling).
Lack of an npm script **alone does not prove dead code**.

Changes made:
- Removed `scripts/analyze-encounter-pacing.mjs`, a standalone,
  pre-expansion analyzer with a hard-coded Monster roster that no
  longer matches the Everything Goes catalogue; the source remains
  recoverable from Git history.
- Removed a duplicate `nextDefenseBonus` initializer in
  `src/engine/expedition-state.js`, without changing the value.
- Added one canonical full-solo balance entrypoint instead of modifying
  or breaking old studies.
- Kept old research files that have test/import/CLI consumers. Their
  results remain historically reproducible, but are **not** current
  balance evidence.

Future removals should require a dependency/reference audit and a
green regression suite; do not delete old tests or artifacts merely
because their naming predates the current rulebook.
