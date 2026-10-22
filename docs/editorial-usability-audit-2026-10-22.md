# Rogue Cards — editorial and beginner-usability review
22 October 2026. Source-level audit on `main` at `40c09443`.
**Editorial only. No rules, card values, engines or printing layouts have been changed.**

## Brief and scope
Editorial standard: a person who has never played a dungeon crawler should be able to set up, take turns, resolve a fight, and finish a game from the core rules; someone who has learned those rules should execute every printed card without improvising an unstated mechanic.
Reviewed the two core rulebook pages and generated deck appendix (`rules.html`, `src/rules-deck-appendix.js`), all seven steps of `tutorial.html`, the four presets (`src/decks.js`), the 139 core card definitions (`src/heroes.js`, `src/rooms.js`, `src/room-memory.js`, `src/room-fates.js`, `src/monsters.js`, `src/monster-defeats.js`, `src/warden.js`, `src/objects.js`) and the 54 extra designs (`src/print-expansion.js`, `src/monster-expansion.js`, `src/item-expansion.js`). Cross-checked print rendering (`src/tabletop-view.js`) and selected execution contracts/tests. This was a text/source audit, **not** a blind playtest or a visual inspection of every printed card at physical scale.

Complete printed edition: **193 designs** = 8 Heroes + 79 regional Rooms (64 original + 15 expansion) + Vault + 24 regional Monsters (12 + 12 expansion) + 2 Warden phases + 79 Objects (52 original + 9 practical + 18 odd). Multiple printed copies are not additional designs.

Severity: **P0** teach incorrect game / fails first play; **P1** ambiguity can change legal outcome or produce inconsistent tabletop adjudication; **P2** editorial/maintenance improvement or rare interaction clarification. Confidence: **confirmed** = direct contradiction in printed sources; **clarify** = ambiguous to reader, not necessarily a code bug. Do not silently change gameplay to resolve an editorial question.

## P0 — resolve before asking first-time players to learn

**E01 — Tutorial teaches obsolete combat. Confirmed.**
`tutorial.html` sample 5 says each side rolls d20 + ATK/DEF, with ties defending. The current `rules.html` section 8 explicitly says the defender **does not roll**: target AC = 12 + DEF; an attack **meets or exceeds** AC. Replace every opposed *attack* in the tutorial with the fixed-AC procedure. Keep opposed WIT/ATK *tests* distinct from attacks. Add a regression assertion comparing the tutorial combat method with current rules.

**E02 — Tutorial uses wrong card statistics and options. Confirmed.**
`tutorial.html` sample 1 calls Veteran Warrior **20 HP, +5 ATK**; the printed Hero has **18 HP, ATK 4**. Sample 4 calls Giant Rat **6 HP, +2 ATK**; the printed Monster has **3 HP, ATK 1, DEF 1** (`src/monsters.js` applies the printed scaling). Sample 5 consequently claims Sword gives total +7 ATK, while current Warrior 4 + Notched Sword 2 = **+6**. The Dripping Passage choice is **PRY GRATE**, not “BREAK IT”; Rat Nest offers **SOOTHE / DISTURB**, not a **FIGHT** Room option. FIGHT is the general response to an active Monster, and should be explained as such. Rewrite all seven tutorial steps against the current cards, not only these isolated numbers.

**E03 — Tutorial teaches the wrong final boss and encounter length. Confirmed.**
`tutorial.html` sample 7 says Warden **20 HP**, Phase II at **10 HP**. `rules.html` and `src/warden.js` say **15 HP**, switch at **8 HP**. The tutorial says 9 Rooms total (3 per depth) as if a normal runnable route, whereas the published Everything Goes procedure requires 12 non-Corridor Rooms *per depth*. Explicitly label the 9-Room tutorial as a **compressed worked example that skips intermediary Rooms**, not a sanctioned alternative game mode.

**E04 — Even the current printed rulebook’s combat worked example contradicts current stats. Confirmed.**
`rules.html` says Will-o'-Wisp starts on **5 HP** but later shows **9 → 5 HP** after 4 damage. Its printed ATK is **+2**, while the example uses **+4** for Spark and Flash. A fully valid worked alternative:
- Warrior (ATK 4 + Sword 2) rolls 13: total 19 vs Wisp AC 16; d6 damage 2. Spends 1 HP for guaranteed Blood Rush +2. Wisp **5 → 1 HP**.
- Wisp Flash with ADV: d20 7/14, keep 14, +2 ATK = 16 vs Warrior AC 15, hit; deal 3 damage, next Hero attack DIS.
- Knight attacks with DIS 18/10, keep 10, +4 = 14 vs AC 16, miss.
- Wisp Spark: d20 15 +2 =17 vs Knight AC 17, hit. Damage 4, Knight’s Intercept guaranteed -3 for 1 self-HP: net 2 HP lost (1 self-HP + 1 attack).
- Next round Warrior rolls 12 +6 =18, hits, damage 5, Wisp **1 → 0**; no response.
This preserves the intended teaching steps but must be checked against the exact printed interruption rules before publishing.

