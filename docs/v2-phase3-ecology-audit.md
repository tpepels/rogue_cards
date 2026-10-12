# Rogue Cards V2 — Phase 3 mechanical-ecology audit

**Status:** phase 3 implementation on `main`, as separately printable V2 prototypes. **V1 is still the canonical playable edition.**

[36 V2 Rooms](../v2-rooms.html) · [52 unique V2 Objects](../v2-objects.html) · [12 V2 Monsters](../v2-monsters.html) · [one-page V2 rules](../rules-v2.html)

## Scope and observations

The V2 design catalogue contains **100 unique card faces**: 36 Rooms (12 per region), 44 Items, 8 Potions, and 12 Monster prototypes. The Monsters copy V1 printed stats and four-row behaviour tables without modifying V1; their **new** Phase 3 text adds exploitable weaknesses, negotiations and revised remains. The fixed Warden and all Heroes still await the full V2 migration.

The audit identified recurring problems:

1. **Flat rewards:** too many different Rooms simply exchanged HP for 1–3 Items. We rewrote selected choices to substitute Wand recharge, magical sacrifices and risk-dependent rewards.
2. **Synergy by annotation only:** the earlier `v2.links` lists suggested connections that were not always actionable. Phase 3 prints the **actual trigger, cost and outcome** on the involved cards; metadata alone does nothing.
3. **Interchangeable spells:** Scrolls and Wands largely differed by damage amount or skipped Monster responses. Now they can change a specific behaviour band, explode in the Hero's face, or interact with a specific Room/Monster.
4. **Wands generated repeatable value:** Wands must now be upright to use; after rolling, turn them sideways. An overcharge **discards the Wand and costs d6 HP**, guaranteeing only that Wand's printed highest outcome. Alternative recharge is confined to explicitly printed, once-per-party Room decisions, a Shrine substitution, or a consumed card.
5. **Curses were only taxes on stats:** cursed gear now influences magic effects, negotiations, sacrifice and high-risk boosts. Equipped CURSED gear remains stuck until cleansed.
6. **Monsters did not recognise equipment:** twelve independent prototypes add weaknesses to properties, companions and magical effects, plus choices to bribe, scare, recruit or trick creatures.
7. **Cross-Room bookkeeping was creeping in:** lingering "remember the next Room roll" penalties were removed. Visible cards, upright/sideways orientation and HP represent persistent state. No separate log is required.

## Working interaction matrix

These are explicitly printed trigger/effect pathways, not abstract proposed ideas.

| Encounter | Card interaction | Consequence |
| --- | --- | --- |
| Giant Rat | Loyal Hound or any BEAST Companion | Its strongest behaviour result (6) becomes 1–2 |
| Floating Eye | Ring of the Sideways Eye or Tunnel Raven | Alters the creature's 6 behaviour / protects against Freeze |
| Living Mold | FIRE or ICE, Ring of Embers, Ring of the Mold King, Coffin Moth | Changes behaviour outcomes and helps resist POISONED |
| Iron Sentinel | Scroll of Storm Teeth (LIGHTNING) | Extra damage against metal |
| Rust Monster | Discard METAL to bargain; no METAL equipped improves safety | Trade possessions for a safe exit or exploit its weakness |
| Bridge Troll | FIRE | Prevents its next Regenerate result |
| Forgotten Acolyte / Restless Shade | CURSED gear, MAGIC effects | Risk HP to bargain or alter Monster behaviour |
| Fungal Garden / Choir of Mushrooms | Pitch Torch, Scroll of Cinder, FIRE property | Turn environmental danger into resources |
| Flooded Chamber | Scroll of Hush / Knotted Rope / ICE gear | Manipulate its printed outcome rather than endure the hazard |
| Bookcase of Teeth / Broken Oracle | Tunnel Raven, Chalk, knowledge Scrolls, eye Rings | Peek, reveal or reorder coming Rooms |
| Shrines / Candle Altar / Crown of the Unking | CURSED equipment, MAGIC, Wands | Curse-cleansing decisions and Wand recharge |
| Beetle Caravan | METAL Items, Loyal Hound, Scroll of Storm Teeth | Trade material, threaten with magic or talk your way through |
| Merchant / Ghostly Auction / Midnight Bazaar | Ghost Coin, Ring of Small Deals, Pocket Goblin, Wand of Bad Trades | Connected risk/reward bargains with explicit costs |
| Room d6 rolls | Ring of Echoes | Keep original, reroll or choose either result; cursed variant exacts HP |
| Hero d20 rolls | Ring of Crooked Luck, Wand of Undoing | Change odds after a roll, at risk of injury or Wand exhaustion |
| All seven Wands | Shrine substitution, Room trade, Ashwood Staff, Lantern Heart | Recharging competes with healing, trading or a consumable relic |
| All seven Wands | OVERCHARGE | Discard Wand and lose d6 HP for its highest printed effect |
| Scroll of the Last Word | CURSED equipment | Guarantee dangerous, high-end magic at an additional HP cost |
| Goblin Raider | Items used in negotiation | Recruit as Companion instead of winning through damage |

