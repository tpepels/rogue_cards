# Phase 5 — complete-card expedition model and balance audit

**Status (12 October 2026):** mechanical model implemented and quantitatively benchmarked; **not yet certified as physically playtested or optimally balanced**. V2 is the sole playable edition. The website still contains one card catalogue and one A4 rulebook; no additional public pages were added.

## What is implemented

The canonical simulation is `src/expedition-campaign.js`, using the expedition state in `src/expedition-runtime.js`.

- All **111 unique card faces** are retained: 8 Heroes, 36 regional Rooms, 1 Vault, 12 regional Monsters, 2 Warden phases, and 52 Objects.
- **52 Objects** and **37 Rooms** have explicit, mechanically typed handlers for every printed d6 outcome; all 74 Room choices also have handlers. Invalid or unknown operations fail rather than silently doing nothing.
- Physical inventory and starting gear, one Weapon/Armour/Ring/Companion slot, cursed equipment, Potion identification, one-use Scrolls, exhausted/recharged Wands, Ring and Companion triggers, party protection, parley, edible remains, held bonuses, scouting and Room rewards are represented.
- Nine regional Rooms lead to the tenth-room Vault. The Warden retains HP when entering Phase II. Its printed two-Hero attacks and the higher two-Hero sealing cost are modeled.
- The play policies are **survival**, **treasure**, **magic**, **seal**, and **negotiation**. They differ in Room choices, resource spending and interactions. The policies are scripted and deterministic for a given seed, not human or optimal decision-makers.
- Tests force every printed Object d6 face and every Room choice/result through its handler, stress solo and two-Hero expeditions, check Potion identity and Wand exhaustion, protect cursed cleansing/held modifiers and verify printed-card fingerprints. CI also checks browser printing and the one-A4 rules.

An editorial cross-card audit still distinguishes **144 declared metadata links** from actual printed effects: **65 links have identifiable printed evidence** and **79 are not directly evidenced by that heuristic**. Metadata links grant no gameplay power.

## d20 health-counter revision (12 October 2026)

Each Hero and active Monster is tracked with one dedicated d20 showing
remaining HP, never rolled. Heroes' printed maximum HP now ranges from
18 to 20; the Warden starts at 20 HP and transitions to Phase II at
10 HP, retaining the same counter and any remaining HP. The game's
previous measured win rates were calculated with more Hero/Warden HP,
and therefore are not post-revision outcomes.

## Later canonical Vault adjustment (12 October 2026)

The following conservatively adjusted values supersede the older benchmark:
Warden Unbound has ATK 6, its Ruin result deals 1 HP to each Hero, and the
Vault Seal costs 3 MAGIC Items solo or 6 with two Heroes. The rates below
were measured **before** these adjustments and must not be presented as
current post-adjustment win rates. See README.md for pairwise interaction and
individual card-balance experiments.

## Targeted card-balance adjustments (12 October 2026)

After the controlled per-card simulations on commit `276e9c9`, we
adjusted exactly four cards: Whispering Blade (+4 ATK with curse unchanged),
Hall of Teeth RATTLE (three Items after winning the DEEP Monster fight),
Ghostly Auction HECKLE (three Items after winning the MIDDLE Monster fight),
and Warden's Threshold FIGHT (two Items plus unchanged d6 HP healing after
victory). Matching typed-effect handlers, full-effect combat statistics,
the scripted treasure policy, and reviewed printed-card hashes were updated
together. Earlier experiment measurements are **pre-adjustment** and must
be rerun before claiming the new cards have a particular win rate.

## Measured complete-policy results

The GitHub Actions **Verify tabletop print-and-play** run on commit `675ac246d2` executed `npm run balance -- 2000`: 2,000 seeded expeditions for each of **12 party setups × 5 strategies = 120,000 campaigns**. All returned zero unresolved operations and zero stalled campaigns. These are implementation-based, **policy-specific win rates**, not human win probabilities.

| Hero / party | Survival win rate | Magic win rate | Seal-focused win rate |
| --- | ---: | ---: | ---: |
| Warrior | 46.2% | 38.0% | 50.5% |
| Knight | 47.6% | 39.2% | 55.7% |
| Wizard | 26.4% | 19.8% | 45.0% |
| Witch | 28.5% | 18.4% | 45.6% |
| Rogue | 34.9% | 24.9% | 46.4% |
| Thief | 34.8% | 21.1% | 50.9% |
| Priest | 32.6% | 22.0% | 50.1% |
| Monk | 32.1% | 25.1% | 45.9% |
| Warrior + Priest | 75.8% | 67.8% | 78.5% |
| Knight + Wizard | 73.2% | 68.8% | 81.5% |
| Rogue + Witch | 61.1% | 53.1% | 70.2% |
| Thief + Monk | 65.0% | 54.9% | 73.4% |

The **treasure** and **negotiation** policies were also executed for all 12 setups; their full tabular output is in the linked Actions job. At 2,000 trials a single win-rate estimate has up to approximately ±2.2 percentage points of ordinary 95% binomial sampling error, apart from much larger policy/model uncertainty.

**Findings:** solo play remains notably harder than paired play; physical-fighter Heroes fare better with the survival policy, while magic-dependent Heroes get a large relative benefit from preparing for the seal. An aggressive scripted spell policy can perform *worse* than conserving resources, making magic/spell timing an important balance consideration. These outcomes are sensitive to the specific heuristics; do not treat the raw class ranking as definitive.

## Gameplay corrections already incorporated

- Clarified FIRE healing sacrifices, shrine cleansing cost, and both pay-to-reroll Room choices on printed cards.
- Made the final Warden's FIRE/LIGHTNING weakness cancel an actual response.
- Adjusted several Hero profiles, two-Hero sealing cost and Warden multi-target attacks after the early tests.
- Corrected the Warden's phase health transition, failed-seal bonus, Hero protection timing, Priest/Ring/Wand d20 intervention, saved rerolls, persistence of one-time benefits, Potion identity, cursed-item cleanse, and a final-Room party-wipe edge case.
- Card-text fingerprints guard against unnoticed simulator/printed-card divergence. New mechanical changes require tests and reviewed handler updates.

## Verification and repeatability

```sh
npm install
npm test
npm run audit
npm run balance -- 2000
npm run balance:baseline -- 120
npm run test:visual
```

`npm run balance` is now the **canonical full-effect, five-strategy experiment**. `npm run balance:baseline` is retained only as a separately labeled historical simplified comparison and should not be used to make final balance decisions.

[Successful quantitative CI run](https://github.com/tpepels/rogue_cards/actions/runs/38258466804).

## What is still required before final physical print

**The effects have executable handlers, but modeling every handler is not the same as proving every strategic use is correct or realistic.** Forced result tests check mechanical reachability; scripted policies do not exhaustively search every combo or establish good human decisions.

Before saying the game is fully balanced, verify interaction parity against real card reads and representative **solo and co-op tabletop sessions**, especially Crown-of-Rehearsals/seal decisions, multi-Hero targeting, high-value magic conversions, late-dungeon consumable availability, resource loops, and the large solo-versus-duo performance gap. Record session outcomes and perceived decision quality. Then make a targeted final balance pass and physical print proof.

Do **not** add website sections or new cards to compensate for incomplete validation; retain the one-A4 rules limit.

## Post-d20 HP causal balance experiments

The `scripts/post-hp-study.mjs` experiments use revised HP values,
paired seeds, legal Room alternatives, per-Hero Item effects, and
simulator-only PARLEY/SEAL strategy ablations. Experimental PARLEY is
opt-in and defaults to false. Card text and normal strategy behavior
remain unchanged.