**E05 — The game length / descent trigger is underspecified outside Everything Goes. Clarify.**
`rules.html` gives “12 non-Corridor Rooms per depth” under “In Everything Goes”. `src/decks.js` advertises Classic 12/depth, Strange 13/depth, Balanced 48 non-Corridor copies plus corridors and Everything Goes 79 unique Rooms. State exactly **when to descend for every official preset** (fixed count, exhausted pile, or something else) and what custom decks do if they run out. Also explain what happens to undiscovered/bottom-decked Rooms at the depth limit, and to the count if a trapdoor descends early. The deck appendix lists cards but does not make each run length explicit.

## P1 — remove ambiguity from shared game language

**E06 — Opposed-test ties are not adjudicated explicitly. Clarify.** Section 6 says “higher total wins”, but card choices express binary “Win / Lose”. A tie is neither higher result. State whether ties cause the acting Hero to lose the opposed test, and specify natural 1/20 treatment for opposed tests. Do not confuse this with the separate **attacks meet AC** rule.

**E07 — “HP at 0” needs a beginner flow. Clarify.** Section 3 says downed Hero cannot act unless healed “before the expedition moves on”. Say who may heal them, if a Monster response can occur in between, what happens to that Hero when leaving the Room and whether they can recover later. Include one concrete 2-Hero example.

**E08 — One Hero choice and shared ownership deserve a single clear procedure. Clarify.** Who chooses a Room option, who pays/discards, who draws and holds a rewarded Item, who takes damage, and when a downed party member can receive healing are spread across pages. Introduce “acting Hero” in section 5 rather than first explaining it in section 9.

**E09 — Reactions and interrupt ordering lack a priority rule. Clarify.** Several Hero abilities and equipped Items trigger *before a d20*, *after a hit*, *after behaviour is rolled*, or *after a result*. For example, Wandering Knight INTERCEPT and Warded Shield both respond to being hit; a Priest ability and a ring may affect the same d20. Explain whether multiple distinct reactions can respond to the same trigger, who orders them, what “once per Room” consumes, and whether a triggered ability is optional.

**E10 — Physical KEEP/sideways/tucked/consumed states need a miniature illustrated example. Clarify.** Rulebook mentions kept Room, PACT sideways, tapped Wand, Item tucked under a Room or Monster, and discarded Items. Explain whether sideways equipment retains passive bonuses, what to do when a kept effect is used and discarded, what expires at the next Room vs the next depth, and how to return a tucked card. This is a real bookkeeping load on paper, not a mere glossary entry.

**E11 — Tags are widely used but not defined as a system. Clarify.** `FIRE`, `ICE`, `MAGIC`, `CURSED`, `METAL`, `ALCHEMY`, `BEAST`, `PLANT`, `LIGHTNING`, `BARGAIN`, `KNOWLEDGE` appear throughout cards. Add a sentence: “ALL-CAPS words in an Object’s tag strip are properties, not actions; a card counts as that property only if the tag is printed on it.” Also make explicit whether “WITH” checks any party member or only acting Hero, and “EQUIPPED” requires an equipped Item (wording in rules currently partially addresses this).

**E12 — Discarded-Potion memory can disrupt the discard pile. Clarify.** Potions say “Drink and discard” *and* “Keep one used Potion face up to remember its effect”; some 5–6 results also create a functional kept Potion. But the rules require discarded Items to stay in one newest-on-top stack, including for salvage effects. Tell players to keep the *identity reminder* visible **in the discard pile** (or with a separate token), distinct from a functional kept card; make the distinction unambiguous.

**E13 — Different actions named “FIGHT” need clear meaning. Clarify.** Most Rooms have two Room choices, while encounters permit fighting/Parley after the Room choice. `Warden’s Threshold` has **FIGHT GUARDIAN** as a Room choice; `Hall of Teeth` has **RATTLE** that starts a fight and promises a bonus only on victory; `Rat Nest` has **DISTURB**, which is an opposed ATK check, *not* the regular Monster fight. A beginner cheat sheet should explicitly distinguish `Room choice`, `Monster appears`, `combat turn`, and `post-victory reward`.

