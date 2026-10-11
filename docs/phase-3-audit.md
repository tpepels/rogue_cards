# Phase 3 / Magic interactions audit

## Five design decisions

| Decision | Implemented |
|---|---|
| Families | Potions, Scrolls, Wands, Rings |
| Universal properties | 15 tags; shared interactions are explicit, not freeform |
| Object combinations | Only printed DRINK, THROW, READ, ZAP, WEAR actions |
| Blessing and curses | Only Rings (visible Uncursed/Blessed/Cursed markers) |
| Identification | Independent randomly shuffled appearance-to-identity mapping per family |

## Digital/physical contracts

- 5 Potion appearances use 5 hidden potion identity slips from the original Field Guide.
- 4 Scroll, 4 Wand, and 4 Ring appearances each use their own shuffled set of 4 printable Identity cards.
- All identical appearances map to the same magical effect within a run; mappings reset between runs.
- 3 copies of every Scroll and Wand appearance; 3 ring copies per appearance, one in each blessing state.
- Wands carry 3 individual charges (mark on card); scrolls are consumed; rings occupy one slot. Replacement rings return to inventory.
- Ring curses are visible, not hidden: Protection +1/+2/-1 Defence; Light, Sustenance and Resistance work if not Cursed.
- FIRE scrolls are diminished by WATER; amplified by WOOD rooms. Sparks and thrown Frost are amplified by WATER, Acid is amplified versus METAL, Poison is amplified versus ORGANIC.
- Wand DIGGING prepares a single free bypass for the next LOCKED or TRAP room. Banishment removes a non-Warden monster from play. Mapping peeks at the next Room card.
- Each magic action uses a normal action from the Phase 2 two-action turn.
- The finite digital Object supply includes only printable physical copies. Hidden identities remain separate and are not loot.
- Saved game schema bumped from v2 to v3 to avoid interpreting old runs with missing magic fields.
- Main Field Guide links to the Phase 3 two-sheet magic reference and per-family identification table.

## Scope boundaries

- Fifteen tags are a vocabulary, not a simulation engine: WOOD and ORGANIC gained explicit damage interactions, but not every pair of properties is meaningful. No unstated property interactions are inferred.
- No freeform dipping, combining items, shopping, crafting, enchantment or identification by price.
- Blessings/curses do not extend to consumables or wands during this phase.
- Long expedition duration remains an **untested 90–120 minute target**, not an empirically timed achievement.

## Verification

Run:
    npm test
    npm install
    npx playwright install chromium
    npm run test:visual

A4 output and human print legibility must still be checked with physical printouts.
