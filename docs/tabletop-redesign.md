# Rogue Cards — Tabletop-first reboot

## Why this replaces Phases 1–7

The earlier phase series developed a browser roguelike and tried to reproduce it on paper with several rulebook supplements. That reversed the intended priority. **The print cards are now authoritative.** The website is a preview and an A4 print surface only. The browser simulation is not connected to the current edition and must not quietly define its rules.

## Locked design decisions

| Decision | Current physical solution |
|---|---|
| Players | Solo or cooperative 1–2 |
| Time | 90–120 minutes aspirational; **not measured** |
| Victory | Find the Amulet by defeating the fixed Warden; **no return trip** |
| Dungeon | One Room card revealed and resolved at a time; **no persistent map** |
| Turn | One meaningful action per Hero; movement between Rooms automatic |
| Combat | Attacker d20+ATK versus defender d20+DEF; attacker total must exceed defender. Natural 1 misses, natural 20 critical, d6 damage; WIT DC saves |
| Monster behaviour | Four entries per Monster card for d6 1–2 / 3–4 / 5 / 6, resolved after each Hero action while Monster lives |
| Equipment | Printed Weapons, Armour, Curses, Spells, Companions; a few potions with physical discovery |
| Survival | Pets, corpses, prayer/altars, magic/statuses, curses, traps/environment; **no hunger or cross-run bones** |
| Rule budget | One A4 common-rules sheet. Everything else printed in full on the relevant card, up to several effects if they fit |

## Physical card ecology and setup

- Choose a Hero for each player, draw two items and equip freely.
- Three regional Room decks with six unique designs each. Reveal three UPPER, three MIDDLE, three DEEP, and finally the fixed Amulet Vault = **10 Rooms** with no map.
- Three regional Monster decks, printed with the d6 behaviour table and EAT/CORPSE outcome. The Warden is separate.
- Item and Potion copies constitute one finite deck; rewards never create phantom cards.
- Equip one Weapon, Armour, and Companion; five inventory cards per Hero. Keep first consumed mystery Potion visible with its d6 identification result.
- Use markers for HP and tilt cards to mark once-per-Room abilities. Tuck permanent corpse traits under the Hero.
- No app, look-up charts, simulation, or computer is required at the table.

## Mechanical cohesion review

The game's loop is **Reveal → (save / encounter) → each Hero acts → Monster d6 response → kill / retreat not available → reward / one safe action → next Room**. There is intentionally no pathing, initiative order beyond player order, hunger meter, separate Monster AI pile, or between-battle command system. The d20 is for attack and defence and WIT saves; the d6 is for monster decisions, damage, corpse outcomes, healing and mystery discovery.

Three complexity guards:

1. A common operation has one definition in the one-page rules: ADV/DIS, conditions, DC tests, d20 opposed combat, d6 behaviour, slots, room progression and victory.
2. Exceptions are written directly on the Hero, Room, Monster, Item, or Potion card; no supplementary rule lookup required.
3. An optional action in a Room consumes that Hero's safe action. One Monster corpse can be eaten once, so its trait cannot be duplicated by both Heroes.

## Verification and known limits

Node validation checks card stock, regional topology, Monster behaviour coverage, spells/potions/curses/pets/corpses and one-page-rule phrases. Browser tests check all card specimen content for clipping, 90 × 130 mm card boxes, four-per-A4 sheet layout, mobile viewing, and one-A4 core-rules page geometry. The former engine and its phase-specific tests are not the game under development.

**Physical playability is NOT empirically verified:** paper contrast, art quality, reading distance, table ergonomics, card sorting/setup time, cooperative vs solo balance and the 90–120-minute target all require real tabletop sessions. A print-layout test cannot establish those facts. Do not claim this game is balanced or production-print-ready without those sessions.

### Open playtest questions

- Are d20 opposed rolls + d6 damage and behaviour sufficiently quick?
- Does one Monster response after **each** Hero action keep 2-player fights appropriately challenging?
- Is 10 sequential Rooms enough for a meaningful 90–120-minute session?
- Do players enjoy discovery through three appearance-based Potion d6 identities?
- Are 97 physical cards and one page of shared rules manageable?
