# Rogue Cards engine architecture

## Goal

Maintain **one canonical implementation of printed card mechanics**, reusable
by a future browser/desktop computer game, while keeping scripted policies,
Monte Carlo optimization, AI experimentation, multi-seed runs, filesystem
checkpoints and charts out of the runtime dependency graph.

This is an incremental extraction, not a rewrite of game rules. The
simulation remains the mechanical regression reference. A complete
interactive phase/turn controller, save/load serialization, animations and
networking are deliberately future work.

## Dependency direction

~~~text
Computer game UI (future)                      Experiment scripts (current)
          |                                               |
          v                                               v
src/engine/index.js                           src/expedition-campaign.js
  - createGame()                                - full expedition scripts
  - observeGame()                               - AI decisions and heuristics
  - enterNextRoom() / chooseRoom()               - seeded scenario experiments
  - legalCombatActions() / takeCombatAction()            |
  - takeMonsterResponse()                                 |
  - finishCurrentRoom()                                   |
          |_______________________________________________|
                          |
                          v
               src/engine/combat.js
               src/engine/expedition-state.js
               src/engine/dice-bands.js
               src/engine/random.js
                          |
                          v
        Canonical printed cards, effect models, item access,
        room-memory engine and fate handlers

src/rollout-state.js + src/rollout-evaluator.js
  - strictly experimental, NEVER imported by src/engine/*
src/research-agent.js + src/decision-planner.js
  - AI / planning, NEVER imported by src/engine/*
~~~

**Import rule:** All files under \`src/engine/\` must be portable JavaScript
without Node, filesystem, timers, browser globals or research policy imports.
The \`tests/engine-api.test.mjs\` check guards this rule.

Legacy imports from \`src/expedition-runtime.js\` still work. That module
is now just a compatibility re-export of the canonical
\`src/engine/expedition-state.js\`. The \`src/expedition-campaign.js\`
simulation still exports \`playerAttack\` and \`monsterRespond\` for older
callers but now delegates them to \`src/engine/combat.js\`.

## UI-facing code

~~~js
import {
  createGame, observeGame, enterNextRoom, legalRoomChoices, chooseRoom,
  legalCombatActions, takeCombatAction, takeMonsterResponse,
  finishCurrentRoom
} from "./src/engine/index.js";

const state=createGame({seed:1234,heroes:["knight"],strategy:"survival"});
const publicView=observeGame(state); // JSON-serializable, no hidden deck order
enterNextRoom(state);

const choices=legalRoomChoices(state);
if(choices.length)chooseRoom(state,choices[0]);

const actions=legalCombatActions(state,0);
if(actions.length)takeCombatAction(state,actions[0]);
// The UI can animate before calling takeMonsterResponse(state,0).
~~~

These are **atomic mechanics**, not an entire interactive game loop.
A real UI still needs a phase controller that handles exploration
preparations, pending Monsters, multiple Hero turns, corpse rewards, the
Vault/SEAL/Warden encounter, accessibility and user choices. It must
never infer rules from the printed-card text; call the engine's effect
handlers instead.

The \`observeGame\` result deliberately omits the hidden Item, Room
and Monster sequences and the PRNG closure. That is the public-state
boundary. A UI/controller owning the actual state can still implement
legitimate scouting or replay features.

All experiment-specific knobs (\`researchPolicy\`, \`agentConfig\`,
\`itemTrial\`, \`plannerRisk\`, and Monte Carlo \`budget\`) are outside
the public engine API.

## JavaScript optimization work

1. **Seeded RNG moved out of the baseline simulator** to
   \`src/engine/random.js\`. The generator and its draw order are
   bit-for-bit compatible with the older \`src/playtest.js\` export.
   There is no Node or UI dependency.
2. **Source-card coverage hashing moved out of the engine constructor.**
   The Monte Carlo adapter performs the printed-data verification. A
   future computer game can start without importing the baseline
   simulator or its reviewed-checksum machinery.
3. **Combat extracted unchanged** into \`src/engine/combat.js\`, so
   research agents and future interactive UI invoke identical rules.
4. **Printed d6 bands precompiled once**, returning a constant-time
   face-to-outcome mapping instead of reparsing range strings for every
   triggered Room or Item effect.
5. **Rollout deck samples reused across action alternatives**. Under the
   same hypothetical scenario, the fair agent generates the unknown
   decks **once**, then uses card-aware state clones for each action.
   Each branch retains exactly the same independently seeded dice.
   The Oracle still gets full remaining deck order, but never future
   actual dice. Card-aware cloning and per-decision public-deck-pool
   caching were already introduced earlier.

No C++, Rust or WebAssembly build dependency is needed.

### Tests

~~~sh
git pull --ff-only
npm run test:engine
npm test
npm run validate:deck
~~~

The engine boundary test checks public snapshots and import direction,
RNG reproducibility, 1–6 on every printed roll table, Room transitions,
real combat parity and the unchanged seeded simulator. The suite also
includes fixed-seed card-aware-versus-structured-clone and other
full-expedition rollouts.

### Speed measurements (run on the intended computer)

~~~sh
npm run bench:rollout-forks -- --samples 300
npm run bench:rollout-scenarios -- --samples 300 --choices 4
~~~

The scenario microbenchmark verifies matching seeded checksums across
both versions **before** reporting elapsed milliseconds and relative
speedups. These are microbenchmarks, not whole-game CPU measurements.
Do not assume a 2x faster fork makes the complete 128-rollout study 2x
faster; combat resolution and the number of alternative actions remain
important.

Profile full-worker hotspots with Node \`--cpu-prof\` before considering
native compilation. If it becomes worthwhile, a Rust Node-API addon is
possible **behind the engine interface** without changing the card
catalogue, game commands, UI or experiment result formats.

## Still required before shipping a computer game

- A complete interactive phase controller that prevents illegal action
  ordering (including Warden, SEAL, reaction and post-battle rewards)
- Save/load with explicit PRNG state capture and schema migration
- An immutable input/event log suitable for replay, debugging and undo
- UI rendering and accessibility
- Golden deterministic replays and integration checks between the future
  interactive controller and the existing scripted expedition runner

This separation keeps the rules engine reusable without pretending
those remaining product features already exist.