The **six d6 faces** on every applicable Room or Object are accounted for through three- or four-band ranges. Monster behaviour keeps 1–2 / 3–4 / 5 / 6. Combat remains opposed d20 + ATK versus d20 + DEF; there is no new common encounter procedure.

## Decisions kept on the card

- **ROLL** is the exciting uncertainty; **choice** is what makes it strategic. Phase 3 retains both.
- **Only one Room option per party** (unless that specific Room says otherwise). All extra recharge and bargaining options respect this limit.
- A **sideways Wand cannot activate**. Overcharge sacrifices it, even if the player was hoping to recharge it later.
- **Scrolls disappear after reading**, including catastrophes. No reuse loop.
- A Ring with an **ONCE PER ROOM** action lies sideways until the next Room; passive modifiers still apply.
- Cards that convert a Monster's behaviour apply to the **next** roll as printed; they do not need their own duration track.
- A Monster's PARLEY option is evaluated **before combat**, and only when its costs can be paid. "No corpse" avoids gaining both a safe exit and an EAT reward.
- Named Item/Room matches and property requirements are **case- and wording-specific**. A metadata link with no printed text grants no ability.

## Remaining Phase 4/5 work

Phase 3 is a design/ecology pass, not a claim that the entire V2 game is balanced or ready to print professionally.

- The twelve V2 Monsters reuse V1 HP/ATK/DEF and behaviour tables. Their damage and resilience need to be balanced with V2 heroes and heavier magic.
- The Warden's V2 mechanics and the V2 Heroes are not yet designed; these remain separately canonical V1 cards.
- A complete solo/co-op campaign simulation, real card-draw frequencies, Warden survivability, and exploits involving 2-player item transfers need testing.
- Some tags have few interactions. Future Monster development should deliberately spread ICE, LIGHTNING, BONE, BARGAIN and KNOWLEDGE rather than inventing additional universal keywords.
- Unique art for the V2 catalogue is still incomplete; the preview continues to use deterministic monochrome placeholders where committed illustrations are absent.
- Browser clipping and exact A4 card geometry are automatically checked; readability and contrast on actual printed paper should still be proofed.

## Files and verification

- `src/v2-rooms.js` — updated Room choices.
- `src/v2-objects.js` — expanded item effects, family interactions, Scrolls/Rings/Wands.
- `src/v2-monsters.js` — new independent V2 Monster ecology over V1 stat baselines.
- `src/tabletop-view.js` and `styles/tabletop.css` — physical collage layouts, including Monster d6/weakness/parley strips.
- `v2-monsters.html` and `src/v2-monsters-app.js` — preview/filter/print.
- `tests/v2-ecology.test.mjs` — printed synergy, overcharge, complete behaviour bands and V1 isolation.
- `tests/v2-objects.test.mjs`, `tests/v2-rooms.test.mjs`, `tests/visual.spec.mjs` — existing and new mechanical/physical print checks.

**No V1 Card data, V1 mechanics or canonical V1 rulebook were edited.** V2 changes are kept independently on main for review.
