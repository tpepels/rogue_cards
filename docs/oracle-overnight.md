# Rogue Cards - overnight all-card Oracle audit

**Scope:** complete printed-effect expeditions, isolated stochastic
full-horizon search branches, 64 conditional Room comparisons,
52 conditional Item comparisons, and descriptive exposure/path coverage
for all eight Heroes, 12 regional Monsters, two Warden phases and the Vault.

**Do not use this to claim complete optimal play.** The current agent
branches Room decisions (including retained fate Rooms) and attack versus
each legal combat Item. It also replans a second level of future Room/combat
decisions. The complete game does **not yet have** a uniform legal-action
state machine exposing every PARLEY, SEAL, reactive Item, Hero ability,
retained-Room return, reroll and equipment-timing decision. The report
always lists these exclusions; it cannot declare complete coverage.

## Start tonight on an 8-core Linux laptop

Requirements: Node 22+, current Git checkout, sufficient disk space.
Leave the laptop plugged in, allow airflow, and keep its lid open.
Use 7 workers to leave some processing capacity for the desktop.

From the `rogue_cards` repository directory:

```bash
git pull --ff-only
node --version
npm run test:rollout
npm run validate:deck
```

Check the workload without running it:

```bash
npm run oracle:overnight -- \
  --runs 1200 --knowledge oracle --budget 2 --replan-budget 1 \
  --workers 7 --chunk-size 10 --hours 10 \
  --seed 20261014 --out results/oracle-night-01 --dry-run
```

Start in the background, protected from terminal disconnection.
`systemd-inhibit` prevents automatic sleep while the study runs;
it does not guarantee that closing the lid cannot suspend your laptop.
Check local power settings and **keep the lid open**.

```bash
mkdir -p results
nohup systemd-inhibit --what=idle:sleep --mode=block \
  --why="Rogue Cards overnight full-effect Oracle study" \
  npm run oracle:overnight -- \
  --runs 1200 --knowledge oracle --budget 2 --replan-budget 1 \
  --workers 7 --chunk-size 10 --hours 10 \
  --seed 20261014 --out results/oracle-night-01 \
  > results/oracle-night-01.log 2>&1 < /dev/null &
echo "Started study process $!"
```

Check the log at any time:

```bash
tail -n 40 results/oracle-night-01.log
```

**If the time cap is reached**, completed chunks, summary and validation
files remain on disk. Restart with the identical options except for
adding `--resume` (you can change `--workers` and `--hours`):

```bash
npm run oracle:overnight -- \
  --runs 1200 --knowledge oracle --budget 2 --replan-budget 1 \
  --workers 7 --chunk-size 10 --hours 10 \
  --seed 20261014 --out results/oracle-night-01 --resume
```

Do **not** `git pull` or change game source between runs intended
to share checkpoints. The runner refuses to resume if the Git commit or
sampling design changed. To replicate on independent seeds, use a new
output directory and a different `--seed`.

## What is sampled

The runner plans 116 x 1200 = **139,200 matched pairs**, or
**278,400 completed real expeditions** if all requested trials finish.
Each card uses a distinct deterministic seed sequence. Each individual
pair uses the same initial seed, Hero party and play style.

All eight solo Heroes and 28 possible two-Hero pairs are rotated through,
as are survival, magic, treasure, seal and negotiation priorities.
Each expedition uses a full-horizon, **two-ply** Oracle agent with exact knowledge of the remaining hidden deck order but no future dice. To evaluate fair-information play separately, rerun with `--knowledge fair`, a new output directory and disjoint seed batches.
The root samples two hypothetical scenarios for every currently legal
Room/combat action; later continuation decisions sample one extra
level. The final search still relies on a nonrecursive continuation
policy. Strict-terminal mode refuses any simulated branch that must
be scored using a made-up HP heuristic rather than a win/loss.

**Room counterfactual:** move the one existing target Room to the first
position of its own printed stage deck in both arms (no duplication).
Force the first versus second printed choice, only when both are legal.
Require equality of the complete recorded pre-choice HP, inventory and
pending Monster snapshot. The result is conditional on reaching the Room
in that artificially controlled location, *not* its average effect in
an ordinary shuffled expedition. The unobserved opportunity is recorded
and excluded, not counted as failure.

**Item counterfactual:** leave the shuffled Item deck untouched in the
control, and in the treatment move one existing copy of the named Item
from that deck to the first Hero's starting inventory. This measures
the benefit of **early ownership**, not the Item's intrinsic strength
at its usual draw time. Trials without an available physical copy are
excluded.

**The remaining cards:** every actual encounter for all eight Heroes,
all 12 Monsters, the Warden phases and Vault is recorded. Room choices,
printed d6 bands, Item acquisition/uses/passives, Monster behavior bands,
and full-terminal search branch counts are tracked. These are coverage
and descriptive outcomes, not causal Hero/Monster power estimates.
There are no artificial numeric ratings invented for untested effects.

## Statistical interpretation

- For the 64 Room-choice and 52 early-Item counterfactuals, the report
  gives a *paired win-rate difference*, 95% paired interval, matched
  win discordances, exact two-sided McNemar/binomial p (normal tail for
  large discordance counts) and **Holm-adjusted p-values** to control
  the familywise error rate across the card comparisons.
- It requires at least 500 eligible conditional pairs before even
  labeling a card's estimated contrast sufficiently sampled for
  interpretation. That threshold is only a minimum, not guaranteed power.
- A 1200-seed study cannot guarantee significance for every card:
  a genuinely negligible effect should remain nonsignificant and an
  infrequently legal Room might not collect enough eligible trials.
- Effects of roughly 5 percentage points may be detectable with enough
  *discordant* matched outcomes; smaller differences can require many
  thousands of eligible paired trials per card, especially after
  multiple-testing correction.
- None of the reported intervals is automatically simultaneous;
  use adjusted p-values, report effect sizes and independent seeded
  replications. No printed card should be nerfed/buffed on p-value alone.

The important truth condition is the `coverageGaps` section.
Missing Room choices, roll bands, item triggers, Monster results and
unsearched decision types are named. Even after every planned
expedition completes, **`validation.json` may intentionally report
`pass: false`** until the underlying complete game-action interface
actually exists. This prevents another high-count simulation from
being passed off as a comprehensive rules or balance proof.

## Files to bring back for analysis

The run writes:

- `manifest.json` - exact Git SHA, Node version, seed, sampling design,
  search depth and mechanically relevant settings
- `summary.md` - per-card results and missing coverage
- `summary.json` - complete conditional counts, discordances,
  confidence intervals, Holm adjustments, party/strategy strata,
  example reproduction seeds and aggregate coverage
- `validation.json` - explicit completeness flags and blockers
- `checkpoints/` - one complete, resumable chunk per card/seed block

Include the log as well, especially if any worker crashed.
After stopping the run (or reaching its time cap):

```bash
tar -czf oracle-night-01.tar.gz \
  -C results oracle-night-01
```

If the archive is large, you can send `manifest.json`,
`summary.json`, `summary.md`, `validation.json` and the end of
the log first. Keep the original checkpoints for follow-up/resume.
Do not change printed cards until we've read the missing-path and
per-card statistical evidence.

For full search over every printed decision, the next engineering task
is a canonical phase-controlled `legalActions(state)` /
`applyAction(state,action)` / `terminal(state)` API,
used by information-set MCTS. This nightly study is not a replacement
for implementing that API.