**E14 — Parley cost and retained Monster exception. Clarify.** `Goblin Raider` can be recruited as a Companion by spending 2 Items. The rules allow one equipped Companion. State whether the new Goblin occupies/replaces that slot, where the recruited Monster card physically goes, and what happens to the Monster’s combat effects/HP counter. `Will-o’-Wisp` can follow until the next Corridor/Vault; spell out what happens if the party never reveals a Corridor before Vault, and when its card is placed.

**E15 — Victory / escape wording can mislead. Clarify.** Rules say the quest is to “reach the Amulet Vault and escape with the Amulet”, but the same page describes winning immediately on combat/SEAL or an alternate ending. Tell the first-time player plainly that **claiming the Amulet ends the expedition as a win**, with no extra return journey, if that is the intended rule.

**E16 — Room route manipulation needs a physical protocol. Clarify.** Multiple Corridors say reveal two or three Rooms, pick one, then put others at top/bottom, order them or enter unseen. Add one example for “enter one now; place the other at bottom”, including whether the Corridor itself counts and whether another revealed Corridor changes depth count. The main rulebook’s PEEK / REVEAL definition is too short for all variants.

**E17 — First-attack bonuses are spread across cards. Clarify.** `Notched Sword`, `Ashwood Staff`, `Warded Shield` have passive equipped bonuses and distinct once-per-Room or hit triggers. Provide a combined Hero attack example that uses only printed card wording, ideally Warrior + Sword vs Giant Rat. Point out that “once per Room” means a *triggered* effect, not the passive equipment stat.

## P1 — individual wording requiring editorial decisions (not speculative rule changes)

**E18 — Broken Oracle (`d-oracle`).** “Reveal next Room; replace it” is an unclear physical instruction. Replace with “Reveal the top card of this depth’s Room pile, then return it face down to the top” or the exact intended procedure. Explicitly define TREASURE/CORRIDOR/OTHER according to the printed Room kind.

**E19 — The Puppet Judge (`u-puppet`) / The Talking Door (`d-mouth`).** “Keep acquittal”, “upright Puppet Judge acquittal” require exact physical state: keep the Room, which orientation, how many times the acquittal can be spent, and whether BRIBE is always an eligible alternative. Write both matching ends of the link together.

**E20 — Beetle Caravan (`m-beetle`).** “Keep for +1 Item at Midnight Bazaar” appears inside the BARGAIN choice but does not explicitly tell a human **keep this Room**. Say how/when the future benefit is recorded, whether the Bazaar bonus applies to every successful draw and whether the kept Room is discarded afterward. Also distinguish this from STEAL’s cost-penalty state.

**E21 — Echo Bell (`odd-echo-bell`).** “Choose a held KEEP Room trophy. It can be used one extra time” is underspecified: which kept Rooms count as trophies, what happens when its normal first use says “discard this Room”, and how to mark the extra charge. Determine an operational method before copy-editing.

**E22 — Red String (`odd-red-string`).** “Your next d20 result is also the other Hero’s next d20 result” must say whether this transfers the *natural die face* or the modified total, whether each character applies their own ATK/WIT modifiers and ADV/DIS, whether the other Hero actually rolls, and whether a 1/20 remains natural. This can change combat outcomes.

**E23 — Sun Charm (`odd-sun-charm`).** “Cancel your next DIS penalties” can mean one DIS, all queued DIS, or a future unlimited number. Specify a single consumption rule and duration.

**E24 — Moon Lens (`odd-moon-lens`).** “Before choosing a Room option, roll its ROOM d6 now” does not say what happens in a Room without a d6 (e.g., Broken Oracle) or if the chosen option never asks for that roll. State eligible Rooms and when the stored result expires.

**E25 — Fever Candle (`odd-fever-candle`).** “Discard for +3 on your next WIT test; then lose 1 HP” makes the HP payment’s timing ambiguous. Specify whether 1 HP is paid immediately or *after* the eventual WIT test; check against voluntary-HP payment rules.

**E26 — Solo/duo targeting terms.** Several Monster behaviours refer to “active Hero”, “target” or “each Hero”, and cards mention “next Hero d20”. Write one general rule that the active Hero is the last actor unless a printed effect targets all/someone else, and explain whether pending penalties stay with one Hero or the party.

## P2 — consistency, accessibility and maintenance

