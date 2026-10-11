# Room, Feature & Chest — three-Room tabletop prototype

**Design review only, not production rules.** Applies ten new answers on top of the earlier twenty decisions: solo/co-op 1–2, one A4 shared rules, nine sequential Rooms then Amulet Vault (no return), one meaningful Hero action, opposed d20 combat, d6 damage and four-branch d6 Monster behaviour, no Hunger or cross-run Bones, pets, corpse eating, prayer, spells, curses and traps, HP counters + card orientation only, 90 × 130 mm original distressed-ink illustrated cards.

## Key reconciliation: what Room cards contain versus what is drawn

**Presence is printed on the Room.** It must explicitly name or illustrate every fixture present, such as CHEST, ALTAR, STATUE, FOUNTAIN, LOCKED DOOR, NPC, REMAINS or ARCANE OBJECT. A random draw NEVER decides whether an already printed Chest exists.

**Details may come from a matching drawn card.** A Room that says CHEST — DRAW 1 CHEST places a Chest Feature card beside it, giving that chest's specific lock, trap and rewards. A Room that prints ALTAR with its complete choices needs no Feature draw. A special STATUE may instead name a physical Feature card (as this prototype does) or instruct DRAW 1 STATUE FEATURE from a matching sorted subtype pile; never a random unrelated feature. A Room may also print MONSTER — DRAW 1 UPPER MONSTER or EVENT — DRAW 1 EVENT; these define actual draws, not generic lookup tables. A specific Chest draw always comes from a Chest pile; do not draw a random fountain or statue and call it a Chest.

**Density:** normally one or two actionable features/encounters, exceptionally three. A Monster+Chest is two. An on-entry Trap+Monster+Statue is three. Visible but purely decorative objects do not count. Optional objects can be left unexplored with no universal cost or lingering clock.

## Taxonomy: 12 card roles, but not 12 random piles

HERO | ABILITY | COMBAT ACTION | ROOM | MONSTER | EVENT | TRAP | FEATURE (Chest is a Feature subtype) | ITEM (Mystery Potion subtype) | SPELL | COMPANION | REWARD (Remains/Treasure/Relic subtypes).

- The twelve types describe **what the physical card means**. They do NOT require twelve decks.
- **Region decks:** 3 Rooms and 3 Monsters. Monsters are drawn only on printed Room command; the Warden and final Vault remain fixed.
- **Scenes:** one small EVENT pile and one separate TRAP pile. A printed DRAW 1 TRAP must never produce an Event, and DRAW 1 EVENT must never produce a Trap. Their trigger and resolution live on the drawn card.
- **Fixtures:** one shuffled CHEST pile, available only when a Room prints CHEST; unusual other Features are taken from a small **named face-up reserve**, or a correctly sorted subtype pile only when enough variants exist. The prototype's STATUE takes the named Cracked Oracle from this reserve.
- **Finds:** one finite deck of common supplies and occasional equipment or Spells; rarer named Relics are earned from specific Room/Chest/Monster text rather than treated as common draws.
- **Static cards:** Heroes, their two Abilities and reusable Combat Actions start face-up, not in any deck. Named Reward and Remains cards may form a face-up stock if a printed drop directly names them.

**Pile-count and table footprint audit:** Across the whole game, this requires **3 Room + 3 Monster + Event + Trap + Chest + Finds = 10 shuffled piles**, plus an optional named Feature reserve. However, organise the regional Room/Monster cards into three packets and put only the **current region's Room and Monster piles** on the table. Then there are exactly **six active shuffled piles** (Room, Monster, Event, Trap, Chest, Finds), plus any face-up reserved cards. Other regions stay in their packet until needed. If six still proves excessive, revise after tabletop testing; do not hide the cost by making draws require searching through mismatched card types.

## Physical loop

