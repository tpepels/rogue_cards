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

## Canonical illustration-first card faces

The **production card gallery and A4 print sheets** now use the flexible illustration-first card design, not the earlier generic mini-art template. Hero/Monster cards place a stat rail inside a large ink illustration, short-effect Items devote most of the card to the image, and the Flooded Chamber demonstrates the optional Room-with-sidebar layout. The title overlays the image as an ivory paper strip. Mechanical wording stays on clean paper.

All **ten original uploaded PNGs** in `assets/illustrations/` are connected via the explicit mapping in `src/tabletop-view.js`; the current corresponding cards are Cave Delver, Floating Eye, Rusty Key, Smoky Potion, Flooded Chamber, Forgotten Supplies (storeroom scene), Goblin Raider (scavenger scene), Buried Lockbox (chest), Broken Oracle (strange feeling scene) and Stone Watcher (cracked statue). These are visual assignments only; card gameplay text and the one-A4 rules are unchanged. Cards without new art retain visibly monochrome SVG placeholders until individually illustrated.

The experimental proposals for **separate Chest, Event, Feature, Reward and other card types** remain design studies, not current playable card types. Their implementation requires a subsequent physical mechanics/content redesign; a large image alone does not make that prototype canonical.

### Phase 2: composition, not just distress

The printed card renderer now uses the actual reference-inspired physical grammar. A common imperfect masthead and cut-paper title sit over **adaptive illustration panels**; the effect text determines how much space the artwork can occupy, rather than imposing one fixed image height. Heroes and Monsters use a left-side HP/ATK/DEF (plus Hero WIT) stat rail with printed symbols; Monsters have a clearly separated four-row d6 behaviour record and full corpse wording. Short-effect Items fill more of the face with art. The **Flooded Chamber** uses a real printed side-column Room treatment, not the same bottom panel as every other card.

This is still a **visual-only** release. It preserves all current rules, card names, illustration assignments, quantity, dimensions, and four-up A4 print layout. The proposed separate Room/Chest/Feature/Reward taxonomy is still not implemented.

## Physical components and source of truth

`src/tabletop-data.js` defines the entire tabletop catalogue and real print quantities. `src/tabletop-view.js` renders those cards (90 × 130 mm) in the gallery and four-up A4 print sheets. `src/tabletop-app.js` is only a browsing/printing tool. `rules.html` is the **sole shared rules sheet**. `print-and-play.html` is optional pre-game preparation, **not** a second rulebook.

The older `src/engine.js`, `src/data.js`, `src/app.js` and phase supplements are retained temporarily as legacy implementation files but do not govern the tabletop edition. Do not add gameplay mechanics exclusively to the browser: update the physical card and the one-page rules first.

## Verification

Run npm install, npm test, and npm run test:visual.

The active tests verify print stock, monster behaviour tables, absence of external lookup requirements, one-page rules, responsive preview, and A4/card print geometry. Former engine-phase tests are archival and are not run against the redesigned tabletop rules.

## Playtest priorities

Validate 1-player and 2-player difficulty, 90–120-minute target, on-card text readability, printed component counts, and whether the d20 opposed/d6 behaviour resolution feels dynamic without slowing physical combat. Avoid developing a new digital engine until the physical playtest is successful.
