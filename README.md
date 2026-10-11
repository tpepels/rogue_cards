# ROGUE CARDS / ISSUE 003

**Four kinds of unidentified magic. Two actions. One life.**

**[PLAY IN YOUR BROWSER](https://tpepels.github.io/rogue_cards/)** · [Physical rules](https://tpepels.github.io/rogue_cards/field-guide.html) · [Dungeon sheets](https://tpepels.github.io/rogue_cards/playmat.html) · [Magic supplement](https://tpepels.github.io/rogue_cards/magic-guide.html)

Rogue Cards is a solo-first, physical-first roguelike card-game prototype. All physical cards are **90 × 140 mm** with economical monochrome line drawings inspired by 1980s homemade zines. The browser game and printable field guide use the same fundamental rules. **90–120 minutes is the desired physical session length, not a measured claim.**

## Phase 3 — Magic and material interactions

- Four unidentified families: **Potions (5 appearances), Scrolls (4), Wands (4), Rings (4)**.
- Potion identities come from the original five slips; the other families have **12 large-format identity cards**. Each family is shuffled separately at setup, so all copies of one appearance have a stable identity for that run.
- 15 shared properties: FIRE, WATER, COLD, ELECTRICITY, ACID, POISON, METAL, WOOD, STONE, DARK, LIGHT, HOLY, DIGGING, TELEPORT, ORGANIC. Properties are a rule vocabulary: only interactions explicitly named in a card or reference sheet resolve. Some material tags remain descriptive pending Phase 4.
- **Only explicitly printed verbs:** Potions DRINK/THROW; Scrolls READ; Wands ZAP (three charges per card); Rings WEAR (one slot).
- **Selective blessing/curse:** only Rings in this prototype. Every ring appearance has one Uncursed, one Blessed and one Cursed printed copy. State is visible; hidden identity is still randomized.
- 48 additional printed cards: 12 Scrolls, 12 Wands, 12 Rings, and 12 Identity references. The updated print kit contains 166 physical cards total.
- Browser inventory shows discovered identities for all four families and maintains a ring slot. New runs use schema v3; previous v2 saves remain in local storage untouched.
- [The Unknown Objects](magic-guide.html) is the printable identification notebook, property glossary and exact-action reference.

## Phase 2 game

- **A hybrid dungeon:** Ten main depths (0–10) and an optional side chamber at depths 1–9. Side chambers connect only to their parent; explored rooms and wounded monsters persist.
- **Two actions per turn:** Move, reveal, attack, eat, use or equip an item, take loot, pray, claim the Amulet; end early if needed. At the end of the turn, lose one hunger and activate the monster.
- **Dice-based combat:** Roll a single d6 + attack against 4 + defence. A natural 1 misses, a natural 6 hits critically for three damage, and an ordinary hit deals two.
- **Shared ten-card monster behaviour deck:** Strike ×3, Lunge ×2, Guard ×2, Frenzy, Drain, Recover. Shuffle its discards once the pile empties.
- **Loot and equipment:** Rations, keys, mystery potions, a Notched Sword, Patchwork Mail, a Lucky Bone and a companion Dog. One weapon, one armour and one companion slot.
- **Identifying potions:** Five potion appearances are randomly mapped to five hidden effects each run.
- **Objective:** Defeat the Amulet Warden at depth 10, take the Amulet of Yendor and return by explored rooms to the entrance.
- **Physical kit:** Print full card quantities, field guide, dungeon/map sheets and potion identity slips. Requires a six-sided die and pencil.

## Run locally

No framework, no build process and no server-side dependencies are needed for the website. Use a local static server for ES modules:

    python3 -m http.server 8000
    # http://localhost:8000

Saved games are browser-local (key \`rogue-cards-v2\`). Phase 1 saves are not migrated automatically: the two-action rules are incompatible with v1 saved runs. Legacy saves are not overwritten.

## Tests

Run the engine and presentation tests with Node 22+:

    npm test

The browser geometry and print suite uses Playwright (only a development dependency):

    npm install
    npx playwright install chromium
    npm run test:visual

These checks cover deterministic deck setup, physical map topology, turns, dice, status effects, victory/death, seeded simulations, HTML-escaped rendering, responsive cards, and A4 print layout. They deliberately **do not block GitHub Pages deployment** during rapid prototyping.

## Print-and-play

1. Open **Cards** and select **PHYSICAL KIT** rather than **SPECIMENS**.
2. Select **PRINT CARDS / SAVE PDF**; print on A4 at 100% scale, with browser headers and footers off.
3. Each page contains up to four **90 × 140 mm** cards. Separate the physical Room, Monster, Object, Behaviour, and Event piles after cutting.
4. Print [field-guide.html](field-guide.html) (includes potion identity slips), [playmat.html](playmat.html) (dungeon map), and [magic-guide.html](magic-guide.html) (the three new mystery-family mappings and property reference).
5. Keep all 12 new Identity cards separate from the Object deck. Shuffle face down within each family and assign one per appearance; leave it hidden until discovered. Reserve starting items and fixed Vault/Warden, and follow the field guide. Record monster wounds and uncollected loot in the map grid to avoid needing to display all cards at once.

**Print size still requires confirmation on the user's actual printer; browser/PDF scaling may vary.**

## Repository

- \`src/data.js\` — all physical card definitions, copies and monster behaviours
- \`src/engine.js\` — seeded, presentation-agnostic, two-action roguelike engine
- \`src/app.js\` — browser play, discovery map, inventory/identifications and printable catalogue
- \`src/card-view.js\` — shared pure card renderer and four-card A4 pagination
- \`src/art.js\` — original simple SVG pen artwork
- \`styles.css\`, \`styles/phase1.css\`, \`styles/phase2.css\` — monochrome style, responsive layout and print rules
- \`field-guide.html\` — standalone rules and potion identification slips
- \`playmat.html\` — writable dungeon and character sheets
- \`tests/\` — native unit tests and optional Playwright browser tests

## Scope and limitations

The prototype is solo and follows a fixed topology with randomly revealed rooms, monsters, objects and events. It does not yet have true spatial line-of-sight, AI pathfinding, priest shops, curses, corpse eating, a full item physics engine, or persistent bones levels. Some exploratory card effects may be rebalanced later. Session length and game economy are not validated by timed physical playtests. The system is not an official NetHack product.

See [Phase 2 implementation](docs/phase-2-audit.md) and [Phase 3 implementation](docs/phase-3-audit.md).
