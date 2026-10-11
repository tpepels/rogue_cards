# Phase 2 — physical core: implementation record

## Chosen rules (fixed for this phase)

1. **Hybrid dungeon:** main route 0–10, with nine optional one-room side branches; only explored rooms are persisted.
2. **Two actions per turn:** a new monster behaves only at the end of the player's second action or a voluntary End Turn. Hunger -1 is deducted once per turn, before monster behaviour.
3. **Dice combat:** d6 + ATK versus 4 + DEF, natural 1 miss and natural 6 critical 3 damage, ordinary hit 2 damage. A single die is reused for every roll.
4. **Shared monster behaviour deck:** ten physical cards; discarded cards reshuffle when exhausted. One monster active in the current room.
5. **Longer expedition:** depth 10, resource management and optional loot branches. Intended 90–120 minutes; this must be verified with physical playtests.

## Acceptance criteria

- Physical cards, browser rules and field guide agree on attack rolls, turn timing, hero starter items, deck counts, monster effects, route connections and potion identities.
- Browser engine has no dependency on DOM, templates or styles.
- Incomplete runs can be saved and loaded under schema v2.
- Old v1 saves remain untouched, rather than being misinterpreted as v2.
- Card layouts are readable on phone and desktop and print four 90x140 mm cards per A4 sheet.
- Browser encounter UI shows all legal actions and the result of d6 rolls and monster behaviours.
- Printable field guide, map/dossier sheets, and hidden identity slips suffice for a solo physical playtest.

## Known limitations / tests not performed

- The physical kit has not been printed on a real printer or playtested to measure session length.
- Simulated strategy runs are not a proxy for physical human playtests or balance.
- Rules intentionally keep only one current monster active. Branches are dead ends, not an unconstrained spatial maze.
- Potions and some items rely on the field guide reference sheet. Full card-only rules consistency will require a later editorial pass.
- All art is sparse, black ink vector work. Print borders and clipping depend on browser and printer settings.
