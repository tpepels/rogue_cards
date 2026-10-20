# Balanced Recovery v1 — promoted to the official physical cards

**Status:** Applied to canonical printed card sources and the real game engine.
**Scope:** Exactly 25 unique card definitions — 19 Monster cards, 3 Item cards,
3 Room cards. The existing Balanced B Room/deck selection is unchanged.

## The actual physical card rules

### Consumables (same printed copies and usage windows)

| Card | Prior | Official v1 | Copies |
|---|---|---|---:|
| Linen Bandages | OUTSIDE COMBAT: discard to heal d6 HP | **d6+2 HP** | 3 |
| Dry Rations | OUTSIDE COMBAT: discard to heal 2 HP | **4 HP** | 3 |
| Thorn Tonic | OUTSIDE COMBAT: discard to heal 3 HP, next WIT DIS | **5 HP**, same next WIT DIS | 2 |

Executable Item effects use `src/item-healing.js`; its canonical default values
and the printed `v2.trigger` values agree. The card's original action timing
and consumption rules remain unchanged.

### Rooms

| Card | Prior | Official v1 | Cost |
|---|---:|---:|---|
| Coal Store (UPPER) | 3 HP | **5 HP** | Discard 1 Item |
| Abandoned Barracks (MIDDLE) | 4 HP | **6 HP** | Discard 1 Item |
| Vacant Watchpost (DEEP) | 2 HP | **4 HP** | Free |

The original printed Room choice and the matching
`ROOM_EFFECTS` opcode were changed together. The other Room choices, dice
bands and outcomes are unchanged.

### Monster DEFEAT

Each of these **19 individual physical Monster cards** now adds
`Heal d6 HP.` to its existing `DEFEAT` benefit, without replacing the
original draw/peek/salvage/stat action:

- Goblin Raider, Sewer Crawler, Cave Bat Swarm
- Bridge Troll, Will-o'-Wisp, Floating Eye
- Restless Shade, Rust Monster, Forgotten Acolyte, Iron Sentinel
- Keyhole Mimic, Dust Skeleton, Lantern Moth
- Drowned Jailer, Ropebound Hound, Bell Beetle
- Vault Parasite, Bone Cantor, Glass Revenant

The other five regional Monsters keep their pre-existing individual healing
rewards: Giant Rat (2), Living Mold (d6), Drain Leech (d6), Wax Golem (3),
Ash Penitent (d6).

**No global post-combat heal rule was added.** Defeats resolve through the
existing `monster.v2.defeatOps` path, not a special hidden simulator reward.
No post-fight heal on a bypassed Monster, a failed fight or Warden victory.

## Why this combination

The independent confirmation of the previous, separately tested recovery
arms (128 expeditions each) observed:

| Intervention | Vault reached | Overall wins |
|---|---:|---:|
| Pre-v1 canonical, held-out baseline | 45.3% | 28.1% |
| Stronger Item recovery + printed Monster d6 rewards | 58.6% | 39.1% |
| Stronger REST + printed Monster d6 rewards | 60.2% | 36.7% |
| **Diagnostic, unprintable +5 HP after combat** | 60.2% | 43.0% |

**The exact promoted combination has NOT been simulated as one arm.**
It blends the tested first arm's stronger Items and Monster effects with
smaller (5/6/4) REST increments instead of the tested second arm's
9/10/8 REST values. The numbers above describe **other** arms, not a
validated win rate for this final combined physical rule set. Confidence
intervals are wide with only 128 held-out seeds, and Hero-specific,
Vault-specific and physical playtesting remain relevant.

## How to verify

~~~bash
cd ~/Projects/rogue_cards
git pull --ff-only
npm run test:balanced-recovery
npm run validate:deck
~~~

See `tests/balanced-recovery-v1.test.mjs` and
`.github/workflows/balanced-recovery-v1.yml` for print/runtime parity and
rule regressions. If any check fails, do not print a deck yet.

The official card definitions are:
- `src/monster-defeats.js`
- `src/print-expansion.js`
- `src/item-expansion.js`
- `src/item-healing.js` and the Item executor
- `src/room-effect-model.js`

Archived `recovery-overnight` / `printed-recovery` numerical results refer
to the older source revision and must not be interpreted as results from the
current baseline. Their staging variants explicitly override promoted
Monster healing rather than accidentally adding a second HEAL effect.
Do **not** merge old trial records into new studies.

## Balance status / remaining acceptance criteria

We can reasonably regard **physical recovery design as calibrated enough
for a new playable edition**, but should **not call the entire game fully
balanced** until we verify:

1. A reproducible run of this *exact* combined official edition, not
   extrapolated arms, preferably paired with a relevant reference.
2. By-Hero win rates, deep-stage/Vault survivability and Warden difficulty.
3. Monster and Item value distribution; the printed extra d6 reward should
   not trivialize Monster identity or make risks rewarding in the wrong order.
4. Physical playtesting, readability and real human choices.

The Room encounter distribution, all Monster combat stats, Hero stats,
Warden and other rule systems are unchanged in this release.
