# How much HP recovery is needed after a Monster fight?

The canonical physical Room distribution is now **Balanced B**:
16 ordinary Room copies and 2 Corridors per depth, making
48 non-Corridor cards and 6 Corridors. The full catalogue still exists
for custom decks. Existing Monster/Item/Room effects are not changed.

**Baseline evidence (prior independent confirmation, 118 runs for B):**
Balanced B gave about **12.7% solo wins**, **30.5% Vault reach**,
**18.5 ordinary Monster encounters per 36-Room equivalent**, and
**69.7% fight conversion**. These estimates are preliminary and use
the frozen MCTS solo agent, not human players.

## Isolated treatment

The canonical control grants **0 extra HP** after combat.
Candidate treatments grant **+1, +2, +3, +4, +5, +6, +7, +8, +10 HP**
at the conclusion of a **won ordinary Monster fight**. Bonuses stack
with each Monster's existing printed DEFEAT reward and any retained
Room FIGHT_HEAL. Capped by Hero maximum HP.

No artificial bonus is paid on:
- a successful PARLEY/negotiation;
- retreat, banishment or a Monster vanishing;
- Warden Phase I, Unbound, or sealing the Vault;
- losing a fight / dying.

The bonus is applied by the normal shared canonical settlement
engine, meaning the MCTS tree and rollout policy see exactly the
same future state and effect as the committed real decision.
The +N rule is **staging-only**, not yet a printed rule.

## Measurements

Compare each treatment against the matching **canonical B** run
using the same Hero and seed. Measure:
- solo win rate, Vault reach and 36-Room completion;
- encounters per 36 Rooms and fight conversion;
- mean encounters and fights per expedition;
- average offered healing (N × triggers), effective HP actually
  restored, and HP lost to the maximum-HP cap;
- per-Hero outcomes, combat damage, Item usage;
- paired bootstrap confidence intervals in the JSON report.

The main question is the **smallest N** that approaches **40% solo
wins** without pushing Vault access far above 50% or changing the
desired encounter density. Do **not** equate total offered HP with
HP actually restored, and do not pick the smallest N using screening
alone.

## Commands

```bash
cd ~/Projects/rogue_cards
git pull --ff-only
npm run test:balance:combat-healing
# Also check the core canonical-deck regressions
node --test tests/everything-goes.test.mjs tests/decks.test.mjs \
  tests/room-ratio-hypotheses.test.mjs
```

Dry run (prints plan, makes no changes):

```bash
node scripts/study-balance-hypotheses.mjs \
  --suite combat-healing --variant-limit 9 --finalists 4 --dry-run
```

Smoke:

```bash
node scripts/study-balance-hypotheses.mjs \
  --suite combat-healing --variant-limit 9 --finalists 4 \
  --smoke true --workers 4 --minutes 20 \
  --out results/combat-healing-smoke
```

Screen, then independently confirm the four most promising doses:

```bash
node scripts/study-balance-hypotheses.mjs \
  --suite combat-healing --variant-limit 9 --finalists 4 \
  --screen-repeats 8 --confirm-repeats 16 \
  --workers 8 --minutes 600 \
  --out results/combat-healing-v1
```

There are 10 groups in the screening (canonical B and nine doses)
and 5 groups in the confirmation (canonical B and four selected
doses). That is **640 screening expeditions** and **640
confirmation expeditions**, if completed: 1,280 in total.

The runner writes `manifest.json`, `trials.ndjson`,
`summary.json`, and `comparison.md`. Resuming an incomplete run
with exactly the same options and code revision is supported.

## After the dose-response study

Choose an interesting physical delivery of equivalent expected
restoration: on-kill Item rewards, consumables, conditional shrine
choices, specific Monster DEFEAT rewards, or risk-bearing options.
Then run a second study *without* the artificial HP injection.