1. **ENTER:** reveal one Room card. Its printed text lists its contents. Resolve mandatory Entry hazards; draw specified Monster/Event/Trap and matching Chest/Feature cards. Place Chest at Room's edge so its existence is visible. An on-entry Event/Trap may resolve immediately; optional Features remain untouched.
2. **FIGHT:** if a Monster is alive, each Hero in order takes one action using an Action, Ability, Spell or Item. Roll opposed d20 and d6 damage. A surviving Monster responds with its own d6 table after each Hero action. **No optional object/altar/Chest/NPC interaction while a Monster survives.**
3. **EXPLORE / LEAVE:** after combat (or immediately for peaceful Room), each conscious Hero gets up to one safe action: open one Chest, use one optional Room fixture, pray, eat Remains, equip, trade or leave. Chests and fixtures may be skipped, with no generic penalty. Resolve automatic printed LEAVE rewards, turn exhausted cards upright at the next Room and discard cleared cards. Movement is automatic; no map or return route.

A used Chest is turned sideways; a Monster defeated goes to its discard; Rewards go to the Hero or discard. HP counters live beside the Hero/Monster; effects that persist must be represented by a card physically attached/tucked under the Hero. Never require poison counters, time tracks or handwritten mystery identities.

## Mini-prototype physical card pack (first test, fixed draws)

**Room A — Abandoned Storeroom (UPPER):** ENTER: Reveal 1 UPPER Monster. HERE: CHEST — draw 1 Chest and set beside Room. It cannot be opened until Monster dies. LEAVE: Skip Chest if desired.

**Monster — Goblin Scavenger (UPPER):** HP 8 / ATK +3 / DEF +2. d6: 1–2 Hide (nothing); 3–4 Knife (ATTACK); 5 Duck (next Hero attack DIS); 6 Rush (ATTACK +2). DROP: draw 1 Find. No corpse resolution on Monster card.

**Chest A — Ironbound Chest (FEATURE/CHEST):** OPEN, choose ONE: PICK d20+WIT DC 13. Pass: take 1 Find; fail: draw 1 Trap and resolve. OR FORCE d20+ATK DC 15. Pass: take 1 Find; fail: suffer d6 HP. THEN turn this Chest sideways. Opening takes one safe action, one attempt; no retry in that Room.

**Chest B — Pilgrim's Coffer (FEATURE/CHEST):** OPEN, choose ONE: UNLOCK with Rusty Key (discard it, take 1 Find), OR PRAY d20+WIT DC 12. Pass: take 1 Find and heal 2 HP; fail: take 1 Find but suffer d6 HP. THEN turn sideways. Distinct alternatives to Chest A.

**Trap — Needle Lock:** NOW: the opener tests d20+WIT DC 13. Pass: avoid needle. Fail: suffer d6 HP. Discard this Trap. No lingering status.

**Room B — Chapel of Ash (MIDDLE):** ENTER: draw 1 Event (no Monster). HERE: ALTAR — choose PRAY d20+WIT DC 14 (pass heal d6 HP; fail suffer 2 HP), OR CLEANSE one CURSED Item by discarding one other Item. LEAVE: optional, skip freely. Room itself contains this feature; no altar card draw.

**Event — Candle in the Dark:** NOW, choose: DOWSE (nothing) or LISTEN d20+WIT DC 14. Pass: peek at next Room; fail: suffer d6 HP. Discard. Room B directs you to draw this Event on entry. It resolves immediately; the Altar remains for the later safe action.

**Room C — Collapsed Gallery (DEEP):** ENTER: draw 1 Trap; then reveal 1 DEEP Monster. HERE AFTER COMBAT: STATUE — place 1 matching STATUE Feature card; interact or skip. This is an intentionally rare three-part Room: Trap + Monster + Statue.

**Feature — Cracked Oracle (STATUE):** USE, choose ONE after combat: BREAK (suffer d6 HP, take 1 Find), or READ (d20+WIT DC 14; pass peek at next Room, fail suffer 2 HP). Turn sideways. This feature is drawn only when a Room visibly prints STATUE.

**Monster — Iron Watcher (DEEP):** HP 12 / ATK +5 / DEF +4. d6: 1–2 Assess (nothing); 3–4 Hammer (ATTACK); 5 Guard (next Hero attack DIS); 6 Crush (ATTACK; +2 damage on hit). DROP: draw 1 Find.

**Named Reward — Relic of Embers:** RELIC, ONCE PER ROOM: turn sideways to add +d6 damage to one successful attack. Readies on next Room. Awarded only when specifically named, not from generic finds.

