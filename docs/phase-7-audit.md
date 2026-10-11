# Phase 7 — Balance, Cohesion and Print Readiness

## Decisions implemented

1. **Comparable difficulty:** Target the survival gap between Delver/Wizard and Knight/Rogue without introducing unique subsystem exceptions. Final class-stat changes are modest and preserve starting equipment and techniques. We measure all four heroes under direct, cautious and exploratory policies, not one strategy.
2. **Keep ten depths:** The main route remains Entrance 0 through the Vault at 10, with the three regional room piles and optional side chambers.
3. **Luck with counterplay:** Continue the visible undrawn monster intention, class techniques, defensive Brace, Feint, consumable magic, optional side paths, prepared Digging and risk–reward choices. No invisible rubber-banding or guaranteed victories.
4. **Simplify/consolidate:** The new print-and-play entry point provides one setup checklist and a clear rule hierarchy rather than adding another layer of card exceptions. Reuse the established HP, Defence and item modifiers rather than introducing new resource meters.
5. **Complete print-and-play:** Dedicated guide index, cards via the existing actual-copy print kit, map/record sheets, magic guide, living-dungeon guide and tactical guide. A physical printing checklist is included.

## Mechanical cohesion and interaction matrix

| System | Tactical / combat | Magic | Survival & ecology | Dungeon & print |
| --- | --- | --- | --- | --- |
| Hero balance | Preserve techniques and the two-action economy; modest starting stats | Wizard still relies on hidden magic and HEX | Delver's initial food and Knight's armour identity remain meaningful | Same ten-depth objective and region encounter odds |
| Monster intentions | Peek rather than consume Behaviour, maintaining d6 and guard effects | Freeze/invisibility can postpone the visible intention | Pets still act before the monster's actual behaviour | No additional printed monster cards |
| Curses and enchanted gear | Visible integer modifier in existing slot; cursed gear locks | Distinct from the existing ring blessings/curses | Altar use competes with prayer and healing decisions | One modifier written on an existing physical Object card |
| Puzzles and bargains | Avoid combat first or pay action/HP/Hunger | Digging bypasses explicitly named obstacles | Costs compete with pet feeding and starvation | Draw only from finite Object deck; no duplicates |
| Corpses and bones | Corpses emerge on defeat, bones on run death | Magic identities still randomized by run | Pet scavenging competes with hero meals | Single persistent card/marker per room; no new population simulation |

## Print setup and rule hierarchy

Use [Print and Play](../print-and-play.html) as the primary entry point. It includes required card copy quantities (through the gallery's Physical Kit option), the main field guide, three supplemental references, and the map/tracker. Physical cards remain 90 × 140 mm and should be printed at actual size; cross-sheet and document clipping is automatically checked. The guides remain separate for reference legibility, rather than forcing a single unwieldy continuous pamphlet.

Universal rules live in the **Field Guide**, magic identities and property interactions in **Unknown Objects**, pets/corpses/prayer/bones in **Living Dungeon**, and new tactical survival in **Tactical Survival**. Individual card exceptions must name the affected rule. This prevents users from needing to interpret informal combinations.

## Simulations and limits

CI executes 80 deterministic seeds × 4 heroes × 3 agent strategies = **960 policy-controlled expeditions** using `npm run sim:phase7`. The direct agent prioritizes efficient progress; cautious emphasizes optional survival actions; explorer takes more optional risk. It reports deaths, wins, timeouts, mean turns/actions, deepest floor, room counts, caches, techniques, and bargains. These are *observations about the specified heuristic policies*, not optimal solutions, human win rates or duration measurements.

Balance adjustments should be judged by **cross-policy comparisons** and ideally repeated with varied seeds, stronger item/magic policies, and actual physical sessions. Do not tune to one statistical target or erase each hero's strengths.

## Outstanding physical acceptance requirements

The 90–120 minute target cannot be verified by engine speed. Record at least setup time, tutorial reading time, number of turns, time per turn, total physical playtime, floor reached, optional side chambers entered, and reports of unclear card wording. Real print color/contrast, cut tolerances, card handling and readability need human inspection. The repository does not claim those empirical tests were performed.

## Final seeded benchmark — 2026-10-11, workflow 38166033670

80 seeds per hero-policy cell (12 cells), no timeouts. Win rates:

| Hero | Direct | Cautious | Explorer |
| --- | ---: | ---: | ---: |
| Delver | 42.5% | 28.75% | 30.0% |
| Knight | 55.0% | 43.75% | 27.5% |
| Wizard | 40.0% | 27.5% | 32.5% |
| Rogue | 53.75% | 38.75% | 36.25% |

Final role adjustments are **Delver HP 13, ATK 3, DEF 2** (previous Phase 6 baseline HP 12/ATK 3/DEF 1) and **Wizard HP 12, ATK 3, DEF 1** (previous baseline HP 10/ATK 2/DEF 1); Knight and Rogue remain unchanged. All techniques and starting objects remain unchanged. Under the direct policy, the hero spread narrows to 15 percentage points (40.0–55.0%). Cautious still spans 16.25 points, while explorer spans 8.75 points. That is evidence of better *approximate parity* across strategies, **not proof of balanced human play**. Three agents share substantial decision logic and may underestimate the Wizard's consumable magic or overuse optional risks.

The simulated mean number of turns ranges from about 20 to 33, depending on hero and policy, which cannot be converted into minutes without measured human timings. The ten-depth target has not changed.