**E27 — Static editorial audits cover only older subsets. Confirmed.** `docs/card-copy-audit.md` records 111/111, explicitly superseded. `tests/human-card-usability.test.mjs` and `tests/card-copy.test.mjs` assert exactly 139 original cards. The printable catalog uses `src/decks.js` to add **54 more** (15 Rooms, 9 practical Objects, 12 Monsters, 18 odd Objects) up to **193 designs**. Extend one editorial suite to use `FIXED_CARDS + SELECTABLE`, then assert 193 unique IDs, no empty timing/targets, legible text budgets, and full printed effect presence for *all 193*. Preserve separate physical rule-parity tests.

**E28 — No regression check for tutorial vs live card stats. Confirmed.** The tutorial hardcodes HP/ATK/DEF and options as prose. Generate displayed stat descriptions from canonical `HEROES` / `MONSTERS` when possible, and make example rolls immutable, explicit *fixtures* verified against the current rules. Add tests for 18 HP Warrior, 3 HP Rat, 15 HP Warden, fixed AC, no defender d20 and exact option labels; ideally verify all seven steps.

**E29 — No regression check for printed rulebook arithmetic. Confirmed in worked example.** Replace prose-only numerical examples with fixtures tested for damage arithmetic, attack thresholds, and transitions. Ensure the example remains true after balance adjustments. A test passing only because `rules.html` contains shared vocabulary cannot detect E04.

**E30 — Teach before referencing.** The mandatory first read should be “Setup → one Room → one Monster → one fight → loot → depth progression → Vault”. Put a *correct* short annotated turn in the two-page core guide, then offer PACT, retained Room exceptions, Wands, multiple rerolls and special endings as optional advanced mechanics. Current rulebook starts with four concept sections and pushes the detailed example to page 2; the tutorial currently contradicts it.

**E31 — Print scale must be checked in hand.** 90×130 mm card size and four per A4, multi-slip rule text over illustration, 4-page guide at reduced print type. Browser clipping/word-count tests are useful but cannot establish that a tired first-time reader can scan an interrupted trigger or identify a d6 outcome without confusion. Blind tests should use *printed* output, not just web cards.

**E32 — Consistent dictionary and editorial style sheet.**
- Use one exact word for `use`, `equip`, `carry`, `discard`, `tuck`, `keep`, `turn sideways`, `recharge`.
- Reserve `FIGHT` for ordinary combat, `PARLEY` for Monster avoidance, `Room option` for printed two-choice Rooms.
- Capitalize mechanic tags only when they are printed formal tags (`MAGIC`, `FIRE`, etc.).
- Make every card formula “**TIMING → COST → CHECK/ROLL → SUCCESS / FAILURE → DURATION**”, while allowing flavorful text separately.
- Use `d6`, `d20`, `d20 + ATK`, `AC`, `ADV`, `DIS` consistently.
- Keep all visible examples internally coherent and reproducible.

## Proposed beginner smoke test (zero RPG experience)

Give a reader only a printed standard deck, four-page rules and a die set. Do **not** teach verbally. Observe whether they can (1) correctly pick a deck and setup a Hero, (2) identify acting Hero and perform a Room choice, (3) distinguish the Room roll from an attack, (4) compute AC and resolve a natural 20, (5) resolve a Monster behaviour and both Heroes’ actions, (6) interpret a kept Room/sideways tool, (7) discard/identify a Potion, (8) progress depth correctly, (9) play the Warden transition and SEAL, (10) state exactly when they win. Log every rules lookup and every improvised ruling. Aim for **zero contradictory instructions**, **zero undefined compulsory terms**, and all ten actions possible without coaching.

## Suggested safe editorial work order
1. Freeze current printed mechanics as the single source of truth; do not rebalance during this pass.
2. Replace tutorial with a canonical, reproducible worked sample. Correct rulebook combat example and run-level duration/variant text.
3. Resolve P1 *design decisions* with the game designer, recording precise interpretations, before rewriting ambiguities that could change gameplay.
4. Apply one style guide across every source family including all 54 expansion designs; add cross-document tests.
5. Verify rendered card sheet and conduct blind printed playtests.
6. Only then publish this as novice-ready.

**Bottom line:** technically comprehensive does not mean editorially self-teaching. Current rules are close to a compact expert reference, but there are confirmed contradictory onboarding examples and several underdefined rare interactions. Treat tutorial drift as a blocker; treat individually ambiguous cards as editorial decisions, not silently “fixed” rules.
