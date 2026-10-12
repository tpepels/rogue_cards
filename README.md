# Rogue Cards

**A physical solo/cooperative dungeon-crawling card game for one or two players.**

[**One card catalogue and print kit**](https://tpepels.github.io/rogue_cards/) · [**One-A4 rulebook**](https://tpepels.github.io/rogue_cards/rules.html)

All cards, dice ranges, behaviours, rewards and strange exceptions are printed on the cards. The website is only a printable catalogue; play happens at the table.

## What is in the game

| Family | Unique cards |
| --- | ---: |
| Heroes | 8 |
| Regional Rooms | 36 (12 UPPER, 12 MIDDLE, 12 DEEP) |
| Final Room | 1 Amulet Vault |
| Regional Monsters | 12 |
| Final Monsters | 2 Warden phases |
| Items | 44 (8 tools, 6 equipment, 4 companions, 4 relics, 8 scrolls, 7 rings, 7 wands) |
| Potions | 8 |
| **Total** | **111 card designs** |

The catalogue can show **one of each** or **full physical print quantities**, filter by card family and dungeon depth, and print four **90 × 130 mm** cards per A4.

## Gameplay

Select a Hero, take the named starting Object and draw one more. Shuffle UPPER, MIDDLE and DEEP Rooms and matching Monsters into regional piles. Descend through three Rooms of each level, one at a time, then the Amulet Vault.

Every Room offers a decision, a printed roll and potentially a Monster. Combat is opposed **d20 + ATK vs d20 + DEF**, with **d6 damage** and a Monster's own **d6 behaviour after each Hero turn**. Scrolls, Rings and Wands interact with Monsters, Rooms, environmental properties and each other. At the Vault, choose whether to face the Warden or attempt an expensive magical seal; the Warden changes into its second phase at 12 HP.

All general rules fit on [one A4 sheet](rules.html). Individual card text is authoritative when it overrides a shared rule. The print deck is self-contained; no online lookup or digital engine is required.

## Source layout

- `src/tabletop-data.js` — **the single canonical catalogue and print-deck API**
- `src/heroes.js` — Hero archetypes, starting Objects and d6 abilities
- `src/rooms.js` — regional Room choices and dice outcomes
- `src/objects.js` — Items, Potions, Scrolls, Rings and Wands
- `src/monsters.js` — twelve Monsters with d6 behaviours and negotiation
- `src/warden.js` — Amulet Vault, Warden Phase I and Phase II
- `src/tabletop-view.js`, `styles/tabletop.css` — physical card layout
- `src/tabletop-app.js`, `index.html` — one catalogue, filters and printing
- `rules.html` — the one canonical rules sheet

## Phase 5: mechanical audit and playtest baselines

[Phase 5 measured audit and limitations](docs/phase5-audit.md)

Two reproducible developer commands accompany the canonical print kit:

- **npm run audit** — check all cards' printed dice bands, broken references and Object–Room metadata-only links
- **npm run balance -- 1500** — run seeded baseline solo and two-Hero expeditions with basic attacks and a limited Scroll/Wand policy

The model uses real regional piles, basic equipment, opposed d20, Monster d6 behaviour and the two Warden phases, but does **not** implement every Potion, Companion, Ring, Relic, parley choice, Room alternative or tactical strategy. Its win rates are *diagnostics*, **not** established game balance. The next work is complete card-effect coverage and real print-and-play testing; no more website sections are needed.

## Verification

```sh
npm install
npm test
npx playwright install chromium
npm run test:visual
npm run serve
```

Tests check complete dice bands, printed interactions, category counts, Hero starts, Warden phases, card clipping, physical dimensions and the one-A4 rulebook. **Automated structural and print checks do not substitute for table playtesting or a full difficulty/balance study.** In particular, solo and cooperative success rates and the new magic/item economy require real playtest data.
