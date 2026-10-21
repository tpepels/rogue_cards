# UBA PUCT agent selection — 20 October 2026

## Decision
Adopt PUCT with public-information priors, c = 0.70, without progressive
widening as the version-locked default for the next Ultimate Balance Act
optimization. Profile ID: `puct-c070-v1`.

Independent calibration confirmation at rollout budget 32 (96 solo trials
per arm, all eight Heroes, disjoint calibration seeds):
- Previous baseline: 31/96 wins (32.3%), 47.5 s mean search/expedition.
- Tuned PUCT: 60/96 wins (62.5%), 96.3 s mean search/expedition.
- Tuned PW only: 20/96 wins (20.8%).
- Tuned PUCT + PW: 55/96 wins (57.3%), 100.2 s mean search/expedition.

Decision is user-approved before budget-64 confirmation completed. A solo
result does not establish equivalent strength in duo play or at equal
wall-clock compute. No physical card or engine rules are changed.

## Search-policy identity
`puct-c070-v1` copies the solo study agent's search configuration:
budget 32 (minimum), UCT exploration 0.2, implicit weight 0.5,
solo-threat heuristic, frontier tree, fair knowledge, pragmatic tree-only
simulation, tree bonus 0.15, first visit 0.75, rollout preference 0.75,
implicit scales 1.0, and max 5000 search steps. PUCT uses coefficient
0.70. Progressive widening is disabled. Solo keeps the studied
solo-pragmatic equipment policy. Duo automatically selects the existing
party-efficient equipment policy and legacy implicit heuristic because
both selected solo controls reject multi-Hero parties; this duo use of
PUCT has not been independently validated.

The older UBA `reference-v1`, `weak-v1`, and earlier agent hashes stay
unchanged. Optimization and confirmation checkpoints are keyed by their
new profile identity and source bytes.

## Run after the current calibration command has stopped
```bash
cd ~/Projects/rogue_cards
git pull --ff-only
npm run test:uba
node --test tests/uba-puct-profile.test.mjs
node scripts/balance-optimize.mjs --goals experiments/balance-goals.json \
  --base balanced-recovery-v1 --workers 8 --budget-hours 12 \
  --out results/uba-puct-c070-v1
```

The CLI and library optimizer default to the pinned PUCT agent. Since
21 October 2026, NEW optimizer runs and standalone confirmation default to
**that PUCT agent only**, for both optimization and independent holdout. The
older reference/weak profiles can still be explicitly requested for separate
agent comparisons but are not part of standard balancing. Existing optimizer
checkpoints retain their originally locked validation-profile set to remain
resumable; use `--best-agent-only-validation` to explicitly amend the holdout
policy on a paused legacy checkpoint without discarding completed optimization
trials. The amendment is stored separately in
`validation-policy-override.json` and persists on subsequent resumes. If a
holdout with legacy profiles has already started, the command rejects an
in-place profile change; use a fresh validation output instead.
The historical `validation.profiles` array in `balance-goals.json` is
preserved to avoid invalidating the 20 October checkpoint and no longer
forces extra profiles in new validations. Existing balance targets are **not recalibrated**;
the PUCT agent has a higher observed solo baseline win rate than the
previous search agent, so optimizer scores/physical proposals must be
reviewed against the baseline under the same policy. A 12-hour run can stop with incomplete checkpointed trials. Resume requires
the same scientific inputs, but Git revisions and Node versions no longer
block continuation. Original trials and source snapshots are preserved, and
new source revisions are archived separately. Mixed code versions may change
experimental behavior: inspect provenance before drawing scientific conclusions.
Changing source code during an *active* worker run is still detected.


## Finish the active generation, then review

The optimizer stores a **zero-based** generation index: `g0`, `g1`, `g2`.
If `STATUS.md` says `Generation: 1 / 3` and `Stage: refine`, the run
is working on **g1**; `--stop-after-generation 1` is already behind the
active generation. An older version silently stopped without completing it.
That mismatch is now rejected.

To complete an already active `g1` refinement and stop without starting `g2`,
interrupt the original Node process with Ctrl+C, then:

```bash
cd ~/Projects/rogue_cards
git pull --ff-only
node --test tests/uba-optimizer.test.mjs tests/uba-results-status.test.mjs
node scripts/balance-optimize.mjs \
  --goals experiments/balance-goals.json \
  --base balanced-recovery-v1 \
  --workers 8 --budget-hours 12 \
  --out results/uba-puct-c070-v1 \
  --best-agent-only-validation \
  --stop-after-current-generation
npm run results:status
```

The flag requires an active saved generation, completes only that
generation, recomputes candidate fitness, and persists the checkpoint
at the **next** zero-based generation index. It exits with
`stopReason: generation-boundary` and `complete: false`.
The output now calls the field `completedGenerations`, not `generations`.
If the checkpoint is already between generations, it refuses to start
anything new. With the explicit numbered option,
`--stop-after-generation 2` is also appropriate for g1, but the
current-generation flag is safer when you are uncertain about the index.
All committed trial records and the optimizer lock remain unchanged.
