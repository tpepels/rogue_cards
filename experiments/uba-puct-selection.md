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

The CLI and library optimizer default to the pinned PUCT agent. Independent
validation also includes that agent, plus the prior `reference-v1` and
`weak-v1` controls. Existing balance targets are **not recalibrated**;
the PUCT agent has a higher observed solo baseline win rate than the
previous search agent, so optimizer scores/physical proposals must be
reviewed against the baseline under the same policy. A 12-hour run can
stop with incomplete checkpointed trials; resume with exactly the same
scientific inputs and code revision. Do not git-pull or change engine
source while another checkpointed study is still running.
