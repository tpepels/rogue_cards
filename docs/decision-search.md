# Rogue Cards - Canonical action interface and Oracle search

The printed tabletop rules, the full-effect expedition runner and the
Oracle must share **one legal-action source**, not independent hand-written
candidate lists.

## Implemented in `src/engine/index.js`

`legalActions(state,{phase,heroIndex,roomId})` exposes stable action objects
for these phases:

| Phase | Legal branches |
|---|---|
| Room | Two printed options, subject to exact card costs |
| Combat | Attack, every legal combat Item mode, Elbereth ward/flee |
| PARLEY | Fight or pay/roll the printed negotiation if affordable |
| Vault | Fight or attempt SEAL when affordable |
| Post-Warden I | Fight, SMUGGLE, BARGAIN, UNTHRONE, escape when eligible |
| Retained Room | Printed return modes for supported kept Rooms |
| Hero ability | Steady and risky modes when the Hero is eligible |
| Equipment | Equippable Item and target slot |
| Explore | Printed pre-Room Item triggers, optional continue |
| Between Rooms | Potions/recovery tools, optional continue |
| Room choice / on-attack / on-hit / after-hit / defence / after-roll / failed-d20 / on-poison / after-magic / room-roll | Legal printed Item triggers at that timing, optional continue |

`applyAction(state,action)` uses canonical Room/combat executors and handles
atomic Hero-mode, retained-choice, equipping and ordinary die-based
Item triggers. Complex multi-stage PARLEY/Vault/post-Warden transitions are
**not** implemented twice inside the public engine: they are resolved in
the canonical expedition runner and deliberately rejected by the atomic
executor until a full phase controller exists.

The research rollout evaluator now enumerates canonical legal Room/combat
actions, **including Elbereth**, instead of assembling another bespoke
list. `pairedPhaseRollouts` uses the same legal interface to branch on
PARLEY, SEAL and post-Warden outcomes. Full-effect continuations replay
the real rules after the decision, on isolated seeded state forks.
`--strict-terminal` rejects sampled continuations without an actual
expedition ending.

## Not yet a universal all-decision solver

A single action **enumerator** is not sufficient. The game currently still
auto-resolves several optional printed timing windows during a larger
engine call, leaving no actual pause at which the Oracle can act.

Remaining correctness work:

1. **Full phase-controlled stepping:** make every optional reaction
   (before/after defence, failed d20, on hit, etc.) yield a pending action
   event with immutable observation, then resume with a selected action.
2. **Deferred Room triggers:** when a retained Room reaches its printed
   return moment, expose the exact available modes at that point and
   resolve the selected branch; not an earlier preset preference.
3. **Hero abilities, push-your-luck, and equipment:** choices must happen
   at their printed timing. Auto-activation during `s.activate`,
   `roomRoll`, `roomEntry` and similar functions must become
   pausable for search, without changing rule order.
4. **Full information-set MCTS:** share tree statistics across repeated
   observations and histories; root branching plus one future branching
   level is not enough to optimize every subsequent action. Any
   unbranched continuation must remain explicitly classified.
5. **Coverage proof:** verify each possible phase/action pair has an
   executable transition and test at least one seeded real-game
   continuation of every printed Item, Room, Monster, Hero and Vault
   outcome. Mark impossible printed rolls as dead design, not covered.

Until all five conditions are satisfied, do **not** claim that a
large Monte Carlo study tested all player decisions.

## Targeted Room balance changes

These fixes are tied to the independently run 14 October 2026,
278,400-expedition evidence. The conditional first-stage-choice
experiment found:

- `m-ladder`: TAKE THE SHAFT minus CLIMB = -11.68 percentage points
  (Holm-adjusted p approximately 5.5e-11).
- `d-bones`: RATTLE minus SEARCH = -8.43 percentage points
  (Holm-adjusted p approximately 3.07e-5).
- `d-gilded`: MAP EXIT advantage +2.27 percentage points, but almost
  entirely attributable to the survival-strategy ending choice,
  **not** evidence of a universally overpowered card.

The following printed changes were made, while retaining the existing
printed effect engine, dice and stage rules:

- `m-ladder` shaft d6 face 1: fall to DEEP, lose 4 HP and face a
  DEEP Monster, **not** a premature Vault drop;
  face 4-5: gain 1 Item on safe descent;
  face 6: gain 3 Items.
- `d-bones` RATTLE: after defeating the DEEP Monster, draw **4** Items.
- `d-gilded`: remove its nonexistent d6 roll table. Neither of
  its two printed route options invokes a die, so leaving a three-band
  table printed was misleading. Both corridor actions remain.

The first two are **hypotheses being tested**, not certified fixes.
There is no license to change every nonsignificant Item. An Item
awarded at the start is not a state-matched measure of intrinsic value.

## Run focused verification

```bash
git pull --ff-only
npm run validate:deck
npm run test:engine
npm run test:rollout
```

To get matched post-change choices on new seeds across varied solo and
two-Hero parties, using the real two-ply full-terminal Oracle:

```bash
npm run oracle:overnight -- \
  --only m-ladder,d-bones \
  --runs 1200 --seed 20261020 \
  --knowledge oracle --budget 2 --replan-budget 1 \
  --workers 7 --chunk-size 10 --hours 10 \
  --out results/room-rebalance-oracle
```

The `--only` switch intentionally selects the two target cards.
Every other mechanic in the actual game can still occur in the
continuations, but there are only **two targeted statistical tests**
in this run. Export the entire result directory, including
`manifest.json`, `summary.json`, `summary.md` and checkpoints.

Interpret `eligible` rather than requested seeds; conditional
comparison denominators can be smaller. Use independent replication
and comparison with historical confidence intervals before further
changing values. If changes in the action-search policy itself alter
results, compare identical agent versions before attributing a
difference to the printed card.
