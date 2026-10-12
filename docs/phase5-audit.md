# Phase 5 — mechanical audit and expedition baselines

**Status: active implementation, not final balance certification.** The website remains one card catalogue and one A4 rulebook. No new public pages or cards.

## Audit coverage

- **111 unique cards**: eight Heroes, 36 Rooms, one Vault, 12 regional Monsters, two Warden phases, and 52 Objects.
- Complete d6 outcome ranges and Monster behaviour bands.
- **144 declared Object–Room metadata links.** A conservative named-reference/property heuristic finds **65 with printed evidence** and **79 without direct printed evidence**. Metadata alone never grants an effect, and unsupported links are not automatically bugs.
- Resource costs, printed conditions, Warden stage continuity and once-per-Room effects.

The repeatable audit (npm run audit) rejects missing Room references, malformed dice bands and duplicate card identities, and prints evidence gaps.

## Card improvements already made

1. **Fungal Garden:** discarding FIRE now explicitly heals d6 HP.
2. **Candle Altar:** cleansing an equipped CURSED Item requires discarding another Item.
3. **Laughing Fountain:** paying 2 HP now explicitly grants two d6 rolls and a choice of result.
4. **Treasure That Sings:** the corresponding push-your-luck cost has identical timing.
5. **Warden Unbound:** FIRE or LIGHTNING damage now skips its next response. The earlier effect merely changed a result of 6 to 1–2, but 1–2 was still an attack.

No base statistics were changed on evidence from the limited simulator, and no extra universal rules were added.

## Simulator contract

The seeded model in src/playtest.js uses regional Room draws, printed Monster copies, Hero starting Objects, basic equipment ATK/DEF, opposed d20 combat (including critical 1/20), major Hero combat abilities, Monster behaviour, nine regional Rooms, a two-phase Warden without health restoration, and the opposed WIT seal.

The **basic** policy attacks normally and chooses the first affordable Room option. The **magic** policy also casts a selected subset of five offensive Scrolls and four Wands, consuming or exhausting them as printed.

**Important limitations:** this does not yet simulate Potions and identification, EAT/corpse choices, most Ring/Relic/Companion triggers, most parley options, precise room scouting/reordering, Wand recharge and every alternative Room decision. Unimplemented or simplified interactions are counted in the output. The numbers below are **policy-specific benchmarks, not verified full-game win rates**.

## Initial results

1,500 seeded runs per setup, seed 42. Sampling error for a rate from this many runs is at most approximately ±2.5 percentage points at 95% confidence, but the **systematic simulator bias is much greater**.

| Party | Basic win % | Limited-magic win % | Magic actions/run |
| --- | ---: | ---: | ---: |
| Warrior | 38.9 | 37.7 | 0.52 |
| Knight | 51.2 | 49.9 | 0.52 |
| Wizard | 25.4 | 25.1 | 0.43 |
| Witch | 23.5 | 21.9 | 0.45 |
| Rogue | 32.5 | 31.3 | 0.48 |
| Thief | 27.9 | 27.5 | 0.46 |
| Priest | 28.8 | 29.5 | 0.46 |
| Monk | 33.7 | 34.1 | 0.48 |
| Warrior + Priest | 79.7 | 78.5 | 0.48 |
| Knight + Wizard | 83.5 | 84.6 | 0.52 |
| Rogue + Witch | 63.7 | 62.6 | 0.53 |
| Thief + Monk | 69.5 | 68.1 | 0.58 |

The two-Hero survival buffer is strong even with one Monster response after each Hero action. This merits full-game and real-table testing before inventing a scaling rule. Magical Heroes are materially undervalued because their signature Item interactions are largely outside the simulated policy.

**Warden seal:** In limited-magic runs, approximately **61–69% of solo parties reaching the Vault** and **69–85% of the tested two-Hero parties reaching it** still held three MAGIC Items. The alternative ending is reachable in the current supply model. Actual players may spend substantially more magic before the Vault.

The magic policy casts **under one spell per expedition** on average. It is not adequate evidence that magic itself is weak or strong.

## Verification

- npm test — original physical-card tests, seeded solo and duo expeditions, opposed dice correctness, card-reference audit, printed wording regressions.
- npm run audit — print network and mechanical structure report.
- npm run balance -- 1500 — reproducible outcomes for eight solo Heroes and six two-Hero combinations under both policies.
- npm run test:visual — browser checks for 111 distinct card faces and their A4 print sheets.

## What remains before Phase 5 can be called finished

Build a strict full-effect resolver or verified action definitions for **all 52 Objects** and every Room decision; play survival, treasure, negotiation, spell-heavy and seal-preparation strategies; check infinite loops and resource exploits; run full solo and two-player campaigns; and compare the numbers with real printed-card playtests. Only then adjust HP/ATK/DEF, resource supply or party difficulty, and finish unique artwork and the print proof.

**Keep rules on the cards. Do not add more website sections or expand the deck as a substitute for balancing it.**
