# Rogue Cards V2 — Phase 1 Room ecology

**Status:** implemented as an independent V2 print/prototype deck, not yet a playable replacement for V1.

- [Browse / print all 36 V2 Rooms](../v2-rooms.html) — filters for UPPER, MIDDLE, DEEP; 4 real 90 × 130 mm cards per A4.
- [Read the V2 one-A4 core rules](../rules-v2.html).
- The source of truth is [\`src/v2-rooms.js\`](../src/v2-rooms.js). V1 source and print catalogue remain [\`src/tabletop-data.js\`](../src/tabletop-data.js).

## What Phase 1 changed

Each of the **18 original Rooms has a V2 rewrite**, and **18 genuinely new Rooms** join them: 6 additional designs per level, for **36 unique Rooms / 12 in each regional pile**. The fixed tenth-room Amulet Vault is unchanged in the currently playable V1 print kit and is not part of these 36 randomisable Rooms.

Every V2 Room has:
- A short, evocative situation.
- **Exactly two alternative options**, selected once **for the party**. In some lairs, choose before combat.
- An explicit **ROLL d6** outcome record for the risky option, with **no missing or overlapping faces**.
- Either **1–2 / 3–4 / 5–6** or **1–2 / 3–4 / 5 / 6** probability bands.
- A six-family editorial category: **HAZARD, SHRINE, MYSTERY, ENCOUNTER, LAIR, TREASURE**. These are content labels, not new game phases or shared mechanics.

The collage card renderer draws actual bold dice-range rows instead of burying them in a paragraph. All layouts use the canonical print size and actual ink-filtered illustration layer. The ten original V1 PNG mappings are reused when a matching Room still exists; the rest retain monochrome placeholders. The earlier user-generated illustration archive is **not** silently treated as committed art.

## Room mechanisms represented

| Mechanism | Example Rooms | Printed effect / consequence |
|---|---|---|
| Lock and tool interactions | Rusty Gate, Buried Lockbox, The Last Chest | Discard Rusty Key for a guaranteed 5–6 outcome |
| Terrain tools | Collapsing Stairs, Flooded Chamber, Broken Bridge | Knotted Rope changes the risk |
| Light and fire | Lamp-Eater, Opened Crypt, Lightless Hall, Choir of Mushrooms | Pitch Torch creates a distinct choice or improves the roll |
| Sacrifices / cleansing | Abandoned Shrine, Candle Altar, Crown of the Unking | Exchange Items for healing, cleansing or risky relics |
| Monster parley | Rat Nest, Opened Crypt, Warden's Threshold | Draw Monster immediately, then choose to negotiate or fight |
| Pushing luck | Laughing Fountain, Bottomless Well, Treasure That Sings, The Last Chest | Roll again once, paying HP or another Item |
| Opposed d20 objects | Rusty Gate, Bridge of Whispering Rope, Clockwork Confessional, The Talking Door | Roll d20+ATK/WIT against a printed d20+modifier |
| Knowledge | Bookcase of Teeth, Broken Oracle, The Talking Door | Inspect future Rooms or modify their order |
| NPC bargains | Merchant in a Sack, Ghostly Auction, Beetle Caravan, Midnight Bazaar | Pay, cheat, bargain or provoke a creature |
| Lasting card effects | Clockwork Confessional, Lost Reliquary, Mirror of Regrets, Crown of the Unking | Keep the physical Room under a Hero until its one printed effect is spent |

## Design and playtest guardrails

1. **Rolls stay fun.** Opposed d20 combat and d6 Monster responses are unchanged from the V2 draft. These new Rooms add risk via card-local dice, never a universal table.
2. **No extra tracking.** Single-use lasting bonuses are kept as an actual physical card, then discarded when used. HP and card orientation are the only global trackers.
3. **No additional universal Room phases.** A Room explicitly says when its special choice precedes combat.
4. **Beware bottom-of-pile peeks.** If a Room says to peek or swap the next 2 Rooms and only one remains in the active regional pile, the card explicitly guards its swap. Do not reorder the fixed Vault.
5. **No V1 content migration yet.** The additional Items, specialised Monsters, corpse ecology, cross-card wording audit and balance pass are later phases. The page prominently says it is a **V2 design draft**.
6. **Check actual physical print proofs.** Automated tests check the full cards, dice-band completeness, clipping and A4 geometry. They do not establish readability under every printer/ink/paper choice.

## Next work

**Phase 2:** expand and redesign Items and Potions, including matching the named tool/companion interactions. Then build a richer **card interaction matrix (Phase 3)** before rewriting remaining Monsters, Heroes and effects (Phase 4) and completing table playtests (Phase 5).
