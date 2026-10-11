# Phase 4 — procedural dungeon

## Decisions implemented

- **Topology:** the main route 0–10 remains guaranteed; optional chambers require a room's printed **SIDE** exit, and two adjacent, revealed side rooms bearing **LINK** connect to create a loop.
- **Physical map:** oversized Room cards print UPPER/MIDDLE/DEEP and SIDE/LINK exit markers. Every main Room implicitly has BACK and FORWARD; the printed map sheet tracks room identities, monster HP and uncollected loot.
- **Discovery:** unknown Room cards are revealed only when entered; revisit keeps the room, monster and loot exactly as before.
- **Monsters:** stationary. No wandering or pursuit. Retreat follows a known open exit toward the surface.
- **Progression:** three distinct, separately shuffled Room supplies: Upper Works (1–3), Flooded Hollows (4–6), Black Crypts (7–9), followed by fixed Vault (10). Monster encounter odds increase by region: main 3/6, 4/6, 5/6 and side 2/6, 3/6, 4/6.

## Rules kept unchanged

Two actions per turn, d6 combat, shared behaviour deck, hunger, four randomized magical object families, 15 universal properties and ring B/U/C states.

## Print setup

Sort all non-special Room cards by their printed region and shuffle each region separately, face-down. When entering a new room in depths 1–9, draw from the matching pile. SIDE on the current main Room reveals a possible optional adjacent side chamber (but does not reveal its contents until entered). Two explored adjacent side chambers marked LINK permit movement between them; otherwise they are separate dead ends. Save room cards for revisiting; never reshuffle revealed locations into the pile.

## Caveats

The topology deliberately retains the guaranteed main route so that a blocked random exit cannot render the Amulet unreachable. Room exits describe a *compact regional dungeon grammar*, not free spatial tiling. In the browser the Room deck is one shuffled multiset filtered by the printed region; shuffling three physical region piles produces the same within-region distribution. The 90–120 minute goal is not yet measured with physical playtests.

## Validation

Run `npm test` and `npm run test:visual` (after installing the optional Playwright developer dependency and Chromium). Actual printer scaling and human usability still require physical inspection.
