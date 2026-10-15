# Small MCTS diagnostics pilot (new card revision)

This is an exploratory **one-source/three-agent** study, not a new balance
simulator. All three agents execute complete expeditions using the same
canonical engine, the same initial game seed, and fair-information MCTS.
The previous 360-pair study on revision `6129a115` found that the larger
frontier search **lost more often**, so do not assume more visits help.

## Exactly what this compares

| Arm | Tree | Budget (minimum) |
| --- | --- | ---: |
| `classic2` | historical full-tree | 2 |
| `classic16` | historical full-tree | 16 |
| `frontier16` | sparse frontier UCT | 16 |

The actual requested budget is `max(configuredBudget, legalActionCount)`
for all three. This preserves full legal-action coverage at the root.
A source seed is run **only three times**, not once for every pair.

Two controlled questions:

1. `tree-16`: full vs frontier at equal search budget (16).
2. `budget-full`: full-tree budget 2 vs 16 (same algorithm).

A third **descriptive, confounded** contrast, `old-vs-deep`, compares
classic2 and frontier16 to locate where the historically worse agent's
first action disagreement occurs. It costs **no additional expeditions**.

In losing pairs the runner retains compact early decision traces:
Room, combat, reaction, equipment, chosen legal action, current HP, carried
Items, equipped Items, and Room progress. The summary aggregates the
category of the **first action split** and prints up to 12 examples per
contrast. Differences *after* that first split do not establish causation.

Every source's checkpoint also records ending HP, inventories, damage,
kills, terminal result and approximate effort. Other traces are discarded
to keep storage and memory use modest.

## Recommended laptop pilot

Use a separate pinned worktree of the experiment branch. Do not reuse
the old studies' audits/checkpoints: card rules have changed.

```bash
npm run test:session
npm run validate:deck
npm run audit:canonical -- --runs 36 --seed 20261016 --max-steps 3000 --out results/audit-mcts-diagnostics
npm run oracle:mcts-diagnostics -- --runs 36 --workers 6 --hours 2 --seed 20261016 --low-budget 2 --high-budget 16 --trace-limit 120 --job-minutes 30 --audit results/audit-mcts-diagnostics/summary.json --out results/mcts-diagnostics-pilot
```

The pilot covers all 8 solo Heroes and 28 two-Hero parties exactly once,
in the same source-index order as the existing canonical studies. It does
not have sufficient power for individual-card rebalancing, and intermediate
p-values are descriptive only.

If interrupted, rerun **the same command with `--resume`** to skip
completed three-agent source checkpoints. You can use tmux or just stop
with Ctrl+C. The run has a two-hour dispatch cap, six worker threads
(leaving two hardware threads for other work), and a per-source timeout.
It must not run alongside a separate 7-worker balancing study.

Results:

- `results/mcts-diagnostics-pilot/summary.json` - three-agent wins,
  median wall time, paired differences, p-values and categorized first
  losing decisions.
- `results/mcts-diagnostics-pilot/checkpoints/*.json` - reproducible
  individual seeds and the selected traces for losing cases.
- `results/mcts-diagnostics-pilot/manifest.json` - pinned Git revision,
  canonical audit and immutable design settings.

Interpretation:

- A cheaper or higher-win configuration is a promising **navigation
  policy** for subsequent card-balance runs, not evidence of individual
  card balance.
- Report the win rates, paired differences, confidence intervals,
  computational effort ratios and qualitative disagreement examples.
- There are three inspected contrasts. `exploratoryBonferroniP` is a
  conservative descriptive multiple-comparison adjustment.
- No card text or rules are altered by this experiment.
- Before trusting rebalanced cards, run the **separate focused
  `oracle:balance`** study on the same final revision using an agreed
  single navigation policy and fresh independent source seeds.

If 36 sources provide a clear efficiency signal, stop there. If they are
inconclusive, decide whether another 36 or 72 independent seeds are worth
the laptop time; do not launch a 360-source search tournament by default.