**Remains Reward — Strange Flesh:** EAT (one safe action), d6: 1–2 suffer d6 HP; 3–4 heal d6 HP; 5–6 tuck this card beneath your Hero for +1 on WIT checks. This is a separate Reward, never a text block on the Monster.

### Dry-run script

Place the three Rooms in A/B/C order (representative stages, NOT a replacement for ten-room main game). Give a Hero its basic Strike/Guard/Press prototype Actions and a Rusty Key. Use the Goblin as Room A Monster; test Room A twice, with a different Chest card each time. In one run force a failure to expose the Needle Lock. In Room B compare PRAY/CLEANSE/skip. In Room C resolve the Entry Trap before Iron Watcher, then place the Cracked Oracle beside the Room and choose its STATUE action or leave. Use the named Relic and Remains as alternative reward tests, not automatic extra rewards added in every room.

## Role/layout guidance: shared frame, specialised interiors

90 × 130 mm trim, 4 mm type-safe inset, title at least 16pt, rules preferably 10–11pt (minimum 9.5pt pending actual print). Shared woodcut/zine distressed border with clean rule text, original art on every card. No colour-dependent rules.

| Card | Distinct information layout |
|---|---|
| ROOM | Regional banner + atmospheric scene; big ENTER / HERE / LEAVE rows, printed fixture labels (chest, altar, NPC, statue, fountain etc.) |
| FEATURE/CHEST | Unique container illustration; OPEN choices (PICK / FORCE / KEY / PRAY), success and failure separated, obvious turn-sideways used state |
| TRAP | Mechanism art, NOW / TEST DC / PASS / FAIL, immediately discard if one-shot |
| MONSTER | HP/ATK/DEF stat rail, four legible d6 behaviour rows 1–2 / 3–4 / 5 / 6, single DROP row; **no corpse rules** |
| EVENT | Dramatic scene art, NOW / CHOOSE with explicit outcomes |
| REWARD | Distinct subtype label; CLAIM / EAT / PERMANENT with d6 mini-table only if relevant |
| HERO/ABILITY/ACTION/ITEM/SPELL/COMPANION | Stay as in previous design study; do not bulk-redesign during this gate |

### Complexity audit and unresolved questions

1. **Room and Chest consistency:** printed CHEST requires guaranteed Chest subpile matching its type, not a random arbitrary Feature.
2. **Monster/event placement:** compulsion and optional interaction must be clear; Event and Trap should not accidentally spawn extra enemies.
3. **Reward stock:** named Remains/relics need explicit finite, physically accessible cards; no invisible generation or missing decks.
4. **Attempts:** current prototype grants one Chest opening attempt per Hero safe action and then turns the Chest sideways, whether successful or not. This is provisional and needs tabletop judgement.
5. **Status carrier:** current main has a persistent untracked POISONED condition. Prototype Trap uses immediate HP loss instead; later rewrite must attach a physical card for every lasting effect.
6. **One vs two players:** one safe action per Hero grants two-person party more optional feature interactions; treat this as balance question, not a silent exception.
7. **Table footprint:** ten piles exist across the entire adventure, but only six shuffled piles are active when the region packets are used. Count actual setup and handling time at the table.
8. **90–120 min:** unmeasured target for full ten-Room game; a three-Room test should measure per-encounter attention and card-handling, not extrapolate duration.
9. **Card density:** optional three-feature Rooms may strain text layout. Prioritise legibility and meaningful choice before adding content.
10. **Art:** current minimal SVG reused icons do not fulfil detailed engraving direction. These prototype cards use placeholder shapes only.

## Sign-off checkpoints before full deck refactor

- Players can tell exactly what is present from the Room card **before** drawing any Feature card.
- Different Chest cards make materially different decisions, remain optional and are blocked by live Monsters.
- No optional combat-time room interactions, no extra status or charge counters, no off-card mechanical lookups.
- Repeated d20 and d6 actions remain quick, with one Hero action and Monster response.
- Six sample cards can be read on 90 × 130 mm paper at normal distance.
- No assumption that the complete 97-card old print stock is final.

**STOP:** keep existing game source, one-A4 core and active print kit unchanged until the revised physical design is approved.
