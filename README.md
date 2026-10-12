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

## Phase 5: full-effect expedition validation

[Phase 5 measured audit and modeling limitations](docs/phase5-audit.md)

The game now has explicit handlers for all **52 Object cards** and all **37 Room cards** (both choices and every d6 band), plus the canonical two-phase Warden, Hero abilities, Monster behaviour, item inventory, Potion identification, Wand recharging, curses, parley and corpses. Five deterministic play strategies support repeatable solo and two-Hero comparisons.

```sh
npm run audit
npm run balance -- 2000
npm run balance -- 10000 --json > detailed-results.json
npm run balance:baseline -- 120
```


The default `balance` output is the original TSV-compatible table. Add `--json` to export
all 60 configurations with per-card activation counts, Room choices, Monster visits,
executed effect operations, seal availability, seal attempts and seal successes.
JSON also includes the tested Git commit (when available), fixed seed, experiment
size and aggregate solo/cooperative and strategy summaries. No new card rules or
simulator strategies are introduced. **Seal-related rates use different denominators:**
seal availability and attempt rate use Vault arrivals; seal success per attempt uses
actual attempts. A low activation count is not proof a card is weak because it may
have been rarely drawn.

`npm run balance` is the complete-effect, five-policy benchmark; `balance:baseline` is an older reduced-mechanics comparison. CI has verified **120,000 seeded expeditions** with zero unresolved operations or stalls, but the simulated choices are scripted, not optimised human play. Do not treat these win rates as established physical-game balance: real solo/cooperative sessions and focused interactions still need testing before final print.


## Focused balance experiments (Phase 5 diagnostics)

The default `npm run balance` command and printed game rules are unchanged.
These commands test **scripted simulation policies**, not optimal or human win rates.

```sh
npm test
npm run balance:matched -- 1000 > matched-vault.json
npm run balance:rooms -- 500 > room-policies.json
npm run balance:diagnostics -- 1000 > diagnostics.json
```

- **`balance:matched`** replays identical seeds, Heroes, Room decisions,
  and inventory up to the Vault, then chooses to fight or attempt a seal if
  affordable. It verifies that pre-Vault snapshots match and reports
  paired differences for all arrivals and the seal-eligible subset, including
  discordant outcomes. It **does not** prove a given policy is optimal.
- **`balance:rooms`** independently tests `scripted`, `contextual`,
  `uniform` and `second-when-legal` decision rules on the same
  starting seeds. Paths may use different random draws after choices diverge;
  do not treat each difference as an otherwise-identical counterfactual.
- **`balance:diagnostics`** tests all eight solo Heroes and all **28
  distinct** two-Hero pairings under all five strategies. It exports
  failure stages/causes, Vault HP, available magic, per-Object acquisition
  and activation, held/equipped exposure at Room entry, and whether a run
  ever acquired an Object before winning/losing.

Each command defaults to aggregate JSON for manageable uploads; add
`--jsonl` to export **one JSON line per individual expedition**
(one record containing both alternatives for a Vault comparison).
These JSONL files can be large. Commands return nonzero on unresolved
effects or stalled expeditions.

**Interpretation:** Object `objectRoomExposures` count an owned copy at the
start of a Room; conditional trigger eligibility is narrower than exposure.
`objectSeenWins/objectSeenRuns` is an observational association, not the
causal benefit of an Item. Fatal causes are the Monster or Room active
when the last surviving Hero died; phase-specific deaths are recorded
separately. All 28 pairs are included, but balance still needs tabletop
validation and better optimized decision policies.


## Item and Room balance / interaction testing

The canonical Vault balance adjustment is printed on the cards and used by
both simulators: Warden Phase II has **ATK 6** and its Ruin result costs **1 HP
per Hero**. The Seal costs **3 MAGIC Items solo / 6 with two Heroes**.

Run these two independent, controlled balance experiments:

```sh
npm test
npm run balance:items -- 200 > item-balance.json
npm run balance:room-cards -- 200 > room-card-balance.json
```

- **Item balance:** all **52 Objects**, over 8 solo Heroes + 4 representative
  pairs and three strategies. Matched seeded expeditions compare the normal
  starting hand against adding one extra **existing** Item copy removed from
  the shuffled deck. Reports trials, availability, paired victory-rate
  difference, discordant outcomes, damage, and approximate uncertainty.
  **This measures the value of receiving an extra Item, not an intrinsic
  ranking or proof that two Item cards are equally strong.**
- **Room-choice balance:** all **36 regional Rooms**, same setups and seeds.
  Run each legal Room option at the same pre-decision HP, inventory and
  pending Monster. Only samples that actually reach the Room **and can take
  both choices** enter the comparison. Reports conditional paired outcomes
  and uncertainty; sparse samples are explicitly null, not fabricated.
- **Mechanical interaction tests:** automated pairwise Object × Object,
  Object × regional Room (both choices), Object × Monster (including Warden
  phases, sampled printed dice faces), and Hero × Object. Every declared
  Object link must refer to a real card. Dedicated tests still exercise
  **all six faces** of every printed Object and Room roll, plus selected
  higher-order interactions.

**Scope limitation:** exhaustive testing of *every possible multi-card
combination*, sequence, dice history, and strategic decision is infeasible;
the interaction suite is comprehensive at the stated **pairwise** level,
not exhaustive across triples or larger combinations. Passing the suite
checks engine integrity, not balance, usefulness, game-theoretic optimality
or real tabletop enjoyment. Use the generated balance reports to decide
which individual cards warrant adjustment.

## Verification

```sh
npm install
npm test
npx playwright install chromium
npm run test:visual
npm run serve
```

Tests check complete dice bands, printed interactions, category counts, Hero starts, Warden phases, card clipping, physical dimensions and the one-A4 rulebook. **Automated structural and print checks do not substitute for table playtesting or a full difficulty/balance study.** In particular, solo and cooperative success rates and the new magic/item economy require real playtest data.
