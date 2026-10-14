# Rogue Cards

**A physical solo/cooperative dungeon-crawling card game for one or two players.**

[**One card catalogue and print kit**](https://tpepels.github.io/rogue_cards/) · [**Build your own dungeon**](https://tpepels.github.io/rogue_cards/decks.html) · [**Illustrated learn-to-play tutorial**](https://tpepels.github.io/rogue_cards/tutorial.html) · [**One-A4 rulebook**](https://tpepels.github.io/rogue_cards/rules.html)

All cards, dice ranges, behaviours, rewards and strange exceptions are printed on the cards. The website is only a printable catalogue; play happens at the table.

## What is in the game

| Family | Unique cards |
| --- | ---: |
| Heroes | 8 |
| Regional Rooms | 64 (24 UPPER, 22 MIDDLE, 18 DEEP) |
| Final Room | 1 Amulet Vault |
| Regional Monsters | 12 |
| Final Monsters | 2 Warden phases |
| Items | 44 (8 tools, 6 equipment, 4 companions, 4 relics, 8 scrolls, 7 rings, 7 wands) |
| Potions | 8 |
| **Total** | **139 card designs** |

The original catalogue can show **one of each** or **full physical print quantities**, filter by card family and dungeon depth, and print four **90 × 130 mm** cards per A4.

## Choose your dungeon deck

Use the [**interactive Dungeon Deck Builder**](https://tpepels.github.io/rogue_cards/decks.html) to start from three recommended physical decks, then add or remove any eligible card:

| Deck | Regional Rooms | Pacts on offer | Purpose |
| --- | ---: | ---: | --- |
| **Classic Crawl** | 36 (12 per depth) | 0 | Corridors, ordinary treasure, traps, Monsters and basic equipment |
| **Strange Paths** | 39 (13 per depth) | 6 | Standard exploration interspersed with occasional long-term bargains |
| **Everything Goes** | 79 (29 UPPER / 27 MIDDLE / 23 DEEP) | 10 | All original and expansion Rooms and every unusual combination |

The builder can also save a **custom card selection in your browser**, print the selected cards in physical quantities, and copy a plain-text deck list. The Hero cards, Vault and both Warden phases are always included; every chosen Room and Monster stays in its matching depth pile. Select at least three Rooms and at least one Monster type per depth. Include your Heroes' printed starting Objects and keep those aside before shuffling the remaining Objects. The builder warns about incomplete custom piles but allows deliberately difficult experimental decks.

**New print-only expansion:** 15 self-contained regional Rooms (including cells, corridors, traps and ordinary treasure) and 9 simple Tools/Weapons/Armour cards. They add **24 designs** to the 139 originals, for **163 selectable physical card designs**. They do not introduce new Pacts, delayed debts or universal rules. These extra cards deliberately live in `src/print-expansion.js` rather than the engine's `CATALOGUE`: the Oracle/engine and existing 139 canonical designs remain untouched until the print playtest is accepted.

**Artwork status:** the 24 extra cards currently reuse thematically related original illustrations to keep the new print kit usable; their names and rules are different. Those reused images are temporary and are not presented as 24 newly commissioned illustrations.


## Generated card illustrations

All **139 unique card designs** have dedicated PNG illustrations in
`assets/illustrations/`; the 28 additional illustrations (112-139) have
now been committed. `CARD_ART` in `src/tabletop-view.js` remains the
single source of truth for card-to-image mapping.

The same PNG is used in the on-screen gallery and A4 print sheets.
The old generic SVG drawings are not substituted. `npm run validate:deck`
checks all canonical card mappings and the referenced PNG files.

### Generate only artwork for newly added cards

The [Gemini illustration generator](docs/illustration-generator.md) reads the
actual `CATALOGUE` and `CARD_ART` map; no CSV or visual hooks are involved.
It uses the preceding illustration as the only style reference, sends only
the card name and `scripts/illustration-style.txt`, and writes missing PNGs
directly to `assets/illustrations/`. Existing artwork is not regenerated.

```sh
npm run art:check                 # free, list missing images
npm run art:missing -- --limit 3 # up to three paid requests
npm run art:missing               # generate all remaining missing images
```

After reviewing the results, commit the new PNGs and generated `CARD_ART`
entries. The script uses Gemini 3.1 Flash Image at 1K; it is run locally, not
by CI.

## Gameplay

Choose a Hero and its starting Object, then draw one more. Shuffle UPPER, MIDDLE and DEEP Rooms and matching Monsters into regional piles. Ordinarily explore **three Rooms per depth** before reaching the Amulet Vault. Rare **trapdoors** can skip remaining Rooms, send you straight to the Vault or expose a dangerous detour.

Most Rooms stay straightforward: fight a Monster, suffer a trap, explore, or risk a d6 roll. Some provide a meaningful bargain; rare Rooms can be **kept** to make a second decision later. Named Room, Monster and Item combinations reward discovery without a new quest or resource deck.

Combat uses opposed **d20 + ATK vs d20 + DEF**, **d6 damage**, and Monster **d6 behaviour after each Hero turn**. All eight Heroes have a distinct, reliable ability choice and a riskier d6 alternative. Selected Items and Rooms allow **chained REROLLS** with increasing HP costs. **ELBERETH** provides a desperate, potentially dangerous chance to interrupt or escape combat.

At the Vault, **FIGHT** and **SEAL** remain the normal ways to win the Amulet. Previous decisions may instead enable rare **SMUGGLE**, **BARGAIN** or **UNTHRONE** resolutions after Warden Phase I. Empty-handed escape is a defeat with a different ending; some curses create unusual epilogues.

Every Hero and active Monster tracks remaining HP with its own d20 (never rolled).
Hero starting HP ranges from 18 to 20; the Warden starts at 20 HP and
keeps the same die when it changes phase at 10 HP. At 0 HP, remove the die.
Use separate d20s for opposed combat and WIT rolls.

The shared rules are explained in a [two-page printable guide](rules.html). Individual card text is authoritative when it overrides a shared rule. The print deck is self-contained; no online lookup or digital engine is required.

## Source layout

- `src/tabletop-data.js` — **the original 139-card canonical catalogue and engine print-deck API**
- `src/print-expansion.js` — 24 extra physical-only card definitions and temporary illustration aliases
- `src/decks.js`, `src/decks-app.js`, `decks.html` — three recommended print decks and custom deck builder
- `src/heroes.js` — Hero archetypes, starting Objects and reliable/risky abilities
- `src/rooms.js` — regional encounters, dangerous choices and trapdoor results
- `src/objects.js` — Items, Potions, Scrolls, Rings and Wands
- `src/monsters.js` — twelve Monsters with d6 behaviours and negotiation
- `src/warden.js` — Amulet Vault and both Warden phases
- `src/tabletop-view.js`, `styles/tabletop.css` — physical card layout
- `src/tabletop-app.js`, `index.html` — one catalogue, filters and printing
- `rules.html` — the one canonical rules sheet

## Visual card layout editor

Open [**the drag-and-resize layout editor**](https://tpepels.github.io/rogue_cards/layout-editor.html) to position each card's **title**, **upper rules**, and **dice/results** cutouts on the real printed card.

- Choose any of the 139 cards, drag a paper piece, and use its bottom-right handle to resize it.
- All 139 cards have individual initial placements based on the three hand-tuned reference cards (Veteran Warrior, Laughing Water, and Antidote). The reference placements remain unchanged; longer Room and Monster copy receives wider or earlier slips. Use **Restore Starting Layout** to undo adjustments on one card without removing its preset.
- When new cards are added, run `npm run layouts:init` to generate starting positions **only for cards not yet in the JSON**; it will never overwrite hand-positioned layouts.
- Use the numeric inspector for **millimetre position and size**, **rotation in degrees**, and **z-index layering**. A rotation slider and **Bring to Front / Send to Back** controls adjust the overlap visually. Arrow keys nudge a selected piece; Shift + arrows move it 2 mm.
- Work is automatically saved **in that browser only**. Choose **Export JSON** to download a portable `rogue-cards-layouts.json` backup, and **Import JSON** to resume it anywhere.
- To make the layout permanent, replace `data/card-placements.json` with the exported file, then run:

```sh
npm run layouts:build
npm run layouts:check
```

Commit `data/card-placements.json` and generated `styles/card-placements.css` together. The latter is loaded **after** the collage styles and applied to both the gallery and A4 printing. There is no need to maintain separate CSS selectors for individual cards. The editor changes each cutout's position, size, rotation and stacking order, but never the rules text or the physical 90 × 130 mm card dimensions. JSON exports retain all these properties per card, and older exported layouts remain importable.

## Reusable engine and separate research experiments

The [headless game-engine architecture](docs/engine-architecture.md)
now exposes deterministic state, public game snapshots, printed Room
commands, legal combat actions, and Monster responses without importing
experiment agents or a browser UI.

- `src/engine/` - canonical reusable rules state, combat, dice and public API
- `src/expedition-runtime.js` - compatibility re-export for existing callers
- `src/expedition-campaign.js` - policy-driven whole-expedition simulator
- `src/research-agent.js` and `src/rollout-*.js` - experimental planning
- `scripts/study-*.mjs` - laptop-only benchmarks, optimization and reports

The engine does not require Node, external services, or Monte Carlo.
A future computer-game UI can use it for atomic interactions. A full
human-driven phase controller and save/load still need implementation.

```sh
npm run test:engine
npm test
npm run bench:rollout-forks -- --samples 300
npm run bench:rollout-scenarios -- --samples 300 --choices 4
```

Performance work includes compiled d6 outcome tables, a standalone
seeded RNG, card-aware clones, and sampling each hypothetical hidden
deck only once across all legal action alternatives. Benchmarks
report actual speed on the machine where they run, not estimates.

## Phase 5: full-effect expedition validation

[Phase 5 measured audit and modeling limitations](docs/phase5-audit.md)

The game now has explicit handlers for all **52 Object cards** and all **65 Room cards** (both choices and every d6 band), plus the canonical two-phase Warden, Hero abilities, Monster behaviour, item inventory, Potion identification, Wand recharging, curses, parley and corpses. Five deterministic play strategies support repeatable solo and two-Hero comparisons.

```sh
npm run audit
npm run balance -- 2000
npm run --silent balance -- 10000 --json > detailed-results.json
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
npm run --silent balance:matched -- 1000 > matched-vault.json
npm run --silent balance:rooms -- 500 > room-policies.json
npm run --silent balance:diagnostics -- 1000 > diagnostics.json
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


## Targeted Item and Room balance adjustments (12 October 2026)

The first controlled Item/Room experiments motivated a four-card
balance pass. The canonical card catalogue and the full-effect handlers
now agree:

- **Whispering Blade:** +4 ATK (was +3), still CURSED and loses 1 HP after
  each successful hit.
- **Hall of Teeth - RATTLE:** after winning the required DEEP Monster fight,
  draw 3 Items (was 2).
- **Ghostly Auction - HECKLE:** after winning the required MIDDLE Monster
  fight, draw 3 Items (was 2).
- **Warden's Threshold - FIGHT:** after victory, heal d6 HP and draw
  2 Items (was 1).

The historical balance reports preceding these adjustments describe older
card values. Do not interpret those results as post-change measurements.
No other Item, Room, Hero, Warden, or Vault rule changed in that four-card balance pass.

## Item and Room balance / interaction testing

The canonical Vault balance adjustment is printed on the cards and used by
both simulators: Warden Phase II has **ATK 6** and its Ruin result costs **1 HP
per Hero**. The Seal costs **3 MAGIC Items solo / 6 with two Heroes**.

Run these two independent, controlled balance experiments:

```sh
npm test
npm run --silent balance:items -- 200 > item-balance.json
npm run --silent balance:room-cards -- 200 > room-card-balance.json
```

- **Item balance:** all **52 Objects**, over 8 solo Heroes + 4 representative
  pairs and three strategies. Matched seeded expeditions compare the normal
  starting hand against adding one extra **existing** Item copy removed from
  the shuffled deck. Reports trials, availability, paired victory-rate
  difference, discordant outcomes, damage, and approximate uncertainty.
  **This measures the value of receiving an extra Item, not an intrinsic
  ranking or proof that two Item cards are equally strong.**
- **Room-choice balance:** all **64 regional Rooms**, same setups and seeds.
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

## d20 health tracking (12 October 2026)

Each Hero and active Monster has one dedicated d20 showing its current HP;
the d20 is a counter, not a roll. The eight Heroes now have maximum HP
18–20 and the Warden has 20 HP, changing to Phase II at 10 HP without
resetting its counter. Remove the die at 0 HP and restore it if a Hero is
healed. Normal d20 rolls use separate dice.

These health changes can affect win rates; pre-change balance reports are
not post-change difficulty estimates. Printed cards and both simulation
engines have corresponding changes.


## Automated checks after every game change

The push/PR workflow now runs the full mechanical test suite and a
**deterministic 12,600-expedition comparison** (all eight solo Heroes,
all 28 two-Hero parties, five strategies, 70 seeds per configuration).
A JSON report is saved as a GitHub Actions artifact and a summary
is displayed in the workflow run.

```sh
npm test
npm run verify:items
npm run --silent verify:game -- 70 --compare tests/fixtures/game-baseline.json > game-verification.json
npm run --silent verify:game -- 1000 > full-game-verification.json
```

- **Printed Item effects:** tests exercise each of the **133 printed d6 outcome
  bands** across **43 rolled Objects** and check observable changes to damage,
  healing, resources, attacks, poison, card exhaustion, and similar operations.
  All **nine non-dice Objects** have a dedicated equipped/Room/Seal example.
  Existing tests cover every printed Room choice/die result, basic interaction
  pairings, once-per-Room constraints, Potion identity, Wand recharge,
  curses and Warden transitions.
- **Campaign stability:** unrecoverable effect errors or stalled expeditions
  fail the verification. The report also shows Item acquisition and activation
  coverage. An Item with zero activations is not necessarily broken: passive
  Items have no activate() event.
- **Change impact:** the repository keeps a reviewed, reproducible
  `tests/fixtures/game-baseline.json`. Whenever the game changes,
  the report shows exactly which Hero/strategy win, Vault, Seal or damage
  figures have changed. Differences are **warnings for review**, not automatic
  evidence of bugs, and don't block the separate website deployment.
  After deliberately accepting a balance change, regenerate and review the
  baseline explicitly; do not overwrite it merely to make the diff disappear.

**Limitations:** These are scripted simulated decisions, not human players.
Passing proves the tested mechanical contracts hold in those conditions; it
does **not** prove every free-form interaction, card-text nuance, alternative
trigger timing or high-order combination is correct, or that Items are balanced.
Situational cards still need targeted tabletop playtesting.

## Full-effect stochastic planning

The [state-fork rollout laboratory](docs/stochastic-rollouts.md) evaluates
legal Room and combat decisions by actually executing printed effects,
Item outcomes, Monster responses, and optionally the entire remaining
expedition through the Vault. The fair agent samples hidden decks using
publicly known cards; the Oracle retains their actual order. Both use
independent sampled dice, matched across alternative decisions. The
actual expedition dice and game state are never touched by planning.

To validate real-state rollouts locally and compare 0/8/32/128 samples:

~~~sh
npm test
npm run agent:budgets -- --runs 2 --seeds 71001 --budgets 0,8 --parties solo --strategies magic --out results/rollout-smoke-01
npm run agent:budgets -- --runs 25 --seeds 71001,72001,73001 --budgets 0,8,16 --workers 4 --chunk-size 5 --out results/rollout-standard-v2
~~~

Older agent results remain reproducible because approximate heuristic
planning is still the default unless the new rollout mode is selected.
Shorter horizons use a stated nonterminal score; full-horizon mode uses
actual terminal wins/losses. The budget runner now checkpoints completed
experiment chunks, reports active-worker progress, and supports
`--resume` with unchanged settings after interruption. The earlier
194,400-expedition 0/8/32/128 study command was far too expensive
for a first local run. These are modeled policies, not proven
optimal agents or human play.

## Fair-information versus deck-Oracle agent

The [local agent optimization study](docs/agent-oracle.md) trains the
ordinary-information and full-deck-information agents separately, with
**disjoint training, validation and held-out seeds**. A fixed-weight Oracle
control isolates the value of deck visibility from parameter re-tuning.
The Oracle never sees actual future dice or the simulator's RNG state.

```sh
npm run agent:study -- --preset smoke --dry-run
npm run agent:study -- --preset smoke --out results/agent-smoke-01
npm run agent:study -- --preset standard --workers 8 --out results/agent-standard-01
```

This is a benchmark of increasingly informed, tuned heuristics, not an exact
optimal solver. No cards or rules are changed by the research harness.

## Local multi-seed validation (no CI required)

The [laptop validation laboratory](docs/local-validation.md) tests every Hero,
all 28 two-Hero combinations, multiple independent random seed batches,
scripted and alternative decision policies, Hero order, and every Item's
opportunities and outcomes. It generates complete CSV/JSON/Markdown reports
under the ignored `results/` directory.

Wandering Knight is **intentionally the beginner-friendly strong class**.
The validator monitors his performance without treating his advantage as
a failed balance criterion. No cards or rules are modified by the validator.

```sh
git pull --ff-only
npm run validate:local -- --preset smoke --out results/smoke-first --progress
npm run validate:local -- --preset standard --workers 8 --out results/standard-01 --progress
```

For a full multi-seed, multi-policy study, see the deep preset and reproducibility
instructions in the linked document. These experiments are intended to run
on your own laptop, not GitHub CI.

## October 2026 Hero rebalance

The [approved risky-power Hero and Item rebalance](docs/hero-balance-2026-10.md)
keeps Knight's powerful exact-six result, lowers Veteran Warrior's HP/ATK,
halves the Wizard and Priest d6 backlash (rounded up), and strengthens
Monk STILLNESS. The all-36-party post-change study found **79.3% average
two-Hero wins and no party at 95%**, but a **20.4-point solo spread** still
exceeds the target. Item follow-up studies are linked in the balance report.

## Item opportunity and strength experiments

The [Item timing audit and 72,000-expedition controlled study](docs/item-opportunity-study.md)
records each Object's draws, legal trigger opportunities, uses, observed outcomes
and passive applications separately. It compares the original scripted policy,
contextual Item preservation, zero reservation penalties and forced legal use.
A [separate 165,600-expedition targeted study](.github/workflows/item-targeted-study.yml)
forces **one card at a time** while leaving other decisions unchanged,
so rarely selected Items can be investigated individually before changing
printed cards. These remain simulated agents, not measured human win rates.

## Planner factorial ablation results

The [345,600-expedition Room / Combat / PARLEY / SEAL ablation](docs/planner-ablation-findings.md) measures the four cautious-planner features separately, including leave-one-out effects and all pairwise interactions. The findings apply only to scripted simulations; no physical-game rules or cards were altered.

## Planner v2: how to interpret results

The planner study is a scripted simulation. It is not a measure of human win
rates and cannot establish whether an Item is fun, understandable, or balanced.
The first uploaded `planner-study` and `planner-all` results were **v1**;
do not reuse those numbers as post-fix balance evidence.

Planner v2 rejects combat actions whose printed triggers are for Rooms,
negotiation or reactive rolls. It scores actual remaining Monster HP, the
Warden's 10-HP phase transition, automatic Hero attacks, known Room-die
overrides, and the real cost of optional Room rerolls. It records how often
a legal combat Item was held, how often one was chosen, and outcomes for
every solo Hero and all 28 Hero pairings.

The study uses separate deterministic seed sequences per strategy and party,
paired within each party and run. Later dice outcomes still diverge as
policies make different choices; these are not identical alternative futures.
The utility model, card automation outside planner decisions, and the
decision strategies are still approximate.

To run a **new independent holdout** after making planner changes, choose a
seed that has not been used while tuning:

```sh
npm test
npm run --silent study:planner -- 300 --all --seed 78126014 > planner-holdout.json
npm run --silent study:planner:report -- planner-holdout.json > planner-holdout.md
```

The opt-in [GitHub Actions planner holdout](.github/workflows/planner-validation.yml)
also exports the complete JSON and readable Markdown report as downloadable
artifacts. Check the report's commit, seed, `unresolved=0`, and `stalls=0`.
Watch **combat Item selections divided by combat turns with a legal Item**,
not just the share of all combat turns. Large improvements over an old
scripted policy do not imply an optimal player.

## Advanced, risk-aware decision planning (opt-in)

This is the most detailed automated player model. It does **not**
change any printed card, legal action, battle rule or old simulator baseline.

Run from a current repository checkout:

```sh
git pull --ff-only
npm test
mkdir -p analysis
npm run --silent study:planner -- 100 --progress > analysis/planner-study.json
npm run --silent study:planner:report -- analysis/planner-study.json > analysis/planner-study.md
```

The default studies 8 solo Heroes plus 4 illustrative Hero pairs, each
under Magic and Treasure, and compares baseline / legacy-adaptive /
planner-balanced / planner-cautious / planner-bold. At 100 seeds each
this performs **12,000 full expeditions**. All 28 two-Hero combinations:

```sh
npm run --silent study:planner -- 300 --all --progress > analysis/planner-all.json
npm run --silent study:planner:report -- analysis/planner-all.json > analysis/planner-all.md
```

The full study above runs 108,000 expeditions. To reproduce
another independent random batch, append `--seed 123456`.

**What the planner evaluates:**

- Enumerates all six printed Room outcome faces and both affordable choices;
  values expected healing, draw, hazards, encounter risk and opportunity cost.
- Computes opposed d20 attack chances and approximate per-Monster combat
  danger, with risk preferences (balanced, cautious and bold).
- Evaluates printed Scroll and Wand outcomes versus a regular attack,
  including likely damage, effects that skip Monster turns, healing, and
  scarcity of Magic resources needed for the Vault.
- Compares PARLEY success probabilities and printed payment costs
  against estimated losses from fighting.
- Estimates the chance to Seal and the danger of fighting both Warden
  phases instead, including the Crown's possible self-damage.

Reports include win rates, paired approximate confidence intervals,
Vault arrivals, Items spent, damage, spell activations, every solo Hero
and an auditable sample of up to 12 decisions per run. This is bounded
expected-utility planning, **not exhaustive game-tree search**; it
cannot prove the policy optimal or the game well-balanced. Interventions
may alter subsequent dice sequences even with matching starting seeds.

## Improving the simulated decisions (local, opt-in)

The original five scripted strategies are preserved unchanged for regression
comparison. A separate set of experimental policies explores what happens
when Magic and Treasure players make different decisions. **No printed
card effects or tabletop rules are changed.**

Run on your own computer from the project root:

```sh
git pull --ff-only
npm test
npm run --silent study:decisions -- 50 > decision-study.json
npm run --silent study:report -- decision-study.json > decision-study.md
```

`50` seeds per party/strategy generates 7,200 expeditions (8 solo Heroes
+ 4 representative pairs, Magic and Treasure; the baseline and five
alternatives). Use `200` for 28,800 expeditions or `1000` for 144,000.
Study output is JSON only when called through `node` or `npm run --silent`.

The five opt-in experiments are:

- `parley`: tries a risk/resource-sensitive Monster PARLEY when sensible
- `seal`: attempts an affordable Vault Seal if WIT is high or party HP is low
- `conserve`: saves MAGIC combat items against near-dead regional Monsters
- `rooms`: uses existing contextual Room-choice scores
- `adaptive`: combines all four changes

The report shows paired victory-rate changes, approximate 95% intervals,
changes in Vault access, damage, spent resources, spell actions, PARLEY
attempts and Seal attempts, and results by each solo Hero.

These are **research heuristics**, not an optimal human-playing agent.
Comparisons use paired initial seeds, but after a decision changes,
later random rolls may no longer be matched. The intervals are not
corrected for testing many configurations. Keep the original baseline;
evaluate these experiments before choosing a new standard policy.

## Post-d20 HP balance study

The post-health-revision research runs on the **current canonical deck**,
not the earlier per-card figures measured at commit 276e9c9.

Three reproducible studies are available:

```sh
npm run --silent study:items -- 200 > post-hp-items.json
npm run --silent study:rooms -- 200 > post-hp-rooms.json
npm run --silent study:strategies -- 400 > post-hp-strategies.json
```

- **Items:** one extra existing Item moved from the deck into the starting
  hand, for all 52 Items, eight solo Heroes and four two-Hero parties,
  under Survival, Magic and Seal. Per-Hero comparisons show whether
  Knight, Wizard, and others benefit differently from each Item.
- **Rooms:** compares both options for every regional Room only where
  both are legal, verifying equal HP, inventory and Monster at the choice.
- **Strategies:** five policies across all solo Heroes and 28 pairs.
  For Magic and Treasure, separately tries **Monster PARLEY**, the
  **affordable Vault SEAL**, and **both together**, on paired seeds.

The GitHub Actions workflow **Post-HP card and policy research** runs
all three studies on its triggering push and can be manually dispatched.
It uploads the complete JSON results as separate artifacts. The
research-only `researchAllowParley` flag defaults to false and does not
change the printed game or normal simulator behavior.

These results are strategy-dependent. Approximate confidence intervals
are uncorrected for multiple comparisons; consider playtests before
declaring Items or Room options intrinsically strong or weak.

## Verification

```sh
npm install
npm test
npx playwright install chromium
npm run test:visual
npm run serve
```

Tests check complete dice bands, printed interactions, category counts, Hero starts, Warden phases, card clipping, physical dimensions and the one-A4 rulebook. **Automated structural and print checks do not substitute for table playtesting or a full difficulty/balance study.** In particular, solo and cooperative success rates and the new magic/item economy require real playtest data.
