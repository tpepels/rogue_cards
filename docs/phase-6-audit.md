# Phase 6 — Tactical Survival & Expedition Depth

## Scope and five design decisions

This phase extends **the existing physical-first, two-action, d6-combat game** rather than replacing it.

| Decision | Physical interaction | Browser implementation |
|---|---|---|
| Compact tactical combat | Show top Behaviour card; BRACE or FEINT once per turn; class TECHNIQUE once per monster | Undrawn Behaviour peek; temporary guard/feint/evade flags and per-monster technique marker |
| Enchanting and cursed equipment | Sword/Mail use visible per-object modifier; altar enchant/cleanse once per location | Equipment slots contain modifier and curse state; cannot swap cursed equipment |
| Environmental puzzles | Crypt, Fungal Nest and Flooded Chamber hidden caches | Key, prepared Digging or 2 Hunger to take a finite-supply Object |
| Risk–reward non-combat encounters | Shop/Altar bargains are optional and can kill a hero | Lose 2 HP for one physical Object, once per room |
| Escalating difficulty | Existing regional encounter odds plus +1 monster HP at depths 7–10 | Room entry applies escalating Pressure and deep HP; side room remains optional with 5/6 loot odds |

## Cross-system interaction audit

| Affects | Combat | Magic | Pets, corpses and prayer | Dungeon geometry / supplies |
|---|---|---|---|---|
| Behaviour intention | Shared monster Behaviour deck is **peeked**, not drawn; status effects still postpone draw | Invisibility, cold/frozen and blinding continue to suppress Behaviour | Dog acts before monster Behaviour | Room and monster stay put |
| BRACE / FEINT | Exactly one stance per turn; one normal action; attack dice unchanged; expiry at turn end | No new magic-family actions | Pet may independently attack; prayer still consumes a normal action | No extra map movement or resources |
| Hero technique | Once per monster, tracked on monster card; uses one of two hero actions | Wizard's HEX deals direct magic damage; spell identification unchanged | Companion bonuses no longer substitute for class techniques | Persists when monster is left and revisited |
| Enchant / curse | Modifies derived ATK/DEF; cursed gear can't be swapped | Ring blessings/curses remain separate from Sword/Mail curse; Wand/Scroll effects unchanged | Altar prayer and enchantment may both be used; enchant is once per altar | No duplicates: gear modifier stays on original Object card |
| Cache | Accessible after monster is defeated | Prepared DIGGING substitutes for a Key; no unprinted combinations | Hunger cost competes with pet feeding and prayer | Draws from finite Object deck; opened cache is persistent |
| Bargain | May cause immediate death | Reward can be an unidentified magical object | Competes with prayer/healing and Bones risk | Uses existing Object cards; never summons an extra copy |
| Deep pressure | +1 HP in depths 7–10, on top of Phase 4 encounter probabilities | Damage and status calculations unchanged | Longer fights increase hunger/pet risk | Main route remains reachable; side exploration still voluntary |

## Explicitly unchanged

- Two actions per turn, existing d6 hit/critical rules and shared ten-card Behaviour pile.
- Fixed Vault/Warden and Amulet return objective.
- Phase 4 SIDE/LINK topology and three themed Room supplies.
- Four independent Phase 3 magical identity families, 15 properties, and ring blessings/curses.
- Phase 5 Dog autonomy, corpse risks/intrinsics, prayer cooldown, and bounded cross-run Bones.
- Oversized 90 × 140 mm cards, black-and-white illustration, and A4 printable supplements.

## Important limitations and decisions

1. **Only eight new printed reference cards**; the new action descriptions supplement Hero, Room, and Equipment cards. Enchantments are pencil modifiers on existing Sword/Mail cards, not an unbounded token deck.
2. **No arbitrary freeform interaction matrix.** Cache keys and prepared Digging, altar cleansing, and combat stance effects are explicitly printed.
3. **No unbounded enemy scaling:** deeper monsters gain only +1 HP in addition to regional encounter thresholds. Extra pressure is limited to authored effects.
4. **Finite resources stay finite.** Cache and bargain rewards come directly from the existing Object supply; depletion yields no object.
5. **No claim of a 90–120 minute measured game.** Computer actions and simulated turn counts cannot be converted honestly to physical playtime without table-timed observations.

## Verification and simulation

- Unit and regression suites: `npm test`.
- Interactive browser, responsive cards and physical A4 geometry: `npm run test:visual`.
- Separate deterministic benchmark: `npm run sim:phase6`, default 80 seeds per each of four Heroes (320 total). The benchmark reports win/death/timeout proportions, mean turns, mean actions, deepest floor reached, room discovery, hero techniques, bargains and caches.
- The simulation agent is deliberately basic, not an optimal policy or an exhaustive physical playtest. Interpret win percentages as **heuristic policy outcomes**, not calibrated human win rates.

## Physical acceptance items

Before printing the production kit, record elapsed setup, teaching time, session duration, turns/actions, explored optional rooms, frequent card handling and memory/tracking burden; inspect actual 90 × 140 mm cards and A4 sheets at 100% scale. The browser tests check geometric clipping, not pencil legibility, social pacing, table footprint or strategy quality.
