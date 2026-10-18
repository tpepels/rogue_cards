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

**Important finding from the completed overnight run:** the `solo-threat`
implicit policy chose Elbereth **flee** in 1,434 / 2,304 equal-visits
encounter starts (62.2%), versus 119 / 2,304 (5.2%) for UCT.
The root encounter score counts safely leaving a Monster as `clear`,
even when the Monster was not killed and its DEFEAT reward was not
earned. Therefore the large encounter-level gain is NOT proof that
the full expedition benefits. This is precisely what the next
full-expedition balance study must independently determine.



Dry run to inspect the design, with **no data/files created**:

```sh
npm run study:solo:balance -- --dry-run \
  --runs-per-hero 80 --workers 8 --hours 12 \
  --budget 8 --c 0.35 --alpha 0.4 \
  --from-study results/mcts-solo-overnight/summary.json \
  --seed 20261101 --out results/solo-balance-v2
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
    --seed 20261101 --out results/solo-balance-v2
```

If the tactical run has too few evenly exposed candidate trials, the
automatic selector **fails rather than inventing a winner**. It reads
only the summary from the tactical study and chooses the highest
CPU-calibrated **implicit-only** score among `legacy`, `solo-hp` and
`solo-threat` when using the two-arm default. It compares hybrid
scores only when the `hybrid` arm is explicitly included. For a deliberately specified profile, omit
`--from-study` and pass `--heuristic solo-threat` (or another
known profile). The balance run evaluates on new starting seeds.

The **default** study now runs TWO arms **on matched initial
full-expedition seeds** for each of the eight individual Heroes:
plain UCT and UCT+implicit using the best sampled SOLO heuristic.
Expectimax was 6–19x more expensive per root decision but provided
no reliable improvement in the finished 46,080-trial solo encounter
audit. For a separate exploratory full-expedition comparison, pass
`--arms uct,implicit,hybrid`; do NOT conflate its different compute
cost with a fair time-budget match. Both selected policies (or all three with the opt-in)
commit every move through the same canonical 36-Room `everything-goes` game. All live episodes must
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
80-per-Hero default requires 1,280 full games (8 Heroes × 80 seeds
× 2 policies), or 1,920 with optional `--arms uct,implicit,hybrid`.
A 12-hour wall limit may leave the report partial,
and the output can be resumed on the exact same Git revision. To first
measure throughput, use a separate `--runs-per-hero 2 --out results/
solo-balance-pilot` directory; those results do NOT meet the balance
sample threshold. Small samples are inconclusive, and *card causality*
requires subsequent
paired card interventions rather than interpreting usage as power.

### Complete decision-level statistics and replay audit

`study:solo:balance` now defaults to `--trace full`, with one
`traces/<hero>-<replicate>-<policy>.jsonl.gz` archive **for every finished
expedition**. The raw file is canonical, not a reconstructed/synthetic
playthrough. For every actual decision boundary, it records:

- step, phase, full legal actions, chosen action, search time, and
  whether the engine suspended for a nested reaction; for every
  MCTS-selected action also the root action visit counts, estimated
  win rates, implicit values, search budget and number of tree nodes;
- complete **before/after** public and mutable non-pile state:
  Room identifier/stage/kind, active Monster and HP, queued Monsters,
  all Hero HP/poison/scalar statuses, equipped slots, each physical Item
  copy, deck counts, seen/kept/discarded Rooms and stage progress;
- complete canonical **metrics diff** across that decision, preserving
  all Room, Monster, Item, combat, status and Vault counters;
- actual committed die outcomes when emitted by the decision API,
  RNG states before/after, and a precise state delta.

Each `trials.ndjson` row also stores ALL final engine metrics,
final HP/status/physical inventory, full initial and final snapshots,
a trace filename, SHA256 digest, compressed size and recorded decision
count. Saved trials without a corresponding trace are rejected on
resume in full-trace mode. The file is written atomically before the
result row is checkpointed; failed episodes are not counted as finished.

The raw log deliberately does **not** duplicate the order of every
unseen hidden deck card. Hidden piles can be reconstructed from the
fixed initial seed/version and recorded RNG trajectory; the log itself
contains public pile counts and all actual exposed outcomes. It is an
audit of committed actions, **not** a record of speculative MCTS
rollouts.

Generate a separate detailed per-run and grouped report:

```sh
npm run report:solo:balance -- --dir results/solo-balance-v2
```

This verifies every compressed trace's SHA256 and reconstructs:
- by Hero, policy and expedition: outcome, reached depth, Rooms entered
  and completed, stage, chosen actions, HP lost/healed, die faces,
  poison/status transitions, Items obtained/used/equipped/discarded;
- by specific Room, Monster and Item ID: encounters, fights, kills,
  escapes, parleys, Item acquisitions/activations and relevant
  committed changes;
- comparison of reconstructed final Rooms and encounters to the
  canonical terminal counters. Mismatches fail, not silently disappear.

Produces `details.json`, alongside `summary.json` (compact
balance KPIs), `trials.ndjson` (one row per completed expedition) and
the detailed `traces/` directory.

**Capacity note**: full traces use additional CPU time, disk and memory,
especially with eight simultaneous workers. If a timing-only benchmark
is needed, `--trace off` disables event capture, but such results
cannot supply full action-level balance evidence. Trace mode is fixed
in the resume manifest; do not mix traced and untraced trials.

**Versioning note**: trace schema and instrumentation changed after
the earlier 32-expedition pilot. Old results cannot retroactively
recover per-decision telemetry and MUST NOT be used to claim exhaustive
statistics. Run a fresh output directory from a single pinned commit.

### Resuming the October Wisp-counter pilot without losing completed games

In the 18 October 2026 fully traced pilot, a runner-side assertion
mistakenly assumed `encounterStarts >= sum(monsterVisits)`. A pursuing
Will-o'-Wisp is intentionally registered again by
`completePrintedRoomChoice()` **without** drawing a new Monster.
`encounterStarts` counts newly drawn encounters; `monsterVisits`
counts appearances, including that returning Wisp. The false
assertion now has been removed from the runner. The detailed report
also validates both counters separately against their own canonical
metric deltas.

To resume **only the original fully traced pilot** while preserving
its existing completed episodes:

```sh
cd ~/Projects/rogue_cards
git pull --ff-only
npm run test:solo:balance
npm run study:solo:balance -- \
  --workers 8 --hours 2 --runs-per-hero 2 \
  --budget 8 --c 0.35 --alpha 0.4 \
  --from-study results/mcts-solo-overnight/summary.json \
  --seed 20261101 \
  --out results/solo-balance-pilot-telemetry \
  --resume-compatible-metrics-fix
```

The optional flag **does not automatically mix revisions**. It
requires identical study parameters, a complete per-episode compressed
trace for every saved row, matching SHA256 checksums, matching final
Hero HP, a clean checked-out source tree, an ancestor revision, and
only permitted **observational/instrumentation** file changes between
revisions. It backs up the old manifest before installing a new one
that records the old and new revisions, completed-row count, exact
changed files, and migration time. New rows include their specific
code revision. If any test fails, it rejects the migration; do not
override that rejection or edit signatures manually. Instead use a
new `--out` directory and rerun.

Previous results without decision traces (including the older
`71ddd31` pilot) cannot be migrated by this command; they remain
historical and must stay in a separate output directory.

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
