# ROGUE CARDS — tabletop edition

**A real card game for 1–2 players. One A4 page of core rules. All other rules printed on the cards.**

[Card gallery & physical print kit](https://tpepels.github.io/rogue_cards/) · [One A4 of rules](https://tpepels.github.io/rogue_cards/rules.html) · [Print instructions](https://tpepels.github.io/rogue_cards/print-and-play.html)

## The game, not a digital reproduction

The browser dungeon of earlier prototypes was the wrong product. This edition **does not require a computer for gameplay**. The website is a card preview and four-per-A4 printing surface. It no longer launches the Phase 1–7 turn engine. The earlier engine, source and supplements remain in repository history for reference, but are not part of the physical edition.

- **Solo or cooperative for one or two Heroes.**
- **One sequential Room at a time, no map**: three UPPER, three MIDDLE, three DEEP, then the fixed Amulet Vault at Room ten.
- **No return journey**: defeating the Warden and claiming the Amulet wins.
- **One meaningful action per Hero per round**; after each Hero action, a surviving Monster responds using **its own d6 behaviour table**, printed on its card.
- **Opposed d20 combat**: attacker d20+ATK versus defender d20+DEF, ties defend, natural 1 misses, natural 20 hits critically, successful attacks deal d6 damage. WIT saves use d20 versus a printed DC. Advantage and disadvantage use two d20s.
- **The cards own their effects**: equipment, pets, corpse eating, curses, prayer, spellcasting, traps, room rewards and mystery potions all live on the printed cards.
- **No hunger and no cross-run bones files.** Potions remember a first-use d6 discovery within a run, via the consumed Potion card itself.
- **90–120 minutes remains an unmeasured playtest target.** No simulation results are being presented as human game times.

## V2 — dice-first playtest draft (not yet the playable deck)

[**Print V2 rules, one A4**](https://tpepels.github.io/rogue_cards/rules-v2.html) · [V2 roll-range card design standard](docs/v2-roll-range-card-standard.md)

V2 deliberately retains opposed **d20+ATK vs d20+DEF** combat (including natural 1/20 and damage d6) and **d6 Monster behaviour after each Hero turn**. The shared rules become shorter: unlimited carried cards, free between-combat equipment and Item management, one attempt per printed Room interaction, fewer enduring status rules, and no universal corpse-eating procedure. The cards should feature meaningful **printed d6 outcome ranges** across Rooms, Monsters, Items, Potions and objects, rather than extra common rules.

**Do not substitute `rules-v2.html` for `rules.html` yet.** Current `src/tabletop-data.js` still holds the V1 printed cards and some effects have not been rewritten for V2. V2 is a separate, printable review draft until the complete physical deck has been migrated and checked.

### Phase 1 implementation — 36 choice-driven V2 Rooms

[**Preview and print 36 V2 Rooms**](https://tpepels.github.io/rogue_cards/v2-rooms.html) · [Room ecology / interactions](docs/v2-phase1-room-ecology.md)

Phase 1 implements **36 unique Rooms**: reworked versions of all 18 existing Rooms plus 18 new ones, arranged 12 UPPER / 12 MIDDLE / 12 DEEP. Each is a printable 90 × 130 mm collage card with a visible **CHOOSE ONE** decision and a complete d6 result table. Rooms cover hazards, shrines, mysteries, encounters, lairs and treasure. Selected Rooms have four-outcome tables (1–2, 3–4, 5, 6), push-your-luck rerolls, opposed d20 object checks, guaranteed Monster encounters with negotiate-or-fight choices, and kept-card consequences. Rusty Key, Knotted Rope, Pitch Torch, companions, curses and antidotes have targeted interactions.

This experimental deck lives in `src/v2-rooms.js`, separate from the playable V1 `src/tabletop-data.js`. The preview `v2-rooms.html` has region filters and physical four-per-A4 printing. The original V1 deck, card counts, Vault, and `rules.html` are unchanged. V2-only card text is **not fully compatible with V1 Items/Monsters yet**; these are prototypes, not a certified complete V2 game. Original art is reused where IDs match; uncommitted illustrations are not claimed.

### Phase 2 implementation — Scrolls, Rings, Wands and Potions

[**Preview and print V2 objects**](https://tpepels.github.io/rogue_cards/v2-objects.html) · [Phase 2 object ecology](docs/v2-phase2-object-ecology.md)

V2 now includes **44 unique Items** across seven families — 8 Tools, 6 Equipment, 4 Companions, 4 Relics, **8 Scrolls, 7 Rings, 7 Wands** — plus **8 distinct mystery Potions**. All 52 card faces have their own full effects, plus an 84-copy printable deck. Most Items use complete three- or four-outcome d6 tables, while selected tools and cursed equipment deliberately remain reliable or passive. Scrolls are spent on use. Rings occupy one equipped slot. Wands can misfire, break or drain; spent Wands lie sideways until a Shrine or another card recharges them. Potion identity is remembered with the first consumed copy.

The source is `src/v2-objects.js` and the independent prototype gallery is `v2-objects.html`. Named Item/Room links and printed FIRE, MAGIC, METAL and ALCHEMY property interactions connect the Items to the 36 V2 Rooms. The V2 one-page rules have been clarified for Rings and drained Wands.

**V1 remains canonical and unchanged.** Neither the original V1 deck nor its rules were migrated. The combined V2 game still needs its Monster/Hero redesign, card-network audit, playtests and balance pass before replacing the original playable edition.

### Phase 3 implementation — Mechanical ecology and Monster interactions

[**V2 Monster gallery and print sheets**](https://tpepels.github.io/rogue_cards/v2-monsters.html) · [Phase 3 audit and interaction matrix](docs/v2-phase3-ecology-audit.md)

Phase 3 strengthens the interactions between the **36 V2 Rooms, 52 V2 Objects and 12 Monster prototypes**. Scrolls can manipulate rooms and Monster behaviour; Rings change dice outcomes or exploit creature weaknesses; Wands can be **overcharged** by losing d6 HP and discarding the Wand to choose its strongest printed result. Shrines, cursed equipment, companions, elemental properties, bargains and alternate recharge choices have printed effects rather than relying on hidden data links.

The twelve V2 Monster prototypes add weaknesses, negotiation and corporeal rewards while **reusing V1 Monster statistics and behavioural dice tables without touching V1**. They can be browsed and printed by dungeon region in `v2-monsters.html`.

**V1 is still the canonical playable edition.** The V2 Warden/Hero pass, comprehensive balancing, print artwork and full campaign playtests remain unfinished.

## Canonical illustration-first card faces

The **production card gallery and A4 print sheets** now use the flexible illustration-first card design, not the earlier generic mini-art template. Hero/Monster cards place a stat rail inside a large ink illustration, short-effect Items devote most of the card to the image, and the Flooded Chamber demonstrates the optional Room-with-sidebar layout. The title overlays the image as an ivory paper strip. Mechanical wording stays on clean paper.

All **ten original uploaded PNGs** in `assets/illustrations/` are connected via the explicit mapping in `src/tabletop-view.js`; the current corresponding cards are Cave Delver, Floating Eye, Rusty Key, Smoky Potion, Flooded Chamber, Forgotten Supplies (storeroom scene), Goblin Raider (scavenger scene), Buried Lockbox (chest), Broken Oracle (strange feeling scene) and Stone Watcher (cracked statue). These are visual assignments only; card gameplay text and the one-A4 rules are unchanged. Cards without new art retain visibly monochrome SVG placeholders until individually illustrated.

The experimental proposals for **separate Chest, Event, Feature, Reward and other card types** remain design studies, not current playable card types. Their implementation requires a subsequent physical mechanics/content redesign; a large image alone does not make that prototype canonical.

### Phase 2: composition, not just distress

The printed card renderer now uses the actual reference-inspired physical grammar. A common imperfect masthead and cut-paper title sit over **adaptive illustration panels**; the effect text determines how much space the artwork can occupy, rather than imposing one fixed image height. Heroes and Monsters use a left-side HP/ATK/DEF (plus Hero WIT) stat rail with printed symbols; Monsters have a clearly separated four-row d6 behaviour record and full corpse wording. Short-effect Items fill more of the face with art. The **Flooded Chamber** uses a real printed side-column Room treatment, not the same bottom panel as every other card.

This is still a **visual-only** release. It preserves all current rules, card names, illustration assignments, quantity, dimensions, and four-up A4 print layout. The proposed separate Room/Chest/Feature/Reward taxonomy is still not implemented.

### Phase 3: the Xerox artifact treatment

The production print deck now renders illustration PNGs and placeholder artwork through a shared **reduced-tone black/ivory SVG ink filter** (see `#tt-xerox-ink` in `src/tabletop-app.js`). Paper grain, edge abrasion, pinholes and fine photocopy scratches are confined to the physical frame and illustration plate, not the rules. A deterministic per-card **four-plate misregistration scheme** introduces slight shifts and pasted-label rotations; duplicates of the same printed card are reproducible. No client-side random effects, no extra card state and no dependency on a computer to play.

The gritty treatment deliberately leaves HP, ATK/DEF/WIT, monster d6 tables, item effects and rule text untouched. The original 90 × 130 mm cards and four-per-A4 print sheets remain in force. CI checks the illustration filter in preview and print media, verifies that effects stay unfiltered, and checks the complete physical deck for clipping. This is a visual-composition milestone, **not** a claim of production-grade print proofing or new art for every card. Readability and ink density still need an actual paper proof.

### Collage construction (post-Phase 3)

The current **canonical** printed cards now use one physical assemblage rather than vertically stacked UI boxes. `src/tabletop-view.js` groups each illustration plate, left inset Hero/Monster stat rail, and printed effect into a `tt-collage`; the ivory title and small footer are independently pasted over the same surface. `styles/tabletop.css` deliberately overlaps these layers, with deterministic four-plate offsets instead of runtime randomness. The Flooded Chamber has an offset right-hand note on the picture instead of a docked UI sidebar. Images stay actual image elements under `#tt-xerox-ink` so they are meaningful physical scene art, not CSS background fills.

The rule paper remains solid and unfiltered. Long Monster behaviour/corpse passages do not sit directly on imagery, and their readability is validated by both browser and A4 print clipping tests. Art, type, text, deck quantities, mechanics and the one-A4 core rules remain unchanged. The collage is a **presentation change**, not a new object/card taxonomy.

## Physical components and source of truth

`src/tabletop-data.js` defines the entire tabletop catalogue and real print quantities. `src/tabletop-view.js` renders those cards (90 × 130 mm) in the gallery and four-up A4 print sheets. `src/tabletop-app.js` is only a browsing/printing tool. `rules.html` is the **sole shared rules sheet**. `print-and-play.html` is optional pre-game preparation, **not** a second rulebook.

The older `src/engine.js`, `src/data.js`, `src/app.js` and phase supplements are retained temporarily as legacy implementation files but do not govern the tabletop edition. Do not add gameplay mechanics exclusively to the browser: update the physical card and the one-page rules first.

## Verification

Run npm install, npm test, and npm run test:visual.

The active tests verify print stock, monster behaviour tables, absence of external lookup requirements, one-page rules, responsive preview, and A4/card print geometry. Former engine-phase tests are archival and are not run against the redesigned tabletop rules.

## Playtest priorities

Validate 1-player and 2-player difficulty, 90–120-minute target, on-card text readability, printed component counts, and whether the d20 opposed/d6 behaviour resolution feels dynamic without slowing physical combat. Avoid developing a new digital engine until the physical playtest is successful.
