# Rogue Cards: meaningful encounters and an isolated Warden study

The original 14-hypothesis study showed that simply appending extra mandatory
`MONSTER_DRAW` outcomes makes expeditions less survivable while still falling
short of the 16–20 encounter target. It did **not** establish that every
individual Monster needs its HP/ATK reduced.

This is a predeclared second generation of experiments. It remains isolated
from canonical printed card data. No experimental Room text is printed until
an explicit later design decision and print/rules review.

## Study A — meaningful encounters, not automatic deadly fights

Nine variants test the *structure* of encounters with the same printed
Monster and Hero statistics:

- `safe-encounters-mild`: four additional optional die outcomes per region.
  Draw a physical Monster, but skip its first response.
- `safe-encounters-disadvantage`: same density, but Monster's next attack has
  disadvantage instead of skipping its first response.
- `safe-encounters-strong`: one new encounter outcome on every eligible Room;
  first Monster response skipped.
- `safe-encounters-dense`: all eligible Rooms, Monster's attack has
  disadvantage.
- `voluntary-loot-or-toll`: three existing Rooms per region change to
  **either** draw two Items then encounter a Monster (first response skipped)
  **or** discard one Item and peek at the next Room safely. This is a
  two-choice hypothetical physical Room rewrite.
- `voluntary-loot-or-safe`: trade a smaller reward (one Item) for the
  encounter; the alternative is a free peek.
- `voluntary-higher-loot`: risk a Monster to draw three Items; alternative
  discards one Item and peeks.
- `voluntary-fewer-rooms`: the base voluntary choice appears just once in
  each region.
- `voluntary-fight-not-guarded`: two Item reward for an unprotected Monster
  encounter vs the discard-and-peek route.

The current engine already allows negotiation/parley before fighting. A
skipped response, a weaker opening attack and a choice to decline a Monster
create survivable interactions without reducing Monster HP on every card.
The staged prototypes use existing engine actions `MONSTER_DRAW`,
`SKIP:1`, `MONSTER_DIS`, `DRAW:n`, `COST:1` and `PEEK:1`.

Primary measures: encounters and actual fights per 36 completed Rooms,
fraction of encounters leading to combat, Room choices (including how often
players voluntarily decline an encounter), discarded Items, incoming damage,
wiped parties, Vault reach and wins per Hero. The number of **voluntary
opportunities** cannot be identified from `monsterVisits` alone: check
`roomChoices` and touched Room IDs in `summary.json`.

**Interpretation**: a Monster drawn then peacefully resolved still counts
as an encounter. A Room simply offering a fight the player declines is a
meaningful choice but not a physical Monster appearance. Evaluate both
exposure and willingness to take risk, rather than optimizing Monster count
at any cost.

## Study B — only the Warden

Twelve variants alter **only** `warden` or `warden-fury`, never ordinary
Monsters, Rooms, Hero cards or deck composition:

- Warden Phase I HP 20 -> 18, 16 or 14, tested separately.
- Warden Fury HP 10 -> 8 or 6, tested separately.
- Phase I ATK 6 -> 5; Fury ATK 6 -> 5; both phases ATK 5.
- Phase I DEF 5 -> 4; Fury DEF 5 -> 4.
- HP combinations 16+8 and 18+8.

The physical Phase I -> Phase II threshold stays 10 HP, and the same HP counter
carries over; no new special-case transitions are introduced.

Primary measures: overall solo win probability (target ~40%), Vault reach
(target ~50%), **win rate conditional on reaching Vault**, **win rate conditional
on actually fighting the Warden**, entering Fury, and the distribution
of incoming Warden damage. Also inspect any pre-Vault differences; MCTS
may anticipate future Warden difficulty, so paired starting seeds are **not**
a guarantee of identical choices before the Vault.

No Room or Monster change is promoted from this study: a substantially easier
Warden can improve win rate but will not resolve insufficient meaningful
encounters earlier in the expedition.

## Local protocol

If the original 3,200-run study is *still running*, **do not pull or alter the
repository checkout used by that process**: its resumable manifest pins git
revision and hashes. Finish that run first, or use a separate worktree/new
checkout for the new studies. Never mix trials from different source revisions.

After the original run ends:

```bash
cd ~/Projects/rogue_cards
git pull --ff-only

npm run test:balance:next
npm run test:card:staging

# First: broad encounter structure, with new independent seeds.
npm run study:balance:hypotheses -- \
  --suite encounters --workers 8 --minutes 720 \
  --seed 20270101 --screen-repeats 16 --confirm-repeats 32 \
  --finalists 4 --out results/meaningful-encounters-v2

# Second: independent Warden changes, same fixed agent, different seeds.
npm run study:balance:hypotheses -- \
  --suite warden --workers 8 --minutes 720 \
  --seed 20270102 --screen-repeats 16 --confirm-repeats 32 \
  --finalists 4 --out results/warden-only-v2
```

Each study stores `manifest.json`, `trials.ndjson`, `summary.json`,
and `comparison.md`; it screens all variants once per paired Hero/seed
and validates the top four on disjoint seeds. Resume with the **same**
command after an interruption, assuming the source revision is unchanged.
The max wall-time is a limit, not a guaranteed run duration.

### Boundaries and stop conditions

The design objectives for complete physical expeditions remain:
approximately 16–20 ordinary Monster appearances in 36 Rooms,
55–70% of these turning into combat, 50% Vault reach and 40% solo wins.
These are joint goals: a candidate meeting only one should not be
automatically adopted.

If the expanded encounter options remain far below 16–20 while preserving
survival, the next *design* question is whether all meaningful hazards need to
be Monster cards at all. A social/toll/risk Room decision may be a genuine
encounter to a player while not triggering the engine's `monsterVisits`
counter. Track both explicitly in human tabletop playtests.

The computer cannot measure human tabletop session time, clarity of a printed
Room, or whether repeated two-choice encounters are genuinely interesting.
Those require physical playtests after statistically meaningful simulation.
