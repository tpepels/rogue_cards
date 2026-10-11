# Phase 5 — Living Dungeon implementation audit

## Decisions

1. **Autonomous pets** — A Dog rolls d6 at turn end, roams to a known adjacent room, sniffs, bites, follows the hero, scavenges corpses when hungry, and loses hunger every third turn. Feeding it is an explicit action. No passive Hero +1 damage remains.
2. **Risky corpse eating / intrinsics** — A defeated non-Warden monster leaves a species-tagged corpse; collect/eat are separate actions. Corpses spoil after six turns. Eating restores hunger and risks HP loss on a d6; a safe natural 6 grants one of six lasting intrinsics. The printable reference lists all species and thresholds.
3. **Interacting monster ecology** — Monster habitat preference adds +1 maximum/current HP in a matching region room. Pet scavenging competes with the hero for corpses. Shared room/monster ecology is intentionally limited to a single stationary monster per room to preserve Phase 4.
4. **Consequential prayer** — Pray as one action anywhere: d6 + favour (and +1 at Altar), success on 4+ heals; failure costs hunger and favour; six complete turns must elapse before re-praying. Previous automatic Altar healing is removed.
5. **Bones files** — On death, save up to three carried objects and the Hero class in a bounded Bones Record. The next run checks its first newly revealed room at depth 3–9; on a d6 result of 5–6 the first saved item can be retrieved. The record is consumed by that run and is not shared with advertisers or any server.

## Physical-digital contract

The new `living-guide.html` is a two-page print reference, with a handwritten Bones Record and fields for Pet Hunger, Loyalty, Favour, Cooldown and Intrinsics. `src/ecology.js` is independent of browser rendering. Generic Corpse markers (six copies), Pet, Prayer and Bones references, and six intrinsic ability cards are added to the catalogue and A4 print kit. If more than six corpses are present simultaneously, track further corpses by species and death-turn notation on the map sheet.

New browser saves use `rogue-cards-v5`, with a separate local `rogue-cards-bones-v5` key; older v4 saves are not overwritten. The Dog, its hunger, current room, Prayer state, and intrinsics are visible in the character panel.

## Scope limitations

The game remains single-player, with a single stationary monster in any given room. Pet movement is autonomous but simplified to the first known adjacent room; it is not pathfinding or a spatial tactical subsystem. Monster ecology is constrained to habitat affinity and corpse-mediated interactions, not complex food chains or dynamic populations. The timed 90–120-minute target and tabletop clarity still require physical playtesting.

## Verification

Run `npm test` for core mechanics and `npm run test:visual` for browser and A4 geometry. New tests assert pet activity, corpse consumption, permanent intrinsics, consequential prayer, Bones persistence, and printable reference coverage. Inspect real printed cards at 100% scaling before making a print run.
